const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      console.log('No token provided in request');
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token verified successfully for user ID:', decoded.id);
      
      // Get user from database
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        console.log('User not found for ID:', decoded.id);
        return res.status(401).json({ message: 'User not found' });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error in authentication' });
  }
};

module.exports = auth; 