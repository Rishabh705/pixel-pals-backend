const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    chat: {
        type: Schema.Types.ObjectId,
        refPath: 'chatModel',
        required: true,
    },
    chatModel: {
        type: String,
        required: true,
        enum: ['IndividualChat', 'GroupChat']
    },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
