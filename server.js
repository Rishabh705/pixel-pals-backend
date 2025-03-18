require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const { logger, httpLogger } = require('./middleware/logger');
const corsOptions = require('./config/corsOptions');
const PORT = process.env.PORT || 3500;
const verifyJWT = require('./middleware/verifyJWT');
const cookieParser = require('cookie-parser');
const pool = require('./config/psqldb');
const fs = require('fs');
const errorHandler = require('./middleware/errorHandler');
const cacheService = require('./utils/redis'); 
const app = express();

const expressServer = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const io = new Server(expressServer, {
    cors: {
        origin: process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : []
    },
});

io.on('connection', (socket) => {

    socket.on('register-user', async (userId) => {
        try {
            // Socket IDs should have short TTL as they change frequently
            await cacheService.set(`user_socket:${userId}`, socket.id, 7200); // 2 hours
        } catch (error) {
            console.error('Error registering user:', error);
        }
    });

    socket.on('drawing', data => {
        const room = data.chat_id;
        socket.to(room).emit('drawing', data);
    })

    // Joining rooms based on chat type (individual or group)
    socket.on('join-chat', async (chat_id, userID) => {
        try {
            socket.join(chat_id);
            
            // Add caching here - encryption keys rarely change
            const cacheKey = `encryption_key:${chat_id}:${userID}`;
            let encryptionKey = await cacheService.get(cacheKey);
            
            if (!encryptionKey) {
                const result = await pool.query(
                    `SELECT encrypted_aes_key FROM Keys WHERE chat_id = $1 AND user_id = $2`,
                    [chat_id, userID]
                );
                encryptionKey = result.rows[0]?.encrypted_aes_key;
                
                if (encryptionKey) {
                    // Cache for a reasonable duration (e.g., 1 hour)
                    await cacheService.set(cacheKey, encryptionKey, 3600);
                }
            }
    
            socket.emit('encryptionKey', encryptionKey);
        } catch (error) {
            console.error('Error in join-chat:', error);
        }
    });
    
    // sending messages
    socket.on('send-message', async (data) => {
        try {
            const chatType = data.chat_type;
            const chatId = data.chat_id;
            const receiverId = data.receiver._id;
    
            if (chatType === 'group') {
                console.log(data);
                socket.to(chatId).emit('receive-message', data);
            } 
            // Handle private chat
            else if (chatType === 'individual') {
                const receiverSocketId = await cacheService.get(`user_socket:${receiverId}`);
                if (receiverSocketId) {
                    socket.to(receiverSocketId).emit('receive-message', data);
                }
            }
        } catch (error) {
            console.error('Error in send-message:', error);
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
    socket.on('disconnect', async () => {
        try {
            // Find and remove the user's socket mapping from cache
            const pattern = 'user_socket:*';
            await cacheService.invalidatePattern(pattern);
            
            logger.info(`Socket ${socket.id} disconnected`);
        } catch (error) {
            logger.error('Error handling disconnect:', error);
        }
    });
});

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
  logger.info('Logs directory created');
}

// Middleware for logging HTTP requests
app.use(httpLogger);    

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

app.use(verifyJWT);
app.use('/api/chats', require('./routes/api/chats'));
app.use('/api/contacts', require('./routes/api/contacts'));

// Custom error handler
app.use(errorHandler);

// Error page
app.get('/*', (req, res) => {
    // Only send 404 page for non-API routes (i.e., routes not starting with /api/)
    if (!req.originalUrl.startsWith('/api')) {
        return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
    } else {
        return res.status(404).json({
            success: false,
            message: 'Not Found'
        });
    }
}); 