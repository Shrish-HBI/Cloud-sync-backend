import express from 'express';
import { authenticate, requireClient } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireClient);

/**
 * @route   GET /api/v1/usage/stats
 * @desc    Get usage statistics
 * @access  Private (Client)
 */
router.get('/stats', (req, res) => {
  res.json({ success: true, message: 'Usage stats - TODO' });
});

/**
 * @route   GET /api/v1/usage/downloads
 * @desc    Get download history
 * @access  Private (Client)
 */
router.get('/downloads', (req, res) => {
  res.json({ success: true, message: 'Download history - TODO' });
});

export default router;
