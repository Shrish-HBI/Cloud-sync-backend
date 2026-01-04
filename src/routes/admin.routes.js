import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getSystemStats,
  getActivityLogs,
  toggleClientStatus,
  resetClientPassword,
  getClientStorageStats
} from '../controllers/admin.controller.js';
import { adminBrowseFiles } from '../controllers/browse.controller.js';

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

/**
 * @route   GET /api/v1/admin/clients
 * @desc    Get all clients
 * @access  Private (Admin)
 */
router.get('/clients', getClients);

/**
 * @route   GET /api/v1/admin/clients/:clientId
 * @desc    Get single client details
 * @access  Private (Admin)
 */
router.get('/clients/:clientId', getClientById);

/**
 * @route   POST /api/v1/admin/clients
 * @desc    Create new client
 * @access  Private (Admin)
 */
router.post('/clients', createClient);

/**
 * @route   PUT /api/v1/admin/clients/:clientId
 * @desc    Update client
 * @access  Private (Admin)
 */
router.put('/clients/:clientId', updateClient);

/**
 * @route   DELETE /api/v1/admin/clients/:clientId
 * @desc    Delete client
 * @access  Private (Admin)
 */
router.delete('/clients/:clientId', deleteClient);

/**
 * @route   GET /api/v1/admin/stats
 * @desc    Get admin dashboard stats
 * @access  Private (Admin)
 */
router.get('/stats', getSystemStats);

/**
 * @route   GET /api/v1/admin/activity-logs
 * @desc    Get activity logs with filters
 * @access  Private (Admin)
 */
router.get('/activity-logs', getActivityLogs);

/**
 * @route   PATCH /api/v1/admin/clients/:clientId/status
 * @desc    Suspend or activate client
 * @access  Private (Admin)
 */
router.patch('/clients/:clientId/status', toggleClientStatus);

/**
 * @route   PATCH /api/v1/admin/clients/:clientId/suspend
 * @desc    Suspend client (shorthand)
 * @access  Private (Admin)
 */
router.patch('/clients/:clientId/suspend', async (req, res) => {
  req.body.status = 'suspended';
  return toggleClientStatus(req, res);
});

/**
 * @route   PATCH /api/v1/admin/clients/:clientId/activate
 * @desc    Activate client (shorthand)
 * @access  Private (Admin)
 */
router.patch('/clients/:clientId/activate', async (req, res) => {
  req.body.status = 'active';
  return toggleClientStatus(req, res);
});

/**
 * @route   POST /api/v1/admin/clients/:clientId/reset-password
 * @desc    Reset client password
 * @access  Private (Admin)
 */
router.post('/clients/:clientId/reset-password', resetClientPassword);

/**
 * @route   GET /api/v1/admin/clients/:clientId/storage-stats
 * @desc    Get client's S3 storage statistics
 * @access  Private (Admin)
 */
router.get('/clients/:clientId/storage-stats', getClientStorageStats);

/**
 * @route   GET /api/v1/admin/clients/:clientId/browse
 * @desc    Browse client's S3 files and folders
 * @access  Private (Admin)
 */
router.get('/clients/:clientId/browse', adminBrowseFiles);

export default router;
