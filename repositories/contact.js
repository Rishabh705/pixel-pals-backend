// repositories/contactRepository.js
const pool = require('../config/psqldb');
const cacheService = require('../utils/redis'); 

class ContactRepository {
    // Add a contact to the user's contact list
    async addContact(userId, contactId, client = pool) {
        const query = {
            text: 'INSERT INTO UserSavedContacts (user_id, contact_id) VALUES ($1, $2)',
            values: [userId, contactId],
        };
        await client.query(query);

        // Invalidate the cache for the user's contacts after adding a contact
        await cacheService.invalidate(`user:contacts:${userId}`);
    }

    // Check if a contact already exists in the user's contact list
    async checkIfContactExists(userId, contactId, client = pool) {
        const query = {
            text: 'SELECT * FROM UserSavedContacts WHERE user_id = $1 AND contact_id = $2',
            values: [userId, contactId],
        };
        const result = await client.query(query);
        return result.rows.length > 0; // Return true if contact already exists
    }

    // Get all contacts for a user with caching
    async getUserContacts(userId, client = pool) {
        const cacheKey = `user:contacts:${userId}`;

        // Check if contacts are cached
        let contacts = await cacheService.get(cacheKey);
        if (contacts) {
            return contacts; // Return from cache if available
        }

        // If not cached, fetch from database
        const query = {
            text: `
                SELECT u._id, u.username, u.avatar, u.email
                FROM Users u
                JOIN UserSavedContacts usc ON usc.contact_id = u._id
                WHERE usc.user_id = $1
            `,
            values: [userId],
        };
        const { rows } = await client.query(query);
        contacts = rows;

        // Cache the contacts for the user
        await cacheService.set(cacheKey, contacts, 3600); // Cache for 1 hour

        return contacts; // Return the fetched contacts
    }
}

module.exports = new ContactRepository();
