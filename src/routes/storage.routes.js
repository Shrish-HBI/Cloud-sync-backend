import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getStorageStats } from '../controllers/storage.controller.js';

const router = express.Router();

// GET /api/v1/storage/stats - Get storage statistics from S3
router.get('/stats', authenticate, getStorageStats);

export default router;
