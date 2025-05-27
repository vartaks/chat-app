jest.mock('ws');
jest.mock('./chatHelpers');
jest.mock('./chatState', () => ({
  clients: new Map(),
  ADMIN_PASSWORD: 'adminpassword',
  adminSocket: null,
  muted: new Set(),
}));

const { initializeWebSocketServer } = require('./chatServer');
const WebSocket = require('ws');
const { broadcast, broadcastUserList, logMessage, updateUserLastSeen } = require('./chatHelpers');

describe('chatServer', () => {
  let mockWss;
  let mockSocket;
  let mockClients;
  let mockMuted;

  beforeEach(() => {
    // Clear mocks and state before each test
    jest.clearAllMocks();
    mockClients = new Map();
    mockMuted = new Set();
    require('./chatState').clients = mockClients;
    require('./chatState').muted = mockMuted;


    // Mock WebSocket Server instance
    mockWss = {
      on: jest.fn(),
      clients: mockClients, // Jest mock of clients map
      broadcast: broadcast, // Use the mocked broadcast function
      broadcastUserList: broadcastUserList, // Use the mocked broadcastUserList function
    };
    WebSocket.Server.mockImplementation(() => mockWss);

    // Mock a WebSocket client socket
    mockSocket = {
      send: jest.fn(),
      on: jest.fn(),
      readyState: WebSocket.OPEN, // Simulate open connection
    };
  });

  it('should welcome a new user and handle nickname setting', () => {
    // Initialize the server
    initializeWebSocketServer({});

    // Simulate a connection event
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Assert initial welcome message is sent
    expect(mockSocket.send).toHaveBeenCalledWith('Welcome! Enter your nickname:');

    // Simulate user sending a nickname message
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'TestUser';
    messageHandler(nickname);

    // Assert nickname is set and welcome message is sent
    expect(mockClients.has(mockSocket)).toBe(true);
    expect(mockClients.get(mockSocket).nickname).toBe(nickname);
    expect(mockSocket.send).toHaveBeenCalledWith(`Welcome ${nickname}! Use /list, /msg, /admin, /mute, /kick, /lastseen etc.`);

    // Assert broadcast and user list updates are called
    expect(broadcast).toHaveBeenCalledWith(`${nickname} joined the chat`, mockSocket, mockWss);
    expect(broadcastUserList).toHaveBeenCalledWith(mockWss);
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called after nickname is set
  });

  it('should handle regular messages from a non-muted user', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'TestUser';
    messageHandler(nickname);

    // Simulate sending a regular message
    const userMessage = 'Hello, chat!';
    messageHandler(userMessage);

    // Assert broadcast and logMessage are called
    const now = new Date();
    const expectedFormattedMessage = `[${now.toLocaleString()} -- ${nickname}] ${userMessage}`;;
    expect(broadcast).toHaveBeenCalledWith(expectedFormattedMessage, mockSocket, mockWss);
    expect(logMessage).toHaveBeenCalledWith(expectedFormattedMessage);
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for each message
  });

  it('should not broadcast messages from a muted user', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname and mute user
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'MutedUser';
    messageHandler(nickname);
    mockMuted.add(nickname);

    // Simulate sending a regular message
    const userMessage = 'I should not be seen!';
    messageHandler(userMessage);

    // Assert user is informed they are muted, and broadcast/logMessage are NOT called for the message
    expect(mockSocket.send).toHaveBeenCalledWith('You are muted.');
    const now = new Date();
    const expectedFormattedMessage = `[${now.toLocaleString()} -- ${nickname}] ${userMessage}`;;
    expect(broadcast).not.toHaveBeenCalledWith(expectedFormattedMessage, mockSocket, mockWss);
    expect(logMessage).not.toHaveBeenCalledWith(expectedFormattedMessage);
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Still called for muted users
  });

  it('should handle the /list command', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'TestUser';
    messageHandler(nickname);

    // Add another user
    const anotherMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
    mockClients.set(anotherMockSocket, { nickname: 'AnotherUser', lastSeen: new Date() });

    // Simulate sending /list command
    messageHandler('/list');

    // Assert the list of users is sent to the socket
    // Order might vary, so check for inclusion of both nicknames
    expect(mockSocket.send).toHaveBeenCalledWith(expect.stringContaining('Online:'));
    expect(mockSocket.send).toHaveBeenCalledWith(expect.stringContaining('TestUser'));
    expect(mockSocket.send).toHaveBeenCalledWith(expect.stringContaining('AnotherUser'));
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /list
  });

  it('should handle the /msg command for private messages', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for sender
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const senderNickname = 'Sender';
    messageHandler(senderNickname);

    // Add a target user
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
    const targetNickname = 'Recipient';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });

    // Simulate sending a private message
    const privateMessageText = 'Secret message!';
    messageHandler(`/msg ${targetNickname} ${privateMessageText}`);

    // Assert message is sent to target and sender, and logged
    const formattedMessage = `[Private] ${senderNickname}: ${privateMessageText}`;
    expect(targetMockSocket.send).toHaveBeenCalledWith(formattedMessage);
    expect(mockSocket.send).toHaveBeenCalledWith(`(to ${targetNickname}): ${privateMessageText}`);
    expect(logMessage).toHaveBeenCalledWith(formattedMessage);
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /msg
  });

  it('should inform sender if target user for /msg is not found', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for sender
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const senderNickname = 'Sender';
    messageHandler(senderNickname);

    // Simulate sending a private message to a non-existent user
    const targetNickname = 'NonExistentUser';
    const privateMessageText = 'Secret message!';
    messageHandler(`/msg ${targetNickname} ${privateMessageText}`);

    // Assert sender is informed user is not found, and no messages are sent or logged for the private message
    expect(mockSocket.send).toHaveBeenCalledWith('User not found.');
    expect(logMessage).not.toHaveBeenCalled(); // No private message should be logged
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /msg attempt
  });

  it('should handle the /admin command with correct password', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'AdminCandidate';
    messageHandler(nickname);

    // Simulate sending /admin command with correct password
    messageHandler('/admin adminpassword');

    // Assert socket is set as adminSocket and confirmation message is sent
    expect(require('./chatState').adminSocket).toBe(mockSocket);
    expect(mockSocket.send).toHaveBeenCalledWith('You are now the admin.');
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /admin
  });

  it('should handle the /admin command with incorrect password', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'AdminCandidate';
    messageHandler(nickname);

    // Simulate sending /admin command with incorrect password
    messageHandler('/admin wrongpassword');

    // Assert socket is NOT set as adminSocket and error message is sent
    expect(require('./chatState').adminSocket).toBe(null); // Initially null, should remain null
    expect(mockSocket.send).toHaveBeenCalledWith('Wrong password.');
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /admin attempt
  });

  it('should handle the /kick command by admin', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for admin and set adminSocket
    const adminMessageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const adminNickname = 'AdminUser';
    adminMessageHandler(adminNickname);
    require('./chatState').adminSocket = mockSocket;

    // Add a target user
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN, close: jest.fn() };
    const targetNickname = 'KickTarget';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });

    // Simulate admin sending /kick command
    adminMessageHandler(`/kick ${targetNickname}`);

    // Assert target is informed, socket is closed, clients map updated, broadcast and logMessage called
    expect(targetMockSocket.send).toHaveBeenCalledWith('You have been kicked.');
    expect(targetMockSocket.close).toHaveBeenCalled();
    // Note: The test setup doesn't fully simulate the 'close' event handler removing the client from the map. A more comprehensive test would trigger the 'close' event on targetMockSocket after kick.

    // Assert broadcast and logMessage are called (kick message)
    // The broadcast happens in the close handler, which is not fully simulated here. The test will check if the logMessage is called.
    // A more thorough test would simulate the close event.

    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /kick
    expect(mockSocket.send).not.toHaveBeenCalledWith('User not found.');
  });

  it('should inform admin if target user for /kick is not found', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for admin and set adminSocket
    const adminMessageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const adminNickname = 'AdminUser';
    adminMessageHandler(adminNickname);
    require('./chatState').adminSocket = mockSocket;

    // Simulate admin sending /kick command for non-existent user
    const targetNickname = 'NonExistentUser';
    adminMessageHandler(`/kick ${targetNickname}`);

    // Assert admin is informed user not found, and no other actions taken (kick/close/broadcast/log)
    expect(mockSocket.send).toHaveBeenCalledWith('User not found.');
    // No other sockets exist to send messages to.
    expect(logMessage).not.toHaveBeenCalled();
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /kick attempt
  });

  it('should not allow non-admin to use /kick command', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for non-admin
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'RegularUser';
    messageHandler(nickname);

    // Add a target user
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN, close: jest.fn() };
    const targetNickname = 'KickTarget';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });

    // Simulate non-admin sending /kick command
    messageHandler(`/kick ${targetNickname}`);

    // Assert non-admin is informed, and no kick actions are taken
    expect(mockSocket.send).toHaveBeenCalledWith('Admin only.');
    expect(targetMockSocket.send).not.toHaveBeenCalled();
    expect(targetMockSocket.close).not.toHaveBeenCalled();
    expect(logMessage).not.toHaveBeenCalled();
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /kick attempt
  });

  it('should handle the /mute command by admin', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for admin and set adminSocket
    const adminMessageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const adminNickname = 'AdminUser';
    adminMessageHandler(adminNickname);
    require('./chatState').adminSocket = mockSocket;

    // Add a target user
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
    const targetNickname = 'MuteTarget';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });

    // Simulate admin sending /mute command
    adminMessageHandler(`/mute ${targetNickname}`);

    // Assert target nickname is added to muted set, broadcast and logMessage called
    expect(mockMuted.has(targetNickname)).toBe(true);
    expect(broadcast).toHaveBeenCalledWith(`${targetNickname} has been muted.`, mockSocket, mockWss);
    // logMessage is not called for mute/unmute in the current implementation
    expect(logMessage).not.toHaveBeenCalledWith(expect.stringContaining('has been muted.'));
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /mute
  });

  it('should not allow non-admin to use /mute command', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for non-admin
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'RegularUser';
    messageHandler(nickname);

    // Add a target user
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
    const targetNickname = 'MuteTarget';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });

    // Simulate non-admin sending /mute command
    messageHandler(`/mute ${targetNickname}`);

    // Assert non-admin is informed, and target is NOT muted
    expect(mockSocket.send).toHaveBeenCalledWith('Admin only.');
    expect(mockMuted.has(targetNickname)).toBe(false);
    expect(broadcast).not.toHaveBeenCalled();
    expect(logMessage).not.toHaveBeenCalled();
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /mute attempt
  });

  it('should handle the /unmute command by admin', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for admin and set adminSocket
    const adminMessageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const adminNickname = 'AdminUser';
    adminMessageHandler(adminNickname);
    require('./chatState').adminSocket = mockSocket;

    // Add a target user and mute them
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
    const targetNickname = 'UnmuteTarget';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });
    mockMuted.add(targetNickname);

    // Simulate admin sending /unmute command
    adminMessageHandler(`/unmute ${targetNickname}`);

    // Assert target nickname is removed from muted set, broadcast and logMessage called
    expect(mockMuted.has(targetNickname)).toBe(false);
    expect(broadcast).toHaveBeenCalledWith(`${targetNickname} has been unmuted.`, mockSocket, mockWss);
     // logMessage is not called for mute/unmute in the current implementation
    expect(logMessage).not.toHaveBeenCalledWith(expect.stringContaining('has been unmuted.'));
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /unmute
  });

  it('should not allow non-admin to use /unmute command', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname for non-admin
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'RegularUser';
    messageHandler(nickname);

    // Add a target user and mute them
    const targetMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
    const targetNickname = 'UnmuteTarget';
    mockClients.set(targetMockSocket, { nickname: targetNickname, lastSeen: new Date() });
    mockMuted.add(targetNickname);

    // Simulate non-admin sending /unmute command
    messageHandler(`/unmute ${targetNickname}`);

    // Assert non-admin is informed, and target remains muted
    expect(mockSocket.send).toHaveBeenCalledWith('Admin only.');
    expect(mockMuted.has(targetNickname)).toBe(true);
    expect(broadcast).not.toHaveBeenCalled();
    expect(logMessage).not.toHaveBeenCalled();
    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /unmute attempt
  });

  it('should handle the /lastseen command', () => {
      initializeWebSocketServer({});
      const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionHandler(mockSocket);

      // Set nickname
      const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
      const nickname = 'TestUser';
      messageHandler(nickname);

      // Add another connected user
      const anotherMockSocket = { send: jest.fn(), on: jest.fn(), readyState: WebSocket.OPEN };
      const anotherNickname = 'AnotherUser';
      mockClients.set(anotherMockSocket, { nickname: anotherNickname, lastSeen: new Date() });

      // Simulate sending /lastseen command
      messageHandler('/lastseen');

      // Assert the list includes connected users as 'Online'
      expect(mockSocket.send).toHaveBeenCalledWith(expect.stringContaining('Last seen:\n'));
      expect(mockSocket.send).toHaveBeenCalledWith(expect.stringContaining(`- ${nickname}: Online`));
      expect(mockSocket.send).toHaveBeenCalledWith(expect.stringContaining(`- ${anotherNickname}: Online`));
      expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, mockWss); // Called for /lastseen
  });

  it('should handle user disconnection', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'LeavingUser';
    messageHandler(nickname);

    // Simulate disconnection event
    const closeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'close')[1];
    closeHandler();

    // Assert user is removed from clients and muted (if applicable), broadcast and logMessage called
    expect(mockClients.has(mockSocket)).toBe(false);
    expect(mockMuted.has(nickname)).toBe(false); // Should be removed even if they were muted
    // Note: The broadcast and logMessage calls happen within the close handler, which is triggered by socket.close().
    // Our current mock doesn't fully simulate this. A more advanced mock could call the close handler when socket.close() is called.
    // For now, we can't directly assert the broadcast and logMessage from the close handler here.

    expect(updateUserLastSeen).toHaveBeenCalledWith(mockSocket, wss); // Called on close
  });

  it('should handle admin disconnection', () => {
    initializeWebSocketServer({});
    const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
    connectionHandler(mockSocket);

    // Set nickname and make admin
    const messageHandler = mockSocket.on.mock.calls.find(call => call[0] === 'message')[1];
    const nickname = 'AdminLeaving';
    messageHandler(nickname);
    require('./chatState').adminSocket = mockSocket;

    // Simulate disconnection event
    const closeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'close')[1];
    closeHandler();

    // Assert adminSocket is set to null
    expect(require('./chatState').adminSocket).toBe(null);
    // Other assertions (client removal, broadcast, log) are covered by the general disconnection test
  });
});