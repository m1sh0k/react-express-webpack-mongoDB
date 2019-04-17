import React from 'react';
import Page from '../layout/page.js';
import io from 'socket.io-client';
import {Redirect} from 'react-router-dom'
import UserBtn from '../partials/userBtn.js'
import Modal from '../partials/modalWindow.js'
import Confirm from '../partials/confirmModalWindow.js'



class Chat extends React.Component {

    constructor(props) {
        let user = JSON.parse(sessionStorage.getItem('user')).user;
        //console.log("/chat user: ",user);
        super(props);
        this.state = {
            modalWindow:false,

            errorRedirect: false,
            loginRedirect:false,
            err:{},

            user: user,

            messages: [],
            msgCounter: 0,

            message: '',

            users: this.addUsers(user.contacts) || [],
            filteredUsers: [],
            foundContacts: [],
            blockedContacts: this.addUsers(user.blockedContacts) || [],
            rooms: [],

            arrayBlockHandlerId: undefined,
            messageBlockHandlerId: undefined,

            resAddMeHandler:false,
            resAddMeAddMeName:"",
            addMeHandler:false,
            reqAddMeName:"",

            changeStatusHandler:false,
            changeStatusName:"",
            changeStatusAct:"",

            confirmMessage:"",
        };
    }

    componentDidMount(){
        //move scroll bootom
        console.log("CDM");
        this.scrollToBottom(this.refs.InpUl);

        let socket = io.connect('', {reconnection: true});
        this.socket = socket
            .on('updateUserData',(userData)=>{
                console.log("updateUserData: ",userData);
                let sortUsers = userData.contacts.sort((a,b)=> b.onLine - a.onLine);
                let sortBlockedUsers = userData.blockedContacts.sort((a,b)=> b.onLine - a.onLine);
                this.setState({
                    user:userData,
                    users:sortUsers,
                    blockedContacts:sortBlockedUsers,
                    rooms:userData.rooms,
                });
            })
            .emit('sayOnLine')
            .on('onLine', (name)=> {
                //console.log('receiver user offLine: ',name," ,this.getUsersIdx: ", this.getUsersIdx("users",name));
                let users = this.state.users;
                let usersBC = this.state.blockedContacts;
                if(this.getUsersIdx("users",name) !== -1) {
                    users[this.getUsersIdx("users",name)].onLine = true;
                    let sortUsers = users.sort((a,b)=> b.onLine - a.onLine);
                    this.setState({users:sortUsers});
                }
                if(this.getUsersIdx("blockedContacts",name) !== -1) {
                    usersBC[this.getUsersIdx("blockedContacts",name)].onLine = true;
                    let sortUsers = usersBC.sort((a,b)=> b.onLine - a.onLine);
                    this.setState({blockedContacts:sortUsers});
                }
            })
            .on('offLine', (name)=> {
                //console.log('receiver user offLine: ',name," ,this.getUsersIdx: ", this.getUsersIdx("users",name));
                let users = this.state.users;
                let usersBC = this.state.blockedContacts;
                if(this.getUsersIdx("users",name) !== -1) {
                    users[this.getUsersIdx("users",name)].onLine = false;
                    let sortUsers = users.sort((a,b)=> b.onLine - a.onLine);
                    this.setState({users:sortUsers});
                }
                if(this.getUsersIdx("blockedContacts",name) !== -1) {
                    usersBC[this.getUsersIdx("blockedContacts",name)].onLine = false;
                    let sortUsers = usersBC.sort((a,b)=> b.onLine - a.onLine);
                    this.setState({blockedContacts:sortUsers});
                }
            })
            .on('message', (data)=> {
                if(data.room) {
                    //group message receiver
                    if(data.addUser) {
                        let room = this.state.rooms[this.getUsersIdx("rooms",data.room)];
                        room.members.push(data.addUser);
                        this.setState({room});
                    }
                    if(data.remuveUser) {
                        let room = this.state.rooms[this.getUsersIdx("rooms",data.room)];
                        room.members.filter(itm => itm.name !== data.remuveUser);
                        this.setState({room});
                    }
                    this.printMessage({name:data.user,text:data.text,status:data.status,date:this.dateToString(data.date)},this.getUsersIdx("rooms",data.room));
                } else {
                    //message receiver
                    this.printMessage({name:data.user,text:data.text,status:data.status,date:this.dateToString(data.date)},this.getUsersIdx("users",data.user));
                    this.msgCounter(this.getUsersIdx("users",data.user));
                }
            })
            .on('typing', (username)=> {
                //receiver
                if(this.getUsersIdx("users",username) < 0) return;
                const typingUser = this.state.users[this.getUsersIdx("users",username)];
                typingUser.typing = true;
                this.setState({typingUser});
                setTimeout(()=>{
                    typingUser.typing = false;
                    this.setState({typingUser});
                },2000)
            })

            .on('error',(message)=>{
                //console.log('Server error happened: ',message);
                if(typeof message === 'string' || message instanceof String) {
                    let data = JSON.parse(message);
                    if(data.status == 423 || data.status == 401) {
                        this.setState({err: data});
                        sessionStorage.setItem('error', message);
                        //console.log('this.state.err: ',this.state.err);
                        this.setState({errorRedirect: true});
                    }
                    this.setState({
                        err: {message:data.message,status:data.status},
                        modalWindow: true
                    });
                } else {
                    this.setState({
                        err: message,
                        modalWindow: true
                    });
                }
            })
            .on('logout',()=>{
                //console.log('logout');
                sessionStorage.removeItem('user');
                sessionStorage.removeItem('error');
                this.setState({loginRedirect:true})
            });
    }

    componentWillUnmount(){
        this.socket.disconnect();
    };

    getUserLog =(reqArrName,reqUsername,reqMesCountCb)=>{
        let reqUser = this.state[reqArrName][this.getUsersIdx(reqArrName,reqUsername)];
        this.socket.emit('getUserLog',reqUsername,reqMesCountCb,(err,arr)=>{
            //console.log("getUserLog arr: ",arr," ,err: ",err);
            if(err) {
                this.setState({
                    modalWindow:true,
                    err:{message:err},
                })
            }else {
                arr.map(itm => itm.date = this.dateToString(itm.date));
                //console.log("getUserLog arrModDate: ",arr);
                reqUser.messages = arr;
                this.setState({reqUser});
            }
        })
    };

    scrollToBottom = (element) => {
        element.scrollTop = element.scrollHeight;
    };

    filterSearch =(str)=> {
        return characters => characters.name.substring(0,str.length).toLowerCase() === str.toLowerCase();
    };

    setFiltered = (nameStr) => {
        console.log("setFiltered str: ",nameStr);
        if(nameStr.length === 0) this.setState({filteredUsers: []});
        this.setState({filteredUsers: this.state.users.filter(this.filterSearch(nameStr))},()=>{
            if(this.state.filteredUsers.length === 0) {
                this.socket.emit('findContacts', nameStr,(usersArr)=>{
                    this.setState({
                        foundContacts:usersArr
                    });
                })
            }
        });
    };

    typing =(name,ev)=> {
        //console.log('this.typing sId: ', sId);
        this.setState({message: ev.target.value});
        if(name) {this.socket.emit('typing', name)}
    };

    msgCounter =(i)=> {
        //console.log('msgCounter i : ', i);
        //if(this.state.messageBlockHandlerId === "users") return;
        if(this.state.messageBlockHandlerId !== i) {
            const currentUser = this.state.users[i];
            currentUser.msgCounter = currentUser.msgCounter + 1;
            this.setState({currentUser});
        }
    };

    inxHandler =(arrName,inx)=> {
        console.log('inxHandler arrName: ',arrName,", arrName inx: ", inx);
        this.setState({
            messageBlockHandlerId: inx,
            arrayBlockHandlerId: arrName
        });
        if(arrName !== "users") return;
        const eUser = this.state.users[inx];
        if (eUser && eUser.msgCounter !== 0) {
            eUser.msgCounter = 0;
            this.setState({eUser});
        }
    };

    dateToString =(dateMlS)=> {
        let currentdate = new Date(dateMlS);
        return currentdate.getHours() + ":" + currentdate.getMinutes() + "/" + currentdate.getDate() + ":" + (currentdate.getMonth()+1) + ":" + currentdate.getFullYear()// + ":"+ currentdate.getSeconds();
    };

    sendMessage =(name)=> {
        if (name) {
            console.log('this.sendMessage !GC');
            let date = Date.now();
            this.socket.emit('message', this.state.message, name, date, ()=> {
                this.printMessage({name:this.state.user.username, text:this.state.message, date:this.dateToString(date), status:false},this.getUsersIdx("users",name));
                this.setState({message:''});
            });
            return false;
        }
    };

    getUsersIdx =(arrName,username)=> {
        return this.state[arrName].map((itm)=>{return itm.name;}).indexOf(username);
    };

    printMessage =(data,i)=> {
        console.log("printMessage: ",data);
        const currentUser = this.state.users[i];
        currentUser.messages = [...currentUser.messages,{user:data.name, text:data.text, status:data.status, date:data.date}];
        this.setState({currentUser});
    };

    moveToBlackList =(name)=> {
        this.socket.emit('moveToBlackList',name,(err,userData)=>{
            console.log("moveToBlackList callback err: ",err," ,userData: ",userData);
            if(err) {
                this.setState({
                    modalWindow:true,
                    err:{message:err},
                    addMeHandler: false,
                    confirmMessage:"",
                    reqAddMeName:"",
                })
            } else {
                this.setState({
                    users:userData.users,
                    blockedContacts:userData.blockedContacts,
                })
            }
        })
    };

    deleteUser =(name)=> {
        this.socket.emit('deleteUser',name,(err,userData)=>{
            console.log("deleteUser callback err: ",err," ,userData: ",userData);
            if(err) {
                this.setState({
                    modalWindow:true,
                    err:{message:err},
                    addMeHandler: false,
                    confirmMessage:"",
                    reqAddMeName:"",
                })
            } else {
                this.setState({
                    users:userData.users,
                    blockedContacts:userData.blockedContacts,
                })
            }
        })
    };

    addUsers =(nameArr)=> {
        nameArr.map((name,i) =>{
            nameArr[i] = {name:name, messages:[], msgCounter :0, typing:false, onLine:false, banned:false}
        });
        return nameArr;
    };

    hideModal =()=> {
        this.setState({modalWindow: false});
    };

    addMe =(name)=> {
        console.log("addMe: ",name);
        this.setState({
            addMeHandler:true,
            reqAddMeName:name,
            confirmMessage:"Send request to add user "+name+"?"
        })
    };

    resAddMe =(name)=>{
        console.log("resAddMe: ",name);
        this.setState({
            resAddMeHandler:true,
            resAddMeAddMeName:name,
            confirmMessage:"Allow user "+name+" to add you?"
        })
    };

    addMeHandler = (confirmRes) => {
        console.log('confirmRes: ',confirmRes);
        if(confirmRes){
            this.socket.emit('addMe', {name:this.state.reqAddMeName,date:Date.now()},(err,userData)=>{
                console.log("addMe callback err: ",err," ,userData: ",userData);
                if(err) {
                    this.setState({
                        modalWindow:true,
                        err:{message:err},
                        addMeHandler: false,
                        confirmMessage:"",
                        reqAddMeName:"",
                    })
                }else {
                    this.setState({
                        users:userData.contacts,
                        addMeHandler: false,
                        confirmMessage:"",
                        reqAddMeName:"",
                    });

                }
            })
        }else{
            this.setState({
                addMeHandler: false,
                confirmMessage:"",
                reqAddMeName:"",
            });
        }
    };

    resAddMeHandler =(confirmRes)=>{
        //('resAddMeHandler: ',confirmRes);
        if(confirmRes){
            this.socket.emit('resAddMe', {name:this.state.resAddMeAddMeName,date:Date.now()},(err,userData)=>{
                console.log("resAddMeHandler callback err: ",err," ,userData: ",userData);
                if(err) {
                    this.setState({
                        modalWindow:true,
                        err:{message:err},
                        resAddMeHandler:false,
                        resAddMeAddMeName:"",
                        confirmMessage:""
                    })
                }else {
                    this.setState({
                        users:userData.contacts,
                        blockedContacts:userData.blockedContacts,
                        resAddMeHandler:false,
                        resAddMeAddMeName:"",
                        confirmMessage:""
                    });

                }
            })
        }else{
            this.setState({
                resAddMeHandler:false,
                resAddMeAddMeName:"",
                confirmMessage:""
            });
        }
    };

    userStatusHandler =(confirmRes)=> {
        console.log('userStatusHandler: ',confirmRes,' ,this.state.changeStatusAct: ',this.state.changeStatusAct,', this.state.changeStatusName: ',this.state.changeStatusName);
        if(confirmRes){
            this.socket.emit(this.state.changeStatusAct, {name:this.state.changeStatusName,date:Date.now()},(err,userData)=>{
                console.log("userStatusHandler callback err: ",err," ,userData: ",userData);
                if(err) {
                    this.setState({
                        modalWindow:true,
                        err:{message:err},
                        changeStatusHandler:false,
                        changeStatusName:"",
                        changeStatusAct:"",
                        confirmMessage:""
                    })
                }else {
                    this.setState({
                        users:userData.contacts,
                        blockedContacts:userData.blockedContacts,
                        changeStatusHandler:false,
                        changeStatusName:"",
                        changeStatusAct:"",
                        confirmMessage:""
                    });

                }
            })
        }else{
            this.setState({
                changeStatusHandler:false,
                changeStatusName:"",
                changeStatusAct:"",
                confirmMessage:""
            });
        }
    };

    onContextMenuHandler =(res,username)=>{
        switch (res) {
            case "deleteUser":
                console.log("onContextMenuHandler deleteUser");
                this.setState({
                    changeStatusHandler:true,
                    confirmMessage:"Are you sure you want to delete a user "+username+"?",
                    changeStatusName:username,
                    changeStatusAct:"deleteUser",
                });
                break;
            case "banUser":
                console.log("onContextMenuHandler banUser");
                this.setState({
                    changeStatusHandler:true,
                    confirmMessage:"Are you sure you want to ban a user "+username+"?",
                    changeStatusName:username,
                    changeStatusAct:"banUser",
                });
                break;
            case "unBanUser":
                console.log("onContextMenuHandler unBanUser");
                this.socket.emit('unBanUser', {name:username,date:Date.now()},(err,userData)=>{
                    console.log("unBanUser callback err: ",err," ,userData: ",userData);
                    if(err) {
                        this.setState({
                            modalWindow:true,
                            err:{message:err},
                            changeStatusHandler:false,
                            changeStatusName:"",
                            changeStatusAct:"",
                            confirmMessage:""
                        })
                    }else {
                        this.setState({
                            users:userData.contacts,
                            blockedContacts:userData.blockedContacts,
                        });
                    }
                });
                break;
            case "clearChatWindow":
                console.log("onContextMenuHandler clearChatWindow");
                break;
            case "viewUserData":
                console.log("onContextMenuHandler viewUserData");
                break;
            case "moveOnTop":
                console.log("onContextMenuHandler moveOnTop");
                break;
            case "reqAuth":
                console.log("onContextMenuHandler reqAuth");
                this.setState({reqAddMeName:username},()=>this.addMeHandler(true));
                break;
            default:
                console.log("onContextMenuHandler Sorry, we are out of " + res + ".");
        }
    };

    //Group functional
    createRoom =(roomName)=>{
        this.socket.emit('createRoom',roomName,(err)=>{
            if(err){
                this.setState({
                    modalWindow:true,
                    err:{message:err},
                })
            }else {
                this.setState({rooms:[...this.state.rooms,{name:roomName,enable:true,messages:[]}]})
            }
        })
    };

    inviteUserToRoom =(roomName,invitedUser)=>{

    };

    leaveRoom =(roomName)=>{

    };

    getRoomLog =(reqRoomName,reqMesCountCb)=>{
        let reqRoom = this.state.rooms[this.getUsersIdx("rooms",reqRoomName)];
        this.socket.emit('getUserLog',reqRoomName,reqMesCountCb,(err,room)=>{
            if(err) {
                this.setState({
                    modalWindow:true,
                    err:{message:err},
                })
            }else {
                room.messages.map(itm => itm.date = this.dateToString(itm.date));
                reqRoom = room;
                this.setState({reqRoom});
            }
        })
    };



    render() {

        console.log('/chat user:', this.state);
        if(this.state.errorRedirect) {return <Redirect to='/error'/>}//passing props in Redirect to={{pathname:'/error',state:{error:this.state.err}}} get props: this.props.location.state.error
        if(this.state.loginRedirect) {return <Redirect to='/login'/>}
        return (
            <Page user={this.state.user} title="CHAT PAGE" className="container">
                {this.state.modalWindow ?
                    <Modal show={this.state.modalWindow} handleClose={this.hideModal} err={this.state.err}/>
                :""}
                {this.state.addMeHandler ?
                    <Confirm confirmHandler={this.addMeHandler} show={this.state.addMeHandler} message={this.state.confirmMessage}/>
                :""}
                {this.state.resAddMeHandler ?
                    <Confirm confirmHandler={this.resAddMeHandler} show={this.state.resAddMeHandler} message={this.state.confirmMessage}/>
                :""}
                {this.state.changeStatusHandler ?
                    <Confirm confirmHandler={this.userStatusHandler} show={this.state.changeStatusHandler} message={this.state.confirmMessage}/>
                :""}
                <div className="chat-room">
                    <div className="chat-users">
                        <div className="login-form">
                            <input name="nameSearchInp" className="form-control searchInChat" autoComplete="off" autoFocus placeholder="Search..."
                                    onChange={ev => this.setFiltered(ev.target.value)}
                            />
                            <div className="userList white">white list users</div>
                            {this.state.filteredUsers.length === 0?
                                    (this.state.foundContacts.length !== 0)? (
                                        this.state.foundContacts.map((name,i) =><UserBtn
                                            key={i}
                                            i={i}
                                            name={name}
                                            addMe={() => this.addMe(name)}
                                        />)
                                    ):this.state.users.map((itm,i) => <UserBtn
                                            key={i}
                                            itm={itm}
                                            i={i}
                                            getUserLog={() => this.getUserLog("users",itm.name,null)}
                                            inxHandler={()=> this.inxHandler("users",i)}
                                            messageBlockHandlerId={this.state.messageBlockHandlerId}
                                            onContextMenuHandler={this.onContextMenuHandler}
                                            banList={false}
                                        />)
                                : this.state.users.filter(items => this.state.filteredUsers
                                        .map(i => i.name)
                                        .includes(items.name))
                                        .map((itm,i) => <UserBtn
                                            key={i}
                                            itm={itm}
                                            i={this.getUsersIdx("users",itm.name)}
                                            getUserLog={() => this.getUserLog("users",itm.name,null)}
                                            inxHandler={() => this.inxHandler("users",i)}
                                            messageBlockHandlerId={this.state.messageBlockHandlerId}
                                            onContextMenuHandler={this.onContextMenuHandler}
                                            banList={false}
                                        />
                                )}

                            {this.state.blockedContacts.length !== 0 ?
                                    <div>
                                        <div className="userList black">black list users</div>
                                        {
                                            this.state.blockedContacts.map((itm,i) =>
                                                <UserBtn
                                                    key={i}
                                                    itm={itm}
                                                    i={i}
                                                    getUserLog={() => this.getUserLog("blockedContacts",itm.name,null)}
                                                    inxHandler={() => this.inxHandler("blockedContacts",i)}
                                                    messageBlockHandlerId={this.state.messageBlockHandlerId}
                                                    onContextMenuHandler={this.onContextMenuHandler}
                                                    banList={true}
                                                />)
                                        }
                                    </div>
                                :""}
                            {this.state.rooms.length !== 0 ?
                                    <div>
                                        <div className="userList white">group list</div>
                                        {
                                            this.state.rooms.map((itm,i) =>
                                                <UserBtn
                                                    key={i}
                                                    itm={itm}
                                                    i={i}
                                                    getUserLog={() => this.getRoomLog("rooms",itm.name,null)}
                                                    inxHandler={() => this.inxHandler("rooms",i)}
                                                    messageBlockHandlerId={this.state.messageBlockHandlerId}
                                                    //onContextMenuHandler={this.onContextMenuHandler}
                                                />)
                                        }
                                    </div>
                                :""}
                        </div>
                    </div>

                    {
                        ((a,e) => {
                            //console.log('message-block: e:',e,", a:",a);
                            let eUser = {};
                            if(a && e !== undefined) {eUser = this.state[a][e]}
                            else{eUser = undefined}
                            return (
                                <div className="message-block">
                                    <div name="chatRoom" id="chatDiv">
                                        <ul name="InpUl" className="chat-list" ref="InpUl">
                                            {
                                                (eUser) ? (
                                                    eUser.messages.map((data, i) => {
                                                        return (
                                                            <li key={i}
                                                                className={(data.user === this.state.user.username) ? ("right") : ("")}>{data.text} <span className="messageData">{data.user}<span className="messageTime">{data.date}</span></span></li>
                                                        )
                                                    })
                                                ) : ("")
                                            }
                                        </ul>

                                                <form onSubmit={(ev) => {
                                                    ev.preventDefault();
                                                    ev.stopPropagation();
                                                    this.sendMessage(eUser.name)
                                                }}
                                                      name="chatRoomForm" className="writeMessWrapp">
                                                    <div className="input-group writeMess">
                                                        <textarea name="formInp" className="form-control" autoComplete="off"
                                                               autoFocus placeholder="Message..."
                                                               value={this.state.message}
                                                               onChange={ev => (this.typing(eUser.name, ev))}
                                                        />
                                                        {
                                                            (a !== "blockedContacts") ?

                                                            <button onClick={() => this.sendMessage(eUser.name)} name="msgBtn" type="button" className="btn">SEND</button>

                                                            :

                                                            <button onClick={() => this.resAddMe(eUser.name)} name="msgBtn" type="button" className="btn">ALLOW USER</button>


                                                        }

                                                    </div>
                                                </form>


                                    </div>
                                </div>
                            );
                        })(this.state.arrayBlockHandlerId,this.state.messageBlockHandlerId)
                     }

                </div>
            </Page>
        );
    }
}

export default Chat;


