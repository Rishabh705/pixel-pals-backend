const ContactService = require('../services/contact');

class ContactController {
    // Add a contact to the user's contact list
    async addContact(req, res, next) {
        try {
            const userId = req.user._id; // Extract userId from authenticated user
            const { email } = req.body; // Extract email from request body

            const updatedContacts = await ContactService.addContact(email, userId); // Call service to add contact

            return res.status(201).json({
                message: 'Contact added to contact list successfully.',
                data: updatedContacts,
            });
        } catch (err) {
            next(err); // Pass error to the error handler middleware (next function
        }
    }

    // Get the user's contacts
    async getContacts(req, res, next) {
        try {
            const userId = req.user._id; // Extract userId from authenticated user

            const contacts = await ContactService.getContacts(userId); // Call service to get contacts

            return res.status(200).json({
                message: 'Contacts fetched successfully.', 
                data: contacts,
            });
        } catch (err) {
            next(err); // Pass error to the error handler middleware (next function
        }
    }
}

// Export the class instance to be used in routes
module.exports = new ContactController();
