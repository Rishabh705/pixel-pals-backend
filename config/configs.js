// config/config.js
require('dotenv').config();

const config = {
    redis: {
        url: process.env.REDIS_URL,
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100
    }
};

module.exports = config;