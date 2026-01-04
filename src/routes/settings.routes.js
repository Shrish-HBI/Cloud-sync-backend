import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

/**
 * @route   GET /api/v1/settings
 * @desc    Get system settings
 * @access  Private (Admin)
 */
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Get settings - TODO' });
});

/**
 * @route   PUT /api/v1/settings
 * @desc    Update system settings
 * @access  Private (Admin)
 */
router.put('/', (req, res) => {
  res.json({ success: true, message: 'Update settings - TODO' });
});

export default router;
