function addHover (e) {
    e.target.classList.add("hover");
}

function removeHover (e) {
    e.target.classList.remove("hover");
}

function createServerTab () {
    let t = document.createElement("span"),
        n = document.createElement("span"),
        name = "server";

    t.id = name + "_tab";
    t.dataset.type = 0;
    t.className = "tabRoom";

    n.innerHTML = name;
    n.className = "activeTab";
    n.id = "serverTab";
    n.onmouseover = addHover;
    n.onmouseout = removeHover;
    n.onclick = function () { selectTab(name); };
    
    t.appendChild(n);

    DOM.tabs.appendChild(t);
    selectTab(name);
}

function createTab (name, type, select) {
    if(APP.name === name) return;
    if(document.getElementById(name + "_tab")) {
        if(select) selectTab(name);
        return;
    }
    
    let t = document.createElement("span"),
        n = document.createElement("span"),
        x = document.createElement("span");

    t.id = name + "_tab";
    t.dataset.type = type;
    t.innerHTML = "|";
    t.className = (type === 2) ? "tabRoom" : "tabName";

    n.innerHTML = name;
    n.className = "inactiveTab";
    n.onmouseover = addHover;
    n.onmouseout = removeHover;
    n.onclick = function () { selectTab(name); };

    x.innerHTML = "&#x2715;";
    x.className = "tabX";
    x.onclick = function () { closeTab(name, true); };

    t.appendChild(n);
    t.appendChild(x);

    DOM.tabs.appendChild(t);
    if(select) selectTab(name);
}

function selectTab (name) {
    let t = document.getElementById(name + "_tab");

    if(t) {
        APP.activeTab = name;
        for(let i = 0; i < t.parentNode.children.length; i++) {
            t.parentNode.children[i].firstElementChild.className = "inactiveTab";
        }
        t.firstElementChild.className = "activeTab";

        DOM.messages.innerHTML = APP.messages[name] || "";
        DOM.messages.scrollTop = DOM.messages.scrollHeight;
    }
    APP.blinkTab[name] = false;
    DOM.chatInput.focus();
}

function closeTab (name, leave) {
    let t = document.getElementById(name + "_tab");
    if(t) {
        // leave room
        if(leave && parseInt(t.dataset.type, 10) === 2) {
            processCommand("/leave " + name);
        }
        
        let lt = t.previousElementSibling.firstElementChild.innerHTML;
        selectTab(lt);
        t.parentNode.removeChild(t);
        t = null;
    }
}

function updateUsers (users) {
    APP.users = users.sort(function (a, b) {
            let ra = a.name,
                rb = b.name;
            if(ra < rb) return -1;
            if(ra > rb) return 1;
            return 0;
        });
    DOM.userList.innerHTML = "";
    for(let i = 0; i < APP.users.length; i++) {
        let name = APP.users[i].name;
        let pubKey = APP.users[i].pubKey;
        
        APP.secrets[name] = getSharedSecret(APP.keys.k, pubKey);
    
        let user = document.createElement("span");
        
        user.dataset.name = name;
        user.title = "Public key: " + byteArrToHex(pubKey);
        
        user.appendChild(document.createTextNode(name));
        
        if(APP.users[i].name !== APP.name) {
            user.onmouseover = addHover;
            user.onmouseout = removeHover;
            user.onclick = function () { createTab(user.dataset.name, 1, true); };
        }
        else user.className = "myUser";
        
        let listitem = document.createElement("div");
        listitem.classList.add("marginLeft");
        listitem.appendChild(user);
        DOM.userList.appendChild(listitem);
    }
}

function updateRooms (rooms) {
    APP.rooms = rooms.sort(function (a, b) {
            let ra = a.name,
                rb = b.name;
            if(ra < rb) return -1;
            if(ra > rb) return 1;
            return 0;
        });
    DOM.roomList.innerHTML = "";
    for(let i = 0; i < APP.rooms.length; i++) {
        let room = APP.rooms[i].room;
            
        let r = document.createElement("span");
        
        r.dataset.room = room;
        r.appendChild(document.createTextNode(room));
        r.onmouseover = addHover;
        r.onmouseout = removeHover;
        r.onclick = function () {
            processCommand("/join " + r.dataset.room);
        };
        
        let listitem = document.createElement("div");
        listitem.classList.add("marginLeft");
        listitem.appendChild(r);
        DOM.roomList.appendChild(listitem);
    }
}

function toggleName (type) {
    if(type === "name" && APP.name.length) {
        DOM.chatInputArea.hidden = false;
        DOM.nameInput.hidden = true;
        DOM.myName.innerHTML = "";
        DOM.myName.appendChild(document.createTextNode(APP.name));
        DOM.myName.hidden = false;
        DOM.chatInput.focus();
    }
    else if(type === "input") {
        DOM.chatInputArea.hidden = true;
        DOM.myName.hidden = true;
        DOM.nameInput.value = APP.name;
        DOM.nameInput.hidden = false;
        DOM.nameInput.focus();
    }
}

function createMessage (message) {
    message.ts = message.ts || getFormattedUTCTimestamp();
    message.time = message.ts.split(" ")[1];

    let s = document.createElement("span"),
        st = document.createElement("span"),
        sr = document.createElement("span"),
        ss = document.createElement("span"),
        b = document.createElement("br"),
        t = document.createElement("span"),
        ts = document.createTextNode(" " + message.time + " ");

    //set message class
    switch (message.type) {
        case 0: s.className = "server_msg"; 
                break;
        case 1: s.className = (APP.name === message.sender) ? "send_private_msg" : "recv_private_msg";
                break;
        case 2: s.className = (APP.name === message.sender) ? "send_room_msg" : "recv_room_msg";
                break;
        case 3: s.className = "status_msg";
                break;
        case 4: s.className = "error_msg";
                break;
        case 5: s.className = "success_msg";
                break;
        case 6: s.className = "attention_msg";
                break;
        case 7: s.className = "info_msg";
                break;
    }

    if(!message.sender) message.sender = "server";
    
    //show receipt
    if(message.messageid) {
        sr.className = "receipt";
        sr.id = message.messageid;
        sr.innerHTML = (APP.name === message.sender) ? "&#10007;" : "&nbsp";
    }

    //timestamp
    st.className = "timestamp";
    st.appendChild(ts);
    st.title = message.ts;
    
    s.appendChild(sr);
    s.appendChild(st);
    
    //show sender
    if(message.type === 1 || message.type === 2) {
        ss.className = "sender";
        ss.innerHTML = "<strong>" + message.sender + "</strong>: ";
        s.appendChild(ss);
    }
    if(message.type === 3) {
        ss.innerHTML = message.sender + " ";
        s.appendChild(ss); 
    }

    t.innerHTML = message.message;

    s.appendChild(t);
    s.appendChild(b);

    return s;
}

