const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || 'Internal Server Error';

    // Log error for debugging (in development)
    if (process.env.NODE_ENV === 'development') {
        logger.error('Error 🔥:', {
            message: err.message,
            stack: err.stack,
            statusCode: err.statusCode
        });
    }

    // Handle specific error types
    if (err.name === 'ValidationError') {
        // Mongoose validation error
        err.statusCode = 400;
        err.message = Object.values(err.errors)
            .map(val => val.message)
            .join(', ');
    }

    if (err.code === 11000) {
        // Mongoose duplicate key error
        err.statusCode = 400;
        err.message = `Duplicate value entered for ${Object.keys(err.keyValue)} field`;
    }

    if (err.name === 'JsonWebTokenError') {
        err.statusCode = 401;
        err.message = 'Invalid token. Please log in again.';
    }

    if (err.name === 'TokenExpiredError') {
        err.statusCode = 401;
        err.message = 'Your token has expired. Please log in again.';
    }

    // Send error response
    res.status(err.statusCode).json({
        success: false,
        error: {
            message: err.message,
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
                details: err.errors
            })
        }
    });
};

module.exports = errorHandler;