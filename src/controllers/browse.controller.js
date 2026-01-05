import { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Browse files and folders in client's S3 bucket
 */
export const browseFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const { prefix = '', delimiter = '/' } = req.query;
    
    // Get client's storage config from database
    const [clients] = await pool.query(
      `SELECT c.id as client_id, csc.*
       FROM clients c
       LEFT JOIN client_storage_config csc ON c.id = csc.client_id
       WHERE c.user_id = ?`,
      [userId]
    );

    if (clients.length === 0 || !clients[0].client_id) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'CLIENT_NOT_FOUND', 
          message: 'Client profile not found' 
        }
      });
    }

    const storageConfig = clients[0];
    
    if (!storageConfig.bucket_name) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'NO_STORAGE_CONFIG', 
          message: 'Storage not configured for this client' 
        }
      });
    }

    // Create S3 client with client's credentials
    const s3Client = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      credentials: {
        accessKeyId: storageConfig.access_key_id,
        secretAccessKey: storageConfig.secret_access_key,
      },
      forcePathStyle: true,
    });

    const bucketPrefix = storageConfig.bucket_prefix || '';
    const fullPrefix = bucketPrefix + prefix;
    
    // List objects
    const command = new ListObjectsV2Command({
      Bucket: storageConfig.bucket_name,
      Prefix: fullPrefix,
      Delimiter: delimiter,
      MaxKeys: 1000, // Limit to 1000 items per request
    });
    
    const response = await s3Client.send(command);

    // Process folders (CommonPrefixes)
    const folders = (response.CommonPrefixes || []).map(item => {
      const folderPath = item.Prefix.replace(bucketPrefix, '');
      const folderName = folderPath.replace(prefix, '').replace(/\/$/, '');
      return {
        name: folderName,
        path: folderPath,
        type: 'folder',
        size: 0,
        lastModified: null,
      };
    });

    // Process files (Contents)
    const files = (response.Contents || [])
      .filter(item => item.Key !== fullPrefix) // Exclude the prefix itself
      .map(item => {
        const filePath = item.Key.replace(bucketPrefix, '');
        const fileName = filePath.replace(prefix, '');
        
        // Skip if this is a folder marker
        if (fileName.endsWith('/')) return null;
        
        return {
          name: fileName,
          path: filePath,
          type: 'file',
          size: item.Size,
          sizeKb: parseFloat((item.Size / 1024).toFixed(2)),
          sizeMb: parseFloat((item.Size / (1024 ** 2)).toFixed(2)),
          lastModified: item.LastModified,
          etag: item.ETag?.replace(/"/g, ''),
        };
      })
      .filter(item => item !== null);

    // Combine and sort: folders first, then files
    const items = [...folders, ...files];

    res.json({
      success: true,
      data: {
        currentPath: prefix,
        isTruncated: response.IsTruncated || false,
        items: items,
        totalItems: items.length,
        folderCount: folders.length,
        fileCount: files.length,
      }
    });
  } catch (error) {
    logger.error('Error browsing files:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'BROWSE_ERROR', 
        message: 'Failed to browse files',
        details: error.message 
      }
    });
  }
};

/**
 * Admin: Browse files for a specific client
 */
export const adminBrowseFiles = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { prefix = '', delimiter = '/' } = req.query;
    
    // Get client's storage config
    const [storageConfigs] = await pool.query(
      `SELECT csc.*
       FROM client_storage_config csc
       WHERE csc.client_id = ?`,
      [clientId]
    );

    if (storageConfigs.length === 0) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'NO_STORAGE_CONFIG', 
          message: 'Storage not configured for this client' 
        }
      });
    }

    const storageConfig = storageConfigs[0];

    // Create S3 client
    const s3Client = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      credentials: {
        accessKeyId: storageConfig.access_key_id,
        secretAccessKey: storageConfig.secret_access_key,
      },
      forcePathStyle: true,
    });

    const bucketPrefix = storageConfig.bucket_prefix || '';
    const fullPrefix = bucketPrefix + prefix;
    
    // List objects
    const command = new ListObjectsV2Command({
      Bucket: storageConfig.bucket_name,
      Prefix: fullPrefix,
      Delimiter: delimiter,
      MaxKeys: 1000,
    });
    
    const response = await s3Client.send(command);

    // Process folders
    const folders = (response.CommonPrefixes || []).map(item => {
      const folderPath = item.Prefix.replace(bucketPrefix, '');
      const folderName = folderPath.replace(prefix, '').replace(/\/$/, '');
      return {
        name: folderName,
        path: folderPath,
        type: 'folder',
        size: 0,
        lastModified: null,
      };
    });

    // Process files
    const files = (response.Contents || [])
      .filter(item => item.Key !== fullPrefix)
      .map(item => {
        const filePath = item.Key.replace(bucketPrefix, '');
        const fileName = filePath.replace(prefix, '');
        
        if (fileName.endsWith('/')) return null;
        
        return {
          name: fileName,
          path: filePath,
          type: 'file',
          size: item.Size,
          sizeKb: parseFloat((item.Size / 1024).toFixed(2)),
          sizeMb: parseFloat((item.Size / (1024 ** 2)).toFixed(2)),
          lastModified: item.LastModified,
          etag: item.ETag?.replace(/"/g, ''),
        };
      })
      .filter(item => item !== null);

    const items = [...folders, ...files];

    res.json({
      success: true,
      data: {
        clientId,
        currentPath: prefix,
        isTruncated: response.IsTruncated || false,
        items: items,
        totalItems: items.length,
        folderCount: folders.length,
        fileCount: files.length,
      }
    });
  } catch (error) {
    logger.error('Error browsing client files:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'BROWSE_ERROR', 
        message: 'Failed to browse client files',
        details: error.message 
      }
    });
  }
};

/**
 * Generate download URL for a file
 */
export const getDownloadUrl = async (req, res) => {
  try {
    const userId = req.user.id;
    // Support both query params (GET) and body (POST)
    const { filePath } = req.method === 'GET' ? req.query : req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'MISSING_FILEPATH', 
          message: 'File path is required' 
        }
      });
    }

    // Get client's storage config
    const [clients] = await pool.query(
      `SELECT c.id as client_id, csc.*
       FROM clients c
       LEFT JOIN client_storage_config csc ON c.id = csc.client_id
       WHERE c.user_id = ?`,
      [userId]
    );

    if (clients.length === 0 || !clients[0].client_id) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'CLIENT_NOT_FOUND', 
          message: 'Client profile not found' 
        }
      });
    }

    const storageConfig = clients[0];
    
    if (!storageConfig.bucket_name) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'NO_STORAGE_CONFIG', 
          message: 'Storage not configured for this client' 
        }
      });
    }

    // Create S3 client
    const s3Client = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      credentials: {
        accessKeyId: storageConfig.access_key_id,
        secretAccessKey: storageConfig.secret_access_key,
      },
      forcePathStyle: true,
    });

    const bucketPrefix = storageConfig.bucket_prefix || '';
    const fullPath = bucketPrefix + filePath;
    const fileName = filePath.split('/').pop();

    // Get file metadata from S3
    let fileSize = 0;
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: storageConfig.bucket_name,
        Key: fullPath,
      });
      const metadata = await s3Client.send(headCommand);
      fileSize = metadata.ContentLength || 0;
    } catch (err) {
      logger.warn('Could not get file size:', err.message);
    }

    // Generate presigned URL for download (valid for 1 hour)
    // This URL allows direct download from S3 without going through backend
    // Works for files of any size - no size limit
    const command = new GetObjectCommand({
      Bucket: storageConfig.bucket_name,
      Key: fullPath,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600 // 1 hour
    });

    // Record download in history
    try {
      // Get file_id if it exists in our database
      const [files] = await pool.query(
        'SELECT id FROM files WHERE client_id = ? AND path = ? AND deleted_at IS NULL LIMIT 1',
        [storageConfig.client_id, filePath]
      );
      
      const fileId = files.length > 0 ? files[0].id : null;
      
      await pool.query(
        `INSERT INTO download_history 
         (client_id, file_id, file_name, file_size_bytes, status, ip_address, user_agent, downloaded_at)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, NOW())`,
        [
          storageConfig.client_id,
          fileId,
          fileName,
          fileSize,
          req.ip || req.connection.remoteAddress,
          req.headers['user-agent'] || null
        ]
      );
    } catch (err) {
      logger.error('Error recording download history:', err);
      // Don't fail the download if history recording fails
    }

    res.json({
      success: true,
      data: {
        downloadUrl,
        expiresIn: 3600,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        filePath: filePath,
        fileName: fileName,
        fileSize: fileSize,
        fileSizeMb: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
        message: 'Direct download URL generated. File will be downloaded directly from storage without size limits.'
      }
    });
  } catch (error) {
    logger.error('Error generating download URL:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'DOWNLOAD_ERROR', 
        message: 'Failed to generate download URL',
        details: error.message 
      }
    });
  }
};

/**
 * Delete file from S3 bucket
 */
export const deleteFile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'MISSING_FILE_PATH', 
          message: 'File path is required' 
        }
      });
    }

    // Get client's storage config from database
    const [clients] = await pool.query(
      `SELECT c.id as client_id, csc.*
       FROM clients c
       LEFT JOIN client_storage_config csc ON c.id = csc.client_id
       WHERE c.user_id = ?`,
      [userId]
    );

    if (clients.length === 0 || !clients[0].client_id) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'CLIENT_NOT_FOUND', 
          message: 'Client profile not found' 
        }
      });
    }

    const storageConfig = clients[0];
    
    if (!storageConfig.bucket_name) {
      return res.status(404).json({
        success: false,
        error: { 
          code: 'NO_STORAGE_CONFIG', 
          message: 'Storage not configured for this client' 
        }
      });
    }

    // Create S3 client
    const s3Client = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      credentials: {
        accessKeyId: storageConfig.access_key_id,
        secretAccessKey: storageConfig.secret_access_key,
      },
      forcePathStyle: true,
    });

    const bucketPrefix = storageConfig.bucket_prefix || '';
    const fullPath = bucketPrefix + filePath;

    // Delete the file from S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: storageConfig.bucket_name,
      Key: fullPath,
    });

    await s3Client.send(deleteCommand);

    // Mark file as deleted in database if it exists
    try {
      await pool.query(
        'UPDATE files SET deleted_at = NOW() WHERE client_id = ? AND path = ?',
        [storageConfig.client_id, filePath]
      );
    } catch (dbError) {
      // Log but don't fail if database update fails
      logger.warn('Failed to update file deletion in database:', dbError);
    }

    logger.info(`File deleted: ${filePath} for client ${storageConfig.client_id}`);

    res.json({
      success: true,
      message: 'File deleted successfully',
      data: {
        filePath: filePath
      }
    });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'DELETE_ERROR', 
        message: 'Failed to delete file',
        details: error.message 
      }
    });
  }
};
