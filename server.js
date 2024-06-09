require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Server } = require('socket.io')
const path = require('path')
const { logger } = require('./middleware/logEvents')
const corsOptions = require('./config/corsOptions')
const PORT = process.env.PORT || 3500
const verifyJWT = require('./middleware/verifyJWT')
const cookieParser = require('cookie-parser')
const pool = require('./config/psqldb')
const app = express()

const expressServer = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const io = new Server(expressServer, {
    cors: {
        origin: process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : []
    },
});

const users = {};

io.on('connection', (socket) => {
    console.log(`User ${socket.id} connected`);

    socket.on('register-user', (userId) => {
        users[userId] = socket.id; // Track the socket ID for each user
        console.log(`Registered user ${userId} with socket`);
    });

    // Joining rooms based on chat type (individual or group)
    socket.on('join-chat', async (chat_id) => {
        socket.join(chat_id);

        // Fetch and send last messages for the joined chat
        try {
            const result = await pool.query(
                'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC LIMIT 10',
                [chat_id]
            );
            socket.emit('chat-history', result.rows);
        } catch (error) {
            console.error('Error fetching chat history:', error);
        }
    });
    // Broadcasting messages to the appropriate room
    socket.on('send-message', async (data) => {
        const room = data.chat_id;

        console.log(`User ${socket.id} joined ${room}`);

        socket.to(room).emit('receive-message', data);

        // If it's a group chat, send the message to all group members
        if (data.receiver._id === '') {
            const groupMembers = await pool.query(
                'SELECT user_id FROM groupchatparticipants WHERE groupchat_id = $1',
                [data.chat_id]
            );

            groupMembers.rows.forEach(member => {
                if (users[member.user_id]) {
                    socket.to(users[member.user_id]).emit('receive-message', data);
                }
            });
        } else if (users[data.receiver._id]) {
            socket.to(users[data.receiver._id]).emit('receive-message', data);
        }
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

//custom middlewares
app.use(logger)

//thirdparty middlewares
app.use(cors(corsOptions))

//built in middlewares
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

//make all static files available
app.use(express.static(path.join('./public/')))

//routes
app.use('/', require('./routes/root'))
app.use('/api/auth', require('./routes/api/auth'))
app.use('/refresh', require('./routes/refresh'))

app.use(verifyJWT)
app.use('/api/chats', require('./routes/api/chats'))
app.use('/api/contacts', require('./routes/api/contacts'))

//Error page
app.get('/*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'))
})