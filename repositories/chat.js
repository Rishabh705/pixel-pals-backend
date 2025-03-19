const pool = require('../config/psqldb');
const cacheService = require('../utils/redis');
const CustomError = require('../utils/Error');

class ChatRepository {
    constructor() {
        this.INDIVIDUAL_CHAT_CACHE_TTL = 3600; // 1 hour
        this.GROUP_CHAT_CACHE_TTL = 3600; // 1 hour
        this.USER_CHATS_CACHE_TTL = 300;
    }
 
    // Cache key generators
    generateChatCacheKey(chatId, chatType) {
        return `chat:${chatType}:${chatId}`;
    }

    generateGroupParticipantsCacheKey(chatId) {
        return `chat:participants:${chatId}`;
    }

    generateUserChatsListCacheKey(userId, chatType) {
        return `user:chats:${chatType}:${userId}`;
    }

    async storeChatKeys(chatId, jsonkeys, client) {
        
        const encryptedAESKeys = new Map(Object.entries(jsonkeys));
        

        // Build the insertion query dynamically for each participant
        const valuesClause = Array.from(encryptedAESKeys)
            .map(([_id, encryptedKey], index) => `($1, $${index * 2 + 2}, $${index * 2 + 3})`)
            .join(", ");

        const valuesArray = [chatId, ...Array.from(encryptedAESKeys).flatMap(([_id, encryptedKey]) => [_id, encryptedKey])];

        const chatKeysInsertQuery = {
            text: `INSERT INTO Keys (chat_id, user_id, encrypted_aes_key)
                   VALUES ${valuesClause}`,
            values: valuesArray,
        };

        await client.query(chatKeysInsertQuery);
    }

    async createOneOnOneChat(participant1Id, participant2Id, client = pool) {
        const query = {
            text: `
                INSERT INTO IndividualChats (participant1, participant2)
                VALUES ($1, $2)
                RETURNING _id;
            `,
            values: [participant1Id, participant2Id]
        };
        
        const { rows } = await client.query(query);
        const newChat = rows[0];
        return newChat; 
    }

    async createGroupChat(name, description, senderID, members, client = pool) {
        const query = {
            text: `
                    INSERT INTO GroupChats (name, description)
                    VALUES ($1, $2)
                    RETURNING _id
                `,
            values: [name, description]
        };

        const { rows } = await client.query(query);
        const newChat = rows[0];
        
        const paticipants = members.map((member)=>{
            if(member === senderID){
                return {id: member, role: 'admin'}
            }
            return {id: member, role: 'member'}
        });

        await this.updateGroupParticipants(newChat._id, paticipants, client);
        
        return newChat;
    }

    async updateGroupParticipants(chatId, participants, client = pool) {
        // Build placeholders dynamically based on the number of participants
        const placeholders = participants
            .map((_, idx) => `($1, $${2 + idx * 2}, $${3 + idx * 2})`)
            .join(', ');
    
        // Build the query
        const query = {
            text: `WITH inserted_participants AS (
                        INSERT INTO GroupChatParticipants (groupchat_id, user_id, role) 
                        VALUES ${placeholders} ON CONFLICT (groupchat_id, user_id) 
                        DO UPDATE SET role = EXCLUDED.role
                        RETURNING *
                    )
                    SELECT 
                        jsonb_build_object(
                            '_id', ip.user_id,
                            'username', u.username,
                            'avatar', u.avatar
                        ) AS user_data
                    FROM 
                        inserted_participants ip
                    JOIN 
                        Users u ON ip.user_id = u._id;`,
            values: [
                chatId, // groupchat_id for all participants
                ...participants.flatMap(participant => [
                    participant.id, // user_id
                    participant.role // role (e.g., 'admin', 'member')
                ])
            ]
        };
    
        // Execute the query
        const { rows } = await client.query(query);
    
        // Cache keys
        const participantsCacheKey = this.generateGroupParticipantsCacheKey(chatId);
        const chatCacheKey = this.generateChatCacheKey(chatId, 'group');
    
        // Invalidate old cache (since new members were added/updated)
        await cacheService.invalidate(participantsCacheKey);
        await cacheService.invalidate(chatCacheKey);
    
        // Cache the updated participants list
        await cacheService.set(participantsCacheKey, rows, this.GROUP_CHAT_CACHE_TTL);
    
        return rows;  // Returning the updated participants list
    }
    
    async addUserChats(chatId, participantIds, chatType, client = pool) {
        const values = participantIds.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`).join(', ');
        const queryValues = participantIds.flatMap(participantId => [participantId, chatId, chatType]);

        await client.query(
            `INSERT INTO UserChats (user_id, chat_id, chat_type) VALUES ${values}`,
            queryValues
        );


        // Invalidate chat lists for all participants
        await Promise.all(
            participantIds.map(participantId =>
                chatType === 'individual' ?
                    cacheService.invalidate(this.generateUserChatsListCacheKey(participantId, 'individual'))
                    : cacheService.invalidate(this.generateUserChatsListCacheKey(participantId, 'group'))
            )
        );
    }

    // finding chats (caching left out here. think about it later)
    async findOneOnOneChatByMembers(participant1Id, participant2Id, client = pool) {
        const query = {
            text: `
                SELECT _id
                FROM IndividualChats
                WHERE (participant1 = $1 AND participant2 = $2) OR
                        (participant1 = $2 AND participant2 = $1)
            `,
            values: [participant1Id, participant2Id]
        };

        const { rows } = await client.query(query);
        const chat = rows[0];

        return chat;
    }  

    async findGroupChatByMembers(members, client = pool) {
        // this is less frequent so avoid using caching.
        const query = {
            text: `
               WITH new_group AS (
                    SELECT UNNEST($1::UUID[]) AS user_id
                )
                SELECT gc._id
                FROM GroupChats gc
                JOIN (
                    SELECT groupchat_id
                    FROM GroupChatParticipants gcp
                    JOIN new_group ng ON gcp.user_id = ng.user_id
                    GROUP BY gcp.groupchat_id
                    HAVING 
                        COUNT(gcp.user_id) = (SELECT COUNT(*) FROM new_group) 
                        AND COUNT(gcp.user_id) = (SELECT COUNT(*) FROM GroupChatParticipants WHERE groupchat_id = gcp.groupchat_id)
                ) matched_groups ON gc._id = matched_groups.groupchat_id;
            `,
            values: [members]
        };
        const { rows } = await client.query(query);
        return rows[0];
    }

    // get chat list of user
    async getUserIndividualChats(userId, client = pool) {
        const cacheKey = this.generateUserChatsListCacheKey(userId, 'individual');

        // Try cache first
        const cachedChats = await cacheService.get(cacheKey);
        if (cachedChats) {
            return cachedChats;
        }
        const query = {
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
                    END AS lastMessage,
                    'individual' AS chat_type,
                    COALESCE(k.encrypted_aes_key, NULL) AS encrypted_aes_key
                FROM IndividualChats ic
                JOIN UserChats uc ON uc.chat_id = ic._id
                JOIN Users u1 ON ic.participant1 = u1._id
                JOIN Users u2 ON ic.participant2 = u2._id
                LEFT JOIN Messages m ON ic.lastMessage = m._id
                LEFT JOIN Users u3 ON m.sender = u3._id
                LEFT JOIN Keys k ON k.chat_id = ic._id AND k.user_id = $1
                WHERE uc.user_id = $1 AND uc.chat_type = 'individual'
            `,
            values: [userId]
        };

        const { rows } = await client.query(query);

        // Cache the results
        if (rows.length > 0) {
            await cacheService.set(cacheKey, rows, this.USER_CHATS_CACHE_TTL);
        }

        return rows;
    }

    async getUserGroupChats(userId, client = pool) {
        const cacheKey = this.generateUserChatsListCacheKey(userId, 'group');
        const query = {
            text: `
                SELECT 
                    gc._id AS chat_id,
                    gc.name,
                    gc.description,
                    gc.created_at,
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
                    END AS lastMessage,
                    'group' AS chat_type,
                    COALESCE(k.encrypted_aes_key, NULL) AS encrypted_aes_key
                FROM GroupChats gc
                JOIN UserChats uc ON uc.chat_id = gc._id
                LEFT JOIN Messages m ON gc.lastMessage = m._id
                LEFT JOIN Users u3 ON m.sender = u3._id
                LEFT JOIN Keys k ON k.chat_id = gc._id AND k.user_id = $1
                WHERE uc.user_id = $1 AND uc.chat_type = 'group'
            `,
            values: [userId]
        };

        const { rows } = await client.query(query);
        // Cache the results
        if (rows.length > 0) {
            await cacheService.set(cacheKey, rows, this.USER_CHATS_CACHE_TTL);
        }
        return rows;
    }

    // get chat by id 
    async getIndividualChatById(chatId, userID, client = pool) {
        // Generate cache key for this chat
        const cacheKey = this.generateChatCacheKey(chatId, 'individual');

        // Try to get from cache first
        const cachedChat = await cacheService.get(cacheKey); 
        if (cachedChat) {
            if(userID !== cachedChat.participant1._id && userID !== cachedChat.participant2._id) 
                throw new CustomError('Unauthorized access', 403);
            return cachedChat; 
        }

        const query = {
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
                AND (ic.participant1 = $2 OR ic.participant2 = $2)
                GROUP BY
                    ic._id,
                    u1.username,
                    u1.avatar,
                    u2.username,
                    u2.avatar,
                    ic.created_at;
            `,
            values: [chatId, userID]
        };

        const { rows } = await client.query(query);
        const chat = rows[0];

        // Cache the chat if found
        if (chat) {
            await cacheService.set(cacheKey, chat, this.INDIVIDUAL_CHAT_CACHE_TTL);
        }
        return chat;
    }

    async getGroupChatById(chatId, userID, client = pool) {
        // Generate cache key for this chat
        const cacheKey = this.generateChatCacheKey(chatId, 'group');

        // Try to get from cache first
        const cachedChat = await cacheService.get(cacheKey);
        if (cachedChat) {
            const memberIds = cachedChat.members.map(member => member._id);
            if (!memberIds.includes(userID)) {
                throw new CustomError('Unauthorized access', 403);
            }
            return cachedChat;
        }

        const query = {
            text: `
                SELECT
                gc._id AS group_chat_id,
                gc.name,
                gc.description,
                gc.created_at,
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            '_id', u._id,
                            'username', u.username,
                            'avatar', u.avatar
                        )
                    )
                    FROM GroupChatParticipants gcp
                    JOIN Users u ON gcp.user_id = u._id
                    WHERE gcp.groupchat_id = gc._id
                ) AS members,
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            '_id', m._id,
                            'message', m.message,
                            'sender', jsonb_build_object(
                                '_id', u._id,
                                'username', u.username,
                                'avatar', u.avatar
                            ),
                            'created_at', m.created_at
                        ) ORDER BY m.created_at ASC
                    )
                    FROM GroupChatMessages gcm
                    JOIN Messages m ON gcm.message_id = m._id
                    JOIN Users u ON m.sender = u._id
                    WHERE gcm.groupchat_id = gc._id
                ) AS messages
            FROM GroupChats gc
            WHERE gc._id = $1
            AND EXISTS (
                SELECT 1 FROM GroupChatParticipants gcp 
                WHERE gcp.groupchat_id = gc._id AND gcp.user_id = $2
            )
            `,
            values: [chatId, userID]
        };    

        const { rows } = await client.query(query); 
        const chat = rows[0];
 
        // Cache the chat if found
        if (chat) {
            await cacheService.set(cacheKey, chat, this.GROUP_CHAT_CACHE_TTL);
        }
        //TODO: should we cache the participants separately
        return chat;
    }

    async createMessage(messageId, message, senderId, chatId, chatType, client = pool) {
        const query = {
            text: "INSERT INTO Messages (_id, message, sender, chat_id, chat_type) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            values: [messageId, message, senderId, chatId, chatType]
        };

        const { rows } = await client.query(query); 

        return rows[0];
    }

    async updateChatLastMessage(chatId, messageId, chatType, members, client = pool) {
        const query = {
            text: `
                UPDATE ${chatType === 'individual' ? 'IndividualChats' : 'GroupChats'}
                SET lastMessage = $1
                WHERE _id = $2
            `,
            values: [messageId, chatId]
        };

        await client.query(query);

        // Invalidate chat caches
        const chatCacheKey = this.generateChatCacheKey(chatId, chatType);
        await cacheService.invalidate(chatCacheKey);
        
        // Invalidate user chat lists to affect all participants
        await Promise.all(
            members.map(participantId =>
                cacheService.invalidate(this.generateUserChatsListCacheKey(participantId, chatType))
            )
        );
    }

    async addMessageToChat(chatId, messageId, chatType, client = pool) {
        const tableName = chatType === 'individual' ? 'IndividualChatMessages' : 'GroupChatMessages';
        const columnName = chatType === 'individual' ? 'individualchat_id' : 'groupchat_id';

        const query = {
            text: `
                INSERT INTO ${tableName} (${columnName}, message_id)
                VALUES ($1, $2)
            `,
            values: [chatId, messageId]
        };

        await client.query(query);
    }
}

module.exports = new ChatRepository();