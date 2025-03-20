const chatRepository = require('../repositories/chat');
const CustomError = require('../utils/Error');
const userRepository = require('../repositories/auth');

class ChatService {
    async createOneOnOneChat(senderID, receiverID, aesKeys) {

        if (!receiverID) {
            throw new CustomError('Missing receiverID', 400);
        }

        if (senderID === receiverID) {
            throw new CustomError('Cannot create chat with self', 400);
        }

        return await userRepository.withTransaction(async (client) => {
            const receiver = await userRepository.findUserByID(receiverID, client);
            if (!receiver) {
                throw new CustomError('Receiver not found', 404);
            }

            const existingChat = await chatRepository.findOneOnOneChatByMembers(senderID, receiverID, client);
            if (existingChat) {
                return {
                    created: false,
                    data: existingChat,
                };
            }

            const newChat = await chatRepository.createOneOnOneChat(senderID, receiverID, client);

            // Store the encrypted symmetric key for the new chat
            await Promise.all([
                chatRepository.storeChatKeys(newChat._id, aesKeys, client),
                chatRepository.addUserChats(newChat._id, [senderID, receiverID], 'individual', client)
            ]);

            return {
                created: true,
                data: newChat,
            };
        });
    }

    async createGroupChat(name, description, members, senderID, aesKeys) {
        // Input validation
        if (!name || !members || !Array.isArray(members) || members.length === 0) {
            throw new CustomError('Required fields: name, members', 400);
        }

        // Ensure the owner is included in the members and handle duplicates
        if (!members.includes(senderID.toString())) {
            members.push(senderID.toString());
        }

        // Remove duplicates from members array
        const uniqueMembers = [...new Set(members)];

        // Check if there are valid members (at least 3)
        if (uniqueMembers.length < 3) {
            throw new CustomError('At least 3 members are required', 400);
        }

        return await userRepository.withTransaction(async (client) => {
            const users = await userRepository.findUsersByIds(uniqueMembers, client);
            const existingUserIds = users.filter(user => user).map(user => user._id);
            const missingMembers = uniqueMembers.filter(id => !existingUserIds.includes(id));

            if (missingMembers.length > 0) {
                throw new CustomError(`Some members do not exist: ${missingMembers}`, 404);
            }

            const existingChat = await chatRepository.findGroupChatByMembers(uniqueMembers, client);
            if (existingChat) {
                return {
                    created: false,
                    data: existingChat,
                };
            }

            const newChat = await chatRepository.createGroupChat(name, description, senderID, uniqueMembers, client);

            // Add chat reference to each user's chat list
            await Promise.all([
                chatRepository.addUserChats(newChat._id, uniqueMembers, 'group', client),
                chatRepository.storeChatKeys(newChat._id, aesKeys, client)
            ]);

            return {
                created: true,
                data: newChat,
            };
        })
    }

    /* TODO: logic left for updating the members*/
    async updateGroupChatParticipants(chatId, members) {
        if (!chatId || !members || !Array.isArray(members) || members.length === 0) {
            throw new CustomError('Required fields: name, members', 400);
        }


    }

    async getChats(userId) {
        if (!userId) {
            throw new CustomError('Missing userId', 400);
        }
        const [individualChats, groupChats] = await Promise.all([
            chatRepository.getUserIndividualChats(userId),
            chatRepository.getUserGroupChats(userId)
        ]);

        return {
            individualChats: individualChats ?? [],
            groupChats: groupChats ?? []
        };
    }

    async getChat(chatId, userID) {
        if (!chatId) {
            throw new CustomError('Missing chatId', 400);
        }
        const [individualChat, groupChat] = await Promise.all([
            chatRepository.getIndividualChatById(chatId, userID),
            chatRepository.getGroupChatById(chatId, userID)
        ]);

        if (individualChat) {
            return {
                chat_id: individualChat.individual_chat_id,
                type: 'individual',
                participant1: individualChat.participant1 ?? {},
                participant2: individualChat.participant2 ?? {},
                messages: individualChat.messages ?? [],
                created_at: individualChat.created_at
            };
        }

        if (groupChat) {
            return {
                chat_id: groupChat.group_chat_id,
                type: 'group',
                name: groupChat.name ?? '',
                description: groupChat.description ?? '',
                members: groupChat.members ?? [],
                messages: groupChat.messages ?? [],
                created_at: groupChat.created_at
            };
        }

        throw new CustomError('Chat not found', 404);
    }

    async updateChatWithMessage(chatId, senderID, message, messageID) {
        if (!chatId || !senderID || !message || !messageID) {
            throw new CustomError('Required fields: message, chatId, senderID, messageID', 400);
        }

        return await userRepository.withTransaction(async (client) => {
            // Check if the chat exists
            const chat = await this.getChat(chatId, senderID);
            if (!chat) {
                throw new CustomError('Chat not found', 404);
            }
            const { type: chatType } = chat;

            const members = []
            if (chatType === 'individual') {
                members.push(chat.participant1, chat.participant2);
            } else {
                members.push(...chat.members);
            }

            // Create a new message
            const newMessage = await chatRepository.createMessage(
                messageID,
                message,
                senderID,
                chatId,
                chatType,
                client
            );

            // Update the chat's lastMessage field
            await chatRepository.updateChatLastMessage(
                chatId,
                newMessage._id,
                chatType,
                members,
                client
            );

            // Add the message to the appropriate chat-message junction table
            await chatRepository.addMessageToChat(
                chatId,
                newMessage._id,
                chatType,
                client
            );

            return newMessage;
        });
    }
}

module.exports = new ChatService();
