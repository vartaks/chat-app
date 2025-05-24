const fs = require('fs');

const clients = new Map(); // socket => { nickname: string, lastSeen: Date }
const logStream = fs.createWriteStream('chat.log', { flags: 'a' });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
let adminSocket = null;
const muted = new Set();

module.exports = {
  clients,
  logStream,
  ADMIN_PASSWORD,
  adminSocket,
  muted,
}; 