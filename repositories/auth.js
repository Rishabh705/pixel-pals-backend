// repositories/userRepository.js
const pool = require('../config/psqldb');
const cacheService = require('../utils/redis');

class UserRepository {
    constructor() {
        this.USER_CACHE_TTL = 3600; // 1 hour
        this.PUBLIC_KEY_CACHE_TTL = 3600; // 1 hour
    }

    async withTransaction(callback) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Cache key generators
    generateUserCacheKey(data, purpose='email') {
        return `user:${purpose}:${data}`;
    }

    generatePublicKeyCacheKey(userId) {
        return `user:publicKey:${userId}`;
    }

    // Enhanced invalidation patterns
    async invalidateRelatedCaches(userId, email) {
        await Promise.all([
            // Invalidate user cache
            cacheService.invalidate(this.generateUserCacheKey(email)),
            cacheService.invalidate(this.generateUserCacheKey(userId, "id")),
            // Invalidate public key cache
            cacheService.invalidate(this.generatePublicKeyCacheKey(userId)),
            // Invalidate any session caches
            cacheService.invalidatePattern(`session:${userId}:*`)
        ]);
    }

    async findUserByID(id, client = pool) {
        const cacheKey = this.generateUserCacheKey(id, "id");
        
        let user = await cacheService.get(cacheKey);
        if (user) {
            return user;
        }

        const query = {
            text: 'SELECT * FROM users WHERE _id = $1',
            values: [id]
        };
        const { rows } = await client.query(query);
        user = rows[0];

        if (user) {
            await cacheService.set(cacheKey, user, this.USER_CACHE_TTL);
        }

        return user;
    }
    
    async findUsersByIds(userIds, client = pool) {
        // First check cache for all users
        const cacheKeys = userIds.map(id => this.generateUserCacheKey(id, "id"));
        const cachedUsers = await Promise.all(
            cacheKeys.map(key => cacheService.get(key))
        );
    
        // Filter out IDs that need to be fetched from DB
        const uncachedIds = userIds.filter((id, index) => !cachedUsers[index]);
        
        let dbUsers = [];
        if (uncachedIds.length > 0) {
            const query = {
                text: 'SELECT * FROM users WHERE _id = ANY($1::uuid[])',
                values: [uncachedIds]
            };
            const { rows } = await client.query(query);
            dbUsers = rows;
    
            // Cache the newly fetched users
            await Promise.all(
                dbUsers.map(user => 
                    cacheService.set(
                        this.generateUserCacheKey(user._id, "id"),
                        user,
                        this.USER_CACHE_TTL
                    )
                )
            );
        }
    
        // Combine cached and DB users
        return userIds.map(id => {
            const cachedUser = cachedUsers[userIds.indexOf(id)];
            if (cachedUser) return cachedUser;
            return dbUsers.find(user => user._id === id);
        });
    }

    async findUserByEmail(email, client = pool) {
        const cacheKey = this.generateUserCacheKey(email);
        
        let user = await cacheService.get(cacheKey);
        if (user) {
            return user;
        }

        const query = {
            text: 'SELECT * FROM users WHERE email = $1',
            values: [email]
        };
        const { rows } = await client.query(query);
        user = rows[0];

        if (user) {
            await cacheService.set(cacheKey, user, this.USER_CACHE_TTL);
        }

        return user;
    }

    async updateRefreshToken(email, refreshToken, client = pool) {
        const query = {
            text: 'UPDATE users SET refreshToken = $1 WHERE email = $2 RETURNING _id',
            values: [refreshToken, email]
        };
        const { rows } = await client.query(query);

        if (rows[0]) {
            await this.invalidateRelatedCaches(rows[0]._id, email);
        }
    }

    async findUserPublicKey(userId, client = pool) {
        const cacheKey = this.generatePublicKeyCacheKey(userId);

        let publicKey = await cacheService.get(cacheKey);
        if (publicKey) {
            return publicKey;
        }

        const query = {
            text: 'SELECT publicKey FROM users WHERE _id = $1',
            values: [userId]
        };
        const { rows } = await client.query(query);
        publicKey = rows[0]?.publickey;

        if (publicKey) {
            await cacheService.set(cacheKey, publicKey, this.PUBLIC_KEY_CACHE_TTL);
        }

        return publicKey;
    }

    async createUser(userData, client = pool) {
        const { username, email, hashedPassword, publicKey } = userData;
        const query = {
            text: 'INSERT INTO users(username, email, password, refreshToken, publicKey) VALUES($1, $2, $3, $4, $5) RETURNING *',
            values: [username, email, hashedPassword, '', publicKey]
        };
        const { rows } = await client.query(query);
        const newUser = rows[0];

        await Promise.all([
            cacheService.set(
                this.generateUserCacheKey(email),
                newUser,
                this.USER_CACHE_TTL
            ),
            cacheService.set(
                this.generatePublicKeyCacheKey(newUser._id),
                publicKey,
                this.PUBLIC_KEY_CACHE_TTL
            )
        ]);
        return newUser;
    }

    async findUserByRefreshToken(refreshToken, client = pool) {
        const query = {
            text: 'SELECT * FROM users WHERE refreshToken = $1',
            values: [refreshToken]
        };
        const { rows } = await client.query(query);
        const user = rows[0];

        if (user) {
            await cacheService.set(
                this.generateUserCacheKey(user.email),
                user,
                this.USER_CACHE_TTL
            );
        }

        return user;
    }

    async clearRefreshToken(userId, client = pool) {
        const query = {
            text: 'UPDATE users SET refreshToken = $1 WHERE _id = $2 RETURNING email',
            values: ['', userId]
        };
        const { rows } = await client.query(query);
        
        if (rows[0]) {
            await this.invalidateRelatedCaches(userId, rows[0].email);
        }
    }

    async blacklistToken(tokenId, ttl) {
        try {
            const blacklistKey = `${this.BLACKLIST_PREFIX}${tokenId}`;
            await cacheService.set(blacklistKey, true, ttl);
            logger.info(`Token ${tokenId} blacklisted for ${ttl} seconds`);
        } catch (error) {
            logger.error('Error blacklisting token', {
                tokenId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if a token is blacklisted
     * @param {string} tokenId - The token ID to check
     * @returns {Promise<boolean>} - True if token is blacklisted
     */
    async isTokenBlacklisted(tokenId) {
        try {
            const blacklistKey = `${this.BLACKLIST_PREFIX}${tokenId}`;
            const isBlacklisted = await cacheService.get(blacklistKey);
            return !!isBlacklisted;
        } catch (error) {
            logger.error('Error checking blacklisted token', {
                tokenId,
                error: error.message
            });
            // If there's an error checking the blacklist, assume token is invalid
            return true;
        }
    }

    /**
     * Remove a token from the blacklist
     * @param {string} tokenId - The token ID to remove from blacklist
     */
    async removeFromBlacklist(tokenId) {
        try {
            const blacklistKey = `${this.BLACKLIST_PREFIX}${tokenId}`;
            await cacheService.invalidate(blacklistKey);
            logger.info(`Token ${tokenId} removed from blacklist`);
        } catch (error) {
            logger.error('Error removing token from blacklist', {
                tokenId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new UserRepository();