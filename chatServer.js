const WebSocket = require('ws');
const { clients, ADMIN_PASSWORD, adminSocket, muted } = require('./chatState');
const { updateUserLastSeen, broadcast, broadcastUserList, logMessage } = require('./chatHelpers');

let wss = null;

function initializeWebSocketServer(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', socket => {
    socket.send('Welcome! Enter your nickname:');

    let nickname = null;

    socket.on('message', msg => {
      msg = msg.toString().trim();

      // Update last seen time for any message received after nickname is set
      if (nickname) {
          updateUserLastSeen(socket, wss);
      }

      if (!nickname) {
        if ([...clients.values()].some(client => client.nickname === msg)) {
          socket.send('Nickname taken. Try another:');
          return;
        }
        nickname = msg;
        clients.set(socket, { nickname: nickname, lastSeen: new Date() });
        socket.send(`Welcome ${nickname}! Use /list, /msg, /admin, /mute, /kick, /lastseen etc.`);
        broadcast(`${nickname} joined the chat`, socket, wss);
        broadcastUserList(wss);
        return;
      }

      if (msg.toLowerCase() === 'exit') {
        socket.close();
        return;
      }

      if (msg === '/list') {
        socket.send('Online: ' + [...clients.values()].map(client => client.nickname).join(', '));
        return;
      }

      if (msg === 'TYPING:') {
        // Broadcast to others only
        for (let [client, name] of clients.entries()) {
          if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(`[TYPING] ${nickname}`);
          }
        }
        return;
      }

      if (msg.startsWith('/admin ')) {
        const pw = msg.split(' ')[1];
        if (pw === ADMIN_PASSWORD) {
          adminSocket = socket;
          socket.send('You are now the admin.');
        } else {
          socket.send('Wrong password.');
        }
        return;
      }

      if (msg.startsWith('/kick ')) {
        if (socket !== adminSocket) return socket.send('Admin only.');
        const target = msg.split(' ')[1];
        const targetSocket = [...clients.entries()].find(([_, clientInfo]) => clientInfo.nickname === target)?.[0];
        if (targetSocket) {
          targetSocket.send('You have been kicked.');
          targetSocket.close();
        } else {
          socket.send('User not found.');
        }
        return;
      }

      if (msg.startsWith('/mute ')) {
        if (socket !== adminSocket) return socket.send('Admin only.');
        const name = msg.split(' ')[1];
        muted.add(name);
        broadcast(`${name} has been muted.`, socket, wss);
        return;
      }

      if (msg.startsWith('/unmute ')) {
        if (socket !== adminSocket) return socket.send('Admin only.');
        const name = msg.split(' ')[1];
        muted.delete(name);
        broadcast(`${name} has been unmuted.`, socket, wss);
        return;
      }

      if (msg.startsWith('/msg ')) {
        const parts = msg.split(' ');
        const target = parts[1];
        const text = parts.slice(2).join(' ');
        const targetSocket = [...clients.entries()].find(([_, clientInfo]) => clientInfo.nickname === target)?.[0];
        if (targetSocket) {
          const formatted = `[Private] ${nickname}: ${text}`;
          targetSocket.send(formatted);
          socket.send('(to ' + target + '): ' + text);
          logMessage(formatted);
        } else {
          socket.send('User not found.');
        }
        return;
      }

      if (msg === '/lastseen') {
          let lastSeenList = 'Last seen:\n';
          for (let [clientSocket, userInfo] of clients.entries()) {
              // For currently connected users, last seen is now
              const status = clientSocket.readyState === WebSocket.OPEN ? 'Online' : `Last seen: ${userInfo.lastSeen.toLocaleString()}`;
              lastSeenList += `- ${userInfo.nickname}: ${status}\n`;
          }
          // We need to store disconnected users to show their last seen. This requires a separate structure.
          // For now, this will only show currently online users and their "last seen" as Online.
          socket.send(lastSeenList);
          return;
      }

      if (muted.has(nickname)) {
        socket.send('You are muted.');
        // The last seen is already updated at the beginning of the message handler
        return;
      }

      // Add timestamp to the message before broadcasting and logging
      const now = new Date();
      const formattedMessage = `[${now.toLocaleString()} -- ${nickname}] ${msg}`;;

      broadcast(formattedMessage, socket, wss);
      logMessage(formattedMessage);
    });

    socket.on('close', () => {
      // Update last seen time when a user disconnects
      // User info is not deleted until after this block, so we can still update last seen.
      updateUserLastSeen(socket, wss);
      clients.delete(socket);
      muted.delete(nickname);
      if (socket === adminSocket) adminSocket = null;
      broadcast(`${nickname} has left the chat.`, null, wss);
      broadcastUserList(wss);
      logMessage(`${nickname} disconnected.`);
    });
  });
}

module.exports = { initializeWebSocketServer }; 