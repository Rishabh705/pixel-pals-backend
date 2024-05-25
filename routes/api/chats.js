const express = require('express');
const router = express.Router();
const chatController = require('../../controllers/chatController');

// Route to get all chats for a user
router.route('/')
    .get(chatController.getChats);

router.route('/:id')
    .get(chatController.getChat)
    .put(chatController.updateChat);

// Separate routes for creating one-on-one and group chats
router.route('/one-on-one')
    .post(chatController.createOneOnOneChat)
    
router.route('/group')
    .post(chatController.createGroupChat)


module.exports = router;
