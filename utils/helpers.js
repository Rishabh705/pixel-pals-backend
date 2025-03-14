const { subtle } = require('crypto').webcrypto; // Ensure Node.js is using webcrypto

async function generateAESKey() {
    return subtle.generateKey(
        {
            name: 'AES-GCM',
            length: 256 // Key length in bits
        },
        true, // Extractable
        ['encrypt', 'decrypt'] // Usages
    );
}


// Encrypt the AES key for each participant using their public RSA key
async function encryptSymmetricKey(publicKeysBase64Map) {
    // Generate a single AES key for the group
    const symmetricKey = await generateAESKey();

    // Export the AES key for encryption with RSA
    const exportedKey = await subtle.exportKey("raw", symmetricKey);

    // map to store the encrypted AES keys for each participant
    const encryptedAESKeys = new Map();

    for (const id_key_pair of publicKeysBase64Map) {
        const [id, keyBase64] = id_key_pair;

        const keyData = base64ToUint8Array(keyBase64);

        const publicKey = await subtle.importKey(
            'spki',
            keyData.buffer,
            {
                name: 'RSA-OAEP',
                hash: { name: 'SHA-256' }
            },
            true,
            ['encrypt']
        );

        // Encrypt the AES key with the participant's RSA public key
        const encryptedAESKey = await subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            exportedKey
        );
        const encryptedAESKeyBase64 = arrayBufferToBase64(encryptedAESKey);
        encryptedAESKeys.set(id, encryptedAESKeyBase64);
    }

    return { encryptedAESKeys };
}

// Helper function to convert base64 string to Uint8Array
function base64ToUint8Array(base64) {
    const binaryString = Buffer.from(base64, 'base64').toString('binary');
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Helper function to convert Uint8Array to base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return Buffer.from(binary, 'binary').toString('base64');
}

module.exports = {
    generateAESKey,
    encryptSymmetricKey,
};
