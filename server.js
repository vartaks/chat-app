const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const clients = new Map(); // socket => nickname
const logStream = fs.createWriteStream('chat.log', { flags: 'a' });
const ADMIN_PASSWORD = 'admin123';
let adminSocket = null;
const muted = new Set();

const mimeTypes = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', socket => {
  socket.send('Welcome! Enter your nickname:');

  let nickname = null;

  socket.on('message', msg => {
    msg = msg.toString().trim();

    if (!nickname) {
      if ([...clients.values()].includes(msg)) {
        socket.send('Nickname taken. Try another:');
        return;
      }
      nickname = msg;
      clients.set(socket, nickname);
      socket.send(`Welcome ${nickname}! Use /list, /msg, /admin, /mute, /kick, etc.`);
      broadcast(`${nickname} joined the chat`, socket);
      broadcastUserList();
      return;
    }

    if (msg.toLowerCase() === 'exit') {
      socket.close();
      return;
    }

    if (msg === '/list') {
      socket.send('Online: ' + [...clients.values()].join(', '));
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
      const targetSocket = [...clients.entries()].find(([_, name]) => name === target)?.[0];
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
      broadcast(`${name} has been muted.`, socket);
      return;
    }

    if (msg.startsWith('/unmute ')) {
      if (socket !== adminSocket) return socket.send('Admin only.');
      const name = msg.split(' ')[1];
      muted.delete(name);
      broadcast(`${name} has been unmuted.`, socket);
      return;
    }

    if (msg.startsWith('/msg ')) {
      const parts = msg.split(' ');
      const target = parts[1];
      const text = parts.slice(2).join(' ');
      const targetSocket = [...clients.entries()].find(([_, name]) => name === target)?.[0];
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

    if (muted.has(nickname)) {
      socket.send('You are muted.');
      return;
    }

    const message = `[${nickname}] ${msg}`;
    broadcast(message, socket);
    logMessage(message);
  });

  socket.on('close', () => {
    clients.delete(socket);
    muted.delete(nickname);
    if (socket === adminSocket) adminSocket = null;
    broadcast(`${nickname} has left the chat.`);
    broadcastUserList();
    logMessage(`${nickname} disconnected.`);
  });
});

function broadcast(message, except) {
  for (let client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client !== except) {
      client.send(message);
    }
  }
  console.log(message);
}

function broadcastUserList() {
  const users = [...clients.values()].join(',');
  for (let client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(`[USERS] ${users}`);
    }
  }
}

function logMessage(msg) {
  const time = new Date().toISOString();
  logStream.write(`[${time}] ${msg}\n`);
}

server.listen(3000, () => {
  console.log('Chat server with WebSocket + browser UI running at http://localhost:3000');
});
