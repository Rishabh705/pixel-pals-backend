const pool = require('../config/psqldb');

// Create a one-on-one chat
const createOneOnOneChat = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start the transaction

        const { receiverID } = req.body;
        const senderID = req.user._id;

        // Check if the receiver exists
        const query1 = {
            text: "SELECT * FROM Users WHERE _id = $1",
            values: [receiverID]
        };

        const response = await client.query(query1);
        const receiver = response.rows[0];

        if (!receiver) {
            await client.query('ROLLBACK'); // Rollback if receiver doesn't exist
            return res.status(404).json({ message: 'Receiver does not exist' });
        }

        // Check if a chat already exists between the two users
        const query2 = {
            text: `
                SELECT *
                FROM IndividualChats
                WHERE  (participant1 = $1 AND participant2 = $2) OR
                       (participant1 = $2 AND participant2 = $1)
            `,
            values: [senderID, receiverID]
        };

        const existingChatResponse = await client.query(query2);
        const existingChat = existingChatResponse.rows[0];

        if (existingChat) {
            await client.query('ROLLBACK'); // Rollback if chat already exists
            return res.status(200).json({
                message: 'Chat already exists',
                data: existingChat,
            });
        }

        // Create a new individual chat
        const query3 = {
            text: `
                INSERT INTO IndividualChats (participant1, participant2)
                VALUES ($1, $2)
                RETURNING *
                `,
            values: [senderID, receiverID]
        };

        const newIndividualChatResponse = await client.query(query3);
        const newIndividualChat = newIndividualChatResponse.rows[0];

        // Update users' chat lists
        const query4 = {
            text: `
                INSERT INTO UserChats (user_id, chat_id, chat_type)
                VALUES ($1, $2, 'individual'), ($3, $2, 'individual')
            `,
            values: [senderID, newIndividualChat._id, receiverID]
        };

        await client.query(query4);

        await client.query('COMMIT'); // Commit the transaction

        res.status(201).json({
            message: 'One-on-one chat created successfully',
            data: newIndividualChat
        });
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback in case of an error
        res.status(500).json({ message: err.message });
    } finally {
        client.release(); // Release the client back to the pool
    }
};

// Create a group chat
const createGroupChat = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start the transaction

        const { name, description, members } = req.body;
        const senderID = req.user._id;

        // Ensure the owner is included in the members
        if (!members.includes(senderID.toString())) {
            members.push(senderID.toString());
        }

        // Create a new group chat
        const query1 = {
            text: "INSERT INTO GroupChats (name, description, owner) VALUES ($1, $2, $3) RETURNING *",
            values: [name, description, senderID]
        };

        const response = await client.query(query1);
        const newGroupChat = response.rows[0];

        // Prepare bulk insert for UserChats
        const userChatsValues = members.map(memberID => `('${memberID}', '${newGroupChat._id}', 'group')`).join(', ');
        const query2 = {
            text: `INSERT INTO UserChats (user_id, chat_id, chat_type) VALUES ${userChatsValues}`
        };

        // Prepare bulk insert for GroupChatParticipants
        const groupChatParticipantsValues = members.map(memberID => `('${newGroupChat._id}', '${memberID}')`).join(', ');
        const query3 = {
            text: `INSERT INTO GroupChatParticipants (groupchat_id, user_id) VALUES ${groupChatParticipantsValues}`
        };

        await client.query(query2);
        await client.query(query3);

        await client.query('COMMIT'); // Commit the transaction

        res.status(201).json({
            message: 'Group chat created successfully',
            data: { chat: newGroupChat }
        });
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback in case of an error
        res.status(500).json({ message: err.message });
    } finally {
        client.release(); // Release the client back to the pool
    }
};

// Get all chats for a user
const getChats = async (req, res) => {
    const client = await pool.connect();
    try {
        const { userID } = req.query;

        // Fetch individual chats
        const query1 = {
            text: `
                SELECT 
                    ic._id AS chat_id,
                    ic.created_at,
                    jsonb_build_object(
                        '_id', u1._id,
                        'username', u1.username,
                        'avatar', u1.avatar
                    ) AS participant1,
                    jsonb_build_object(
                        '_id', u2._id,
                        'username', u2.username,
                        'avatar', u2.avatar
                    ) AS participant2,
                    CASE
                        WHEN ic.lastMessage IS NOT NULL THEN jsonb_build_object(
                            '_id', m._id,
                            'message', m.message,
                            'sender', jsonb_build_object(
                                '_id', u3._id,
                                'username', u3.username,
                                'avatar', u3.avatar
                            ),
                            'created_at', m.created_at
                        )
                        ELSE NULL
                    END AS lastMessage
                FROM IndividualChats ic
                JOIN UserChats uc ON uc.chat_id = ic._id
                JOIN Users u1 ON ic.participant1 = u1._id
                JOIN Users u2 ON ic.participant2 = u2._id
                LEFT JOIN Messages m ON ic.lastMessage = m._id
                LEFT JOIN Users u3 ON m.sender = u3._id
                WHERE uc.user_id = $1 AND uc.chat_type = 'individual';
            `,
            values: [userID]
        };

        const individualChatsResponse = await client.query(query1);
        const individual_chats = individualChatsResponse.rows;

        // Fetch group chats
        const query2 = {
            text: `
                SELECT 
                    gc._id AS chat_id,
                    gc.name,
                    gc.description,
                    gc.created_at,
                    jsonb_build_object(
                        '_id', u._id,
                        'username', u.username,
                        'avatar', u.avatar
                    ) AS owner,
                    CASE
                        WHEN gc.lastMessage IS NOT NULL THEN jsonb_build_object(
                            '_id', m._id,
                            'message', m.message,
                            'sender', jsonb_build_object(
                                '_id', u3._id,
                                'username', u3.username,
                                'avatar', u3.avatar
                            ),
                            'created_at', m.created_at
                        )
                        ELSE NULL
                    END AS lastMessage
                FROM GroupChats gc
                JOIN UserChats uc ON uc.chat_id = gc._id
                JOIN Users u ON u._id = gc.owner
                LEFT JOIN Messages m ON gc.lastMessage = m._id
                LEFT JOIN Users u3 ON m.sender = u3._id
                WHERE uc.user_id = $1 AND uc.chat_type = 'group';
            `,
            values: [userID]
        };

        const groupChatsResponse = await client.query(query2);
        const group_chats = groupChatsResponse.rows;

        res.status(200).json({
            message: 'User chats retrieved successfully',
            data: { individualChats: individual_chats, groupChats: group_chats }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        client.release(); // Release the client back to the pool
    }
};


// Get a single chat
const getChat = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        // Query to fetch individual chat details
        const individualChatQuery = {
            text: `
                SELECT 
                    ic._id AS individual_chat_id,
                    jsonb_build_object(
                        '_id', ic.participant1,
                        'username', u1.username,
                        'avatar', u1.avatar
                    ) AS participant1,
                    jsonb_build_object(
                        '_id', ic.participant2,
                        'username', u2.username,
                        'avatar', u2.avatar
                    ) AS participant2,
                    jsonb_agg(
                        jsonb_build_object(
                            '_id', m1._id,
                            'message', m1.message,
                            'sender', jsonb_build_object(
                                '_id', m1.sender,
                                'username', u3.username,
                                'avatar', u3.avatar
                            ),
                            'created_at', m1.created_at
                        )
                    ) AS messages,
                    ic.created_at AS created_at
                FROM IndividualChats ic
                LEFT JOIN IndividualChatMessages icm ON icm.individualchat_id = ic._id
                LEFT JOIN Messages m1 ON icm.message_id = m1._id
                LEFT JOIN Users u1 ON ic.participant1 = u1._id
                LEFT JOIN Users u2 ON ic.participant2 = u2._id
                LEFT JOIN Users u3 ON m1.sender = u3._id
                WHERE ic._id = $1
                GROUP BY 
                    ic._id,
                    u1.username,
                    u1.avatar,
                    u2.username,
                    u2.avatar,
                    ic.created_at;
            `,
            values: [id]
        };

        // Query to fetch group chat details
        const groupChatQuery = {
            text: `
                SELECT 
                    gc._id AS group_chat_id,
                    gc.name,
                    gc.description,
                    jsonb_build_object(
                        '_id', u._id,
                        'username', u.username,
                        'avatar', u.avatar
                    ) AS owner,
                    jsonb_agg(
                        jsonb_build_object(
                            '_id', m2._id,
                            'message', m2.message,
                            'sender', jsonb_build_object(
                                '_id', m2.sender,
                                'username', u4.username,
                                'avatar', u4.avatar
                            ),
                            'created_at', m2.created_at
                        )
                    ) AS messages,
                    gc.created_at AS created_at
                FROM GroupChats gc
                LEFT JOIN GroupChatMessages gcm ON gcm.groupchat_id = gc._id
                LEFT JOIN Messages m2 ON gcm.message_id = m2._id
                LEFT JOIN Users u ON u._id = gc.owner
                LEFT JOIN Users u4 ON m2.sender = u4._id
                WHERE gc._id = $1
                GROUP BY 
                    gc._id,
                    u._id,
                    u.username,
                    u.avatar,
                    gc.name,
                    gc.description,
                    gc.created_at;
            `,
            values: [id]
        };

        let chat;

        // Check if the chat exists as an individual chat
        const individualChatResponse = await client.query(individualChatQuery);
        chat = individualChatResponse.rows[0];

        // If no individual chat is found, fetch it as a group chat
        if (!chat) {
            const groupChatResponse = await client.query(groupChatQuery);
            chat = groupChatResponse.rows[0];

            if (!chat) {
                return res.status(404).json({ message: 'No chat with the given ID exists' });
            }

            // Format the response for group chat
            const responseData = {
                message: 'Group chat retrieved successfully',
                data: {
                    chat_id: chat.group_chat_id,
                    name: chat.name,
                    description: chat.description,
                    owner: chat.owner,
                    messages: chat.messages ? chat.messages : [],
                    created_at: chat.created_at
                }
            };
            return res.status(200).json(responseData);
        }

        // Format the response for individual chat
        const responseData = {
            message: 'Individual chat retrieved successfully',
            data: {
                chat_id: chat.individual_chat_id,
                participant1: chat.participant1,
                participant2: chat.participant2,
                messages: chat.messages ? chat.messages : [],
                created_at: chat.created_at
            }
        };

        res.status(200).json(responseData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    } finally {
        client.release();
    }
};

// Update a chat with a new message
const updateChat = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start the transaction

        const { id } = req.params;
        const { message, messageID } = req.body;
        const senderID = req.user._id;

        // Find the chat by ID
        const query1 = {
            text: `
                SELECT * FROM (
                    SELECT ic._id AS chat_id, 'individual' AS chat_type
                    FROM IndividualChats ic
                    WHERE ic._id = $1
                    UNION ALL
                    SELECT gc._id AS chat_id, 'group' AS chat_type
                    FROM GroupChats gc
                    WHERE gc._id = $1
                ) c
            `,
            values: [id]
        };

        const chatResponse = await client.query(query1);
        const chat = chatResponse.rows[0];
        if (!chat) {
            await client.query('ROLLBACK'); // Rollback if chat doesn't exist
            return res.status(404).json({ message: 'Chat does not exist' });
        }

        // Create a new message
        const query2 = {
            text: "INSERT INTO Messages (_id, message, sender, chat_id, chat_type) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            values: [messageID, message, senderID, id, chat.chat_type]
        };

        const newMessageResponse = await client.query(query2);
        const newMessage = newMessageResponse.rows[0];

        // Update the detailed chat model
        const query3 = {
            text: `
                UPDATE ${chat.chat_type === 'individual' ? 'IndividualChats' : 'GroupChats'}
                SET lastMessage = $1
                WHERE _id = $2
            `,
            values: [newMessage._id, id]
        };

        await client.query(query3);

        // Insert into IndividualChatMessages or GroupChatMessages
        const query4 = {
            text: `
                INSERT INTO ${chat.chat_type === 'individual' ? 'IndividualChatMessages' : 'GroupChatMessages'} (${chat.chat_type === 'individual' ? 'individualchat_id' : 'groupchat_id'}, message_id)
                VALUES ($1, $2)
            `,
            values: [id, newMessage._id]
        };

        await client.query(query4);

        await client.query('COMMIT'); // Commit the transaction

        res.status(201).json({ message: 'Chat updated successfully', newMessage });
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback in case of an error
        res.status(500).json({ message: err.message });
    } finally {
        client.release(); // Release the client back to the pool
    }
};


module.exports = {
    createOneOnOneChat,
    createGroupChat,
    getChats,
    getChat,
    updateChat,
};

