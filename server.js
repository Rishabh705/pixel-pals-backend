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

// Enhanced Socket.IO configuration for stability
const io = new Server(expressServer, {
    cors: {
        origin: process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : []
    },
    pingTimeout: 60000,        // 60 seconds - wait time before considering connection dead
    pingInterval: 25000,       // 25 seconds - heartbeat frequency
    upgradeTimeout: 30000,     // 30 seconds - transport upgrade timeout
    maxHttpBufferSize: 1e6,    // 1 MB - max message size
    transports: ['websocket', 'polling'],
    allowUpgrades: true
});

// In-memory mapping to track socket-to-user relationships
const socketToUser = new Map();

io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} via ${socket.conn.transport.name}`);

    // Monitor transport upgrades
    socket.conn.on('upgrade', (transport) => {
        logger.info(`Socket ${socket.id} upgraded to ${transport.name}`);
    });

    // Register user and store socket mapping
    socket.on('register-user', async (userId) => {
        try {
            logger.info(`Registering user ${userId} with socket ${socket.id}`);
            
            // Store bidirectional mapping
            socketToUser.set(socket.id, userId);
            await cacheService.set(`user_socket:${userId}`, socket.id, 7200); // 2 hours TTL
            
            logger.info(`User ${userId} successfully registered`);
        } catch (error) {
            logger.error(`Error registering user ${userId}:`, error);
        }
    });

    // Drawing events
    socket.on('drawing', data => {
        socket.to(data.chat_id).emit('drawing', data);
    });

    // Join chat room and retrieve encryption key
    socket.on('join-chat', async (chat_id, userID) => {
        try {
            logger.info(`User ${userID} joining chat ${chat_id}`);
            
            // Backup: Auto-register if not already registered
            if (!socketToUser.has(socket.id)) {
                socketToUser.set(socket.id, userID);
                await cacheService.set(`user_socket:${userID}`, socket.id, 7200);
                logger.info(`Auto-registered user ${userID} via join-chat`);
            }
            
            socket.join(chat_id);
            
            // Check cache for encryption key
            const cacheKey = `encryption_key:${chat_id}:${userID}`;
            let encryptionKey = await cacheService.get(cacheKey);
            
            if (!encryptionKey) {
                const result = await pool.query(
                    `SELECT encrypted_aes_key FROM Keys WHERE chat_id = $1 AND user_id = $2`,
                    [chat_id, userID]
                );
                encryptionKey = result.rows[0]?.encrypted_aes_key;
                
                if (encryptionKey) {
                    await cacheService.set(cacheKey, encryptionKey, 3600); // 1 hour cache
                }
            }
    
            socket.emit('encryptionKey', encryptionKey);
            logger.info(`User ${userID} joined chat ${chat_id}`);
        } catch (error) {
            logger.error('Error in join-chat:', error);
        }
    });
    
    // Send messages
    socket.on('send-message', async (data) => {
        try {
            const { chat_type, chat_id, receiver } = data;
    
            if (chat_type === 'group') {
                socket.to(chat_id).emit('receive-message', data);
            } 
            else if (chat_type === 'individual') {
                const receiverSocketId = await cacheService.get(`user_socket:${receiver._id}`);
                
                if (receiverSocketId) {
                    socket.to(receiverSocketId).emit('receive-message', data);
                } else {
                    logger.warn(`Receiver ${receiver._id} not connected`);
                }
            }
        } catch (error) {
            logger.error('Error in send-message:', error);
        }
    });

    // Typing indicators
    socket.on('typing', (data) => {
        socket.to(data.chat_id).emit('typing', data);
    });

    socket.on('stop-typing', (data) => {
        socket.to(data.chat_id).emit('stop-typing', data);
    });

    // Error handlers
    socket.on('error', (error) => {
        logger.error(`Socket ${socket.id} error:`, error);
    });

    // Disconnect handler - CRITICAL FIX
    socket.on('disconnect', async (reason) => {
        try {
            logger.info(`Socket ${socket.id} disconnected. Reason: ${reason}`);
            
            // Get the user ID for THIS socket only
            const userId = socketToUser.get(socket.id);
            
            if (userId) {
                // Only remove THIS specific user's mapping using invalidate method
                await cacheService.invalidate(`user_socket:${userId}`);
                socketToUser.delete(socket.id);
                logger.info(`Cleaned up mapping for user ${userId}`);
            } else {
                logger.warn(`No user mapping found for socket ${socket.id}`);
            }
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

app.set("trust proxy", 1);
app.use(httpLogger);    
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/root'));
app.use('/api/auth', require('./routes/api/auth'));

app.use(verifyJWT);
app.use('/api/chats', require('./routes/api/chats'));
app.use('/api/contacts', require('./routes/api/contacts'));

app.use(errorHandler);

// 404 handler
app.get('/*', (req, res) => {
    if (!req.originalUrl.startsWith('/api')) {
        return res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
    } else {
        return res.status(404).json({
            success: false,
            message: 'Not Found'
        });
    }
}); 

// Error handlers
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
});  
  
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received: closing server gracefully');
    expressServer.close(() => {
        logger.info('Server closed');
        socketToUser.clear();
        process.exit(0);
    });
});