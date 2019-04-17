var config = require('./../../config');
var async = require('async');
var cookie = require('cookie');
var sessionStore = require('./../libs/sessionStore');
var HttpError = require('./../error/index').HttpError;
var DevError = require('./../error/index').DevError;
var User = require('../models/user').User;
var Message = require('../models/user').Message;
var Room = require('../models/user').Room;
var globalChatUsers = {};
var common = require('../common').commonEmitter;




function getConSid(a) {
    var ConSid = '';
    for (var i=0;i<a.length;i++) {
        if(a[i]==':') {
            for (var j=i+1;j<a.length;j++) {
                if(a[j] != '.') {
                    ConSid += a[j];
                    //continue;
                }
                else {return ConSid;};
            }
        }
    }
}

function loadUser(session, callback) {
    if (!session.user) {
        //console.log('Session %s is anonymous', session.id);
        return callback(null, null);
    }
    //console.log('retrieving user: ', session.user);
    User.findById(session.user, function(err, user) {
        if (err) return callback(err);

        if (!user) {
            return callback(null, null);
        }
        //console.log('user found by Id result: ',user);
        callback(null, user);
    });
}

async function aggregateUserData(username) {
    let userData = await User.findOne({username:username});
    let contacts = userData.contacts;
    let blockedContacts = userData.blockedContacts;
    let wL = contacts.map(async (name,i) =>{
        let status = !!globalChatUsers[name];
        let nameUserDB = await User.findOne({username:name});
        let banned = nameUserDB.blockedContacts.includes(username);
        let authorized =  !(!nameUserDB.contacts.includes(username) && !nameUserDB.blockedContacts.includes(username));
        return contacts[i] = {name:name, messages:[], msgCounter :0, typing:false, onLine:status, banned:banned, authorized:authorized}
    });
    let bL = blockedContacts.map(async (name,i) =>{
        let status = !!globalChatUsers[name];
        let nameUserDB = await User.findOne({username:name});
        let banned = nameUserDB.blockedContacts.includes(username);
        let authorized =  !(!nameUserDB.contacts.includes(username) && !nameUserDB.blockedContacts.includes(username));
        return blockedContacts[i] = {name:name, messages:[], msgCounter :0, typing:false, onLine:status, banned:banned, authorized:authorized}
    });
    userData.contacts = await Promise.all(wL);
    userData.blockedContacts = await Promise.all(bL);
    return userData;
}


module.exports = function (server) {

    var io = require('socket.io').listen(server);

    function findClientsSocket(roomId, namespace) {
        var res = []
            // the default namespace is "/"
            , ns = io.of(namespace ||"/");

        if (ns) {
            for (var id in ns.connected) {
                if(roomId) {
                    var index = ns.connected[id].rooms.indexOf(roomId);
                    if(index !== -1) {
                        res.push(ns.connected[id]);
                    }
                } else {
                    res.push(ns.connected[id]);
                }
            }
        }
        return res;
    }

    io.set('authorization', function (handshake, callback) {
        handshake.cookies = cookie.parse(handshake.headers.cookie || '');
        var sidCookie = handshake.cookies[config.get('session:key')];
        //console.log('sidCookie: ',sidCookie);
        if (!sidCookie) return callback(JSON.stringify(new HttpError(401, 'No Cookie')));
        let sid = getConSid(sidCookie);
        //console.log('authorizationSessionId: ',sid);
        sessionStore.load(sid,(err,session)=>{
            if(err) return callback(new DevError(500, 'Session err: ' + err));
            //console.log('authorization session: ',session,'err: ',err);
            if (!session) return callback(JSON.stringify(new HttpError(401, 'No session')));
            handshake.session = session;
            loadUser(session,(err,user)=>{
                if(err) return callback(JSON.stringify(new DevError(500, 'DB err: ' + err)));
                //console.log('loadUser userId: ',user);
                if(!user) return callback(JSON.stringify(new  HttpError(401, 'Anonymous session may not connect')));
                if(globalChatUsers[user.username]) {
                    console.log("multiChatConnection");
                    delete globalChatUsers[user.username];
                    return callback(JSON.stringify(new HttpError(423, 'Locked! You tried to open Chat Page in another tab.')));
                }
                handshake.user = user;
                return callback(null, true);
            });
        });
    });

    common.on('session:reload', function (sid,callback) {
        //console.log('session:reloadSid: ',sid);
        var clients = findClientsSocket();
        //console.log('clients: ',clients);
        clients.forEach(function (client) {
            let sidCookie = cookie.parse(client.handshake.headers.cookie);
            //console.log('sidCookie: ',sidCookie);
            let sessionId = getConSid(sidCookie.sid);
            //console.log('session:reloadSessionId: ',sessionId);
            if (sessionId !== sid) return;
            sessionStore.load(sid, function (err, session) {
                if (err) {
                    //console.log('sessionStore.load err: ',err);
                    //client.emit('error', err);
                    if(err) return callback(err);
                    //client.disconnect();
                }
                if (!session) {
                    //console.log('sessionStore.load no session find');
                    client.emit('logout');
                    client.disconnect();
                    return;
                }
                //console.log('restore session');
                client.handshake.session = session;
            });
        });
    });

    io.sockets.on('connection', async function (socket) {
        //Global Chat Events
        let username = socket.request.user.username;//req username
        let reqSocketId = socket.id;//req user socket id
        const userDB = await User.findOne({username:username});
        //console.log("connection");
        //update global chat users obj
        globalChatUsers[username] = {
            sockedId:reqSocketId,
            contacts:userDB.contacts, //use only for username otherwise the data may not be updated.
            blockedContacts:userDB.blockedContacts, //use only for username otherwise the data may not be updated.
        };
        //update UserData
        socket.emit('updateUserData',await aggregateUserData(username));
        //move to black list
        socket.on('banUser', async function (data,cb) {
            console.log("banUser name:" ,data.name);
            let userRG = await User.userMFCTBC(username,data.name);//move to blockedContacts
            if(userRG.err) {
                return cb("Move user to black list filed. DB err: " + userRG.err,null);
            }
            if(globalChatUsers[data.name]) {
                socket.broadcast.to(globalChatUsers[data.name].sockedId).emit('updateUserData',await aggregateUserData(data.name));//update user data
                cb(null,await aggregateUserData(username));
            } else cb(null,await aggregateUserData(username));
        });
        //move to white list
        socket.on('unBanUser', async function (data,cb) {
            console.log("unBanUser name:" ,data.name);
            let userRG = await User.userMFBCTC(username,data.name);//move to Contacts
            if(userRG.err) {
                return cb("Move user to black list filed. DB err: " + userRG.err,null);
            }
            if(globalChatUsers[data.name]) {
                socket.broadcast.to(globalChatUsers[data.name].sockedId).emit('updateUserData',await aggregateUserData(data.name));//update user data
                cb(null,await aggregateUserData(username));
            } else cb(null,await aggregateUserData(username));
        });
        //remove completely
        socket.on('deleteUser', async function (data,cb) {
            console.log("deleteUser name:" ,data);
            let userRG = await User.userRFAL(username,data.name);//remove from contacts & blockedContact
            console.log("deleteUser userRG.user:" ,userRG.user);
            if(userRG.err) {
                return cb("Move user to black list filed. DB err: " + userRG.err,null);
            }
            if(globalChatUsers[data.name]) {
                socket.broadcast.to(globalChatUsers[data.name].sockedId).emit('updateUserData',await aggregateUserData(data.name));//update user data
                cb(null,await aggregateUserData(username));
            } else cb(null,await aggregateUserData(username));
        });
        //check user online
        socket.on('checkOnLine', function (name,cb) {
            cb(!!globalChatUsers[name]);
        });
        //req show me online
        socket.on('sayOnLine', function () {
            let contacts = globalChatUsers[username].contacts;
            let blockedContacts = globalChatUsers[username].blockedContacts;
            console.log("sayOnLine, username: ",username,", contacts: ",contacts,", blockedContacts: ",blockedContacts);
            //res for my contacts what Iam onLine
            contacts.concat(blockedContacts).forEach((name)=>{
                if(globalChatUsers[name]) socket.broadcast.to(globalChatUsers[name].sockedId).emit('onLine', username);
            });
        });
        //req show me offLine
        socket.on('sayOffLine', function () {
            let contacts = globalChatUsers[username].contacts;
            let blockedContacts = globalChatUsers[username].blockedContacts;
            console.log("sayOffLine, username: ",username,", contacts: ",contacts,", blockedContacts: ",blockedContacts);
            //res for my contacts what Iam onLine
            contacts.concat(blockedContacts).forEach((name)=>{
                if(globalChatUsers[name]) socket.broadcast.to(globalChatUsers[name].sockedId).emit('offLine', username);
            });
        });
        //req to add me to contact list
        socket.on('addMe', async function (data,cb) {
            //console.log('addMe: ',data);
            let userRG = await User.userATC(username,data.name);//add to contacts
            let userRD = await User.userATBC(data.name,username);//add to blocked contacts
            if(userRG.err) return cb("Request rejected. DB err: "+userRG.err,null);
            if(userRD.err) return cb("Request rejected. DB err: "+userRD.err,null);
            //console.log("addMe userRG: ",userRG," ,userRD: ",userRD);
            let {errMessage,mes} = await Message.messageHandler({members:[username,data.name]});
            if(errMessage) {
                //console.log("addMe errMessage: ", errMessage);
                return cb("Send message filed. DB err: " + errMessage,null);
            }
            //console.log("addMe mes: ",mes," , len: ",mes.messages.length);
            if(mes.messages[mes.messages.length-1] !== "Please add me to you contact list." || mes.messages.length === 0) {//Save message in DB if last !== "Please add me to you contact list." || len == 0
                await Message.messageHandler({members:[username,data.name],message:{user: username, text: "Please add me to you contact list.", status: false, date: data.date}});
                if(globalChatUsers[data.name]) {//Send message "Add me to you contact list" if user online
                    socket.broadcast.to(globalChatUsers[data.name].sockedId).emit('updateUserData',await aggregateUserData(data.name));
                    cb(null,await aggregateUserData(username));
                } else cb(null,await aggregateUserData(username));
            }else cb("Request rejected. You always send request. Await then user response you.",null);
        });
        //res to add me
        socket.on('resAddMe', async function (data,cb) {
            //console.log('resAddMe: ',data);
            let userRG = await User.userMFBCTC(username,data.name);
            if(userRG.err) return cb("Request rejected. DB err: "+userRG.err,null);
            if(globalChatUsers[data.name]) {//Send message "Add me to you contact list" if user online
                let {err,mes} = await Message.messageHandler({members:[username,data.name],message:{ user: username, text: "I added you to my contact list.", status: false, date: data.date}});
                socket.broadcast.to(globalChatUsers[data.name].sockedId).emit('message', { user: username, text: "I added you to my contact list.", status: false, date: data.date});
                cb(null,await aggregateUserData(username));
            }else return cb(null,await aggregateUserData(username));
        });
        //Find contacts
        socket.on('findContacts', async function (data,cb) {
            //console.log('findContacts: ',data);
            let {err,users} = await User.userFindContacts(data);
            //console.log('findContacts users: ',users);
            if(err) return console.log("findContacts err:",err);
            if(users) {
                let usersArr = users.map(itm=>itm.username);
                return  cb(usersArr);
            }
        });
        //chat users history cb
        socket.on('getUserLog', async function (reqUsername,reqMesCountCb,cb) {
            //console.log("getUserLog reqUsername: ", reqUsername);
            let {err,mes} = await Message.messageHandler({members:[username,reqUsername]});
            if(err) {
                //console.log("getUserLog err: ", err);
                return cb(err,null);
            }else {
                //console.log("getUserLog mes: ", mes);
                //let messages = mes.messages.map((itm)=> dateToString(itm));
                //console.log("getUserLog messages: ",mes.messages);
                return cb(null,mes.messages);
            }
        });
        //chat message typing
        socket.on('typing', function (name) {
            //console.log('typing');
            if(!globalChatUsers[name]) return;
            let sid = globalChatUsers[name].sockedId;
            socket.broadcast.to(sid).emit('typing', username);
        });
        //chat message receiver
        socket.on('message', async function (text,resToUserName,dateNow,cb) {
            //console.log('message text: ',text, 'resToUserName: ',resToUserName, 'dateNow: ',dateNow);
            if (text.length === 0 || !resToUserName) return;
            if (text.length >= 60) return socket.emit('message', { user: "Admin", text: "To long message!", status: false, date: Date.now()});
            let resUser = await User.findOne({username:resToUserName});
            if(globalChatUsers[username].blockedContacts.includes(resToUserName)) return socket.emit('message', { user: resToUserName, text: "Admin: You can not write to baned users.", status: false, date: Date.now()});
            if(!resUser.contacts.includes(username)) return socket.emit('message', { user: resToUserName, text: "Admin: user "+resToUserName+" do not add you in his white list!", status: false, date: Date.now()});
            let {err,mes} = await Message.messageHandler({members:[username,resToUserName],message:{ user: username, text: text, status: false, date: dateNow}});
            if(!globalChatUsers[resToUserName]) return cb && cb();
            let sid = globalChatUsers[resToUserName].sockedId;
            //console.log('message text: ',text, 'sid: ',sid, 'resToUserName: ',resToUserName, 'dateNow: ',dateNow);
            socket.broadcast.to(sid).emit('message', { user: username, text: text, status: false, date: dateNow});
            cb && cb();
        });
        //room events
        //create new room
        socket.on('createRoom', async function  (roomName,dateNow,cb) {
            let {err,room} = await Room.createRoom(roomName,username);
            if(err) {
                return cb(err)
            } else {
                let {err,mes} = await Message.roomMessageHandler({roomName:roomName,message:{ user: username, text: username+" created the group "+roomName+".", status: false, date: dateNow}});
                return cb(null)
            }
        });
        //invite users to room
        socket.on('inviteUserToRoom', async function  (roomName,invitedUser,dateNow,cb) {
            let {err,room} = await Room.inviteUserToRoom(roomName,invitedUser);
            if(err) {
                return cb(err)
            } else {
                let {err,mes} = await Message.roomMessageHandler({roomName:roomName,message:{ user: username, text: username+" added "+invitedUser+".", status: false, date: dateNow}});
                if(globalChatUsers[invitedUser]) socket.broadcast.to(globalChatUsers[invitedUser].sockedId).emit('updateUserData',await aggregateUserData(invitedUser));
                room.members.forEach((name) => {
                    if(globalChatUsers[name] && name !== username) socket.broadcast.to(globalChatUsers[name].sockedId).emit('message',{
                        room:roomName,
                        user:username,
                        text: username+" added "+invitedUser+".",
                        status: false,
                        date: dateNow,
                        addUser:invitedUser
                    });
                });
                cb(null)
            }
        });
        //leave room
        socket.on('leaveRoom', async function  (roomName,dateNow,cb) {
            let {err,room} = await Room.leaveRoom(roomName,username);
            if(err) {
                return cb(err)
            } else {
                let {err,mes} = await Message.roomMessageHandler({roomName:roomName,message:{ user: username, text: username+" leaved the group.", status: false, date: dateNow}});
                room.members.forEach((name) => {
                    if(globalChatUsers[name] && name !== username) socket.broadcast.to(globalChatUsers[name].sockedId).emit('message',{
                        room:roomName,
                        user:username,
                        text: username+" leaved the group.",
                        status: false,
                        date: dateNow,
                        remuveUser:username
                    });
                });
                cb(null)
            }
        });
        //get room log
        socket.on('getRoomLog', async function  (roomName,reqMesCountCb,cb) {
            try {
                let room = await Room.findOne({name:roomName});
                if(!room.members.includes(username)) return cb("You do not member of this group.",null);
                let {err,mes} = await Message.roomMessageHandler({roomName:roomName});
                let user = await User.findOne({name:username});
                let status = user.rooms.find(itm => itm.name === roomName)[enable];
                room.messages = mes.messages;
                room[enable] = status;
                if(err) {
                    cb(err,null)
                } else cb(null,room);
            }catch (err){
                return cb(err,null);
            }
        });
        //enable group
        socket.on('enableRoom', async function  (roomName,cb) {
            let user = await User.findOne({name:username});
            if(user.rooms.find(itm => itm.name === roomName) === undefined) return cb("You do not member of group name "+roomName);
            user.rooms.find(itm => itm.name === roomName).enable = true;
            await user.save();
            return cb(null);
        });
        //disable group
        socket.on('disableRoom', async function  (roomName,cb) {
            let user = await User.findOne({name:username});
            if(user.rooms.find(itm => itm.name === roomName) === undefined) return cb("You do not member of group name "+roomName);
            user.rooms.find(itm => itm.name === roomName).enable = false;
            await user.save();
            return cb(null);
        });
        //room message handler
        socket.on('messageRoom', async function  (text,roomName,dateNow,cb) {
            //console.log('messageRoom text: ',text, 'resToUserName: ',resToUserName, 'dateNow: ',dateNow);
            if (text.length === 0) return;
            if (text.length >= 60) return socket.emit('message', { room:roomName,user: "Admin", text: "To long message.", status: false, date: Date.now()});
            let room = await Room.findOne({name:roomName});
            if(!room.members.includes(username)) return socket.emit('message', {room:roomName, user: "Admin", text: "You do not room member.", status: false, date: Date.now()});
            let {err,mes} = await Message.roomMessageHandler({roomName:roomName,message:{ user: username, text: text, status: false, date: dateNow}});
            room.members.forEach(name =>{
                if(globalChatUsers[name] && name !== username) socket.broadcast.to(globalChatUsers[name].sockedId).emit('message',{
                    room:roomName,
                    user:username,
                    text: text,
                    status: false,
                    date: dateNow,
                });
            });
            cb && cb();
        });
        //
        // when the user disconnects perform this
        socket.on('disconnect', async function () {
            let contacts = globalChatUsers[username].contacts || await User.findOne({username:username}).contacts;
            let blockedContacts = globalChatUsers[username].blockedContacts || await User.findOne({username:username}).blockedContacts;
            console.log("disconnect, username: ",username,", contacts: ",contacts);
            //res for my contacts what Iam offLine
            contacts.concat(blockedContacts).forEach((name)=>{
                if(globalChatUsers[name]) socket.broadcast.to(globalChatUsers[name].sockedId).emit('offLine', username);
            });
            //del user from globalUsers
            delete globalChatUsers[username];
        });
    });
    return io;
};
