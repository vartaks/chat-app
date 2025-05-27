const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const { expect } = chai;

describe('chatServer (Unit Tests)', () => {
    let chatServer; // This will hold the module with injected mocks
    let mockChatHelpers;
    let mockChatState;
    let mockSocket;
    let mockWss; // Mock WebSocket Server instance

    beforeEach(() => {
        // Create fresh stubs and mocks for each test
        mockSocket = {
            send: sinon.stub(),
            on: sinon.stub(),
            readyState: 1, // Simulate WebSocket.OPEN
            close: sinon.stub(),
            // Add a placeholder for tempNickname, will be set in tests where needed
            tempNickname: undefined,
        };

        // Mock wss instance - only needs methods that chatServer interacts with
        mockWss = {
            clients: new Set(), // Use a Set to match chatServer's usage in some places
            // Add other stubs if chatServer uses them on wss, e.g., wss.clients
        };

        // Mock chatHelpers using Sinon
        mockChatHelpers = {
            broadcast: sinon.stub(),
            broadcastUserList: sinon.stub(),
            logMessage: sinon.stub(),
            updateUserLastSeen: sinon.stub(),
        };

        // Mock chatState - ensure a fresh, mutable state for each test
         mockChatState = {
             clients: new Map(),
             ADMIN_PASSWORD: 'adminpassword',
             adminSocket: null, // Ensure this is mutable
             muted: new Set(),
         };

        // Use proxyquire to inject mocks for external dependencies.
        // The returned chatServer object contains the actual, un-stubbed functions
        // from chatServer.js, but they will use the injected mocks.
        chatServer = proxyquire('./chatServer', {
             'ws': { WebSocket: { OPEN: 1, CLOSED: 3 } }, // Mock WebSocket constants if needed by core logic
             './chatHelpers': mockChatHelpers,
             './chatState': mockChatState,
         });
    });

    afterEach(() => {
        // Restore all the stubs created by Sinon (including temporary ones within tests)
        sinon.restore();
        // Clear the mockChatState after each test
        mockChatState.clients.clear();
        mockChatState.muted.clear();
        mockChatState.adminSocket = null;
    });

    // --- Tests for core logic functions ---

    describe('handleNewConnection', () => {
        it('should send welcome message and set up listeners', () => {
            // We need to temporary stub the functions that handleNewConnection calls
            // to assert that they are called correctly. Stub them on the chatServer object.
            const handleMessageStub = sinon.stub(chatServer, 'handleMessage');
            const handleDisconnectionStub = sinon.stub(chatServer, 'handleDisconnection');
             const consoleErrorStub = sinon.stub(console, 'error'); // Stub console.error for the error handler


            chatServer.handleNewConnection(mockSocket, mockWss);

            expect(mockSocket.send.calledOnceWith('Welcome! Enter your nickname:')).to.be.true;

            // Verify that .on was called with 'message', and the handler passed to it calls handleMessage
            expect(mockSocket.on.calledWith('message')).to.be.true;
            const messageHandler = mockSocket.on.withArgs('message').getCall(0).args[1];
            messageHandler('test message'); // Simulate receiving a message
            expect(handleMessageStub.calledOnceWith(mockSocket, Buffer.from('test message'), mockWss)).to.be.true; // handleMessage expects buffer

            // Verify that .on was called with 'close', and the handler passed to it calls handleDisconnection
            expect(mockSocket.on.calledWith('close')).to.be.true;
            const closeHandler = mockSocket.on.withArgs('close').getCall(0).args[1];
            closeHandler(); // Simulate closing the connection
            expect(handleDisconnectionStub.calledOnceWith(mockSocket, mockWss)).to.be.true;

             // Verify that .on was called with 'error' and the handler logs and closes
            expect(mockSocket.on.calledWith('error')).to.be.true;
            const errorHandler = mockSocket.on.withArgs('error').getCall(0).args[1];
            const testError = new Error('Test WebSocket Error');
            errorHandler(testError); // Simulate an error
            expect(consoleErrorStub.calledOnceWith('WebSocket error:', testError)).to.be.true;
            expect(mockSocket.close.calledOnce).to.be.true;


            expect(mockSocket.tempNickname).to.be.null; // Check temporary state is set

            // Sinon.restore() in afterEach will handle restoring these stubs
        });
    });


    describe('handleMessage', () => {
        // We are testing the handleMessage function itself
        it('should handle the first message as nickname setting', () => {
            const nickname = 'TestUser';
             // Simulate the state before nickname is set
             mockSocket.tempNickname = null; // Set the temporary nickname property
             mockChatState.clients.clear(); // Ensure clients map is empty

            // Stub processChatMessage temporarily within this test to verify it's NOT called
             const processChatMessageStub = sinon.stub(chatServer, 'processChatMessage');


            chatServer.handleMessage(mockSocket, Buffer.from(nickname), mockWss); // Call handleMessage with the nickname message (as buffer)

            expect(mockChatState.clients.has(mockSocket)).to.be.true;
            expect(mockChatState.clients.get(mockSocket).nickname).to.equal(nickname);
            expect(mockSocket.send.calledOnceWith(`Welcome ${nickname}! Use /list, /msg, /admin, /mute, /kick, /lastseen etc.`)).to.be.true;
            expect(mockChatHelpers.broadcast.calledOnceWith(`${nickname} joined the chat`, mockSocket, mockWss)).to.be.true;
            expect(mockChatHelpers.broadcastUserList.calledOnceWith(mockWss)).to.be.true;
             // updateUserLastSeen is called after setting nickname in the refactored code
            expect(mockChatHelpers.updateUserLastSeen.calledOnceWith(mockSocket, mockWss)).to.be.true;
            expect(mockSocket.tempNickname).to.be.undefined; // Temporary nickname should be removed
             // Ensure processChatMessage was NOT called
            expect(processChatMessageStub.notCalled).to.be.true;

             // Sinon.restore() in afterEach will handle restoring this stub
        });

         it('should inform user if nickname is taken', () => {
             const nickname = 'TakenUser';
             // Simulate a client with the taken nickname already in state
             mockChatState.clients.set({ dummySocket: true }, { nickname: nickname, lastSeen: new Date() });

              // Simulate the state before nickname is set for the new socket
             mockSocket.tempNickname = null;

             // Stub processChatMessage temporarily within this test to verify it's NOT called
             const processChatMessageStub = sinon.stub(chatServer, 'processChatMessage');

             chatServer.handleMessage(mockSocket, Buffer.from(nickname), mockWss); // Call handleMessage with the taken nickname (as buffer)

             expect(mockSocket.send.calledOnceWith('Nickname taken. Try another:')).to.be.true;
             // Ensure nickname is NOT set in state for the new socket
             expect(mockChatState.clients.has(mockSocket)).to.be.false;
             expect(mockChatHelpers.broadcast.notCalled).to.be.true;
             expect(mockChatHelpers.broadcastUserList.notCalled).to.be.true;
              expect(mockChatHelpers.updateUserLastSeen.notCalled).to.be.true; // updateUserLastSeen should not be called
              expect(mockSocket.tempNickname).to.equal(null); // Temporary nickname should remain
               // Ensure processChatMessage was NOT called
              expect(processChatMessageStub.notCalled).to.be.true;

              // Sinon.restore() in afterEach will handle restoring this stub
         });

         it('should call processChatMessage for messages after nickname is set', () => {
              const nickname = 'TestUser';
             // Simulate the state after nickname is set
              mockChatState.clients.set(mockSocket, { nickname: nickname, lastSeen: new Date() });
              mockSocket.tempNickname = undefined; // Ensure temporary nickname is not present

             const userMessage = 'Hello, chat!';

             // Stub processChatMessage temporarily within this test to verify it IS called
             const processChatMessageStub = sinon.stub(chatServer, 'processChatMessage');


             chatServer.handleMessage(mockSocket, Buffer.from(userMessage), mockWss); // Call handleMessage with a regular message (as buffer)

             // Assert that processChatMessage was called with the correct arguments
             expect(processChatMessageStub.calledOnceWith(mockSocket, nickname, userMessage, mockWss)).to.be.true;
              // updateUserLastSeen is called at the beginning of handleMessage if nickname is set
             expect(mockChatHelpers.updateUserLastSeen.calledOnceWith(mockSocket, mockWss)).to.be.true;

              // Sinon.restore() in afterEach will handle restoring this stub
         });
    });

    describe('processChatMessage', () => {
         // We are testing the processChatMessage function itself
         let nickname;
         beforeEach(() => {
             nickname = 'TestUser';
              mockChatState.clients.set(mockSocket, { nickname: nickname, lastSeen: new Date() });
         });

         it('should handle the exit command', () => {
             chatServer.processChatMessage(mockSocket, nickname, 'exit', mockWss);
             expect(mockSocket.close.calledOnce).to.be.true;
         });

         it('should handle the /list command', () => {
             // Add other clients to test the list command
             const anotherSocket = { send: sinon.stub(), readyState: 1 };
             mockChatState.clients.set(anotherSocket, { nickname: 'AnotherUser', lastSeen: new Date() });

             chatServer.processChatMessage(mockSocket, nickname, '/list', mockWss);

             expect(mockSocket.send.calledOnce).to.be.true; // Ensure send was called
             const sentMessage = mockSocket.send.getCall(0).args[0];
             expect(sentMessage).to.include('Online:');
             expect(sentMessage).to.include('TestUser');
             expect(sentMessage).to.include('AnotherUser');
         });

         it('should handle TYPING: message', () => {
             const anotherSocket = { send: sinon.stub(), readyState: 1 };
             mockChatState.clients.set(anotherSocket, { nickname: 'AnotherUser', lastSeen: new Date() });

              const thirdSocket = { send: sinon.stub(), readyState: 1 };
              mockChatState.clients.set(thirdSocket, { nickname: 'ThirdUser', lastSeen: new Date() });

              // Ensure the sender socket is in clients for the loop, but its send should not be called
              mockChatState.clients.set(mockSocket, { nickname: nickname, lastSeen: new Date() });


             chatServer.processChatMessage(mockSocket, nickname, 'TYPING:', mockWss);

             // Assert that only other sockets received the TYPING message
             expect(anotherSocket.send.calledOnceWith('[TYPING] TestUser')).to.be.true;
             expect(thirdSocket.send.calledOnceWith('[TYPING] TestUser')).to.be.true;
             expect(mockSocket.send.notCalled).to.be.true; // The sender should not receive it
         });

         it('should call handleAdminCommand for /admin', () => {
             // Stub handleAdminCommand temporarily within this test to verify it's called
             const handleAdminCommandStub = sinon.stub(chatServer, 'handleAdminCommand');
             const password = 'adminpassword';

             chatServer.processChatMessage(mockSocket, nickname, `/admin ${password}`, mockWss);

             expect(handleAdminCommandStub.calledOnceWith(mockSocket, password)).to.be.true;
              // Sinon.restore() in afterEach will handle restoring this stub
         });

         it('should call handleKickCommand for /kick', () => {
             const handleKickCommandStub = sinon.stub(chatServer, 'handleKickCommand');
             const target = 'KickTarget';

             chatServer.processChatMessage(mockSocket, nickname, `/kick ${target}`, mockWss);

             expect(handleKickCommandStub.calledOnceWith(mockSocket, target, mockWss)).to.be.true;
              // Sinon.restore() in afterEach will handle restoring this stub
         });

         it('should call handleMuteCommand for /mute', () => {
              const handleMuteCommandStub = sinon.stub(chatServer, 'handleMuteCommand');
              const target = 'MuteTarget';

              chatServer.processChatMessage(mockSocket, nickname, `/mute ${target}`, mockWss);

              expect(handleMuteCommandStub.calledOnceWith(mockSocket, target, mockWss)).to.be.true;
              // Sinon.restore() in afterEach will handle restoring this stub
          });

          it('should call handleUnmuteCommand for /unmute', () => {
               const handleUnmuteCommandStub = sinon.stub(chatServer, 'handleUnmuteCommand');
               const target = 'UnmuteTarget';

               chatServer.processChatMessage(mockSocket, nickname, `/unmute ${target}`, mockWss);

               expect(handleUnmuteCommandStub.calledOnceWith(mockSocket, target, mockWss)).to.be.true;
               // Sinon.restore() in afterEach will handle restoring this stub
           });

          it('should call handlePrivateMessage for /msg', () => {
               const handlePrivateMessageStub = sinon.stub(chatServer, 'handlePrivateMessage');
               const msgParts = ['/msg', 'Recipient', 'Private', 'text'];

               chatServer.processChatMessage(mockSocket, nickname, msgParts.join(' '), mockWss);

               expect(handlePrivateMessageStub.calledOnceWith(mockSocket, nickname, msgParts, mockWss)).to.be.true;
               // Sinon.restore() in afterEach will handle restoring this stub
           });

          it('should call handleLastSeenCommand for /lastseen', () => {
               const handleLastSeenCommandStub = sinon.stub(chatServer, 'handleLastSeenCommand');

               chatServer.processChatMessage(mockSocket, nickname, '/lastseen', mockWss);

               expect(handleLastSeenCommandStub.calledOnceWith(mockSocket)).to.be.true;
               // Sinon.restore() in afterEach will handle restoring this stub
          });

          it('should send muted message if user is muted and sends a regular message', () => {
               mockChatState.muted.add(nickname); // Mute the user
               const userMessage = 'I should not be seen!';

               chatServer.processChatMessage(mockSocket, nickname, userMessage, mockWss);

               expect(mockSocket.send.calledOnceWith('You are muted.')).to.be.true;
               expect(mockChatHelpers.broadcast.notCalled).to.be.true;
               expect(mockChatHelpers.logMessage.notCalled).to.be.true;
           });

           it('should broadcast and log regular messages if user is not muted', () => {
              mockChatState.muted.delete(nickname); // Ensure user is not muted
              const userMessage = 'Hello, chat!';

              // Use sinon.match for partial string matching, allowing for the timestamp
              const expectedFormattedMessage = sinon.match(/-- TestUser\] Hello, chat!/);

              chatServer.processChatMessage(mockSocket, nickname, userMessage, mockWss);

              expect(mockChatHelpers.broadcast.calledOnceWith(expectedFormattedMessage, mockSocket, mockWss)).to.be.true;
              expect(mockChatHelpers.logMessage.calledOnceWith(expectedFormattedMessage)).to.be.true;
              expect(mockSocket.send.notCalled).to.be.true; // Should not send a muted message
           });
    });

    describe('handleAdminCommand', () => {
        // We are testing the handleAdminCommand function itself
        let password;
        beforeEach(() => {
            password = 'adminpassword';
            // Reset adminSocket before each test
            mockChatState.adminSocket = null; // Ensure it starts as null
        });

        it('should set adminSocket and send confirmation for correct password', () => {
            chatServer.handleAdminCommand(mockSocket, password);

            expect(mockChatState.adminSocket).to.equal(mockSocket);
            expect(mockSocket.send.calledOnceWith('You are now the admin.')).to.be.true;
        });

        it('should not set adminSocket and send error for incorrect password', () => {
            const wrongPassword = 'wrongpassword';
            chatServer.handleAdminCommand(mockSocket, wrongPassword);

            expect(mockChatState.adminSocket).to.be.null; // Should remain null
            expect(mockSocket.send.calledOnceWith('Wrong password.')).to.be.true;
        });
    });

    describe('handleKickCommand', () => {
        // We are testing the handleKickCommand function itself
        let adminSocket;
        let targetSocket;
        let targetNickname;
        beforeEach(() => {
            adminSocket = { send: sinon.stub() };
            mockChatState.adminSocket = adminSocket; // Set admin as the current socket

            targetSocket = { send: sinon.stub(), close: sinon.stub() };
            targetNickname = 'KickTarget';
            // Add the target user to the clients state
            mockChatState.clients.set(targetSocket, { nickname: targetNickname, lastSeen: new Date() });
             // Add the admin user to the clients state (needed by handleKickCommand to check if socket is adminSocket)
            mockChatState.clients.set(adminSocket, { nickname: 'AdminUser', lastSeen: new Date() });

        });

        it('should kick the target user if called by admin', () => {
            chatServer.handleKickCommand(adminSocket, targetNickname, mockWss);

            expect(targetSocket.send.calledOnceWith('You have been kicked.')).to.be.true;
            expect(targetSocket.close.calledOnce).to.be.true;
            // The close handler should handle removal from clients and broadcasting, so we don't assert that here.
             expect(adminSocket.send.calledWith('User not found.')).to.be.false; // Ensure admin wasn't told user not found
        });

        it('should inform admin if target user for /kick is not found', () => {
            const nonExistentTarget = 'NonExistent';
            chatServer.handleKickCommand(adminSocket, nonExistentTarget, mockWss);

            expect(adminSocket.send.calledOnceWith('User not found.')).to.be.true;
            expect(targetSocket.send.notCalled).to.be.true; // Ensure original targetSocket methods were not called
            expect(targetSocket.close.notCalled).to.be.true;
        });

        it('should not allow non-admin to use the kick command', () => {
            const nonAdminSocket = { send: sinon.stub() };
             // Add the non-admin user to the clients state
            mockChatState.clients.set(nonAdminSocket, { nickname: 'RegularUser', lastSeen: new Date() });

            chatServer.handleKickCommand(nonAdminSocket, targetNickname, mockWss);

            expect(nonAdminSocket.send.calledOnceWith('Admin only.')).to.be.true;
            expect(targetSocket.send.notCalled).to.be.true;
            expect(targetSocket.close.notCalled).to.be.true;
        });
    });

     describe('handleMuteCommand', () => {
        // We are testing the handleMuteCommand function itself
        let adminSocket;
        let targetNickname;
        beforeEach(() => {
            adminSocket = { send: sinon.stub() };
            mockChatState.adminSocket = adminSocket; // Set admin as the current socket

            targetNickname = 'MuteTarget';
             mockChatState.muted.clear(); // Ensure muted is clear before each test

            // Add the admin user to the clients state (needed by handleMuteCommand to check if socket is adminSocket)
            mockChatState.clients.set(adminSocket, { nickname: 'AdminUser', lastSeen: new Date() });
        });

         it('should mute the target user if called by admin', () => {
             chatServer.handleMuteCommand(adminSocket, targetNickname, mockWss);

             expect(mockChatState.muted.has(targetNickname)).to.be.true;
             expect(mockChatHelpers.broadcast.calledOnceWith(`${targetNickname} has been muted.`, adminSocket, mockWss)).to.be.true;
         });

         it('should not allow non-admin to use the mute command', () => {
              const nonAdminSocket = { send: sinon.stub() };
              // Add the non-admin user to the clients state
             mockChatState.clients.set(nonAdminSocket, { nickname: 'RegularUser', lastSeen: new Date() });
             const targetNickname = 'MuteTarget';

             chatServer.handleMuteCommand(nonAdminSocket, targetNickname, mockWss);

             expect(nonAdminSocket.send.calledOnceWith('Admin only.')).to.be.true;
             expect(mockChatState.muted.has(targetNickname)).to.be.false; // Should not be muted
             expect(mockChatHelpers.broadcast.notCalled).to.be.true; // Broadcast should not have been called
         });
     });

     describe('handleUnmuteCommand', () => {
         // We are testing the handleUnmuteCommand function itself
         let adminSocket;
         let targetNickname;
         beforeEach(() => {
             adminSocket = { send: sinon.stub() };
             mockChatState.adminSocket = adminSocket; // Set admin as the current socket

             targetNickname = 'UnmuteTarget';
             mockChatState.muted.clear();
             mockChatState.muted.add(targetNickname); // Mute the target initially

             // Add the admin user to the clients state
             mockChatState.clients.set(adminSocket, { nickname: 'AdminUser', lastSeen: new Date() });
         });

          it('should unmute the target user if called by admin', () => {
              chatServer.handleUnmuteCommand(adminSocket, targetNickname, mockWss);

              expect(mockChatState.muted.has(targetNickname)).to.be.false;
              expect(mockChatHelpers.broadcast.calledOnceWith(`${targetNickname} has been unmuted.`, adminSocket, mockWss)).to.be.true;
          });

          it('should not allow non-admin to use the unmute command', () => {
               const nonAdminSocket = { send: sinon.stub() };
               // Add the non-admin user to the clients state
              mockChatState.clients.set(nonAdminSocket, { nickname: 'RegularUser', lastSeen: new Date() });
              const targetNickname = 'UnmuteTarget';
              mockChatState.muted.add(targetNickname); // Mute the target initially

              chatServer.handleUnmuteCommand(nonAdminSocket, targetNickname, mockWss);

              expect(nonAdminSocket.send.calledOnceWith('Admin only.')).to.be.true;
              expect(mockChatState.muted.has(targetNickname)).to.be.true; // Should remain muted
              expect(mockChatHelpers.broadcast.notCalled).to.be.true;
          });
     });

     describe('handlePrivateMessage', () => {
         // We are testing the handlePrivateMessage function itself
         let senderSocket;
         let senderNickname;
         let targetSocket;
         let targetNickname;
         beforeEach(() => {
             senderSocket = { send: sinon.stub() };
             senderNickname = 'Sender';
              // Add sender to clients state
             mockChatState.clients.set(senderSocket, { nickname: senderNickname, lastSeen: new Date() });

             targetSocket = { send: sinon.stub() };
             targetNickname = 'Recipient';
              // Add recipient to clients state
             mockChatState.clients.set(targetSocket, { nickname: targetNickname, lastSeen: new Date() });
         });

         it('should send private message to target and confirmation to sender if target exists', () => {
             const msgParts = ['/msg', targetNickname, 'Private', 'text'];
             const rawMessage = msgParts.join(' ');

             chatServer.handlePrivateMessage(senderSocket, senderNickname, msgParts, mockWss);

             const formattedMessage = `[Private] ${senderNickname}: Private text`;
             expect(targetSocket.send.calledOnceWith(formattedMessage)).to.be.true;
             expect(senderSocket.send.calledOnceWith(`(to ${targetNickname}): Private text`)).to.be.true;
             expect(mockChatHelpers.logMessage.calledOnceWith(formattedMessage)).to.be.true;
         });

         it('should inform sender if target user for private message is not found', () => {
              const nonExistentTarget = 'NonExistentUser';
              const msgParts = ['/msg', nonExistentTarget, 'Private', 'text'];
              const rawMessage = msgParts.join(' ');

              chatServer.handlePrivateMessage(senderSocket, senderNickname, msgParts, mockWss);

              expect(senderSocket.send.calledOnceWith('User not found.')).to.be.true;
              expect(targetSocket.send.notCalled).to.be.true; // Ensure original targetSocket method was not called
              expect(mockChatHelpers.logMessage.notCalled).to.be.true;
         });
     });

    describe('handleLastSeenCommand', () => {
        // We are testing the handleLastSeenCommand function itself
        let userSocket;
        let userNickname;
        beforeEach(() => {
            userSocket = { send: sinon.stub(), readyState: 1 }; // readyState is checked
            userNickname = 'TestUser';
            mockChatState.clients.set(userSocket, { nickname: userNickname, lastSeen: new Date() });
        });

        it('should send a list of currently online users with Online status', () => {
            const anotherSocket = { send: sinon.stub(), readyState: 1 };
            const anotherNickname = 'AnotherUser';
             mockChatState.clients.set(anotherSocket, { nickname: anotherNickname, lastSeen: new Date() });

            chatServer.handleLastSeenCommand(userSocket);

            expect(userSocket.send.calledOnce).to.be.true; // Ensure send was called
            const sentMessage = userSocket.send.getCall(0).args[0];
            const expectedOutput = /Last seen:\n.*- TestUser: Online.*- AnotherUser: Online/s; // Use /s flag for multiline match
            expect(sentMessage).to.match(expectedOutput);
        });

         // Note: Testing disconnected users\' last seen would require modifying chatState
         // to store disconnected users, which is not currently implemented in chatServer.js
    });

    describe('handleDisconnection', () => {
        // We are testing the handleDisconnection function itself
        let disconnectingSocket;
        let disconnectingNickname;
        beforeEach(() => {
            disconnectingSocket = { send: sinon.stub(), close: sinon.stub() }; // socket might send/close during error handling
            disconnectingNickname = 'LeavingUser';
            // Add the user to clients state before disconnection
            mockChatState.clients.set(disconnectingSocket, { nickname: disconnectingNickname, lastSeen: new Date() });
             mockChatState.muted.clear(); // Ensure muted is clear
             mockChatState.adminSocket = null; // Ensure adminSocket is null initially
        });

        it('should remove the user from clients, broadcast, and log disconnection', () => {
             // Call updateUserLastSeen before calling handleDisconnection to simulate the real flow
             // In the refactored code, updateUserLastSeen is called at the start of handleDisconnection.
             // So, we just need to assert it was called within handleDisconnection.

            chatServer.handleDisconnection(disconnectingSocket, mockWss);

            expect(mockChatState.clients.has(disconnectingSocket)).to.be.false; // User should be removed from clients
            expect(mockChatHelpers.updateUserLastSeen.calledOnceWith(disconnectingSocket, mockWss)).to.be.true; // updateUserLastSeen should be called
            expect(mockChatHelpers.broadcast.calledOnceWith(`${disconnectingNickname} has left the chat.`, null, mockWss)).to.be.true;
            expect(mockChatHelpers.broadcastUserList.calledOnceWith(mockWss)).to.be.true;
            expect(mockChatHelpers.logMessage.calledOnceWith(`${disconnectingNickname} disconnected.`)).to.be.true;
        });

        it('should remove user from muted set if they were muted', () => {
             mockChatState.muted.add(disconnectingNickname); // Mute the user before disconnection

             chatServer.handleDisconnection(disconnectingSocket, mockWss);

             expect(mockChatState.muted.has(disconnectingNickname)).to.be.false; // Should be removed from muted
        });

        it('should set adminSocket to null if the disconnected user was the admin', () => {
             mockChatState.adminSocket = disconnectingSocket; // Set the disconnecting socket as adminSocket

             chatServer.handleDisconnection(disconnectingSocket, mockWss);

             expect(mockChatState.adminSocket).to.be.null; // adminSocket should be reset
        });

        it('should use a default nickname if disconnecting user did not have a nickname set in state', () => {
             // Simulate a disconnection before nickname was fully set in state
             mockChatState.clients.clear(); // Remove the user from clients initially
             // Add the socket back, but without full client info, just temp state if needed.
             // In the refactored code, nickname is determined from clients.get(socket) or socket.tempNickname.
             // If disconnecting before nickname is set in clients, clientInfo will be undefined.
             // If tempNickname is also null, it defaults to 'A user'.
             // Let's simulate the case where the client connected but didn't set a nickname.
             // Add the socket to clients, but without the nickname property.
             mockChatState.clients.set(disconnectingSocket, { lastSeen: new Date() });
             disconnectingSocket.tempNickname = null; // Ensure tempNickname is null


             chatServer.handleDisconnection(disconnectingSocket, mockWss);

             // Expect the broadcast and log message to use the default 'A user'
             expect(mockChatHelpers.broadcast.calledOnceWith('A user has left the chat.', null, mockWss)).to.be.true;
             expect(mockChatHelpers.broadcastUserList.calledOnceWith(mockWss)).to.be.true; // broadcastUserList should still be called
             expect(mockChatHelpers.logMessage.calledOnceWith('A user disconnected.')).to.be.true;
             // updateUserLastSeen should still be called even if no nickname
              expect(mockChatHelpers.updateUserLastSeen.calledOnceWith(disconnectingSocket, mockWss)).to.be.true;
        });
    });

});