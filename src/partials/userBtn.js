import React from 'react';
import OnContextMenu from './onContextMenuWindow.js'
let contentMenuStyle = {
    display: location ? 'block' : 'none',
    position: 'absolute',
    left: location ? location.x : 0,
    top: location ? location.y : 0
};
class UserBtn extends React.Component {

    constructor(props){
        super(props);
        this.state = {
            onContextMenu: false,
            onContextMenuUserName:"",
            authorizedStatus:undefined,
            banStatus:undefined,
            contextMenuLocation: contentMenuStyle
        }
    }

    componentDidMount(){

    }

    rightClickMenuOn =(itm,e)=> {
        //console.log("rightClickMenuOn itm: ",itm);
        //console.log("rightClickMenuOn e.pageX: ",e.pageX," ,e.pageY",e.pageY);
        this.setState({
            onContextMenu:true,
            onContextMenuUserName:itm.name,
            authorizedStatus:itm.authorized,
            banStatus:itm.banned,
            contextMenuLocation: {left: e.pageX, top:e.pageY}
        })
    };

    rightClickMenuOnHide =()=> {
        //console.log("rightClickMenuOnHide");
        this.setState({
            onContextMenu: false,
            onContextMenuUserName:"",
            authorizedStatus:undefined,
            banStatus:undefined,
            contextMenuLocation: contentMenuStyle
        });
    };

    onContextMenuResponse =(res)=> {
        //console.log("onContextMenuResponse res: ", res);
        (()=>{this.props.onContextMenuHandler(res,this.state.onContextMenuUserName)})()
    };

    render() {
        //console.log('UserBtn props: ',this.props);
        let itm = this.props.itm;
        let i = this.props.i;
        return (
            <div key={i}
                 onClick={()=>{
                     if(this.props.addMe) {
                     this.props.addMe()
                 } else {
                         this.props.inxHandler();
                         this.props.getUserLog();
                 }}}
                 onContextMenu={(e)=>{e.preventDefault();this.rightClickMenuOn(itm,e); return false;}}
                 onMouseLeave={this.rightClickMenuOnHide}
                 type="button"
                 className={`btn user ${this.props.messageBlockHandlerId === i ?"clicked ":""}`}>
                {itm ?
                    <div className="userStatus">
                        <ul>
                            <li>
                                {itm.msgCounter !== 0 || itm.msgCounter === undefined ?
                                    <div className="unread-mess">
                                        {itm.msgCounter}
                                    </div>
                                    :""}
                            </li>
                            <li className={` statusNet ${itm.onLine ? "onLine":"offLine"}`}/>
                        </ul>
                    </div>
                    :""}
                {this.props.name ? <font>{this.props.name}</font> : <font color={itm.onLine ? "#fff":"#a09b9b"}>{itm.name}</font>}
                {itm ?
                    <div className="userItm">
                        <div className="typing">
                            {itm.typing ?
                                <div className="loader">
                                    <span/>
                                </div>
                                :""}
                        </div>
                    </div>
                    :""}
                {this.state.onContextMenu ?
                    <OnContextMenu
                        authorizedStatus={this.state.authorizedStatus}
                        banList={this.props.banList}
                        rightClickMenuOnHide={this.rightClickMenuOnHide}
                        onContextMenuResponse={this.onContextMenuResponse}
                        contextMenuLocation={this.state.contextMenuLocation}
                    />
                    :''}
            </div>
        )
    }
}

export default UserBtn;