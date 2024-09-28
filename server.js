require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const { logger } = require('./middleware/logEvents');
const corsOptions = require('./config/corsOptions');
const PORT = process.env.PORT || 3500;
const verifyJWT = require('./middleware/verifyJWT');
const cookieParser = require('cookie-parser');
const pool = require('./config/psqldb');
const app = express();

const expressServer = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const io = new Server(expressServer, {
    cors: {
        origin: process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : []
    },
});

const users = new Map();

io.on('connection', (socket) => {

    socket.on('register-user', (userId) => {
        users[userId] = socket.id; // Track the socket ID for each user
        // console.log(users);
        // console.log(`Registered user ${userId} with socket ${socket.id}`);
    });

    socket.on('drawing', data => {
        const room = data.chat_id;
        socket.to(room).emit('drawing', data);
    })

    // Joining rooms based on chat type (individual or group)
    socket.on('join-chat', async (chat_id, userID) => {
        socket.join(chat_id); // Create a room for this chat
        
        // Fetch public keys from the database based on chat type
        const result = await pool.query(
            `SELECT encrypted_aes_key 
            FROM Keys 
            WHERE chat_id = $1 AND user_id = $2`,
            [chat_id, userID]
        );
        
        // Extract encrypted key from the result
        const encryptionKey = result.rows[0]?.encrypted_aes_key;

        // Emit user's encryptedAES key to him
        socket.emit('encryptionKey', encryptionKey);
    });
    
    // sending messages
    socket.on('send-message', (data) => {
        const chatType = data.chat_type;
        const chatId = data.chat_id;
        const receiverId = data.receiver._id;
        // Handle group chat
        if (chatType === 'group') {
            const room = chatId;

            // Broadcast the message to all connected users in the group chat room
            socket.to(room).emit('receive-message', data);
        }
        // Handle private chat
        else if (chatType === 'individual' && users[receiverId]) {
            // Send the message directly to the receiver if they are online
            socket.to(users[receiverId]).emit('receive-message', data);
        }
    });

    // Handling typing indicator
    socket.on('typing', (data) => {
        const room = data.chat_id;
        socket.to(room).emit('typing', data);
    });

    socket.on('stop-typing', (data) => {
        socket.to(data.chat_id).emit('stop-typing', data);
    });

    // Handling disconnections
    socket.on('disconnect', () => {
        // Clean up if needed
        Object.keys(users).forEach((userId) => {
            if (users[userId] === socket.id) {
                delete users[userId];
            }
        });
    });
});

// Custom middlewares
app.use(logger);

// Third-party middlewares
app.use(cors(corsOptions));

// Built-in middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Make all static files available
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/root'));
app.use('/api/auth', require('./routes/api/auth'));
app.use('/refresh', require('./routes/refresh'));

app.use(verifyJWT);
app.use('/api/chats', require('./routes/api/chats'));
app.use('/api/contacts', require('./routes/api/contacts'));

// Error page
app.get('/*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});