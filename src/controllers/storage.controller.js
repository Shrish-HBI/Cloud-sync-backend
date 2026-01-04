import { S3Client, ListObjectsV2Command, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Get storage statistics from S3 - calculates active and deleted storage
 */
export const getStorageStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get client's storage config and quota from database
    const [clients] = await pool.query(
      `SELECT c.id as client_id, c.storage_quota_gb, csc.*
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

    const prefix = storageConfig.bucket_prefix || '';
    
    // Get active objects
    let activeFiles = [];
    let continuationToken = undefined;
    
    do {
      const command = new ListObjectsV2Command({
        Bucket: storageConfig.bucket_name,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      
      const response = await s3Client.send(command);
      activeFiles = activeFiles.concat(response.Contents || []);
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    // Calculate active storage stats
    const activeStorage = activeFiles.reduce((sum, file) => sum + (file.Size || 0), 0);
    const totalObjects = activeFiles.length;
    
    // Get deleted objects (versions with DeleteMarker)
    let deletedStorage = 0;
    let deletedObjects = 0;
    let versionToken = undefined;
    
    try {
      do {
        const versionsCommand = new ListObjectVersionsCommand({
          Bucket: storageConfig.bucket_name,
          Prefix: prefix,
          KeyMarker: versionToken,
        });
        
        const versionsResponse = await s3Client.send(versionsCommand);
        
        // Count delete markers and their associated versions
        const deleteMarkers = versionsResponse.DeleteMarkers || [];
        deletedObjects += deleteMarkers.length;
        
        // Sum up sizes of deleted versions
        const versions = versionsResponse.Versions || [];
        for (const version of versions) {
          if (version.IsLatest === false) {
            deletedStorage += version.Size || 0;
          }
        }
        
        versionToken = versionsResponse.IsTruncated ? versionsResponse.NextKeyMarker : undefined;
      } while (versionToken);
    } catch (err) {
      // Versioning might not be enabled, that's okay
      logger.info('Versioning not enabled or error:', err.message);
    }

    // Calculate file type breakdown
    const fileTypes = {};
    for (const file of activeFiles) {
      const ext = file.Key?.split('.').pop()?.toLowerCase() || 'unknown';
      if (!fileTypes[ext]) {
        fileTypes[ext] = { count: 0, size: 0 };
      }
      fileTypes[ext].count++;
      fileTypes[ext].size += file.Size || 0;
    }

    // Convert fileTypes object to array for better frontend consumption
    const fileTypesArray = Object.entries(fileTypes).map(([ext, data]) => ({
      extension: ext,
      count: data.count,
      size: data.size,
      sizeGb: data.size / (1024 ** 3),
      sizeMb: data.size / (1024 ** 2)
    })).sort((a, b) => b.size - a.size); // Sort by size descending

    const storageQuotaGb = parseFloat(storageConfig.storage_quota_gb || 0);
    const totalStorageGb = parseFloat(((activeStorage + deletedStorage) / (1024 ** 3)).toFixed(4));
    const usagePercentage = storageQuotaGb > 0 ? parseFloat(((totalStorageGb / storageQuotaGb) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      data: {
        activeStorage: activeStorage,           // bytes
        activeStorageGb: parseFloat((activeStorage / (1024 ** 3)).toFixed(4)),
        activeStorageMb: parseFloat((activeStorage / (1024 ** 2)).toFixed(2)),
        deletedStorage: deletedStorage,         // bytes
        deletedStorageGb: parseFloat((deletedStorage / (1024 ** 3)).toFixed(4)),
        deletedStorageMb: parseFloat((deletedStorage / (1024 ** 2)).toFixed(2)),
        totalStorage: activeStorage + deletedStorage, // bytes
        totalStorageGb: totalStorageGb,
        storageQuotaGb: storageQuotaGb,
        usagePercentage: usagePercentage,
        totalObjects: totalObjects,
        deletedObjects: deletedObjects,
        fileTypes: fileTypesArray,
        lastUpdated: new Date().toISOString(),
      }
    });
  } catch (error) {
    logger.error('Error fetching storage stats:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'STORAGE_ERROR', 
        message: 'Failed to fetch storage statistics',
        details: error.message 
      }
    });
  }
};
