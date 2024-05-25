const User = require('../model/User')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const fsPromises = require('fs').promises;

const login = async (req, res) => {
    if (!req?.body?.username || !req?.body?.password) {
        return res.status(400).json({ message: 'All fields are required' })
    }
    try {
        const foundUser = await User.findOne({ username: req.body.username }).exec()
        
        
        if (!foundUser) return res.status(401).json({ message: 'No such user exists' })
            
            const match = await bcrypt.compare(req.body.password, foundUser.password)
            
            if (match) {
                const accessToken = jwt.sign(
                    {
                        "UserInfo": {
                            "username": foundUser.username,
                            "_id": foundUser._id
                        }
                    },
                    process.env.ACCESS_TOKEN_SECRET,
                    { expiresIn: '1d' }
                );
            const refreshToken = jwt.sign(
                { "username": foundUser.username },
                process.env.REFRESH_TOKEN_SECRET,
                { expiresIn: '1d' }
            );
            // Saving refreshToken with current user
            foundUser.refreshToken = refreshToken;
            
            await foundUser.save();
            
            // Creates Secure Cookie with refresh token
            res.cookie('jwt', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV==='production', sameSite: 'None', maxAge: 24 * 60 * 60 * 1000 });
            
            // Send authorization roles and access token to user
            res.status(201).json(
                {
                    message: 'Authenticated',
                    accessToken: accessToken
                })
        }
        else {
            res.status(401).json({ message: 'Invalid Credentials' })
        }
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

const register = async (req, res) => {

    if (!req?.body?.username || !req?.body?.password) {
        return res.status(400).json({ message: 'All fields are required' })
    }
    // check for duplicate usernames in the db
    const duplicate = await User.findOne({ username: req.body.username }).exec()
    if (duplicate) return res.status(409).json({ message: 'User already registered' })

    try {
        //encrypt the password
        const hashedPwd = await bcrypt.hash(req.body.password, 10)

        //create and store the new user
        await User.create({
            "username": req.body.username,
            "password": hashedPwd,
            'individualChats': [],
            'groupChats': [],
            'refreshToken': ''
        })

        res.status(201).json({ 'message': `New user with ${req.body.username} created!` })
    } catch (err) {
        res.status(500).json({ 'message': err.message })
    }
} 
 
const logout = async (req, res) => {
    // On client, also delete the accessToken 
    const cookies = req.cookies;

    if (!cookies?.jwt) return res.sendStatus(204); //No content
    const refreshToken = cookies.jwt;

    // Is refreshToken in db?
    const foundUser = await User.findOne({ refreshToken }).exec();
    if (!foundUser) {
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV==='production' });
        return res.sendStatus(204);
    } 

    // Delete refreshToken in db
    foundUser.refreshToken = '';
    await foundUser.save();

    res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV==='production' });
    res.sendStatus(204);
}

module.exports = {
    login,
    register,
    logout
}
