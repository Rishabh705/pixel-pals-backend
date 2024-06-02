const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    avatar: {
        type: String,
        default: 'https://github.com/shadcn.png',
    },
    chats: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Chat',
        }
    ],
    refreshToken: {
        type: String,
    },
    savedContacts: [
        {
            type: Schema.Types.ObjectId,
            ref: 'User',
        }
    ],
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
