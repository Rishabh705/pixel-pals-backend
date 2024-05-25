const IndividualChat = require('../model/IndividualChat');
const GroupChat = require('../model/GroupChat');
const User = require('../model/User');
const Message = require('../model/Message');

const createOneOnOneChat = async (req, res) => {
    try {
        const { receiverID, message } = req.body;
        const senderID = req.user._id;

        const receiver = await User.findById(receiverID).exec();
        if (!receiver) {
            return res.status(404).json({ message: 'Receiver does not exist' });
        }

        const newChat = await IndividualChat.create({
            participants: [senderID, receiverID],
        });

        const newMessage = await Message.create({ 
            message, 
            sender: senderID, 
            chat: newChat._id,
            chatModel: 'IndividualChat'
        });

        newChat.messages.push(newMessage._id);
        newChat.lastMessage = newMessage._id;
        await newChat.save();

        await User.updateMany(
            { _id: { $in: [senderID, receiverID] } },
            { $push: { individualChats: newChat._id } }
        );

        res.status(201).json({
            message: 'One-on-one chat created successfully',
            data: { chat: newChat }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Create a group chat
const createGroupChat = async (req, res) => {
    try {
        const { name, description, members, message } = req.body;
        const senderID = req.user._id;

        // Ensure the owner is included in the members
        if (!members.includes(senderID.toString())) {
            members.push(senderID.toString());
        }

        const newChat = await GroupChat.create({
            name,
            description,
            owner: senderID,
            admins: [senderID],
            members,
        });

        const newMessage = await Message.create({ 
            message, 
            sender: senderID, 
            chat: newChat._id,
            chatModel: 'GroupChat'
        });

        newChat.messages.push(newMessage._id);
        newChat.lastMessage = newMessage._id;
        await newChat.save();

        await User.updateMany(
            { _id: { $in: members } },
            { $push: { groupChats: newChat._id } }
        );

        res.status(201).json({
            message: 'Group chat created successfully',
            data: { chat: newChat }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get all chats for a user
const getChats = async (req, res) => {
    try {
        const { userID } = req.query;

        const foundUser = await User.findById(userID)
            .populate({
                path: 'individualChats',
                populate: [
                    { path: 'lastMessage' },
                    {
                        path: 'participants',
                        select: 'username',
                    },
                ],
            })
            .populate({
                path: 'groupChats',
                populate: [
                    { path: 'lastMessage' },
                    {
                        path: 'members',
                        select: 'username',
                    },
                ],
            })
            .exec();

        if (!foundUser) {
            return res.status(404).json({ message: 'No such user exists' });
        }

        res.status(200).json({
            message: 'User chats retrieved successfully',
            data: { individualChats: foundUser.individualChats, groupChats: foundUser.groupChats },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get a single chat
const getChat = async (req, res) => {
    try {
        const { id, type } = req.params;
        let chat;

        if (type === 'individual') {
            chat = await IndividualChat.findById(id)
                .populate({
                    path: 'messages',
                    populate: {
                        path: 'sender',
                        select: 'username',
                    }
                })
                .exec();
        } else if (type === 'group') {
            chat = await GroupChat.findById(id)
                .populate({
                    path: 'messages',
                    populate: {
                        path: 'sender',
                        select: 'username',
                    }
                })
                .exec();
        }

        if (!chat) {
            return res.status(404).json({ message: 'No chat with the given ID exists' });
        }

        res.status(200).json({
            message: 'Chat retrieved successfully',
            data: chat.messages
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Update a chat with a new message
const updateChat = async (req, res) => {
    try {
        const { message, chatID, type } = req.body;
        const senderID = req.user._id;

        let chat;

        if (type === 'individual') {
            chat = await IndividualChat.findById(chatID).exec();
        } else if (type === 'group') {
            chat = await GroupChat.findById(chatID).exec();
        }

        if (!chat) {
            return res.status(404).json({ message: 'Chat does not exist' });
        }

        const newMessage = await Message.create({
            message,
            sender: senderID,
            chat: chat._id,
            chatModel: type === 'individual' ? 'IndividualChat' : 'GroupChat'
        });

        chat.messages.push(newMessage._id);
        chat.lastMessage = newMessage._id;
        await chat.save();

        res.status(201).json({ message: 'Chat updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    createOneOnOneChat,
    createGroupChat,
    getChats,
    getChat,
    updateChat,
};
