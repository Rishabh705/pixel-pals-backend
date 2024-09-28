const jwt = require('jsonwebtoken');
const pool = require('../config/psqldb');

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
            if (err || foundUser.email !== decoded.email) return res.sendStatus(403);
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
            res.json({ accessToken })
        }
    );
}

module.exports = { handleRefreshToken }