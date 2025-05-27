const WebSocket = require('ws');
const chatState = require('./chatState');
const { updateUserLastSeen, broadcast, broadcastUserList, logMessage } = require('./chatHelpers');

// Core function to handle new connection and initial setup
function handleNewConnection(socket, wss) {
    socket.send('Welcome! Enter your nickname:');

    // Store a temporary state on the socket until nickname is set
    socket.tempNickname = null;

    socket.on('message', (msg) => {
        // Always pass a Buffer to handleMessage for test and runtime consistency
        if (!(msg instanceof Buffer)) {
            msg = Buffer.from(msg);
        }
        module.exports.handleMessage(socket, msg, wss);
    });

    socket.on('close', () => {
        module.exports.handleDisconnection(socket, wss);
    });

    socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        // Optionally close the socket on error
        socket.close();
    });
}

// Core function to handle incoming messages (including nickname and commands)
function handleMessage(socket, msg, wss) {
    msg = msg.toString().trim();
    const clientInfo = chatState.clients.get(socket);
    let nickname = clientInfo ? clientInfo.nickname : socket.tempNickname;

    if (!nickname) {
        // This is the first message, treat as nickname
        if ([...chatState.clients.values()].some(client => client.nickname === msg)) {
            socket.send('Nickname taken. Try another:');
            return;
        }
        nickname = msg; // Set the nickname temporarily on the socket
        chatState.clients.set(socket, { nickname: nickname, lastSeen: new Date() });
        // Remove the temporary nickname property
        delete socket.tempNickname;

        socket.send(`Welcome ${nickname}! Use /list, /msg, /admin, /mute, /kick, /lastseen etc.`);
        broadcast(`${nickname} joined the chat`, socket, wss);
        broadcastUserList(wss);
        updateUserLastSeen(socket, wss); // Ensure updateUserLastSeen is called after setting nickname
        return;
    }

    // Update last seen time for any message received after nickname is set
    if (nickname && clientInfo) { // Check clientInfo exists to ensure nickname is fully set in state
        updateUserLastSeen(socket, wss);
    }

    // If nickname is set, process as a regular message or command
    module.exports.processChatMessage(socket, nickname, msg, wss);
}

// Core function to process chat messages and commands
function processChatMessage(socket, nickname, msg, wss) {
    const parts = msg.split(' ');
    const command = parts[0].toLowerCase();

    if (msg.toLowerCase() === 'exit') {
        socket.close();
        return;
    }

    switch (command) {
        case '/list':
            socket.send('Online: ' + [...chatState.clients.values()].map(client => client.nickname).join(', '));
            break;
        case 'typing:': // Handle TYPING: message
             // Broadcast to others only
            for (let [client, name] of chatState.clients.entries()) {
              if (client !== socket && client.readyState === WebSocket.OPEN) {
                client.send(`[TYPING] ${nickname}`);
              }
            }
            break;
        case '/admin':
            module.exports.handleAdminCommand(socket, parts[1]);
            break;
        case '/kick':
            module.exports.handleKickCommand(socket, parts[1], wss);
            break;
        case '/mute':
            module.exports.handleMuteCommand(socket, parts[1], wss);
            break;
        case '/unmute':
             module.exports.handleUnmuteCommand(socket, parts[1], wss);
             break;
        case '/msg':
            module.exports.handlePrivateMessage(socket, nickname, parts, wss);
            break;
         case '/lastseen':
             module.exports.handleLastSeenCommand(socket);
             break;
        default:
            // Handle regular chat message if not muted
            if (chatState.muted.has(nickname)) {
                socket.send('You are muted.');
                // last seen already updated at the beginning of handleMessage
            } else {
                 // Add timestamp to the message before broadcasting and logging
                const now = new Date();
                const formattedMessage = `[${now.toLocaleString()} -- ${nickname}] ${msg}`;;

                broadcast(formattedMessage, socket, wss);
                logMessage(formattedMessage);
            }
            break;
    }
}

// Core function to handle admin command
function handleAdminCommand(socket, password) {
    if (password === chatState.ADMIN_PASSWORD) {
        chatState.adminSocket = socket;
        socket.send('You are now the admin.');
    } else {
        socket.send('Wrong password.');
    }
}

// Core function to handle kick command
function handleKickCommand(socket, targetNickname, wss) {
    if (socket !== chatState.adminSocket) return socket.send('Admin only.');
    const targetSocketEntry = [...chatState.clients.entries()].find(([_, clientInfo]) => clientInfo.nickname === targetNickname);
    if (targetSocketEntry) {
        const [targetSocket, _] = targetSocketEntry;
        targetSocket.send('You have been kicked.');
        targetSocket.close(); // This will trigger the close handler for the kicked user
    } else {
        socket.send('User not found.');
    }
}

// Core function to handle mute command
function handleMuteCommand(socket, targetNickname, wss) {
     if (socket !== chatState.adminSocket) return socket.send('Admin only.');
     chatState.muted.add(targetNickname);
     broadcast(`${targetNickname} has been muted.`, socket, wss);
}

// Core function to handle unmute command
function handleUnmuteCommand(socket, targetNickname, wss) {
    if (socket !== chatState.adminSocket) return socket.send('Admin only.');
    chatState.muted.delete(targetNickname);
    broadcast(`${targetNickname} has been unmuted.`, socket, wss);
}

// Core function to handle private message command
function handlePrivateMessage(socket, senderNickname, parts, wss) {
    const target = parts[1];
    const text = parts.slice(2).join(' ');
    const targetSocketEntry = [...chatState.clients.entries()].find(([_, clientInfo]) => clientInfo.nickname === target);
    if (targetSocketEntry) {
        const [targetSocket, _] = targetSocketEntry;
        const formatted = `[Private] ${senderNickname}: ${text}`;
        targetSocket.send(formatted);
        socket.send('(to ' + target + '): ' + text);
        logMessage(formatted);
    } else {
        socket.send('User not found.');
    }
}

// Core function to handle lastseen command
function handleLastSeenCommand(socket) {
    let lastSeenList = 'Last seen:\n';
    for (let [clientSocket, userInfo] of chatState.clients.entries()) {
        // For currently connected users, last seen is now
        const status = clientSocket.readyState === WebSocket.OPEN ? 'Online' : `Last seen: ${userInfo.lastSeen.toLocaleString()}`;
        lastSeenList += `- ${userInfo.nickname}: ${status}\n`;
    }
    // Note: This still only shows currently connected users as Online.
    // Tracking disconnected users' last seen would require persisting their info.
    socket.send(lastSeenList);
}

// Core function to handle user disconnection
function handleDisconnection(socket, wss) {
    updateUserLastSeen(socket, wss); // Called before removing from clients

    const clientInfo = chatState.clients.get(socket);
    let nickname = 'A user';
    if (clientInfo && clientInfo.nickname) {
        nickname = clientInfo.nickname;
    } else if (socket.tempNickname) {
        nickname = socket.tempNickname;
    }

    chatState.clients.delete(socket);
    // If the disconnected user was muted, remove them from the muted set
    if (clientInfo && chatState.muted.has(clientInfo.nickname)) {
        chatState.muted.delete(clientInfo.nickname);
    }

    // If the disconnected user was the admin, reset adminSocket
    if (socket === chatState.adminSocket) {
        chatState.adminSocket = null; // Reset the mutable adminSocket
    }

    broadcast(`${nickname} has left the chat.`, null, wss); // Broadcast to all remaining users
    broadcastUserList(wss);
    logMessage(`${nickname} disconnected.`);
}

// Initialization function to set up the WebSocket server
function initializeWebSocketServer(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', socket => {
        handleNewConnection(socket, wss);
    });

    // We might need a way to access the wss instance from core functions if they need it for broadcasting etc.
    // Currently, wss is passed as an argument to the handlers and core functions.
    // If more direct access is needed in other parts of chatServer.js, we might need to export it.

    // Return the wss instance if needed by main.js or other parts of the app
    // For testing, having wss available could be useful.
     return wss; // Returning wss for potential external use/testing
}

module.exports = { initializeWebSocketServer, handleNewConnection, handleMessage, processChatMessage, handleAdminCommand, handleKickCommand, handleMuteCommand, handleUnmuteCommand, handlePrivateMessage, handleLastSeenCommand, handleDisconnection }; 