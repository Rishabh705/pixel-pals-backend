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
    individualChats: [
        {
            type: Schema.Types.ObjectId,
            ref: 'IndividualChat',
        }
    ],
    groupChats: [
        {
            type: Schema.Types.ObjectId,
            ref: 'GroupChat',
        }
    ],
    refreshToken: {
        type:String,
    },
    
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
