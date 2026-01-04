import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/v1/share/create
 * @desc    Create shared link
 * @access  Private
 */
router.post('/create', authenticate, (req, res) => {
  res.json({ success: true, message: 'Share routes - TODO' });
});

/**
 * @route   GET /api/v1/share/:token
 * @desc    Access shared file (public)
 * @access  Public
 */
router.get('/:token', (req, res) => {
  res.json({ success: true, message: 'Share access - TODO' });
});

export default router;
