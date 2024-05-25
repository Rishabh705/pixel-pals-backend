const mongoose = require('mongoose');
const { Schema } = mongoose;

const groupChatSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    admins: [
        {
            type: Schema.Types.ObjectId,
            ref: 'User',
        }
    ],
    members: [
        {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        }
    ],
    messages: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Message',
        }
    ],
    lastMessage: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
    },
}, { timestamps: true });

const GroupChat = mongoose.model('GroupChat', groupChatSchema);

module.exports = GroupChat;
