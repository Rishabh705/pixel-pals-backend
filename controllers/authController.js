const authService = require('../services/auth');
const CustomError = require('../utils/Error');
const {logger} = require('../middleware/logger');

class AuthController {
    async login(req, res, next) {
        try {
            if (!req?.body?.email || !req?.body?.password) {
                throw new CustomError('All fields are required', 400);
            }

            const { accessToken, refreshToken, publicKey } = await authService.login(
                req.body.email,
                req.body.password
            );

            res.cookie('jwt', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'None',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days to match REFRESH_TOKEN_EXPIRES
            });

            res.status(200).json({
                status: 'success',
                data: {
                    message: 'Authentication successful',
                    accessToken,
                    publicKey
                }
            });
        } catch (error) {
            logger.error('Login error:', { error: error.message });
            next(error);
        }
    }

    async register(req, res, next) {
        try {
            const { username, email, password, publicKey } = req.body;
            
            if (!username || !email || !password || !publicKey) {
                throw new CustomError('All fields are required', 400);
            }

            await authService.register(username, email, password, publicKey);
            
            res.status(201).json({
                status: 'success',
                data: {
                    message: `User ${username} registered successfully`
                }
            });
        } catch (error) {
            logger.error('Registration error:', { error: error.message });
            next(error);
        }
    }

    async logout(req, res, next) {
        try {
            const refreshToken = req.cookies?.jwt;
            await authService.logout(refreshToken);
            
            res.clearCookie('jwt', {
                httpOnly: true,
                sameSite: 'None',
                secure: process.env.NODE_ENV === 'production'
            });
            
            res.status(200).json({
                status: 'success',
                data: {
                    message: 'Logout successful'
                }
            });
        } catch (error) {
            logger.error('Logout error:', { error: error.message });
            next(error);
        }
    }

    async refreshAccessToken(req, res, next) {
        try {
            const refreshToken = req.cookies?.jwt;
            if (!refreshToken) {
                throw new CustomError('Refresh token not found', 401);
            }

            const { accessToken } = await authService.refreshAccessToken(refreshToken);

            res.status(200).json({
                status: 'success',
                data: {
                    accessToken
                }
            });
        } catch (error) {
            logger.error('Token refresh error:', { error: error.message });
            next(error);
        }
    }

    async rotateTokens(req, res, next) {
        try {
            const refreshToken = req.cookies?.jwt;
            if (!refreshToken) {
                throw new CustomError('Refresh token not found', 401);
            }

            const { accessToken, refreshToken: newRefreshToken } = await authService.rotateTokens(refreshToken);

            res.cookie('jwt', newRefreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'None',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days to match REFRESH_TOKEN_EXPIRES
            });

            res.status(200).json({
                status: 'success',
                data: {
                    accessToken
                }
            });
        } catch (error) {
            logger.error('Token rotation error:', { error: error.message });
            next(error);
        }
    }
}

module.exports = new AuthController();