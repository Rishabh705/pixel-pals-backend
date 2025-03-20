const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const jwtPrivateKey = fs.readFileSync(path.join(__dirname, '../keys/private.key'), 'utf8').trim();
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.sendStatus(401);
    const token = authHeader.split(' ')[1];
    jwt.verify(
        token,
        jwtPrivateKey,
        (err, decoded) => {
            if (err) return res.sendStatus(403); //invalid token
            req.user = {
                _id: decoded.UserInfo._id,
                email: decoded.UserInfo.email,
                username: decoded.UserInfo.username,
            }
            next();
        }
    );
}

module.exports = verifyJWT