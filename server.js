require('dotenv').config();

const server = require('./httpServer');
const { initializeWebSocketServer } = require('./chatServer');

initializeWebSocketServer(server);

server.listen(3000, () => {
  console.log('Chat server with WebSocket + browser UI running at http://localhost:3000');
});
