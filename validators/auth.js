// src/validators/authValidator.js
class AuthValidator {
    validateLogin(data) {
        const errors = {};

        // Email validation
        if (!data.email) {
            errors.email = 'Email is required';
        } else if (typeof data.email !== 'string') {
            errors.email = 'Email must be a string';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.email = 'Invalid email format';
        }

        // Password validation
        if (!data.password) {
            errors.password = 'Password is required';
        } else if (typeof data.password !== 'string') {
            errors.password = 'Password must be a string';
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    validateRegistration(data) {
        const errors = {};

        // Username validation
        if (!data.username) {
            errors.username = 'Username is required';
        } else if (typeof data.username !== 'string') {
            errors.username = 'Username must be a string';
        } else if (data.username.length < 3) {
            errors.username = 'Username must be at least 3 characters';
        } else if (data.username.length > 30) {
            errors.username = 'Username cannot exceed 30 characters';
        } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) {
            errors.username = 'Username can only contain letters, numbers, underscores, and hyphens';
        }

        // Email validation
        if (!data.email) {
            errors.email = 'Email is required';
        } else if (typeof data.email !== 'string') {
            errors.email = 'Email must be a string';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.email = 'Invalid email format';
        }

        // Password validation
        if (!data.password) {
            errors.password = 'Password is required';
        } else if (typeof data.password !== 'string') {
            errors.password = 'Password must be a string';
        } else if (data.password.length < 8) {
            errors.password = 'Password must be at least 8 characters';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
            errors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }
}

module.exports = new AuthValidator();