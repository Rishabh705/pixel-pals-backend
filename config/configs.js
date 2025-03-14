// config/config.js
require('dotenv').config();

const config = {
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379
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
    },
    circuit: {
        wasmPath: 'circuits/fallguys.wasm',
        zkeyPath: 'circuits/fallguys.zkey',
        vKeyPath: './verification_key.json'
    },
    cache: {
        ttl: process.env.CACHE_TTL || 3600,
        blacklistTTL: process.env.CACHE_BLACKLIST_TTL || 3600 * 24 * 30
    },
    kafka: {
        clientId: process.env.KAFKA_CLIENT_ID,
        brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'], 
        retry: {
            initialRetryTime: 100,
            retries: 20
        },
        ssl: process.env.KAFKA_SSL_ENABLED === 'true' ? {
            rejectUnauthorized: false,
        } : undefined,
        sasl: process.env.KAFKA_SASL_MECHANISM ? { 
            mechanism: process.env.KAFKA_SASL_MECHANISM,
            username: process.env.KAFKA_SASL_USERNAME,
            password: process.env.KAFKA_SASL_PASSWORD
        } : null
    }
};

module.exports = config;