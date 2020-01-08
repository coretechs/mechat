"use strict";

const fs = require("fs"),
    config = require("config"),
    request = require("request"),
    compress = require("compression"),
    favicon = require("serve-favicon"),
    sha256 = require("js-sha256"),
    express = require("express"),
    http = require("http"),
    https = require("https"),
    socketio = require("socket.io"),
    app = express();

const ENV = config.get("env"),
    HOST = config.get("host"),
    PORT = config.get("port"),
    VERSION = JSON.parse(fs.readFileSync("package.json")).version,
    START_TS = Date.now(),
    HISTORY = 50,
    OPENROOMHASH = sha256("");

const server = http.createServer(app);

const io = socketio(server, { "sync disconnect on unload": true });

const messages = {};
let roomHashes = {};

function byteArrToHex (byteArr) {
    let hex = "", h = "", x = "", len = byteArr.length;
    for(let i = 0; i < len; i++) {
        x = byteArr[i];
        h = x.toString(16);
        if (x < 16) h = "0" + h;
        hex += h;
    }
    return hex;
}

function hexToByteArr (hex) {
    let arr = [];
    for(let i = 0; i < hex.length; i += 2) {
        arr.push(parseInt(hex.substr(i, 2), 16));
    }
    return arr;
}

function createMessage (message) {
    return { 
        type: message.type || 0,
        sender: message.sender || HOST,
        recipient: message.recipient || HOST,
        ts: message.ts || getFormattedUTCTimestamp(),
        message: message.message || ""
    };
}

function broadcastMessage (message) {
    let msg = createMessage(message);
    messages[HOST].push(msg);
    io.emit("message", msg);
}

function serverMessageToRoom (room, message) {
    io.to(room).emit("message", createMessage({ type: 0, sender: room, recipient: room, message: message }));
}

function getUsers () {
    return Object.keys(io.sockets.sockets).map(id => {
        let s = io.sockets.sockets[id];
        return { name: s.name, pubKey: s.pubKey };
    })
    .filter(p => p.pubKey);
}

function getUsersInRoom (room) {
    let p = io.sockets.adapter.rooms[room];

    if(p) {
        return Object.keys(p.sockets).map(socket => io.sockets.connected[socket].name);
    }
    return 0;
}

function getRooms () {
    let rooms = Object.keys(roomHashes).filter(room => io.sockets.adapter.rooms[room]).map(room => {
        let users = getUsersInRoom(room);
        if(users) return { room: room, hash: roomHashes[room] === OPENROOMHASH ? false : true, users: users };
    });

    let hashes = {};
    rooms.forEach(r => {
        if(roomHashes[r.room]) hashes[r.room] = roomHashes[r.room];
    });
    roomHashes = hashes;

    return rooms;
}

function getRoom (room) {
    if(room.substring(0, 1) !== "#") return 0;
    if(io.sockets.adapter.rooms[room]) return room;
    return 0;
}

function getSocketByName (name) {
    for(let i = 0, ids = Object.keys(io.sockets.sockets); i < ids.length; i++) {
        let s = io.sockets.sockets[ids[i]];
        if(s.name === name) return s;
    }
    return 0;
}

function socketReady (socket) {
    if(socket.name && socket.name.length) return true;
    socket.emit("message", createMessage({ type: 4, message: "*** you need to choose a name first ***" }));
    return false;
}

function setSocketName (socket, name, next) {
    let oldname = socket.name;

    let result = { 
        success: false,
        message: createMessage({ message: "unknown error" })
    }

    if(!name || !name.length || name === HOST) {
        result.message = createMessage({ type: 4, message: "invalid or missing name" });
        next(result);
        return;
    }
    if(name.length > 20) {
        result.message = createMessage({ type: 4, message: "name can not be longer than 20 characters" });
        next(result);
        return;
    }
    if(getSocketByName(name)) {
        result.message = createMessage({ type: 4, message: "name unavailable" });
        next(result);
        return;
    }
    if(!validNameFormat(name)) {
        result.message = createMessage({ type: 4, message: "name can only contain alphanumeric/hyphen/underscore characters" });
        next(result);
        return;
    }

    socket.name = name;
    result.success = true;
    result.message = createMessage({ message: "name set to [" + socket.name + "]" });
    next(result);

    console.log(result.message.message + " for socket: " + socket.client.id);

    if(socket.init) {
        socket.init = false;
        broadcastMessage({ message: "[" + socket.name + "] connected" });
        return;
    }
    
    broadcastMessage({ message: "[" + oldname + "] renamed to [" + socket.name + "]" });
}

function setSocketPubKey (socket, pubKey, next) {
    let result = { 
        success: false,
        message: createMessage({ message: "invalid pubkey" })
    }

    if(pubKey.length === 32) {
        socket.pubKey = pubKey;
        result.success = true;
        result.message = createMessage({ message: "public key set to [" + byteArrToHex(pubKey) + "]" });
    }

    io.emit("users", getUsers());
    io.emit("rooms", getRooms());

    next(result);
}

function validNameFormat (string) {
    return string.match(/^[a-z0-9-_]+$/i);
}

/* pad number with leading 0 */
function pad (num, size) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
}

function getFormattedUTCTimestamp () {
    let months = { 1:"Jan", 2:"Feb", 3:"Mar", 4:"Apr", 5:"May", 6:"Jun", 7:"Jul", 8:"Aug", 9:"Sep", 10:"Oct", 11:"Nov", 12:"Dec" };
    let d = new Date();
    return pad(d.getUTCDate(), 2) + "-" + months[d.getUTCMonth() + 1] + "-" + d.getUTCFullYear() + " " + pad(d.getUTCHours(), 2) + ":" + pad(d.getUTCMinutes(), 2) + ":" + pad(d.getUTCSeconds(), 2) + " UTC";
}

app.set("json spaces", 2);
app.use(compress());

/* third party libraries*/
app.locals.thirdparty = fs.readFileSync(__dirname + "/js/curve25519.js") + 
                        fs.readFileSync(__dirname + "/js/js-sha256.js");
/* cache client side js */
app.locals.main       = fs.readFileSync(__dirname + "/js/client.js") +
                        fs.readFileSync(__dirname + "/js/util.js") +
                        fs.readFileSync(__dirname + "/js/crypto.js") +
                        fs.readFileSync(__dirname + "/js/ui.js");

app.use(favicon(__dirname + "/favicon.ico"));
app.use("/css", express.static(__dirname + "/css"));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/js/:file.js", (req, res, next) => {
    if(app.locals[req.params.file]) {
        res.type("application/javascript");
        res.send(app.locals[req.params.file]);
        return;
    }
    next();
});

app.get("/messages", (req, res) => {
    res.json({ messages: messages[HOST] });
});

app.get("/messages/:room", (req, res, next) => {
    let room = "#" + req.params.room;
    if(getRoom(room)) res.json({ messages: messages[room] });
    next();
});

io.on("connection", socket => {
    console.log("new socket connected: " + socket.client.id);

    socket.name = "";
    socket.pubKey = [];
    socket.authcode = sha256(socket.client.id + "authcode").slice(0, 16);
    socket.init = true;
    
    socket.emit("init", { version: VERSION, instance: START_TS });
    socket.emit("message", createMessage({ type: 7, message: "please enter a name to enable chat" }));
    
    socket.on("set name", (name, next) => {
        setSocketName(socket, name, next);
    });

    socket.on("set pubkey", (pubKey, next) => {
        setSocketPubKey(socket, pubKey, next);
    });
    
    socket.on("join room", (room, hash, next) => {
        if(!socketReady(socket)) return;
        if(room.substring(0, 1) !== "#") room = "#" + room;
        if(room.length > 21) {
            next({ success: false, message: createMessage({ type: 4, message: "*** room name can not be longer than 20 characters ***" }) });
            return;
        }
        if(getRoom(room)) {
            if(roomHashes[room] !== hash) {
                next({ success: false, message: createMessage({ type: 4, message: "*** invalid password for [" + room + "] ***" }) });
                return;
            }
            socket.join(room);
            socket.emit("messages", messages[room]);
        } 
        else {
            messages[room] = messages[room] || [];
            roomHashes[room] = hash;
            socket.join(room);
            socket.emit("messages", messages[room]);
            io.emit("rooms", getRooms());
        }
        next({ success: true, message: createMessage({ message: "joined room [" + room + "]" }) });
        let users = getUsersInRoom(room);
        serverMessageToRoom(room, "[" + socket.name + "] has joined [" + room +"]");
        serverMessageToRoom(room, users.length + " user(s) in room: [" + users.join(", ") + "]");
    });
    
    socket.on("leave room", (room, next) => {
        if(!socketReady(socket)) return;
        if(room.substring(0, 1) !== "#") room = "#" + room;
        if(socket.rooms[room]) {
            socket.leave(room);
            io.emit("rooms", getRooms());
            next({ success: true, message: createMessage({ message: "left room [" + room + "]" }) });
            if(getRoom(room)) {
                let users = getUsersInRoom(room);
                serverMessageToRoom(room, "[" + socket.name + "] has left [" + room +"]");
                serverMessageToRoom(room, users.length + " user(s) in room: [" + users.join(", ") + "]");
            }
            return;
        }
        next({ success: false, message: createMessage({ type: 4, message: "*** user is not in room [" + room + "] ***" }) });
    });

    socket.on("message", message => {
        if(!socketReady(socket)) return;
        if(!message.message) return;
        if(message.message.length > 2048) {
            socket.emit("message", createMessage({ type: 4, message: "*** exceeded max message length of 2048 ***" }));
            return;
        } 

        message.sender = socket.name;
        message.ts = getFormattedUTCTimestamp();

        if(message.recipient.substring(0, 1) === "#") {
            let room = getRoom(message.recipient);

            if(room && message.hash === roomHashes[room]) {
                if(message.hash === OPENROOMHASH) messages[room].push(message);
                delete message.hash;
                socket.nsp.to(room).emit("message", message);
            }
        }
        else {
            let recipient = getSocketByName(message.recipient);
            if(recipient) {
                socket.emit("message", message);
                recipient.emit("message", message);
            }
        }
    });

    socket.on("receipt", receipt => {
        if(!socketReady(socket)) return;
        let s = getSocketByName(receipt.sender);
        s.emit("receipt", receipt);
    });

    socket.on("disconnect", () => {
        console.log("disconnect: " + socket.id);
        if(socket.name) {
            broadcastMessage({ message: "[" + socket.name + "] disconnected" });
            delete socket.name;
            delete socket.pubKey;
        }
        io.emit("users", getUsers());
    });

    socket.on("error", error => {
        console.log("socket error: " + error);
    });
});

server.listen(PORT, () => {
    // init here
    messages[HOST] = [];
    console.log("Express server started on port " + server.address().port);
});