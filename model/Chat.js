const mongoose = require('mongoose');
const { Schema } = mongoose;

const chatSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['IndividualChat', 'GroupChat'],
        required: true,
    },
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'type',
        required: true,
    },
}, { timestamps: true });

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
