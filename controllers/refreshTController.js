const User = require('../model/User');
const jwt = require('jsonwebtoken');

const handleRefreshToken = async (req, res) => {
    const cookies = req.cookies;

    if (!cookies?.jwt) return res.sendStatus(401);
    
    const refreshToken = cookies.jwt;

    const query1 ={
        text:"SELECT * FROM users WHERE refreshToken = $1",
        values: [refreshToken]
    };

    const response = await pool.query(query1);
    const foundUser = response.rows[0];
    
    if (!foundUser) return res.sendStatus(403); //Forbidden

    // evaluate jwt 
    jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        (err, decoded) => {
            if (err || foundUser.username !== decoded.username) return res.sendStatus(403);
            const accessToken = jwt.sign(
                {
                    "UserInfo": {
                        "username": decoded.username,
                        "_id": foundUser._id
                    }
                },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '10s' }
            );
            res.json({ accessToken })
        }
    );
}

module.exports = { handleRefreshToken }