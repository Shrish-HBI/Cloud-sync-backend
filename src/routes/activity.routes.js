import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/v1/activity/logs
 * @desc    Get activity logs
 * @access  Private
 */
router.get('/logs', (req, res) => {
  res.json({ success: true, message: 'Activity logs - TODO' });
});

export default router;
