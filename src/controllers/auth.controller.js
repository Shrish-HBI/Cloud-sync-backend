import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query, transaction } from '../config/database.js';
import config from '../config/index.js';
import activityService from '../services/activity.service.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

class AuthController {
  /**
   * Register new user
   */
  async register(req, res, next) {
    try {
      const { email, password, name, company } = req.body;

      // Check if user exists
      const existingUsers = await query('SELECT id FROM users WHERE email = ?', [email]);
      
      if (existingUsers.length > 0) {
        throw new AppError('Email already registered', 400, 'EMAIL_EXISTS');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = uuidv4();

      // Create user and assign client role
      await transaction(async (conn) => {
        await conn.execute(
          'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
          [userId, email, passwordHash, name]
        );

        await conn.execute(
          'INSERT INTO user_roles (user_id, role) VALUES (?, ?)',
          [userId, 'client']
        );
      });

      logger.info(`New user registered: ${email}`);

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: { userId }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      // Get user with roles
      const users = await query(
        `SELECT u.*, GROUP_CONCAT(ur.role) as roles
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         WHERE u.email = ?
         GROUP BY u.id`,
        [email]
      );

      if (users.length === 0) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      const user = users[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Store session
      const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await query(
        'INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
        [user.id, tokenHash, ipAddress, userAgent, expiresAt]
      );

      // Update last login
      await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

      // Log activity
      const roles = user.roles ? user.roles.split(',') : [];
      await activityService.logActivity({
        userId: user.id,
        userName: user.name,
        userRole: roles[0] || 'client',
        action: 'login',
        details: 'User logged in',
        ipAddress,
        userAgent
      });

      logger.info(`User logged in: ${email}`);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roles
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login for app - includes cloud storage configuration
   */
  async loginApp(req, res, next) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      // Get user with roles
      const users = await query(
        `SELECT u.*, GROUP_CONCAT(ur.role) as roles
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         WHERE u.email = ?
         GROUP BY u.id`,
        [email]
      );

      if (users.length === 0) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      const user = users[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Store session
      const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await query(
        'INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
        [user.id, tokenHash, ipAddress, userAgent, expiresAt]
      );

      // Update last login
      await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

      // Get client details and cloud storage configuration
      const [clientData] = await query(
        `SELECT c.id as client_id, c.name, c.email, c.company, 
                c.storage_quota_gb, c.egress_free_limit_gb, c.status,
                csc.bucket_name, csc.endpoint, csc.region, 
                csc.access_key_id, csc.secret_access_key, csc.bucket_prefix,
                csc.is_verified, csc.last_verified_at
         FROM clients c
         LEFT JOIN client_storage_config csc ON c.id = csc.client_id
         WHERE c.user_id = ?`,
        [user.id]
      );

      // Log activity
      const roles = user.roles ? user.roles.split(',') : [];
      await activityService.logActivity({
        userId: user.id,
        userName: user.name,
        userRole: roles[0] || 'client',
        action: 'login_app',
        details: 'User logged in via app',
        ipAddress,
        userAgent
      });

      logger.info(`User logged in via app: ${email}`);

      const responseData = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles
        },
        accessToken,
        refreshToken
      };

      // Add cloud config if client exists
      if (clientData) {
        responseData.client = {
          id: clientData.client_id,
          name: clientData.name,
          email: clientData.email,
          company: clientData.company,
          status: clientData.status,
          storageQuotaGb: parseFloat(clientData.storage_quota_gb || 0),
          egressFreeLimitGb: parseFloat(clientData.egress_free_limit_gb || 0)
        };

        // Add cloud storage configuration if exists
        if (clientData.bucket_name) {
          responseData.cloudConfig = {
            bucketName: clientData.bucket_name,
            endpoint: clientData.endpoint,
            region: clientData.region,
            accessKeyId: clientData.access_key_id,
            secretAccessKey: clientData.secret_access_key,
            bucketPrefix: clientData.bucket_prefix || '',
            isVerified: Boolean(clientData.is_verified),
            lastVerifiedAt: clientData.last_verified_at
          };
        }
      }

      res.json({
        success: true,
        message: 'Login successful',
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   */
  async logout(req, res, next) {
    try {
      const userId = req.user.id;

      // Delete session
      await query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'logout',
        details: 'User logged out',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      logger.info(`User logged out: ${req.user.email}`);

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id;

      const profiles = await query(
        `SELECT p.*, c.id as client_id, c.storage_quota_gb, c.storage_used_gb, 
                c.egress_used_gb, c.egress_free_limit_gb, c.status
         FROM profiles p
         LEFT JOIN clients c ON p.id = c.user_id
         WHERE p.id = ?`,
        [userId]
      );

      if (profiles.length === 0) {
        throw new AppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          ...profiles[0],
          roles: req.user.roles
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const { name, company, avatar_url } = req.body;

      await query(
        'UPDATE profiles SET name = ?, company = ?, avatar_url = ? WHERE id = ?',
        [name, company, avatar_url, userId]
      );

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'profile_update',
        details: 'User updated profile',
        resourceType: 'profile',
        resourceId: userId
      });

      logger.info(`Profile updated: ${req.user.email}`);

      res.json({
        success: true,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password
   */
  async changePassword(req, res, next) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      // Get current password hash
      const users = await query('SELECT password_hash FROM users WHERE id = ?', [userId]);
      
      if (users.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
      
      if (!isValid) {
        throw new AppError('Current password is incorrect', 400, 'INVALID_PASSWORD');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, userId]);

      // Invalidate all sessions except current
      await query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'password_change',
        details: 'User changed password',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      logger.info(`Password changed: ${req.user.email}`);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new AppError('Refresh token required', 400, 'TOKEN_REQUIRED');
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

      // Generate new access token
      const accessToken = jwt.sign(
        { userId: decoded.userId },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json({
        success: true,
        data: { accessToken }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
