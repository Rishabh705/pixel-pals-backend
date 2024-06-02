const express = require('express');
const router = express.Router();
const contactController = require('../../controllers/contactController');

// Route to get all chats for a user
router.route('/')
    .get(contactController.getContacts)
    .post(contactController.addContact);


module.exports = router;
