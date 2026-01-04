import express from 'express';
import clientController from '../controllers/client.controller.js';
import { authenticate, requireClient } from '../middleware/auth.js';
import { generalLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(requireClient);
router.use(generalLimiter);

/**
 * @route   GET /api/v1/clients/dashboard
 * @desc    Get client dashboard stats
 * @access  Private (Client)
 */
router.get('/dashboard', clientController.getDashboardStats);

/**
 * @route   GET /api/v1/clients/alerts
 * @desc    Get client alerts
 * @access  Private (Client)
 */
router.get('/alerts', clientController.getAlerts);

/**
 * @route   PUT /api/v1/clients/alerts/:alertId/read
 * @desc    Mark alert as read
 * @access  Private (Client)
 */
router.put('/alerts/:alertId/read', clientController.markAlertRead);

/**
 * @route   DELETE /api/v1/clients/alerts/:alertId
 * @desc    Dismiss alert
 * @access  Private (Client)
 */
router.delete('/alerts/:alertId', clientController.dismissAlert);

/**
 * @route   GET /api/v1/clients/downloads
 * @desc    Get download history
 * @access  Private (Client)
 */
router.get('/downloads', clientController.getDownloads);

export default router;
