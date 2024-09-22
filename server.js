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
const chatPublicKeys = {};

io.on('connection', (socket) => {

    socket.on('register-user', (userId) => {
        users[userId] = socket.id; // Track the socket ID for each user
        console.log(users);
        // console.log(`Registered user ${userId} with socket ${socket.id}`);
    });

    socket.on('drawing', data => {
        const room = data.chat_id;
        socket.to(room).emit('drawing', data);
    })

    // Joining rooms based on chat type (individual or group)
    socket.on('join-chat', async (chat_id, type) => {
        socket.join(chat_id); // Create a room for this chat
    
        let publicKeys = {};
    
        // Fetch public keys from the database based on chat type
        if (type === 'individual') {
            const result = await pool.query(
                `SELECT jsonb_build_object(
                    k1.user_id, k1.publicKey,
                    k2.user_id, k2.publicKey
                ) AS public_key_mapping
                FROM IndividualChats ic
                JOIN Keys k1 ON ic.participant1 = k1.user_id
                JOIN Keys k2 ON ic.participant2 = k2.user_id
                WHERE ic._id = $1;`,
                [chat_id]
            );
    
            // Extract public keys from the result
            publicKeys = result.rows[0]?.public_key_mapping || {};
        } else if (type === 'group') {
            const result = await pool.query(
                'SELECT publicKeys FROM GroupChats WHERE _id = $1',
                [chat_id]
            );
    
            // Extract public keys from the result
            publicKeys = result.rows[0]?.publicKeys || {};
        }
    
        // Emit public keys to the connected user
        socket.emit('others-public-key', publicKeys);
    
        // Emit public keys to other connected users in the chat room
        socket.to(chat_id).emit('others-public-key', publicKeys);
    });
    
    

    socket.on('share-public-key', ({ publicKey }) => {
        // Store the public key associated with the chat ID
        chatPublicKeys[socket.id] = publicKey;
        console.log(chatPublicKeys);
    });

    // sending messages
    socket.on('send-message', (data) => {
        const chatType = data.chat_type;
        const chatId = data.chat_id;
        const receiverId = data.receiver._id;
        console.log(data.message);
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