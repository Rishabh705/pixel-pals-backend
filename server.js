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
        console.log(`Registered user ${userId} with socket ${socket.id}`);
        console.log(users);
    });

    socket.on('drawing', data=>{
        const room = data.chat_id;
        socket.to(room).emit('drawing', data);
    })

    // Joining rooms based on chat type (individual or group)
    socket.on('join-chat', async (chat_id) => {
        socket.join(chat_id); //create a room for this chat
        console.log(`User ${socket.id} joined chat ${chat_id}`);
    });

    // Broadcasting messages to the appropriate room
    socket.on('send-message', async (data) => {
        const room = data.chat_id;

        console.log(`User ${socket.id} is sending a message to chat ${room}`);

        // Broadcast message to the room
        socket.to(room).emit('receive-message', data);
        console.log(`Message sent to room ${room}`);

        // If it's a group chat, send the message to all group members
        if (data.receiver._id === '') {
            try {
                const groupMembers = await pool.query(
                    'SELECT user_id FROM groupchatparticipants WHERE groupchat_id = $1',
                    [data.chat_id]
                );

                groupMembers.rows.forEach(member => {
                    if (users[member.user_id]) {
                        socket.to(users[member.user_id]).emit('receive-message', data);
                    }
                });
            } catch (error) {
                console.error('Error fetching group members:', error);
            }
        } else if (users[data.receiver._id]) {
            socket.to(users[data.receiver._id]).emit('receive-message', data);
        }
    });

    // Handling typing indicator
    socket.on('typing', (data) => {
        const room = data.chat_id;
        console.log(`User ${socket.id} is typing in chat ${room}`);
        socket.to(room).emit('typing', data);
    });

    socket.on('stop-typing', (data) => {
        console.log(`User ${socket.id} stopped typing in chat ${data.chat_id}`);
        socket.to(data.chat_id).emit('stop-typing', data);
    });

    // Handling disconnections
    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);
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
