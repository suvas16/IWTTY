const io = new Server(server, {
    maxHttpBufferSize: 1e7,  
    transports: ['websocket'] 
});
const app = express();
const server = http.createServer(app);

// Expand payload limits to allow Base64 image transfers safely
const io = new Server(server, {
    maxHttpBufferSize: 1e7, // Keep your 10MB image limit
    transports: ['websocket'] // <--- CRUCIAL: Forces WebSockets only
});

app.use(express.static('public'));

let activeUsers = new Set();
const MAX_USERS = 2;
let messageHistory = [];
const MAX_HISTORY = 50;

io.on('connection', (socket) => {
    if (activeUsers.size >= MAX_USERS) {
        socket.emit('room_full', 'Sorry, this 1-on-1 room is full.');
        socket.disconnect(true);
        return;
    }

    let username = "";

    socket.on('join_room', (chosenName) => {
        if (activeUsers.size >= MAX_USERS) {
            socket.emit('room_full', 'Sorry, this room just filled up.');
            socket.disconnect(true);
            return;
        }

        username = chosenName;
        activeUsers.add(username);
        
        socket.emit('init', username);
        socket.emit('load_history', messageHistory);
        socket.broadcast.emit('system_message', `${username} joined the chat`);
    });

    socket.on('chat_message', (data) => {
        if (!username) return;

        // Build the standardized storage format
        const verifiedMessage = {
            id: data.id,
            user: username,
            text: data.text,
            image: data.image,
            replyTo: data.replyTo,
            timestamp: Date.now() // Apply atomic server-side timeline clock stamp
        };

        messageHistory.push(verifiedMessage);
        if (messageHistory.length > MAX_HISTORY) {
            messageHistory.shift();
        }

        socket.broadcast.emit('chat_message', verifiedMessage);
    });

    socket.on('disconnect', () => {
        if (username) {
            activeUsers.delete(username);
            io.emit('system_message', `${username} left the chat`);
            if (activeUsers.size === 0) {
                messageHistory = [];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
