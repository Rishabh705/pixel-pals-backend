const mongoose = require('mongoose');
const { Schema } = mongoose;

const individualChatSchema = new Schema({
    participants: [
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

const IndividualChat = mongoose.model('IndividualChat', individualChatSchema);

module.exports = IndividualChat;
