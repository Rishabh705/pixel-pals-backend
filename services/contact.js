// services/contactService.js
const UserRepository = require('../repositories/auth');
const ContactRepository = require('../repositories/contact');
const CustomError = require('../utils/Error'); // Ensure you have this for custom errors

class ContactService {
    // Add a contact to the user's contact list
    async addContact(email, userId) {

        // Validate email input
        if (!email) {
            throw new CustomError('All fields are required', 400);
        }

        if (!userId) {
            throw new CustomError('Invalid User', 400);
        }

        return await UserRepository.withTransaction(async (client) => {
            // Fetch the user and contact using the email
            const contact = await UserRepository.findUserByEmail(email, client);

            if (!contact) {
                throw new CustomError('No such user exists', 404); 
            }

            // Ensure a user cannot add themselves as a contact
            if (contact._id === userId) {
                throw new CustomError('Cannot add yourself as a contact', 400);
            }

            // Check if the contact already exists
            const contactExists = await ContactRepository.checkIfContactExists(userId, contact._id, client);
            if (contactExists) {
                throw new CustomError('Contact already exists', 400);
            }

            // Add the contact to the user's contact list
            await ContactRepository.addContact(userId, contact._id, client);

            // Fetch updated contacts list
            const updatedContacts = await ContactRepository.getUserContacts(userId, client);

            return updatedContacts;
        });
    }

    // Get user's contacts
    async getContacts(userId) {
        if (!userId) {
            throw new CustomError('Invalid User', 400);
        }

        // Get the user's contacts from the contact repository
        const contacts = await ContactRepository.getUserContacts(userId);

        return contacts;
    }
}

module.exports = new ContactService();
