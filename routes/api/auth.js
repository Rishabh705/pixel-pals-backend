const express = require('express')
const router = express.Router()
const authController = require("../../controllers/authController")
const rateLimiter = require('../../middleware/rate-limiter');  // Import the rate limiter

router.route('/login')
    .post(rateLimiter.createAuthLimiter(), authController.login)
    
router.route('/register')
    .post(rateLimiter.createAuthLimiter(), authController.register)

router.route('/logout')
    .get(authController.logout)

router.route('/public-key')
    .get(rateLimiter.createAuthLimiter(), authController.getPublicKey)
    
router.route('/refresh-access-token')
    .get(rateLimiter.createAuthLimiter(), authController.refreshAccessToken)

router.route('/rotate-token')
    .get(rateLimiter.createAuthLimiter(), authController.rotateTokens)
    
module.exports = router