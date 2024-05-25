const express = require('express');
const router = express.Router();
const refreshTokenController = require('../controllers/refreshTController');

router.get('/', refreshTokenController.handleRefreshToken);

module.exports = router;