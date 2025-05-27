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

  // Add more test cases here
}); 