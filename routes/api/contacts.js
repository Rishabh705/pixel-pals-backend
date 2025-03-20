const express = require('express');
const router = express.Router();
const contactController = require('../../controllers/contactController');
const rateLimiter = require('../../middleware/rate-limiter');  // Import the rate limiter

// Route to get all chats for a user
router.route('/')
    .get(rateLimiter.createApiLimiter(), contactController.getContacts)
    .post(rateLimiter.createApiLimiter(), contactController.addContact);


module.exports = router;
