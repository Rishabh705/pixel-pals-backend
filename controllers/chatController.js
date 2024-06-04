const Chat = require('../model/Chat');
const IndividualChat = require('../model/IndividualChat');
const GroupChat = require('../model/GroupChat');
const User = require('../model/User');
const Message = require('../model/Message');

// Create a one-on-one chat
const createOneOnOneChat = async (req, res) => {
    try {
        const { receiverID } = req.body;
        const senderID = req.user._id;
        console.log(senderID, receiverID);
        const receiver = await User.findById(receiverID).exec();
        if (!receiver) {
            return res.status(404).json({ message: 'Receiver does not exist' });
        }

        // Check if a chat already exists between the two users
        const existingChat = await Chat.findOne({
            type: 'IndividualChat',
            chat: {
              $in: await IndividualChat.find({
                participants: { $all: [senderID, receiverID] }
              }).distinct('_id')
            }
          }).exec();

        if (existingChat) {
            console.log(existingChat);
            return res.status(200).json({
                message: 'Chat already exists',
                data: existingChat,
            });
        }

        const newIndividualChat = await IndividualChat.create({
            participants: [senderID, receiverID],
        });

        await newIndividualChat.save();

        const newChat = await Chat.create({
            type: 'IndividualChat',
            chat: newIndividualChat._id
        });


        await User.updateMany(
            { _id: { $in: [senderID, receiverID] } },
            { $push: { chats: newChat._id } }
        );

        res.status(201).json({
            message: 'One-on-one chat created successfully',
            data: newChat
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

        const newGroupChat = await GroupChat.create({
            name,
            description,
            owner: senderID,
            admins: [senderID],
            members,
        });

        await newGroupChat.save();

        const newChat = await Chat.create({
            type: 'GroupChat',
            chat: newGroupChat._id
        });

        await User.updateMany(
            { _id: { $in: members } },
            { $push: { chats: newChat._id } }
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

        // First populate IndividualChat type
        const foundUserWithIndividualChats = await User.findById(userID)
            .populate({
                path: 'chats',
                populate: {
                    path: 'chat',
                    model: 'IndividualChat',
                    populate: [
                        { path: 'lastMessage', populate: { path: 'sender', select: 'username' } },
                        { path: 'participants', select: 'username' }
                    ],
                },
            })
            .exec();

        // Then populate GroupChat type
        const foundUserWithGroupChats = await User.findById(userID)
            .populate({
                path: 'chats',
                populate: {
                    path: 'chat',
                    model: 'GroupChat',
                    populate: [
                        { path: 'lastMessage', populate: { path: 'sender', select: 'username' } },
                    ],
                },
            })
            .exec();

        if (!foundUserWithIndividualChats || !foundUserWithGroupChats) {
            return res.status(404).json({ message: 'No such user exists' });
        }

        // Combine the populated results from both queries
        const combinedChats = {
            individualChats: foundUserWithIndividualChats.chats.filter(chat => chat.type === 'IndividualChat'),
            groupChats: foundUserWithGroupChats.chats.filter(chat => chat.type === 'GroupChat'),
        };

        res.status(200).json({
            message: 'User chats retrieved successfully',
            data: combinedChats,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// Get a single chat
const getChat = async (req, res) => {
    try {
        const { id } = req.params;

        const chat = await Chat.findById(id)
            .populate({
                path: 'chat',
                populate: [
                    {
                        path: 'messages',
                        populate: {
                            path: 'sender',
                            select: 'username avatar',
                        },
                    },
                    {
                        path: 'participants',
                        select: 'username avatar',
                    },

                ],
            })
            .exec();

        if (!chat) {
            return res.status(404).json({ message: 'No chat with the given ID exists' });
        }

        res.status(200).json({
            message: 'Chat retrieved successfully',
            data: chat,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Update a chat with a new message
const updateChat = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const senderID = req.user._id;

        // Find the chat by ID
        const chat = await Chat.findById(id).exec();
        if (!chat) {
            return res.status(404).json({ message: 'Chat does not exist' });
        }

        // Create a new message
        const newMessage = await Message.create({
            message,
            sender: senderID,
            chat: chat._id,
        });

        // Update the detailed chat model
        let chatDetails;
        if (chat.type === 'IndividualChat') {
            chatDetails = await IndividualChat.findById(chat.chat)
            .populate({path:'participants', select: 'username avatar'})
            .exec();
        } else if (chat.type === 'GroupChat') {
            chatDetails = await GroupChat.findById(chat.chat).exec();
        }

        if (!chatDetails) {
            return res.status(404).json({ message: 'Chat details not found' });
        }

        // Push the new message to the chat
        chatDetails.messages.push(newMessage._id);
        chatDetails.lastMessage = newMessage._id;

        await chatDetails.save();

        // Add receiver information to the new message
        let newMessageWithReceiver = newMessage.toObject();
        if (chat.type === 'IndividualChat') {
            const receiver = chatDetails.participants.find(participant => participant._id.toString() !== senderID.toString());
            newMessageWithReceiver.receiver = receiver;
        }


        res.status(201).json({ message: 'Chat updated successfully', newMessage: newMessageWithReceiver});
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