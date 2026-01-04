import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import s3Service from '../services/s3.service.js';
import activityService from '../services/activity.service.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

class FileController {
  /**
   * Get files list
   */
  async getFiles(req, res, next) {
    try {
      const userId = req.user.id;
      const { parentId, type, search } = req.query;

      // Get client ID
      const clients = await query('SELECT id FROM clients WHERE user_id = ?', [userId]);
      
      if (clients.length === 0) {
        throw new AppError('Client not found', 404, 'CLIENT_NOT_FOUND');
      }

      const clientId = clients[0].id;

      let sql = 'SELECT * FROM files WHERE client_id = ? AND deleted_at IS NULL';
      let params = [clientId];

      if (parentId) {
        sql += ' AND parent_id = ?';
        params.push(parentId);
      } else {
        sql += ' AND parent_id IS NULL';
      }

      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }

      if (search) {
        sql += ' AND name LIKE ?';
        params.push(`%${search}%`);
      }

      sql += ' ORDER BY type DESC, name ASC';

      const files = await query(sql, params);

      res.json({
        success: true,
        data: files
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get file by ID
   */
  async getFile(req, res, next) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;

      const files = await query(
        `SELECT f.* FROM files f
         JOIN clients c ON f.client_id = c.id
         WHERE f.id = ? AND c.user_id = ? AND f.deleted_at IS NULL`,
        [fileId, userId]
      );

      if (files.length === 0) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      res.json({
        success: true,
        data: files[0]
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create folder
   */
  async createFolder(req, res, next) {
    try {
      const { name, parentId } = req.body;
      const userId = req.user.id;

      // Get client
      const clients = await query('SELECT * FROM clients WHERE user_id = ?', [userId]);
      
      if (clients.length === 0) {
        throw new AppError('Client not found', 404, 'CLIENT_NOT_FOUND');
      }

      const client = clients[0];

      // Build path
      let path = name;
      if (parentId) {
        const parents = await query('SELECT path FROM files WHERE id = ? AND client_id = ?', [parentId, client.id]);
        if (parents.length > 0) {
          path = `${parents[0].path}/${name}`;
        }
      }

      // Create folder
      const folderId = uuidv4();
      await query(
        `INSERT INTO files (id, client_id, name, type, path, parent_id)
         VALUES (?, ?, ?, 'folder', ?, ?)`,
        [folderId, client.id, name, path, parentId || null]
      );

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'folder_create',
        details: `Created folder: ${name}`,
        resourceType: 'folder',
        resourceId: folderId
      });

      logger.info(`Folder created: ${path} by ${req.user.email}`);

      res.status(201).json({
        success: true,
        message: 'Folder created successfully',
        data: { folderId }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get upload URL
   */
  async getUploadUrl(req, res, next) {
    try {
      const { fileName, fileSize, mimeType, parentId } = req.body;
      const userId = req.user.id;

      // Get client with storage config
      const clients = await query(
        `SELECT c.*, cs.bucket_name, cs.endpoint, cs.region, 
                cs.access_key_id, cs.secret_access_key, cs.bucket_prefix, cs.is_verified
         FROM clients c
         LEFT JOIN client_storage_config cs ON c.id = cs.client_id
         WHERE c.user_id = ?`,
        [userId]
      );
      
      if (clients.length === 0) {
        throw new AppError('Client not found', 404, 'CLIENT_NOT_FOUND');
      }

      const client = clients[0];

      // Check if client is active
      if (client.status !== 'active') {
        throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
      }

      // Check if storage is configured
      if (!client.is_verified) {
        throw new AppError('Storage not configured', 400, 'STORAGE_NOT_CONFIGURED');
      }

      // Check storage quota
      const fileSizeGB = fileSize / (1024 * 1024 * 1024);
      const newStorageUsed = parseFloat(client.storage_used_gb) + fileSizeGB;

      if (newStorageUsed > parseFloat(client.storage_quota_gb)) {
        throw new AppError('Storage quota exceeded', 400, 'QUOTA_EXCEEDED');
      }

      // Build path
      let path = fileName;
      if (parentId) {
        const parents = await query('SELECT path FROM files WHERE id = ? AND client_id = ?', [parentId, client.id]);
        if (parents.length > 0) {
          path = `${parents[0].path}/${fileName}`;
        }
      }

      // Generate S3 key
      const s3Key = s3Service.generateS3Key(client.bucket_prefix, path ? `${path}/${fileName}` : fileName);

      // Storage config for S3
      const storageConfig = {
        bucket_name: client.bucket_name,
        endpoint: client.endpoint,
        region: client.region,
        access_key_id: client.access_key_id,
        secret_access_key: client.secret_access_key
      };

      // Generate presigned upload URL
      const uploadUrl = await s3Service.getUploadUrl(storageConfig, s3Key, mimeType, fileSize);

      // Create file metadata
      const fileId = uuidv4();
      await query(
        `INSERT INTO files (id, client_id, name, size_bytes, type, mime_type, path, parent_id, s3_key)
         VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?)`,
        [fileId, client.id, fileName, fileSize, mimeType, path, parentId || null, s3Key]
      );

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'file_upload_init',
        details: `Initiated upload: ${fileName}`,
        resourceType: 'file',
        resourceId: fileId,
        metadata: { fileSize, mimeType }
      });

      logger.info(`Upload URL generated: ${fileName} by ${req.user.email}`);

      res.json({
        success: true,
        data: {
          uploadUrl,
          fileId,
          s3Key,
          expiresIn: 3600
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm upload (update storage after successful upload)
   */
  async confirmUpload(req, res, next) {
    try {
      const { fileId } = req.params;
      const { etag } = req.body;
      const userId = req.user.id;

      // Get file and client
      const files = await query(
        `SELECT f.*, c.id as client_id FROM files f
         JOIN clients c ON f.client_id = c.id
         WHERE f.id = ? AND c.user_id = ?`,
        [fileId, userId]
      );

      if (files.length === 0) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      const file = files[0];

      // Update file with etag
      await query('UPDATE files SET s3_etag = ? WHERE id = ?', [etag, fileId]);

      // Recalculate client storage
      await query('CALL recalculate_client_storage(?)', [file.client_id]);

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'file_upload_complete',
        details: `Uploaded file: ${file.name}`,
        resourceType: 'file',
        resourceId: fileId
      });

      logger.info(`Upload confirmed: ${file.name} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Upload confirmed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get download URL
   */
  async getDownloadUrl(req, res, next) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;

      // Get file, client and storage config
      const files = await query(
        `SELECT f.*, c.id as client_id, c.status, c.egress_free_limit_gb,
                COALESCE(e.egress_used_gb, 0) as egress_used_gb,
                cs.bucket_name, cs.endpoint, cs.region, 
                cs.access_key_id, cs.secret_access_key
         FROM files f
         JOIN clients c ON f.client_id = c.id
         LEFT JOIN egress_usage e ON c.id = e.client_id 
           AND e.month_year = DATE_FORMAT(NOW(), '%Y-%m')
         LEFT JOIN client_storage_config cs ON c.id = cs.client_id
         WHERE f.id = ? AND c.user_id = ? AND f.deleted_at IS NULL AND f.type = 'file'`,
        [fileId, userId]
      );

      if (files.length === 0) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      const file = files[0];

      // Check if client is active
      if (file.status !== 'active') {
        throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
      }

      // Check egress limit (if blocking is enabled)
      const settings = await query("SELECT value FROM system_settings WHERE `key` = 'block_downloads_on_overage'");
      const blockOnOverage = settings[0]?.value === 'true';

      if (blockOnOverage && parseFloat(file.egress_used_gb) >= parseFloat(file.egress_free_limit_gb)) {
        throw new AppError('Download limit exceeded', 403, 'DOWNLOAD_LIMIT_EXCEEDED');
      }

      // Storage config for S3
      const storageConfig = {
        bucket_name: file.bucket_name,
        endpoint: file.endpoint,
        region: file.region,
        access_key_id: file.access_key_id,
        secret_access_key: file.secret_access_key
      };

      // Generate presigned download URL
      const downloadUrl = await s3Service.getDownloadUrl(storageConfig, file.s3_key);

      // Track egress using stored procedure
      await query('CALL record_egress(?, ?)', [file.client_id, file.size_bytes]);

      // Record download history
      await query(
        `INSERT INTO download_history (client_id, file_id, file_name, file_size_bytes, ip_address)
         VALUES (?, ?, ?, ?, ?)`,
        [file.client_id, fileId, file.name, file.size_bytes, req.ip]
      );

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'file_download',
        details: `Downloaded file: ${file.name}`,
        resourceType: 'file',
        resourceId: fileId,
        ipAddress: req.ip
      });

      logger.info(`Download URL generated: ${file.name} by ${req.user.email}`);

      res.json({
        success: true,
        data: {
          downloadUrl,
          fileName: file.name,
          expiresIn: 3600
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete file(s)
   */
  async deleteFiles(req, res, next) {
    try {
      const { fileIds } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        throw new AppError('File IDs required', 400, 'FILE_IDS_REQUIRED');
      }

      // Get files with storage config
      const files = await query(
        `SELECT f.*, c.id as client_id,
                cs.bucket_name, cs.endpoint, cs.region,
                cs.access_key_id, cs.secret_access_key
         FROM files f
         JOIN clients c ON f.client_id = c.id
         LEFT JOIN client_storage_config cs ON c.id = cs.client_id
         WHERE f.id IN (?) AND c.user_id = ? AND f.deleted_at IS NULL`,
        [fileIds, userId]
      );

      if (files.length === 0) {
        throw new AppError('No files found', 404, 'FILES_NOT_FOUND');
      }

      await transaction(async (conn) => {
        // Soft delete files
        await conn.execute(
          'UPDATE files SET deleted_at = NOW() WHERE id IN (?)',
          [fileIds]
        );

        // Delete from S3 (group by client for different configs)
        const clientFiles = {};
        files.forEach(f => {
          if (f.s3_key) {
            if (!clientFiles[f.client_id]) {
              clientFiles[f.client_id] = {
                storageConfig: {
                  bucket_name: f.bucket_name,
                  endpoint: f.endpoint,
                  region: f.region,
                  access_key_id: f.access_key_id,
                  secret_access_key: f.secret_access_key
                },
                keys: []
              };
            }
            clientFiles[f.client_id].keys.push(f.s3_key);
          }
        });

        // Delete files from each client's storage
        for (const clientId in clientFiles) {
          const { storageConfig, keys } = clientFiles[clientId];
          await s3Service.deleteFiles(storageConfig, keys);
        }

        // Recalculate storage for each client
        const clientIds = [...new Set(files.map(f => f.client_id))];
        for (const clientId of clientIds) {
          await conn.execute('CALL recalculate_client_storage(?)', [clientId]);
        }
      });

      // Log activity
      await activityService.logActivity({
        userId,
        userName: req.user.name,
        userRole: req.user.roles[0],
        action: 'file_delete',
        details: `Deleted ${files.length} file(s)`,
        resourceType: 'file'
      });

      logger.info(`Deleted ${files.length} files by ${req.user.email}`);

      res.json({
        success: true,
        message: `${files.length} file(s) deleted successfully`,
        data: { deletedCount: files.length }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new FileController();
