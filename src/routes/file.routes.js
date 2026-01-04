import express from 'express';
import { body, query as queryValidator } from 'express-validator';
import fileController from '../controllers/file.controller.js';
import { authenticate, requireClient } from '../middleware/auth.js';
import { uploadLimiter, downloadLimiter, generalLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(requireClient);

/**
 * @route   GET /api/v1/files
 * @desc    Get files list
 * @access  Private (Client)
 */
router.get(
  '/',
  generalLimiter,
  [
    queryValidator('parentId').optional().isUUID(),
    queryValidator('type').optional().isIn(['file', 'folder']),
    queryValidator('search').optional().trim(),
    validate
  ],
  fileController.getFiles
);

/**
 * @route   GET /api/v1/files/:fileId
 * @desc    Get file by ID
 * @access  Private (Client)
 */
router.get('/:fileId', generalLimiter, fileController.getFile);

/**
 * @route   POST /api/v1/files/folders
 * @desc    Create new folder
 * @access  Private (Client)
 */
router.post(
  '/folders',
  generalLimiter,
  [
    body('name').trim().notEmpty().isLength({ max: 255 }),
    body('parentId').optional().isUUID(),
    validate
  ],
  fileController.createFolder
);

/**
 * @route   POST /api/v1/files/upload-url
 * @desc    Get presigned URL for upload
 * @access  Private (Client)
 */
router.post(
  '/upload-url',
  uploadLimiter,
  [
    body('fileName').trim().notEmpty().isLength({ max: 500 }),
    body('fileSize').isInt({ min: 1 }),
    body('mimeType').trim().notEmpty(),
    body('parentId').optional().isUUID(),
    validate
  ],
  fileController.getUploadUrl
);

/**
 * @route   POST /api/v1/files/:fileId/confirm
 * @desc    Confirm successful upload
 * @access  Private (Client)
 */
router.post(
  '/:fileId/confirm',
  generalLimiter,
  [
    body('etag').optional().trim(),
    validate
  ],
  fileController.confirmUpload
);

/**
 * @route   GET /api/v1/files/:fileId/download-url
 * @desc    Get presigned URL for download
 * @access  Private (Client)
 */
router.get('/:fileId/download-url', downloadLimiter, fileController.getDownloadUrl);

/**
 * @route   DELETE /api/v1/files
 * @desc    Delete file(s)
 * @access  Private (Client)
 */
router.delete(
  '/',
  generalLimiter,
  [
    body('fileIds').isArray({ min: 1 }),
    body('fileIds.*').isUUID(),
    validate
  ],
  fileController.deleteFiles
);

export default router;
