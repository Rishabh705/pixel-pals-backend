const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const config = require('../config/configs');
const {logger} = require('../middleware/logger');
const cacheService = require('../utils/redis'); // Import the CacheService module

class RateLimiter {
    constructor() {
        // Reuse the Redis client from CacheService
        this.redisClient = cacheService.client;
        
        // No need to establish a new connection as CacheService already handles this
        // Just check if the client is ready
        if (!this.redisClient.isReady) {
            logger.info('Rate limiter waiting for Redis connection from CacheService');
            
            // Listen for the connect event if not already connected
            this.redisClient.on('connect', () => {
                logger.info('Rate limiter using shared Redis connection');
            });
        } else {
            logger.info('Rate limiter using existing Redis connection');
        }
    }

    /**
     * Creates a rate limiter middleware with custom configuration
     * @param {Object} options Rate limiter options
     * @param {string} options.prefix Prefix for Redis keys
     * @param {number} options.windowMs Time window in milliseconds
     * @param {number} options.max Maximum number of requests within window
     * @param {string} options.message Custom error message
     * @returns {Function} Express middleware rate limiter
     */
    createLimiter(options = {}) {
        const windowMs = options.windowMs || 15 * 60 * 1000; // Default 15 minutes

        return rateLimit({
            store: new RedisStore({
                sendCommand: (...args) => this.redisClient.sendCommand(args),
                prefix: `rate-limit:${options.prefix || 'default'}:`,
            }),
            windowMs,
            max: options.max || 100, // Default 100 requests per windowMs
            message: {
                error: options.message || 'Too many requests, please try again later.',
                retryAfter: Math.ceil(windowMs / 1000 / 60), // minutes
            },
            standardHeaders: true, // Return rate limit info in the RateLimit-* headers
            legacyHeaders: false, // Disable the X-RateLimit-* headers
            ...config.rateLimit, // Apply any global rate limit configs
            ...options, // Allow overriding of any options
            handler: (req, res) => {
                const retryAfter = Math.ceil(windowMs / 1000 / 60);
                res.status(429).json({
                    error: {
                        message: options.message || 'Too many requests, please try again later.',
                        retryAfter,
                        retryAfterUnit: 'minutes'
                    },
                });
            }
        });
    }

    /**
     * Creates a pre-configured rate limiter for authentication routes
     * @returns {Function} Auth rate limiter middleware
     */
    createAuthLimiter() {
        return this.createLimiter({
            prefix: 'auth',
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 attempts
            message: 'Too many attempts, please try again later.'
        });
    }

    /**
     * Creates a pre-configured rate limiter for API routes
     * @returns {Function} API rate limiter middleware
     */
    createApiLimiter() {
        return this.createLimiter({
            prefix: 'api',
            windowMs: 60 * 1000, // 1 minute
            max: 30, // 30 requests per minute
            message: 'API rate limit exceeded.'
        });
    }
}

// Export singleton instance
module.exports = new RateLimiter();