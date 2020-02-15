# mechat.io
A simple end-to-end encrypted chat using socket.io.

mechat.io implements client-side end-to-end encryption for all private messages using a hash-based block cipher algorithm. It relies on crypto.getRandomValues for seed generation. UTF-8 is supported.

Messages in group chat rooms are encrypted with the room password.