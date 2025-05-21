const socket = new WebSocket('ws://localhost:3000');
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const userList = document.getElementById('user-list');

let nickname = null;

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
    const names = message.replace('[USERS]', '').trim().split(',');
    userList.innerHTML = '';

    // 🟢 Update count
    document.getElementById('user-count').textContent = `${names.length} user${names.length !== 1 ? 's' : ''} online`;

    // 🟢 Update list
    names.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name === nickname ? `${name} (you)` : name;
      if (name === nickname) {
        li.classList.add('me'); // highlight class
      }
      userList.appendChild(li);
    });
  } else {
    appendMessage(message);
  }
};

input.addEventListener('keypress', e => {
  if (e.key === 'Enter' && input.value.trim()) {
    socket.send(input.value.trim());
    input.value = '';
  }
});
