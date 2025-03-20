const redis = require('redis');
const config = require('../config/configs');
const {logger} = require('../middleware/logger');
class CacheService {
    constructor() {
        this.client = redis.createClient({
            url: config.redis.url,
            socket: {
                reconnectStrategy: (retries) => {
                    const delay = Math.min(retries * 50, 5000);
                    logger.info(`Attempting to reconnect to Redis in ${delay}ms (attempt ${retries})`);
                    return delay;
                }
            }
        });

        // Handle connection events
        this.client.on('error', (err) => {
            logger.error('Redis client error:', err);
        });

        this.client.on('connect', () => {
            logger.info('Connected to Redis successfully!');
        });

        // Establish connection
        this.connect();
    }

    /**
     * Invalidate all keys matching a pattern in Redis
     * @param {string} pattern - The pattern to match (e.g. "user:*")
     * @returns {Promise<void>}
     */
    async invalidatePattern(pattern) {
        try {
            // SCAN is more production-safe than KEYS for large datasets
            let cursor = 0;
            do {
                const reply = await this.client.scan(cursor, {
                    MATCH: pattern,
                    COUNT: 100
                });
                cursor = reply.cursor;
                
                // Delete found keys in batch if any exist
                if (reply.keys.length > 0) {
                    await this.client.del(reply.keys);
                }
            } while (cursor !== 0);
        } catch (error) {
            logger.error(`Error invalidating pattern "${pattern}" in Redis:`, error);
            throw error;
        }
    }

    async connect() {
        try {
            await this.client.connect();
        } catch (err) {
            logger.error('Failed to connect to Redis:', err);
        }
    }

    /**
     * Get a value from Redis cache
     * @param {string} key - The cache key
     * @returns {Promise<any>} - The parsed value from Redis or null if not found
     */
    async get(key) {
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error(`Error fetching key "${key}" from Redis:`, error);
            throw error;
        }
    }

    /**
     * Set a value in Redis cache with a TTL
     * @param {string} key - The cache key
     * @param {any} value - The value to cache
     * @param {number} [ttl=config.cache.ttl] - Time-to-live in seconds (optional, defaults to config)
     * @returns {Promise<void>}
     */
    async set(key, value, ttl = config.cache.ttl) {
        try {
            await this.client.setEx(key, ttl, JSON.stringify(value));
        } catch (error) {
            logger.error(`Error setting key "${key}" in Redis:`, error);
            throw error;
        }
    }

    /**
     * Invalidate a specific key in Redis
     * @param {string} key - The cache key
     * @returns {Promise<void>}
     */
    async invalidate(key) {
        try {
            await this.client.del(key);
        } catch (error) {
            logger.error(`Error invalidating key "${key}" in Redis:`, error);
            throw error;
        }
    }

    /**
     * Clear all keys in Redis (optional for selective environments)
     * @returns {Promise<void>}
     */
    async clearAll() {
        try {
            await this.client.flushDb();
            logger.info('All keys cleared from Redis');
        } catch (error) {
            logger.error('Error clearing Redis database:', error);
            throw error;
        }
    }

    /**
     * Disconnect the Redis client gracefully
     * @returns {Promise<void>}
     */
    async disconnect() {
        try {
            await this.client.quit();
            logger.info('Redis client disconnected successfully.');
        } catch (error) {
            logger.error('Error disconnecting Redis client:', error);
            throw error;
        }
    }
}

// Export a singleton instance of the CacheService
module.exports = new CacheService();
