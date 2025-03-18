const ChatService = require('../services/chat');

class ChatController {
    async createOneOnOneChat(req, res, next) {
        try {
            const { receiverID } = req.body;
            const { aesKeys } = req.body;
            const senderId = req.user._id;

            const result = await ChatService.createOneOnOneChat(senderId, receiverID, aesKeys);

            // If the chat already exists, decide on a different status code
            const statusCode = result.created ? 201 : 200;

            return res.status(statusCode).json({
                message: result.created ? 'One-on-one chat created successfully' : 'Chat already exists',
                data: result.data
            }); 
        } catch (error) {
            // Pass the error to centralized error handler
            next(error);
        }
    }

    async createGroupChat(req, res, next) {
        try {
            const { name, description, members } = req.body;
            const senderID = req.user._id;
            const { aesKeys } = req.body;

            const result = await ChatService.createGroupChat(name, description, members, senderID, aesKeys);

            // If the chat already exists, decide on a different status code
            const statusCode = result.created ? 201 : 200;

            return res.status(statusCode).json({
                message: result.created ? 'Group chat created successfully' : 'Chat already exists',
                data: result.data
            });
        } catch (error) {
            // Pass the error to centralized error handler
            next(error);
        }
    }

    async getChats(req, res, next) {
        try {
            const userID = req.user._id;

            const chats = await ChatService.getChats(userID);

            return res.status(200).json({
                message: 'User chats retrieved successfully',
                data: chats
            });
        } catch (error) {
            next(error);
        }
    }

    async getChat(req, res, next){
        try {
            const { id } = req.params;
            const userID = req.user._id;

            const chat = await ChatService.getChat(id, userID);
            
            // Format based on chat type
            if (chat.type === 'group') {
                return res.status(200).json({
                    message: 'Group chat retrieved successfully',
                    data: chat
                });
            } else {
                return res.status(200).json({
                    message: 'Individual chat retrieved successfully',
                    data: chat
                });
            }
        } catch (err) {
           next(err);
        }
    }

    async updateChatWithMessage(req, res, next) {
        try {
            const { id } = req.params;
            const { message, messageID } = req.body;
            const senderID = req.user._id;

            const result = await ChatService.updateChatWithMessage(id, senderID, message, messageID);

            return res.status(201).json({
                message: 'Chat updated successfully',
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ChatController();

