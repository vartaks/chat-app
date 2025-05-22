const socket = new WebSocket('ws://localhost:3000');
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const userList = document.getElementById('user-list');

let nickname = null;
let typing = false;
let typingTimeout;

const typingNotice = document.createElement('div');
typingNotice.id = 'typing-indicator';
chat.after(typingNotice);

function showTyping(name) {
  typingNotice.textContent = `${name} is typing...`;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingNotice.textContent = '';
  }, 3000);
}

function appendMessage(text) {
  const msg = document.createElement('div');
  msg.textContent = text;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;

  // Detect nickname assignment from server response
  if (!nickname && text.startsWith('Welcome ')) {
    nickname = text.split(' ')[1].split('!')[0];
  }
}

socket.onmessage = e => {
  const message = e.data;

  // Check if it's a user list
  if (message.startsWith('[USERS]')) {
    try {
        const users = JSON.parse(message.replace('[USERS]', '').trim());
        userList.innerHTML = '';

        // 🟢 Update count
        document.getElementById('user-count').textContent = `${users.length} user${users.length !== 1 ? 's' : ''} online`;

        // 🟢 Update list
        users.forEach(user => {
            const li = document.createElement('li');
            // Display nickname and last seen time
            const lastSeenDate = new Date(user.lastSeen);
            const statusText = user.nickname === nickname ? ' (you) - Online' : ` - Last seen: ${lastSeenDate.toLocaleString()}`;
            li.textContent = `${user.nickname}${statusText}`;

            if (user.nickname === nickname) {
                li.classList.add('me'); // highlight class
            }
            userList.appendChild(li);
        });
    } catch (error) {
        console.error("Failed to parse user list message:", error);
        appendMessage("Error receiving user list.");
    }

  } else if (message.startsWith('[TYPING]')) {
    const name = message.replace('[TYPING]', '').trim();
    if (name !== nickname) showTyping(name);
  } else {
    appendMessage(message);
  }
};

input.addEventListener('keypress', e => {
  if (e.key === 'Enter' && input.value.trim()) {
    socket.send(input.value.trim());
    input.value = '';
  } else {
    if (!typing && nickname) {
      typing = true;
      socket.send('TYPING:');
      setTimeout(() => typing = false, 1000); // limit how often it's sent
    }
  }
});
