const express = require('express')
const router = express.Router()
const authController = require("../../controllers/authController")

router.route('/login')
    .post(authController.login)
    
router.route('/register')
    .post(authController.register)

router.route('/logout')
    .get(authController.logout)

router.route('/public-key')
    .get(authController.getPublicKey)
    
router.route('/refresh-access-token')
    .get(authController.refreshAccessToken)

router.route('/rotate-token')
    .get(authController.rotateTokens)
    
module.exports = router