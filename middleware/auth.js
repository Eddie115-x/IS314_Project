const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Please provide a valid authentication token',
        timestamp: new Date().toISOString()
      });
    }

    // Validate token format
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Invalid token format',
        message: 'Token must be in format: Bearer <token>',
        timestamp: new Date().toISOString()
      });
    }

    const token = tokenParts[1];

    if (!token || token.trim() === '') {
      return res.status(401).json({ 
        error: 'Empty token',
        message: 'Token cannot be empty',
        timestamp: new Date().toISOString()
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('❌ JWT verification failed:', {
        error: jwtError.message,
        token: token.substring(0, 20) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'The provided token is invalid or malformed',
          timestamp: new Date().toISOString()
        });
      }
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          message: 'Your session has expired. Please login again',
          timestamp: new Date().toISOString()
        });
      }

      return res.status(401).json({ 
        error: 'Token verification failed',
        message: 'Unable to verify authentication token',
        timestamp: new Date().toISOString()
      });
    }

    // Validate decoded token structure
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ 
        error: 'Invalid token payload',
        message: 'Token does not contain valid user information',
        timestamp: new Date().toISOString()
      });
    }

    // Get user from database with error handling
    let user;
    try {
      user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ['password'] }
      });
    } catch (dbError) {
      console.error('❌ Database error during authentication:', {
        error: dbError.message,
        userId: decoded.userId,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(503).json({ 
        error: 'Database connection error',
        message: 'Unable to verify user credentials. Please try again later.',
        timestamp: new Date().toISOString()
      });
    }

    if (!user) {
      console.warn('⚠️ Authentication attempt with non-existent user:', {
        userId: decoded.userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({ 
        error: 'User not found',
        message: 'User account does not exist',
        timestamp: new Date().toISOString()
      });
    }

    if (!user.isActive) {
      console.warn('⚠️ Authentication attempt with inactive user:', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({ 
        error: 'Account inactive',
        message: 'Your account has been deactivated. Please contact administrator.',
        timestamp: new Date().toISOString()
      });
    }

    // Add user to request object
    req.user = user;
    
    // Log successful authentication
    console.log('✅ User authenticated successfully:', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    next();
  } catch (error) {
    console.error('❌ Unexpected authentication error:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'An unexpected error occurred during authentication',
      timestamp: new Date().toISOString()
    });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please login to access this resource',
          timestamp: new Date().toISOString()
        });
      }

      // Ensure roles is always an array and flatten it
      const requiredRoles = Array.isArray(roles) ? roles.flat() : [roles].flat();

      if (!requiredRoles || requiredRoles.length === 0) {
        console.error('❌ No roles specified for authorization');
        return res.status(500).json({ 
          error: 'Authorization configuration error',
          message: 'Authorization rules not properly configured',
          timestamp: new Date().toISOString()
        });
      }

      if (!requiredRoles.includes(req.user.role)) {
        console.warn('⚠️ Unauthorized access attempt:', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: requiredRoles,
          url: req.originalUrl,
          method: req.method,
          ip: req.ip,
          timestamp: new Date().toISOString()
        });

        return res.status(403).json({ 
          error: 'Access denied',
          message: `Access denied. Required roles: ${requiredRoles.join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }

      next();
    } catch (error) {
      console.error('❌ Authorization middleware error:', {
        error: error.message,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      return res.status(500).json({ 
        error: 'Authorization error',
        message: 'An error occurred during authorization',
        timestamp: new Date().toISOString()
      });
    }
  };
};

const isManagerOrHR = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please login to access this resource',
        timestamp: new Date().toISOString()
      });
    }

    const allowedRoles = ['manager', 'hr', 'admin'];
    
    if (!allowedRoles.includes(req.user.role)) {
      console.warn('⚠️ Manager/HR access denied:', {
        userId: req.user.id,
        userRole: req.user.role,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Manager or HR access required',
        timestamp: new Date().toISOString()
      });
    }

    next();
  } catch (error) {
    console.error('❌ Manager/HR authorization error:', {
      error: error.message,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({ 
      error: 'Authorization error',
      message: 'An error occurred during authorization',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  isManagerOrHR
}; 