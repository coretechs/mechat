"use strict";

function getUser (name) {
    for(let i = 0; i < APP.users.length; i++) {
        if(APP.users[i].name === name) return name;
    }
    return false;
}

function getPubKey (name) {
    for(let i = 0; i < APP.users.length; i++) {
        if(APP.users[i].name === name) return APP.users[i].pubKey;
    }
    return false;
}

function getRoom (room) {
    if(room.substring(0, 1) !== "#") return false;
    for(let i = 0; i < APP.rooms.length; i++) {
        if(APP.rooms[i].room === room) return room;
    }
    return false;
}

function setName (name) {
    APP.socket.emit("set name", name, function (result) {
        processMessage(result.message);
        if(result.success) {
            APP.keys = generateKeys();
            APP.pubKey = APP.keys.p;
            APP.socket.emit("set pubkey", APP.pubKey, function (result) {
                processMessage(result.message);
                if(result.success) {
                    APP.name = name;
                    setCookie("name", name, 1);
                    toggleName("name");
                }
            });
        }
    });
}

function processCommand (message) {
    let parsed = message.split(/[ ]+/).filter(Boolean);
    let command = parsed[0];
    let room = "", recipient = "", pass = "", hash = "", action = "";
    
    switch (command) {
        case "/join":
            room = parsed[1].substring(0, 1) !== "#" ? "#" + parsed[1] : parsed[1];
            pass = parsed[2] || "";
            hash = sha256.hex(pass);

            APP.roomPasses[room] = pass;

            if(room.length > APP.maxRoomLength) {
                processMessage({ type: 4, message: "error: room name can not be longer than " + APP.maxRoomLength - 1 + " characters" });
                return;
            }
            APP.socket.emit("join room", room, hash, function (result) {
                if(result.success) {
                    createTab(room, 2, true);
                }
                processMessage(result.message);
            });
            break;
        case "/leave":
            room = parsed[1].substring(0, 1) !== "#" ? "#" + parsed[1] : parsed[1];
            
            if(room.length > APP.maxRoomLength) {
                processMessage({ type: 4, message: "error: room name can not be longer than " + APP.maxRoomLength - 1 + " characters" });
                return;
            }
            if(getRoom(room)) {
                delete APP.roomPasses[room];
                delete APP.messages[room];
                APP.socket.emit("leave room", room, function (result) {
                    closeTab(room, false);
                    processMessage(result.message);
                });
            }
            break;
        case "/msg": 
            recipient = parsed[1];

            message = message.slice(message.indexOf(parsed[1]) + parsed[1].length).trim();

            if(message.length) {
                if(getUser(recipient)) {
                    createTab(recipient, 1, true);
                    let messageId = getMessageId();
                    let m = {
                        type: 1,
                        message: encryptMessage(message, messageId, APP.secrets[recipient]),
                        messageid: messageId,
                        recipient: recipient
                    };
                    sendTo(m);
                }
                else if(getRoom(recipient)) {
                    createTab(recipient, 2, true);
                    let messageId = getMessageId();
                    let roomPass = APP.roomPasses[recipient];
                    let passHash = sha256.hex(roomPass);
                    let m = {
                        type: 2,
                        message: encryptMessage(message, messageId, roomPass),
                        id: messageId,
                        recipient: recipient,
                        hash: passHash
                    };
                    sendTo(m);
                }
                else processMessage({ type: 4, message: "error: invalid or disconnected user/room" });
            }
            break;
        case "/me":
            action = message.slice(3).trim();
            recipient = APP.activeTab;
            if(action.length) {
                let m = {
                    type: 3,
                    message: action,
                    recipient: recipient,
                    hash: APP.roomPasses[recipient] ? sha256.hex(APP.roomPasses[recipient]) : sha256.hex("")
                };
                sendTo(m);
            }
            break;
        default: processMessage({ type: 4, message: "error: invalid command or missing parameter" });
    }
}

function displayMessage (message) {
    DOM.messages.appendChild(message);
    DOM.messages.scrollTop = DOM.messages.scrollHeight;
}

function sendTo (message) {
    if(!message.message.length) return;
    APP.socket.emit("message", message);
}

function processMessage (message) {
    message.sender = message.sender || "server";
    message.recipient = message.recipient || "server";
    let tab = message.recipient.substring(0, 1) === "#" ? message.recipient : APP.name === message.sender ? message.recipient : message.sender;

    if(message.type === 1) {
        try {
            message.message = decryptMessage(message.message, message.messageid, APP.secrets[tab]);
        }
        catch(ex) {
            processMessage({ type: 4, message: ex });
            throw new Error(ex);
        }       
    }

    if(message.type === 2) {
        try {
            message.message = decryptMessage(message.message, message.id, APP.roomPasses[message.recipient]);
        }
        catch(ex) {
            processMessage({ type: 4, message: ex });
            throw new Error(ex);
        }       
    }

    let msg = createMessage(message);
    createTab(tab, message.type, false);
    
    if(APP.activeTab !== tab) APP.blinkTab[tab] = true;
    if(message.sender !== APP.name) APP.blink = true;

    if(message.recipient === APP.name) {
        APP.socket.emit("receipt", { messageid: message.messageid, sender: message.sender, recipient: message.recipient });
    }

    if(message.recipient.substring(0, 1) === "#" || message.sender !== APP.name) {
        APP.messages[tab] = (APP.messages[tab] || "") + msg.outerHTML;
    }
        
    if(APP.activeTab === tab || message.type > 3) {
        displayMessage(msg);    
    }
}

function processMessages (messages) {
    messages.forEach(function (message) {
        processMessage(message);
    });
}

function processReceipt (receipt) {
    let r = document.getElementById(receipt.messageid);
    
    if(r) {
        //set checkmark
        r.innerHTML = "&#10003;";
        //save message
        APP.messages[receipt.recipient] = (APP.messages[receipt.recipient] || "") + r.parentElement.outerHTML;
    }        
}

function connect () {
    DOM.chatServer.textContent = location.hostname;
    DOM.connIndicator.className = "connected";
}

function disconnect () {
    DOM.chatServer.textContent = "disconnected";
    DOM.connIndicator.className = "disconnected";
}

function initSocket (data) {
    if(APP.instance && APP.instance !== data.instance) {
        APP.socket.disconnect();
        location.reload(true);
        return;
    }
    APP.version = data.version;
    APP.instance = data.instance;

    if(APP.name) setName(APP.name);
}

function init () {
    window.onclick = function () { APP.blink = false; };
    window.onkeydown = function () { APP.blink = false; };
    window.onmouseover = function () { APP.blink = false; };

    createServerTab();
    
    DOM.nameInput.focus();
}

const APP = {
    version: 0,
    instance: 0,
    name: getCookie("name") || "",
    socket: io.connect(location.protocol + "//" + location.hostname + ":" + location.port, { "sync disconnect on unload": true }),
    users: [],
    rooms: [],
    maxNameLength: 20,
    maxRoomLength: 21,
    maxMessageLength: 16384,
    activeTab: "",
    blink: false,
    blinkTab: {},
    messages: {},
    roomPasses: {},
    keys: {},
    secrets: {}
};

const DOM = {
    myName: document.getElementById("myName"),
    nameInput: document.getElementById("nameInput"),
    chatServer: document.getElementById("chatServer"),
    connIndicator: document.getElementById("connIndicator"),
    tabs: document.getElementById("tabs"),
    chatInputArea: document.getElementById("chatInputArea"),
    chatInput: document.getElementById("chatInput"),
    messages: document.getElementById("messages"),
    userList: document.getElementById("userList"),
    roomList: document.getElementById("roomList"),
};

APP.socket.on("connect", connect);
APP.socket.on("init", initSocket);
APP.socket.on("users", updateUsers);
APP.socket.on("rooms", updateRooms);
APP.socket.on("message", processMessage);
APP.socket.on("messages", processMessages);
APP.socket.on("receipt", processReceipt);
APP.socket.on("disconnect", disconnect);

DOM.nameInput.onkeydown = function (e) {
    if(e.key === "Escape") {
        toggleName("name");
        return;
    }
    if(e.key !== "Enter") {
        return;
    }
    e.preventDefault();

    if(APP.name === this.value) toggleName("name");
    else setName(this.value);
};

DOM.nameInput.onkeyup = function (e) {
    if(this.value.length > APP.maxNameLength) {
        this.value = this.value.slice(0, APP.maxNameLength);
    }
    e.preventDefault();
};

DOM.nameInput.onblur = () => {
    toggleName("name");
};

DOM.chatInput.onkeydown = function (e) {
    if(e.key !== "Enter") {
        return;
    }
    e.preventDefault();
    if(!APP.name.length) {
        processMessage({ type: 4, message: "*** you need to choose a name first ***" });
        return;
    }
    if(this.value.substring(0, 1) === "/") processCommand(this.value);
    else {
        processCommand("/msg " + APP.activeTab + " " + this.value);
    }
    this.value = "";
};

DOM.chatInput.onkeyup = function (e) {
    if(this.value.length > APP.maxMessageLength) {
        this.value = this.value.slice(0, APP.maxMessageLength);
    }
};

DOM.myName.onclick = function (e) {
    toggleName("input");
};

// main timer
setInterval(function () {
    if(APP.blink) {
        document.title = "";
        setTimeout("document.title = \"mechat.io\"", 500);
    }
    Object.keys(APP.blinkTab).forEach(function (name) {
        if(APP.blinkTab[name] === true) {
            let t = document.getElementById(name + "_tab");
            t.firstElementChild.style.opacity = 0.5;
            setTimeout(function () {
                t.firstElementChild.style.opacity = 1;
            }, 500);    
        }
    });
}, 1000);

init();

