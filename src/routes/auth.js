const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { body } = require('express-validator');
const authController = require('../controllers/authController');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

const updateProfileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Please enter a valid email'),
];

const updateCredentialsValidation = [
  body('platform').isIn(['zomato', 'swiggy']).withMessage('Invalid platform'),
  body('credentials').isObject().withMessage('Credentials must be an object'),
];

// Register
router.post('/register', registerValidation, authController.register);

// Login
router.post('/login', loginValidation, authController.login);

// Get current user
router.get('/me', auth, authController.getCurrentUser);

// Routes
router.put('/profile', auth, updateProfileValidation, authController.updateProfile);
router.put('/credentials', auth, updateCredentialsValidation, authController.updatePlatformCredentials);

module.exports = router; 