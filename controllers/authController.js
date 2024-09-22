const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/psqldb');

const login = async (req, res) => {
    if (!req?.body?.email || !req?.body?.password) {
        return res.status(400).json({ message: 'All fields are required' })
    }
    const client = await pool.connect();
    try {

        await client.query('BEGIN'); // Start the transaction

        const query1 = {
            text: 'SELECT *  FROM users WHERE email = $1',
            values: [req.body.email]
        };

        const response = await client.query(query1);

        const foundUser = response.rows[0];

        if (!foundUser) {
            await client.query('ROLLBACK'); // END the transaction
            return res.status(401).json({ message: 'No such user exists' })
        }

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
                { expiresIn: '15m' }
            );
            const refreshToken = jwt.sign(
                { "email": foundUser.email },
                process.env.REFRESH_TOKEN_SECRET,
                { expiresIn: '2d' }
            );



            // Saving refreshToken with current user
            const query2 = {
                text: 'UPDATE users SET refreshToken = $1 WHERE email = $2',
                values: [refreshToken, foundUser.email]
            };

            await client.query(query2);

            const query4={
                text: 'SELECT publicKey, privateKey FROM keys WHERE user_id = $1',
                values: [foundUser._id]
            }

            const response2 = await client.query(query4);

            const publicKey = response2.rows[0].publickey;
            const privateKey = response2.rows[0].privatekey;

            if(!publicKey || !privateKey){
                await client.query('ROLLBACK'); // END the transaction
                return res.status(401).json({ message: 'Some Error Occured' })
            }

            await client.query('COMMIT'); // Complete the transaction


            // Creates Secure Cookie with refresh token
            res.cookie('jwt', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'None', maxAge: 24 * 60 * 60 * 1000 });

            // Send authorization roles and access token to user
            res.status(201).json(
                {
                    message: 'Authenticated',
                    accessToken: accessToken,
                    data1: publicKey, // so that attacker can't understand what is being sent
                    data2: privateKey,
                })
        }
        else {
            await client.query('ROLLBACK'); // END the transaction
            res.status(401).json({ message: 'Invalid Credentials' })
        }
    } catch (err) {
        await client.query('ROLLBACK'); // END the transaction
        res.status(500).json({ message: err.message })
    }
    finally {
        client.release();
    }
}

const register = async (req, res) => {

    if (!req?.body?.username || !req?.body?.password || !req?.body?.email) {
        return res.status(400).json({ message: 'All fields are required' })
    }

    if (!req?.body?.data1 || !req?.body?.data2) {
        return res.status(400).json({ message: 'Some Error Occured' })
    }

    if (req.body.password.length < 8)
        return res.status(400).json({ message: "Password should be atleast 8 characters." })

    const passwordSpecial = /[@#$%^&*()!+-]/;

    if (!passwordSpecial.test(req.body.password))
        return res.status(400).json({ message: "Password should contain at least one special character." })

    const passwordLower = /[a-z]/;

    if (!passwordLower.test(req.body.password))
        return res.status(400).json({ message: "Password should contain at least one lowercase character." })

    const passwordUpper = /[A-Z]/;

    if (!passwordUpper.test(req.body.password))
        return res.status(400).json({ message: "Password should contain at least one uppercase character." })

    const passwordDigit = /[0-9]/;

    if (!passwordDigit.test(req.body.password))
        return res.status(400).json({ message: "Password should contain at least one digit." })

    const client = await pool.connect();
    try {
        // check for duplicate usernames in the db

        await client.query('BEGIN'); // Start the transaction

        const query1 = {
            text: 'SELECT *  FROM users WHERE email = $1',
            values: [req.body.email]
        };

        const response = await client.query(query1)
        const duplicate = response.rows[0]

        // const duplicate = await User.findOne({ username: req.body.username }).exec()
        if (duplicate) {
            await client.query('ROLLBACK'); // END the transaction
            return res.status(409).json({ message: 'User already registered' })
        }

        //encrypt the password
        const hashedPwd = await bcrypt.hash(req.body.password, 10);

        //create and store the new user
        const query2 = {
            text: 'INSERT INTO users(username, email, password, refreshToken) VALUES($1, $2, $3, $4)',
            values: [req.body.username, req.body.email, hashedPwd, '']
        };

        await client.query(query2);

        const userResponse = await client.query(query1);

        const newUser = userResponse.rows[0];

        const query3 = {
            text: 'INSERT INTO keys(publicKey, privateKey, user_id) VALUES($1, $2, $3)',
            values: [req.body.data1, req.body.data2, newUser._id]
        };

        await client.query(query3);

        await client.query('COMMIT'); // Commit the transaction

        res.status(201).json({ 'message': `New user with ${req.body.username} created!` })
    } catch (err) {
        await client.query('ROLLBACK'); // Commit the transaction
        console.log(err);
        res.status(500).json({ 'message': err.message })
    }
    finally {
        client.release();
    }
}

const logout = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // start the transaction

        const cookies = req.cookies;

        if (!cookies?.jwt) return res.sendStatus(204); //No content
        const refreshToken = cookies.jwt;


        // Is refreshToken in db?
        const query1 = {
            text: "SELECT * FROM users WHERE refreshToken = $1",
            values: [refreshToken]
        };

        const response = await client.query(query1);
        const foundUser = response.rows[0];

        if (!foundUser) {
            res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === 'production' });
            return res.sendStatus(204);
        }


        // Delete refreshToken in db
        const query2 = {
            text: 'UPDATE users SET refreshToken = $1 WHERE _id = $2',
            values: ['', foundUser._id]
        };
        await client.query(query2);

        await client.query('COMMIT'); // finish the transaction

        res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === 'production' });
        res.sendStatus(204);
    }
    catch (err) {
        await client.query('ROLLBACK'); // end the transaction

        res.status(500).json({ message: "Error Logging you out. Please Try again" });
    }
    finally {
        client.release();
    }
}

module.exports = {
    login,
    register,
    logout
}
