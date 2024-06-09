const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/psqldb');

const login = async (req, res) => {
    if (!req?.body?.email || !req?.body?.password) {
        return res.status(400).json({ message: 'All fields are required' })
    }
    try {
        const query1 = {
            text: 'SELECT *  FROM users WHERE email = $1',
            values: [req.body.email]
        };

        const response = await pool.query(query1);

        const foundUser = response.rows[0];

        if (!foundUser) return res.status(401).json({ message: 'No such user exists' })

        const match = await bcrypt.compare(req.body.password, foundUser.password)

        if (match) {
            const accessToken = jwt.sign(
                {
                    "UserInfo": {
                        "username": foundUser.username,
                        "email": foundUser.email,
                        "_id": foundUser._id
                    }
                },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '1d' }
            );
            const refreshToken = jwt.sign(
                { "email": foundUser.email },
                process.env.REFRESH_TOKEN_SECRET,
                { expiresIn: '1d' }
            );
            // Saving refreshToken with current user
            
            const query2 = {
                text: 'UPDATE users SET refreshToken = $1',
                values: [refreshToken]
            };

            await pool.query(query2);
            
            // Creates Secure Cookie with refresh token
            res.cookie('jwt', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'None', maxAge: 24 * 60 * 60 * 1000 });

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

    if (!req?.body?.username || !req?.body?.password || !req?.body?.email) {
        return res.status(400).json({ message: 'All fields are required' })
    }
    try {
        // check for duplicate usernames in the db

        const query1 = {
            text: 'SELECT *  FROM users WHERE email = $1',
            values: [req.body.email]
        };

        const response = await pool.query(query1)
        const duplicate = response.rows[0]

        // const duplicate = await User.findOne({ username: req.body.username }).exec()
        if (duplicate) return res.status(409).json({ message: 'User already registered' })

        //encrypt the password
        const hashedPwd = await bcrypt.hash(req.body.password, 10);

        //create and store the new user
        const query2 = {
            text: 'INSERT INTO users(username, email, password, refreshToken) VALUES($1, $2, $3, $4)',
            values: [req.body.username, req.body.email, hashedPwd, '']
        };

        await pool.query(query2);

        res.status(201).json({ 'message': `New user with ${req.body.username} created!` })
    } catch (err) {
        console.log(err);
        res.status(500).json({ 'message': err.message })
    }
}

const logout = async (req, res) => {
    // On client, also delete the accessToken 
    const cookies = req.cookies;

    if (!cookies?.jwt) return res.sendStatus(204); //No content
    const refreshToken = cookies.jwt;

    // Is refreshToken in db?
    const query1 ={
        text:"SELECT * FROM users WHERE refreshToken = $1",
        values: [refreshToken]
    };

    const response = await pool.query(query1);
    const foundUser = response.rows[0];

    if (!foundUser) {
        res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === 'production' });
        return res.sendStatus(204);
    }

    // Delete refreshToken in db
    const query2 = {
        text:'UPDATE users SET refreshToken = $1 WHERE _id = $2',
        values:['', foundUser._id]
    };
    await pool.query(query2);
    res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === 'production' });
    res.sendStatus(204);
}

module.exports = {
    login,
    register,
    logout
}
