Let’s extend the example to handle real-time data using sockets in Node.js, 
and process it with RxJS Observables for transformation and control.

Scenario:
* We'll set up a TCP server using Node's net module.
* Clients can connect and send data.
* Data from clients will be streamed as observables.
* Each message will be transformed (e.g., to uppercase) and logged.

How to test it:
1. Run the server (node server.js).
2. Connect using netcat or telnet:
"ncat localhost 3000" OR "telnet localhost 3000"
3. Type messages — you'll see them processed and echoed back in uppercase.

Why RxJS here?
* fromEvent() cleanly converts socket events to an observable stream.
* map() and mergeMap() make it easy to transform and delay responses.
* catchError() ensures graceful error handling per stream.
---------------------------------------------------------------------------------------------

Here's a RxJS-powered TCP chat server in Node.js that:
* Accepts multiple client connections
* Uses RxJS to handle and transform messages
* Broadcasts messages to all connected clients (except the sender)
* Gracefully handles disconnects and errors

How to Use It:
1. Run the server:
node server.js
2. Open multiple terminals and connect using netcat:
ncat localhost 3000
3. Type a message in one terminal — it broadcasts to others.
4. Type exit to disconnect a client.

Key Features:
* Uses fromEvent to turn socket events into observable streams.
* Uses mergeMap + map to transform message content.
* Set stores connected clients for broadcast.
* Gracefully handles disconnects and errors.
---------------------------------------------------------------------------------------------

Let’s enhance the chat server with new features:
1. Nicknames: Each user picks a name when they join.
2. Message logging: All messages are logged to a file (chat.log).

How It Works:
* When a client connects, they enter a nickname.
* Nicknames must be unique.
* Messages are broadcasted to all other users.
* Every message is logged with a timestamp to chat.log.
* Typing exit disconnects the user.

To Test:
1. Run the server: node server.js
2. In separate terminals:
ncat localhost 3000
3. Try entering same and different nicknames, chatting, and typing exit.
---------------------------------------------------------------------------------------------

Let’s add a /list command that lets users see who’s currently online.

Updated Feature Set:
* /list: Shows all connected users.
* Keeps all previous features: nicknames, message logging, broadcasting, exit.

Usage in Chat:
* /list — See who is online.
* exit — Disconnect from the server.
* Any other message — Broadcasted to all.
---------------------------------------------------------------------------------------------

Let’s add private messaging with the /msg command while keeping broadcast functionality.

Features Now Include:
* Broadcast to all users (default behavior).
Just type and press enter.
* Private messaging: /msg <nickname> <message>
Example: /msg Alice hey there!
* List users: /list
* Exit chat: exit
* Logging to chat.log
---------------------------------------------------------------------------------------------

Let’s add admin commands to the chat server, specifically:

New Admin Features:
/kick <nickname> — Forcefully disconnects a user.
/mute <nickname> — Prevents a user from sending messages.
/unmute <nickname> — Allows a muted user to speak again.

We'll keep: Broadcasts, Private messages, User listing, Logging and Nicknames

Admin Rules:
* The first connected user becomes the admin.
* Only the admin can run /kick, /mute, or /unmute.

Command Summary:
/list — list all users
/msg <nickname> <message> — send private message
/kick <nickname> — remove a user [Admin only]
/mute <nickname> — silence a user [Admin only]
/unmute <nickname> — restore voice [Admin only]
exit — leave the chat
---------------------------------------------------------------------------------------------

Password-Based Admin Login
We'll require a password (e.g. "admin123") for admin privileges, instead of auto-assigning to the first user.

How It Works:
* Admin types: /admin <password>
* If correct, they gain admin rights
* Everyone else remains a regular user
---------------------------------------------------------------------------------------------

Instead of using netcat, users can connect via a web browser.

Steps:
1. Use ws module for WebSocket support
2. Serve a simple HTML chat client
3. Handle WebSocket events like message, open, close

To Test:
1. Run the server: node server.js
2. Open browser: http://localhost:3000
3. Try:
/admin admin123 to become admin
/list, /msg, /kick, etc.
