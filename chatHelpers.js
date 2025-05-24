const WebSocket = require('ws');
const { clients, logStream, muted, adminSocket } = require('./chatState');

// Helper function to update user's last seen timestamp
function updateUserLastSeen(socket) {
    const userInfo = clients.get(socket);
    if (userInfo) {
        userInfo.lastSeen = new Date();
        // We should also rebroadcast the user list here to update the client view
        broadcastUserList();
    }
}

function broadcast(message, except, wss) {
  for (let client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== except) {
      client.send(message);
    }
  }
  console.log(message);
}

function broadcastUserList(wss) {
  const users = [...clients.values()].map(clientInfo => ({
      nickname: clientInfo.nickname,
      lastSeen: clientInfo.lastSeen.toISOString() // Send as ISO string
  }));
  const userListMessage = `[USERS]${JSON.stringify(users)}`;
  for (let client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(userListMessage);
    }
  }
}

function logMessage(msg) {
  // The message already contains the timestamp from the message handler
  logStream.write(`${msg}\n`);
}

module.exports = {
  updateUserLastSeen,
  broadcast,
  broadcastUserList,
  logMessage,
}; 