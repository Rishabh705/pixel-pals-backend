// config/config.js
require('dotenv').config();

const config = {
    redis: {
        url: process.env.REDIS_URL,
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    },
    cloudinary: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        folder: 'fallguys-screenshots' 
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        max: 100
    }
};

module.exports = config;