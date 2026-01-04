import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { query } from '../config/database.js';
import { AppError } from './errorHandler.js';

// Verify JWT token and attach user to request
export const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a token in Authorization header.',
        code: 'NO_TOKEN'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format. Use: Bearer <token>',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Check if session exists and is valid
    const sessions = await query(
      'SELECT * FROM user_sessions WHERE user_id = ? AND expires_at > NOW() LIMIT 1',
      [decoded.userId]
    );

    if (sessions.length === 0) {
      throw new AppError('Session expired or invalid', 401, 'SESSION_INVALID');
    }

    // Get user details with roles
    const users = await query(
      `SELECT u.*, GROUP_CONCAT(ur.role) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [decoded.userId]
    );

    if (users.length === 0) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    const user = users[0];
    user.roles = user.roles ? user.roles.split(',') : [];

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    } else if (error.name === 'TokenExpiredError') {
      next(new AppError('Token expired', 401, 'TOKEN_EXPIRED'));
    } else {
      next(error);
    }
  }
};

// Check if user has specific role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401, 'NOT_AUTHENTICATED'));
    }

    const hasRole = roles.some(role => req.user.roles.includes(role));

    if (!hasRole) {
      return next(
        new AppError(
          'You do not have permission to perform this action',
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
};

// Check if user is admin
export const requireAdmin = authorize('admin');

// Check if user is client
export const requireClient = authorize('client');

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const users = await query(
      `SELECT u.*, GROUP_CONCAT(ur.role) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [decoded.userId]
    );

    if (users.length > 0) {
      const user = users[0];
      user.roles = user.roles ? user.roles.split(',') : [];
      req.user = user;
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without user
    next();
  }
};
