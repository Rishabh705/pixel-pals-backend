# Chat Application

This is a chat application built using Node.js, Express, and MongoDB. It supports both individual (one-on-one) and group chats. The application includes user authentication with JWT and bcrypt.

## Table of Contents

- [Chat Application](#chat-application)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
  - [Usage](#usage)
  - [API Endpoints](#api-endpoints)
    - [Authentication](#authentication)
    - [Chats](#chats)
    - [Messages](#messages)
  - [Models](#models)
    - [User](#user)
    - [IndividualChat](#individualchat)
    - [GroupChat](#groupchat)
    - [Message](#message)
  - [Contributing](#contributing)
  - [License](#license)

## Features

- User registration and authentication
- One-on-one chat
- Group chat
- Real-time messaging
- JWT-based authentication
- MongoDB as the database

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/your-username/chat-application.git
    cd chat-application
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Set up environment variables:

    Create a `.env` file in the root directory and add the following:

    ```env
    NODE_ENV=development
    PORT=3000
    MONGO_URI=mongodb://localhost:27017/chat-app
    ACCESS_TOKEN_SECRET=youraccesstokensecret
    REFRESH_TOKEN_SECRET=yourrefreshtokensecret
    ```

4. Start the application:

    ```bash
    npm start
    ```

## Usage

- Register a new user
- Login to get the JWT token
- Use the token to access protected routes
- Create one-on-one or group chats
- Send and receive messages

## API Endpoints

### Authentication

- **Register a new user**

    ```http
    POST /api/auth/register
    ```

    Request Body:
    ```json
    {
      "username": "yourusername",
      "password": "yourpassword"
    }
    ```

- **Login**

    ```http
    POST /api/auth/login
    ```

    Request Body:
    ```json
    {
      "username": "yourusername",
      "password": "yourpassword"
    }
    ```

- **Logout**

    ```http
    POST /api/auth/logout
    ```

### Chats

- **Create a one-on-one chat**

    ```http
    POST /api/chats/one-on-one
    ```

    Request Body:
    ```json
    {
      "receiverID": "receiveruserid",
      "message": "Hello!"
    }
    ```

- **Create a group chat**

    ```http
    POST /api/chats/group
    ```

    Request Body:
    ```json
    {
      "name": "Group Name",
      "description": "Group Description",
      "members": ["userid1", "userid2"],
      "message": "Hello Group!"
    }
    ```

- **Get all chats for a user**

    ```http
    GET /api/chats?userID=youruserid
    ```

- **Get a specific chat**

    ```http
    GET /api/chats/:id
    ```

- **Update a chat**

    ```http
    PUT /api/chats/:id
    ```

    Request Body:
    ```json
    {
      "message": "Updated message",
      "receiverID": "receiveruserid"
    }
    ```

### Messages

- **Get all messages in a chat**

    ```http
    GET /api/messages/:chatID
    ```

## Models

### User

- **Schema**

    ```javascript
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
            type: String,
        },
    }, { timestamps: true });

    const User = mongoose.model('User', userSchema);

    module.exports = User;
    ```

### IndividualChat

- **Schema**

    ```javascript
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
    ```

### GroupChat

- **Schema**

    ```javascript
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
    ```

### Message

- **Schema**

    ```javascript
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
    ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
