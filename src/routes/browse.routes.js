import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { browseFiles, getDownloadUrl, deleteFile } from '../controllers/browse.controller.js';

const router = express.Router();

// GET /api/v1/browse/files?prefix=folder1/subfolder/
router.get('/files', authenticate, browseFiles);

// GET/POST /api/v1/browse/download?filePath=path/to/file.pdf or { filePath: "..." }
router.get('/download', authenticate, getDownloadUrl);
router.post('/download', authenticate, getDownloadUrl);

// POST /api/v1/browse/delete - Delete a file
router.post('/delete', authenticate, deleteFile);

export default router;
