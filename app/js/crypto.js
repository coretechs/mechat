function generateMessageIV () {
    let IV = new Uint8Array(32),
        crypto = window.crypto || window.msCrypto;

    try {
        crypto.getRandomValues(IV);
        return sha256.hex(IV);
    }
    catch(ex) {
        alert(ex);
        throw new Error(ex);
    }
}

function generateKeys () {
    let randomBytes = new Uint8Array(32),
        crypto = window.crypto || window.msCrypto,
        seed = [];

    try {
        crypto.getRandomValues(randomBytes);
        seed = sha256.digest(randomBytes);
        return curve25519.keygen(seed);
    }
    catch(ex) {
        alert(ex);
        throw new Error(ex);
    }
}

function cipher (messageBytes, messageId, secret) {
    let pad = sha256.hex(messageId + secret),
        padBytes = hexToByteArr(pad),
        cipherBytes = [];

    while(messageBytes.length > padBytes.length) {
        pad += sha256.hex(messageId + pad);
        padBytes = hexToByteArr(pad);
    }

    for(let x = 0; x < padBytes.length; x++) {
        let messageByte = messageBytes[x] !== undefined ? messageBytes[x] : 32;
        cipherBytes[x] = messageByte ^ padBytes[x];
    }

    return cipherBytes;
}

function getSharedSecret (privKeyA, pubKeyB) {
    return sha256.hex(curve25519.sharedSecret([], privKeyA, pubKeyB).Z);
}

function encryptMessage (message, messageId, secret) {
    let cipherBytes = cipher(strToUTF8Arr(message), messageId, secret),
        mac = sha256.digest(cipherBytes.concat(hexToByteArr(secret)));
    return byteArrToHex(cipherBytes.concat(mac));
}

function decryptMessage (message, messageId, secret) {
    let cipherBytes = hexToByteArr(message),
        macBytes = cipherBytes.splice(-32),
        macDigest = sha256.digest(cipherBytes.concat(hexToByteArr(secret)));

    if(macBytes.toString() === macDigest.toString()) {
        return byteArrToUTF8Str(cipher(cipherBytes, messageId, secret)).trim();  
    }
    throw new Error("Message authentication failed.");
}

const getMessageId = (function () {
    let messageIV = generateMessageIV(),
        messageId = sha256.hex(messageIV);

    return  function () { 
                messageId = sha256.hex(messageId + messageIV);
                return messageId;
            };
})();

