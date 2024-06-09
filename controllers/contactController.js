const pool = require('../config/psqldb'); // Ensure this points to your PostgreSQL configuration

const addContact = async (req, res) => {
    if (!req.body.email) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const client = await pool.connect();
    try {
        const userId = req.user._id;
        const contact = req.body.email;

        // Start a transaction
        await client.query('BEGIN');

        // Find the user by ID
        const userQuery = {
            text: 'SELECT * FROM Users WHERE _id = $1',
            values: [userId]
        };
        const userResult = await client.query(userQuery);
        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(401).json({ message: 'No such user exists' });
        }

        // Find the contact by username
        const contactQuery = {
            text: 'SELECT _id, username, avatar FROM Users WHERE email = $1',
            values: [contact]
        };
        const contactResult = await client.query(contactQuery);
        if (contactResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(401).json({ message: 'No such contact exists' });
        }
        const foundContact = contactResult.rows[0];

        if (foundContact._id === userId) {
            await client.query('ROLLBACK');
            return res.status(401).json({ message: 'Cannot add same user to contacts.' });
        }

        // Check if the contact already exists in the user's contact list
        const contactExistsQuery = {
            text: 'SELECT * FROM UserSavedContacts WHERE user_id = $1 AND contact_id = $2',
            values: [userId, foundContact._id]
        };
        const contactExistsResult = await client.query(contactExistsQuery);
        if (contactExistsResult.rows.length === 0) {
            // Insert the new contact
            const insertContactQuery = {
                text: 'INSERT INTO UserSavedContacts (user_id, contact_id) VALUES ($1, $2)',
                values: [userId, foundContact._id]
            };
            await client.query(insertContactQuery);
        }

        await client.query('COMMIT'); // Commit the transaction

        // Fetch the updated contacts list
        const updatedContactsQuery = {
            text: `
                SELECT u._id, u.username, u.avatar
                FROM Users u
                JOIN UserSavedContacts usc ON usc.contact_id = u._id
                WHERE usc.user_id = $1
            `,
            values: [userId]
        };
        const updatedContactsResult = await client.query(updatedContactsQuery);

        res.status(201).json({
            message: 'Contact added to contact list successfully.',
            data: updatedContactsResult.rows,
        });
    } catch (err) {
        await client.query('ROLLBACK'); // Rollback in case of an error
        console.error(err);
        res.status(500).json({ message: 'Error adding contact' });
    } finally {
        client.release(); // Release the client back to the pool
    }
};

const getContacts = async (req, res) => {
    if (!req.query.userId) {
        return res.status(400).json({ message: 'User Id is required' });
    }

    const client = await pool.connect();
    try {
        const { userId } = req.query;
 
        // Fetch user contacts
        const contactsQuery = {
            text: `
                SELECT u._id, u.username, u.avatar
                FROM Users u
                JOIN UserSavedContacts usc ON usc.contact_id = u._id
                WHERE usc.user_id = $1
            `,
            values: [userId]
        };
        const contactsResult = await client.query(contactsQuery);

        res.status(200).json({
            message: 'Contacts fetched successfully.',
            data: contactsResult.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching contacts' });
    } finally {
        client.release(); // Release the client back to the pool
    }
};

module.exports = {
    addContact,
    getContacts,
};
