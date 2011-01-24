

$.widget("ui.chatroom", {
    // default options    
    options: {
        userID: (new Date).valueOf().toString(),
        userName: 'Unknown_' + (new Date).valueOf().toString(),
        title: "Chat",
        mainChannel: (new Date).valueOf().toString().match(/\d{6}/)
    },

    //class level vars are built from mainChannel's value and are set in _init.
    membersChannel: "",
    userChannel: "",    

    _create: function() {        
        var self = this //the only forseeable way to get the handle to the element in the callbacks.
        this.element.addClass( "ui-widget ui-widget-content ui-corner-all" )
        //DOM elements for this widget's instance
        chatBox=$("<div class='chat-box'></div>"),
        chatMembers=$("<div class='chat-members'></div>"),
        chatInput=$("<div class='chat-input'></div>"),
        chatTextBox=$('<input type="text" class="chat-textbox"></input>'),
        chatButton=$('<input type="button" value="Send" class="chat-button"></input>')
        chatBox
            .addClass("ui-corner-all")
            .appendTo(this.element);
        chatMembers
            .addClass("ui-corner-all")
            .appendTo(this.element);
        //append the inputs to the input div
        chatTextBox.appendTo(chatInput);
        chatButton.button();
        chatButton.appendTo(chatInput);
        //append the input div to the main element
        chatInput.appendTo(this.element);
        this.element.dialog({
            title:this.options.title,
            autoOpen: true,
            modal: false,
            width: 685,
            height:215,
            close: function() {
                self.element.chatroom('destroy');
            }
        });

        
        this.element.find(".chat-button:first").bind('click', function(){
            self.element.chatroom("publish");
        });
        this.element.find(".chat-textbox:first").bind('keyup', function(e){
            if (((e.keyCode || e.which) == 13) && (($(this).val().replace(/\s+$/,"") != ""))){
                self.element.chatroom("publish");
            }
        });
        this.element.find("a.chat-invite").live('click', function(e){
            aId = ($(this).attr('href')).split("/");
            self.element.chatroom("invite", aId[1])
            return false;
        });
        this.element.find("a.chat-join").live('click', function(e){
            aId = ($(this).attr('href')).split("/");
            self.element.chatroom("join", aId[1]);
            return false;
        });
    },
    _init: function(){
        this.membersChannel = this.options.mainChannel + "_members";
        this.userChannel = this.getUserChannel(this.options.userID);
        this.subscribe();
    },    

    getUserChannel: function(userID){
        return this.options.mainChannel + "_user_" + userID;
    },

    getUserName: function(){
        return this.options.userName;
    },
    
    subscribe: function(){
        console.log("subscribing " + this.getUserName());
        var self = this//.element; //need to get the handle to the object for use inside internal callbacks' scope
        //on subscribe, publish IN status to the membersChannel (to show name in the members list a.k.a "who's in the room"
        PUBNUB.publish({
            channel : this.membersChannel,
            message : (+new Date()) + "::" + this.options.userName + "::" + this.options.userID + "::IN",
            callback : function() {
                self.element.chatroom("updateUserList");
            }        
        });
      
        //subscribe to the mainChat channel for this room.
        var mainChannelTarget = this.element.children('.chat-box');
        PUBNUB.subscribe({
            channel : this.options.mainChannel,
            callback : function(message) {
                //alert(message);
                //$(mainChannelTarget).css("border", 'solid thin blue');
                var osh = $(mainChannelTarget).attr("scrollHeight");
                $(mainChannelTarget).html( mainChannelTarget.html() + '<br/>' + message);
                var nsh = $(mainChannelTarget).attr("scrollHeight");
                if( nsh > osh ){
                    $(mainChannelTarget).animate({
                        scrollTop: nsh
                    }, 'normal');
                }
            },
            error : function(e) {
                console.log(e);
            }
        });

        //subscribe to the user's private channel for this room.
        //yes this uses the same frikkin callback as the above...when i find a way, i will consolidate.
        PUBNUB.subscribe({
            channel : this.userChannel,
            callback : function(message) {
                var osh = $(mainChannelTarget).attr("scrollHeight");
                $(mainChannelTarget).html( mainChannelTarget.html() + '<br/>' + '<i>' + message + '</i>');
                var nsh = $(mainChannelTarget).attr("scrollHeight");
                if( nsh > osh ){
                    $(mainChannelTarget).animate({
                        scrollTop: nsh
                    }, 'normal');
                }
            },
            error : function(e) {
                console.log(e);
            }
        });
        
        //subscribe to the (member) list channel for this room (to see the users subscribed to the room)        
        PUBNUB.subscribe({
            channel : this.membersChannel,
            callback : function() {
                //alert('got a message for members channel.');
                self.element.chatroom("updateUserList");
            },
            error : function(e) {
                console.log(e);
            }
        });
    },

    publish: function(){
        var source = this.element.find('.chat-textbox:first')
        PUBNUB.publish({
            channel : this.options.mainChannel,
            message : this.options.userName + ": " + $(source).val()
        });
        $(source).val('');
        
    },

    //publish to a user's private channel.
    invite: function(userID){            
        //get the user's private channel
        var channel = this.getUserChannel(userID);
        //generate the private room's ID.
        var childID=(((1+Math.random())*0x10000)|0).toString(16).substring(1);
        var roomID=this.options.mainChannel + "_" + childID;        
        //send the invite to the target user
        PUBNUB.publish({
            channel : channel,
            message : this.options.userName + " has invited you to private chat <a href='join/" + roomID + "' class='chat-join'>[link to room]</a>"
            //message : this.options.userName + " has invited you to private chat [link to room]"
        });
        //send a notification to the invitor too
        PUBNUB.publish({
            channel : this.userChannel,
            message : "You sent an invite to a private chat..."
        });
        //instance and launch a new chatroom with the generated roomID.
        //The message sent to the invitee will trigger it's own event handler and launch the room.
        this._launchChildRoom(roomID);        
    },

    //join a specific room
    join: function(roomID){
        //alert('joining: '+ roomID);
        this._launchChildRoom(roomID);
    },

    _launchChildRoom: function(roomID){
        childChatArea = $("<div class='new-chat-area chat-area'></div>");
        childChatArea.appendTo(this.element);
        childChatArea.chatroom({mainChannel:roomID, userName:this.options.userName, userID:this.options.userID, title:"Private Room " + roomID})
    },


    //leaving as public method since it's called from within a PUBNUB callback'
    //this grabs all of the subscriber names from history and determines which should be in the member list and puts them there.
    updateUserList: function(){        
        var membersChannelTarget = this.element.children('.chat-members');
        var currentUserID = this.options.userID;
        //console.log("updating member list...");
        PUBNUB.history(
        {
            channel : this.membersChannel,
            limit : 20
        },
        function(messages) {
            users = new Array();
            //console.log(messages);
            messages.sort(); //sort by timestamp            
            jQuery.each( _.uniq(messages, true), function(i, val) {
                user_detail = val.split('::');
                time          = user_detail[0];
                name          = user_detail[1];
                id            = user_detail[2];
                join_status   = user_detail[3];
                identifier = (name + "~" + id);
                if( join_status == 'IN' ){
                    //console.log('adding ' + identifier);
                    users.push(identifier);
                    //console.log(users);
                } else {
                    //console.log('removing ' + identifier)
                    users = _.without(users,identifier);
                    //console.log(users);
                }
            });
            current_users = _.flatten(users);            
            $(membersChannelTarget).html('')            
            jQuery.each( _.uniq(current_users), function(i, val) {
                user = val.split("~");
                name = user[0];
                id = user[1];
                s = ((id == currentUserID) ? name : "<a href='start_private/" +  id + "' class='chat-invite'>" + name + "</a>");
                $(membersChannelTarget).append(s + '<br/>');
            });
        }
        );
    },

    _unsubscribeAll: function(){
        //console.log("unsubscribing " + this.getUserName());
        //console.log((+new Date()) + "::" + this.options.userName + "::" + this.options.userID + "::OUT");
        //unsubscribe from the main channel
        PUBNUB.unsubscribe({
            channel : this.options.mainChannel
        });
        //unsubscribe from the member list channel
        PUBNUB.unsubscribe({
            channel : this.membersChannel
        });
        //unsubscribe from the user channel
        PUBNUB.unsubscribe({
            channel : this.userChannel
        });
        //send our "logout" message to the member list channel.
        PUBNUB.publish({
            channel : this.membersChannel,
            message : (+new Date()) + "::" + this.options.userName + "::" + this.options.userID + "::OUT"
        });
        //send our "logout" message to the main channel.
        PUBNUB.publish({
            channel : this.options.mainChannel,
            message : "<i>" + this.options.userName + " left the room</i>"
        });
    },

    destroy: function() {
        $.Widget.prototype.destroy.apply(this, arguments); // default destroy
        //  do other stuff particular to this widget
        this._unsubscribeAll();
    }
});