const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const userRepository = require('../repositories/auth');
const cacheService = require('../utils/redis');
const CustomError = require('../utils/Error');
const authValidator = require('../validators/auth');
const { logger } = require('../middleware/logger');

class AuthService {
    constructor() {
        this.jwtPrivateKey = fs.readFileSync(path.join(__dirname, '../keys/private.key'), 'utf8').trim();
        this.jwtPublicKey = fs.readFileSync(path.join(__dirname, '../keys/public.key'), 'utf8').trim();
        this.ACCESS_TOKEN_EXPIRES = '15d';
        this.REFRESH_TOKEN_EXPIRES = '7d';
    }

    async login(email, password) {
        const validation = authValidator.validateLogin({ email, password });
        if (!validation.isValid) {
            throw new CustomError(Object.values(validation.errors)[0], 401);
        }
    
        return await userRepository.withTransaction(async (client) => {
            const user = await userRepository.findUserByEmailAndReturnPubKey(email, client);
            if (!user || !(await bcrypt.compare(password, user.password))) {
                throw new CustomError('Invalid credentials', 401);
            }
    
            const tokens = this._generateTokens(user);
            
            // Update refresh token (which will also invalidate related caches)
            await userRepository.updateRefreshToken(user.email, tokens.refreshToken, client);

            // if user exists, cache it
            if (user) {
                const { password, ...userWithoutPassword } = user;

                const userCacheKey = userRepository.generateUserCacheKey(email);
                // Cache the user with proper TTL
                await cacheService.set(userCacheKey, userWithoutPassword, userRepository.USER_CACHE_TTL);
            }
    
            return {
                ...tokens,
                publicKey: user.publicKey
            };
        });
    }

    async register(username, email, password, publicKey) {
        const validation = authValidator.validateRegistration({ username, email, password, publicKey });
        if (!validation.isValid) {
            throw new CustomError(Object.values(validation.errors)[0], 400);
        }

        return await userRepository.withTransaction(async (client) => {
            const existingUser = await userRepository.findUserByEmail(email, client);
            if (existingUser) {
                throw new CustomError('Email already in use', 409);
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            return await userRepository.createUser({
                username,
                email,
                hashedPassword,
                publicKey
            }, client);
        });
    }

    async logout(refreshToken) {
        if (!refreshToken) {
            return;
        }

        return await userRepository.withTransaction(async (client) => {
            const user = await userRepository.findUserByRefreshToken(refreshToken, client);
            if (user) {
                await Promise.all([
                    userRepository.clearRefreshToken(user._id, client),
                    this._invalidateToken(refreshToken)
                ]);
            }
        });
    }

    async getPublicKey(email) {
        const user = await userRepository.findUserByEmail(email);
        if (!user) {
            throw new CustomError('User not found', 404);
        }
        return user.publickey;
    }

    // Only refresh access token, keeping the same refresh token
    async refreshAccessToken(refreshToken) {
        try {
            if (!refreshToken) {
                throw new CustomError('Refresh token required', 400);
            }
            const decoded = jwt.verify(refreshToken, this.jwtPublicKey, { algorithms: ['RS256'] });
            const user = await userRepository.findUserByEmail(decoded.email);
            if (!user || user.refreshtoken !== refreshToken) {
                throw new CustomError('Invalid refresh token', 401);
            }

            // Only generate new access token
            const accessToken = jwt.sign(
                {
                    "UserInfo": {
                        "username": user.username,
                        "email": user.email,
                        "_id": user._id
                    },
                    type: 'access',
                    tokenId: decoded.tokenId, // Keep the same tokenId
                },
                this.jwtPrivateKey,
                {
                    expiresIn: this.ACCESS_TOKEN_EXPIRES,
                    algorithm: 'RS256'
                }
            );

            return { accessToken };
        } catch (err) {
            logger.error('Error refreshing access token:', { error: err });
            throw new CustomError('Invalid or expired token', 401);
        }
    }

    // Rotate both access and refresh tokens
    async rotateTokens(refreshToken) {
        if (!refreshToken) {
            throw new CustomError('Refresh token required', 400);
        }

        return await userRepository.withTransaction(async (client) => {
            let decoded;
            try {
                decoded = jwt.verify(refreshToken, this.jwtPublicKey, { algorithms: ['RS256'] });
            } catch (err) {
                await this._invalidateToken(refreshToken);
                throw new CustomError('Invalid or expired token', 401);
            }

            if (decoded.type !== 'refresh') {
                throw new CustomError('Invalid token type', 401);
            }

            const user = await userRepository.findUserByEmail(decoded.email, client);
            if (!user || user.refreshtoken !== refreshToken) {
                await this._invalidateToken(refreshToken);
                throw new CustomError('Invalid credentials', 401);
            }

            // Generate new token pair
            const tokens = this._generateTokens(user);

            // Update refresh token and invalidate old one
            await Promise.all([
                userRepository.updateRefreshToken(user.email, tokens.refreshToken, client),
                this._invalidateToken(refreshToken)
            ]);

            return tokens;
        });
    }

    async _invalidateToken(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded?.tokenId) {
                const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
                if (ttl > 0) {
                    await userRepository.blacklistToken(decoded.tokenId, ttl);
                }
            }
        } catch (err) {
            logger.error('Error invalidating token', { error: err.message });
        }
    }

    _generateTokens(user) {
        const tokenId = crypto.randomUUID();

        const accessToken = jwt.sign(
            {
                "UserInfo": {
                    "username": user.username,
                    "email": user.email,
                    "_id": user._id
                },
                type: 'access',
                tokenId,
            },
            this.jwtPrivateKey,
            {
                expiresIn: this.ACCESS_TOKEN_EXPIRES,
                algorithm: 'RS256'
            }
        );

        const refreshToken = jwt.sign(
            {
                sub: user._id,
                type: 'refresh',
                email: user.email,
                tokenId,
            },
            this.jwtPrivateKey,
            {
                expiresIn: this.REFRESH_TOKEN_EXPIRES,
                algorithm: 'RS256'
            }
        );

        return { accessToken, refreshToken, tokenId };
    }
}

module.exports = new AuthService();