const crypto = require('crypto');
require('dotenv').config();

// Get the encryption key from environment variables
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // Ensure it's a Buffer

const encryptMessage = (plainTextMessage) => {
    try {
       
        // Generate a new IV for each encryption
        const IV = crypto.randomBytes(16); // 16 bytes for AES
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
        let encrypted = cipher.update(plainTextMessage, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Combine IV and encrypted message for decryption
        const ivHex = IV.toString('hex');
        return `${ivHex}:${encrypted}`;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt the message.');
    }
};

const decryptMessage = (encryptedMessage) => {
    try {
        // Extract IV and encrypted data
        const [ivHex, encryptedText] = encryptedMessage.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const encryptedBuffer = Buffer.from(encryptedText, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedBuffer, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt the message.');
    }
};

module.exports = { decryptMessage, encryptMessage };
