import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import s3Service from '../services/s3.service.js';
import logger from '../utils/logger.js';
import { S3Client, ListObjectsV2Command, ListObjectVersionsCommand } from '@aws-sdk/client-s3';

/**
 * Get all clients with pagination and filters
 */
export const getClients = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM v_client_stats
      WHERE 1=1
    `;
    const params = [];

    // Filter by status
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    // Search by name, email, or company
    if (search) {
      query += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Count total for pagination
    const countQuery = query.replace('SELECT * FROM', 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // Add pagination
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [clients] = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        clients,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message
    });
  }
};

/**
 * Get single client details
 */
export const getClientById = async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get client details
    const [clients] = await pool.query(
      'SELECT * FROM v_client_stats WHERE id = ?',
      [clientId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get storage config (without secrets)
    const [storageConfigs] = await pool.query(
      `SELECT id, client_id, bucket_name, endpoint, region, bucket_prefix, 
              is_verified, last_verified_at, created_at, updated_at
       FROM client_storage_config WHERE client_id = ?`,
      [clientId]
    );

    // Get recent activity
    const [recentActivity] = await pool.query(
      `SELECT action, details, created_at 
       FROM activity_logs 
       WHERE resource_id = ? OR user_id IN (
         SELECT user_id FROM clients WHERE id = ?
       )
       ORDER BY created_at DESC LIMIT 10`,
      [clientId, clientId]
    );

    // Get download count
    const [downloadStats] = await pool.query(
      `SELECT COUNT(*) as totalDownloads
       FROM download_history WHERE client_id = ?`,
      [clientId]
    );

    res.json({
      success: true,
      data: {
        client: clients[0],
        storageConfig: storageConfigs[0] || null,
        stats: {
          storageUsedPercent: clients[0].storage_used_percent,
          egressUsedPercent: clients[0].egress_used_percent,
          chargeableEgressGb: clients[0].chargeable_egress_gb,
          filesCount: clients[0].files_count,
          foldersCount: clients[0].folders_count,
          totalDownloads: downloadStats[0].totalDownloads,
          recentActivity: recentActivity.map(a => ({
            action: a.action,
            details: a.details,
            timestamp: a.created_at
          }))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client details',
      error: error.message
    });
  }
};

/**
 * Create new client with storage configuration
 */
export const createClient = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      name,
      email,
      password,
      company,
      storageQuotaGb = 100,
      egressFreeLimitGb = 2048,
      storageConfig
    } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if email already exists
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Create user
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await connection.query(
      `INSERT INTO users (id, email, password_hash, name, email_verified)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, name, true]
    );

    // Assign client role
    await connection.query(
      'INSERT INTO user_roles (user_id, role) VALUES (?, ?)',
      [userId, 'client']
    );

    // Create client record
    const clientId = uuidv4();
    await connection.query(
      `INSERT INTO clients (id, user_id, name, email, company, storage_quota_gb, egress_free_limit_gb)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clientId, userId, name, email, company, storageQuotaGb, egressFreeLimitGb]
    );

    // If storage config provided, create it
    if (storageConfig) {
      const { bucketName, endpoint, region, accessKeyId, secretAccessKey, bucketPrefix } = storageConfig;

      if (!bucketName || !endpoint || !region || !accessKeyId || !secretAccessKey) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Incomplete storage configuration'
        });
      }

      // Verify storage config
      const isValid = await s3Service.verifyStorageConfig(
        bucketName,
        endpoint,
        region,
        accessKeyId,
        secretAccessKey
      );

      await connection.query(
        `INSERT INTO client_storage_config 
         (client_id, bucket_name, endpoint, region, access_key_id, secret_access_key, bucket_prefix, is_verified, last_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [clientId, bucketName, endpoint, region, accessKeyId, secretAccessKey, bucketPrefix || '', isValid]
      );
    }

    await connection.commit();

    // Fetch created client
    const [newClient] = await pool.query(
      'SELECT * FROM v_client_stats WHERE id = ?',
      [clientId]
    );

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: {
        client: newClient[0]
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('Error creating client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create client',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * Update client details and storage configuration
 */
export const updateClient = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { clientId } = req.params;
    const {
      name,
      company,
      storageQuotaGb,
      egressFreeLimitGb,
      status,
      storageConfig
    } = req.body;

    // Check if client exists
    const [clients] = await connection.query(
      'SELECT id, name FROM clients WHERE id = ?',
      [clientId]
    );

    if (clients.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    if (company !== undefined) {
      updates.push('company = ?');
      params.push(company);
    }
    if (storageQuotaGb) {
      updates.push('storage_quota_gb = ?');
      params.push(storageQuotaGb);
    }
    if (egressFreeLimitGb) {
      updates.push('egress_free_limit_gb = ?');
      params.push(egressFreeLimitGb);
    }
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length > 0) {
      params.push(clientId);
      await connection.query(
        `UPDATE clients SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        params
      );
    }

    // Update storage config if provided
    if (storageConfig) {
      const { bucketName, endpoint, region, accessKeyId, secretAccessKey, bucketPrefix } = storageConfig;

      // Check if storage config exists
      const [existingConfig] = await connection.query(
        'SELECT id FROM client_storage_config WHERE client_id = ?',
        [clientId]
      );

      if (existingConfig.length > 0) {
        // Update existing config
        const configUpdates = [];
        const configParams = [];

        if (bucketName) {
          configUpdates.push('bucket_name = ?');
          configParams.push(bucketName);
        }
        if (endpoint) {
          configUpdates.push('endpoint = ?');
          configParams.push(endpoint);
        }
        if (region) {
          configUpdates.push('region = ?');
          configParams.push(region);
        }
        if (accessKeyId) {
          configUpdates.push('access_key_id = ?');
          configParams.push(accessKeyId);
        }
        if (secretAccessKey) {
          configUpdates.push('secret_access_key = ?');
          configParams.push(secretAccessKey);
        }
        if (bucketPrefix !== undefined) {
          configUpdates.push('bucket_prefix = ?');
          configParams.push(bucketPrefix);
        }

        if (configUpdates.length > 0) {
          // Verify new config
          const testConfig = {
            bucket_name: bucketName || existingConfig[0].bucket_name,
            endpoint: endpoint || existingConfig[0].endpoint,
            region: region || existingConfig[0].region,
            access_key_id: accessKeyId || existingConfig[0].access_key_id,
            secret_access_key: secretAccessKey || existingConfig[0].secret_access_key
          };

          const isValid = await s3Service.testConnection(testConfig);
          
          configUpdates.push('is_verified = ?', 'last_verified_at = NOW()');
          configParams.push(isValid, clientId);

          await connection.query(
            `UPDATE client_storage_config SET ${configUpdates.join(', ')} WHERE client_id = ?`,
            configParams
          );
        }
      } else {
        // Create new config
        if (!bucketName || !endpoint || !region || !accessKeyId || !secretAccessKey) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: 'Incomplete storage configuration'
          });
        }

        const isValid = await s3Service.verifyStorageConfig(
          bucketName, endpoint, region, accessKeyId, secretAccessKey
        );

        await connection.query(
          `INSERT INTO client_storage_config 
           (client_id, bucket_name, endpoint, region, access_key_id, secret_access_key, bucket_prefix, is_verified, last_verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [clientId, bucketName, endpoint, region, accessKeyId, secretAccessKey, bucketPrefix || '', isValid]
        );
      }
    }

    await connection.commit();

    // Fetch updated client
    const [updatedClient] = await pool.query(
      'SELECT * FROM v_client_stats WHERE id = ?',
      [clientId]
    );

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: {
        client: updatedClient[0]
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('Error updating client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update client',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * Delete client and all associated data
 */
export const deleteClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    // Check if client exists
    const [clients] = await pool.query(
      'SELECT name, user_id FROM clients WHERE id = ?',
      [clientId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const clientName = clients[0].name;
    const userId = clients[0].user_id;

    // Delete user (cascade will delete client and all related data)
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete client',
      error: error.message
    });
  }
};

/**
 * Get admin dashboard statistics
 */
export const getSystemStats = async (req, res) => {
  try {
    // Total clients
    const [clientStats] = await pool.query(`
      SELECT 
        COUNT(*) as totalClients,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeClients,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspendedClients,
        SUM(storage_used_gb) as totalStorageUsed,
        SUM(storage_quota_gb) as totalStorageQuota
      FROM clients
    `);

    // Total egress this month
    const [egressStats] = await pool.query(`
      SELECT COALESCE(SUM(egress_used_gb), 0) as totalEgressThisMonth
      FROM egress_usage
      WHERE month_year = DATE_FORMAT(NOW(), '%Y-%m')
    `);

    // Total files
    const [fileStats] = await pool.query(`
      SELECT COUNT(*) as totalFiles
      FROM files
      WHERE deleted_at IS NULL AND type = 'file'
    `);

    // Recent clients
    const [recentClients] = await pool.query(`
      SELECT id, name, email, company, created_at
      FROM clients
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Storage alerts
    const [storageAlerts] = await pool.query(`
      SELECT 
        a.id,
        a.client_id,
        c.name as clientName,
        a.alert_type,
        a.message,
        a.created_at
      FROM alerts a
      JOIN clients c ON a.client_id = c.id
      WHERE a.alert_type IN ('storage_warning', 'storage_limit')
        AND a.is_read = FALSE
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    // Egress alerts
    const [egressAlerts] = await pool.query(`
      SELECT 
        a.id,
        a.client_id,
        c.name as clientName,
        a.alert_type,
        a.message,
        a.created_at
      FROM alerts a
      JOIN clients c ON a.client_id = c.id
      WHERE a.alert_type IN ('egress_warning', 'egress_limit')
        AND a.is_read = FALSE
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        totalClients: clientStats[0].totalClients,
        activeClients: clientStats[0].activeClients,
        suspendedClients: clientStats[0].suspendedClients,
        totalStorageUsedGb: parseFloat(clientStats[0].totalStorageUsed || 0),
        totalStorageQuotaGb: parseFloat(clientStats[0].totalStorageQuota || 0),
        totalEgressThisMonthGb: parseFloat(egressStats[0].totalEgressThisMonth || 0),
        totalFiles: fileStats[0].totalFiles,
        recentClients,
        storageAlerts,
        egressAlerts
      }
    });
  } catch (error) {
    logger.error('Error fetching system stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system statistics',
      error: error.message
    });
  }
};

/**
 * Get activity logs with filters
 */
export const getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, clientId, action, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        al.*,
        c.name as clientName
      FROM activity_logs al
      LEFT JOIN clients c ON al.resource_id = c.id AND al.resource_type = 'client'
      WHERE 1=1
    `;
    const params = [];

    // Filter by client
    if (clientId) {
      query += ` AND (al.resource_id = ? OR al.user_id IN (SELECT user_id FROM clients WHERE id = ?))`;
      params.push(clientId, clientId);
    }

    // Filter by action
    if (action) {
      query += ` AND al.action = ?`;
      params.push(action);
    }

    // Filter by date range
    if (startDate) {
      query += ` AND DATE(al.created_at) >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(al.created_at) <= ?`;
      params.push(endDate);
    }

    // Count total
    const countQuery = query.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // Add pagination
    query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [logs] = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs',
      error: error.message
    });
  }
};

/**
 * Suspend or activate client
 */
export const toggleClientStatus = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status } = req.body; // 'active' or 'suspended'

    if (!status || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "suspended"'
      });
    }

    // Check if client exists
    const [clients] = await pool.query(
      'SELECT name FROM clients WHERE id = ?',
      [clientId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Update status
    await pool.query(
      'UPDATE clients SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, clientId]
    );

    res.json({
      success: true,
      message: `Client ${status === 'suspended' ? 'suspended' : 'activated'} successfully`
    });
  } catch (error) {
    logger.error('Error toggling client status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update client status',
      error: error.message
    });
  }
};

/**
 * Reset client password
 */
export const resetClientPassword = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Get client's user_id
    const [clients] = await pool.query(
      'SELECT user_id, name, email FROM clients WHERE id = ?',
      [clientId]
    );

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const { user_id, name, email } = clients[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [passwordHash, user_id]
    );

    // Invalidate all existing sessions for this user
    await pool.query(
      'DELETE FROM user_sessions WHERE user_id = ?',
      [user_id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. All active sessions have been terminated.',
      data: {
        clientName: name,
        email: email
      }
    });
  } catch (error) {
    logger.error('Error resetting client password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};

/**
 * Get client's S3 storage statistics (for admin)
 */
export const getClientStorageStats = async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Get client's storage config from database
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

    const activeStorage = activeFiles.reduce((sum, file) => sum + (file.Size || 0), 0);
    const totalObjects = activeFiles.length;
    
    // Get deleted objects (versions with DeleteMarker)
    let deletedStorage = 0;
    let deletedObjects = 0;
    
    try {
      let versionToken = undefined;
      do {
        const versionsCommand = new ListObjectVersionsCommand({
          Bucket: storageConfig.bucket_name,
          Prefix: prefix,
          KeyMarker: versionToken,
        });
        
        const versionsResponse = await s3Client.send(versionsCommand);
        deletedObjects += (versionsResponse.DeleteMarkers || []).length;
        
        for (const version of (versionsResponse.Versions || [])) {
          if (version.IsLatest === false) {
            deletedStorage += version.Size || 0;
          }
        }
        
        versionToken = versionsResponse.IsTruncated ? versionsResponse.NextKeyMarker : undefined;
      } while (versionToken);
    } catch (err) {
      logger.info('Versioning not enabled for client bucket:', err.message);
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

    // Convert fileTypes to array
    const fileTypesArray = Object.entries(fileTypes).map(([ext, data]) => ({
      extension: ext,
      count: data.count,
      size: data.size,
      sizeGb: parseFloat((data.size / (1024 ** 3)).toFixed(4)),
      sizeMb: parseFloat((data.size / (1024 ** 2)).toFixed(2))
    })).sort((a, b) => b.size - a.size);

    res.json({
      success: true,
      data: {
        clientId,
        activeStorage,
        activeStorageGb: parseFloat((activeStorage / (1024 ** 3)).toFixed(4)),
        activeStorageMb: parseFloat((activeStorage / (1024 ** 2)).toFixed(2)),
        deletedStorage,
        deletedStorageGb: parseFloat((deletedStorage / (1024 ** 3)).toFixed(4)),
        deletedStorageMb: parseFloat((deletedStorage / (1024 ** 2)).toFixed(2)),
        totalStorage: activeStorage + deletedStorage,
        totalStorageGb: parseFloat(((activeStorage + deletedStorage) / (1024 ** 3)).toFixed(4)),
        totalObjects,
        deletedObjects,
        fileTypes: fileTypesArray,
        lastUpdated: new Date().toISOString(),
      }
    });
  } catch (error) {
    logger.error('Error fetching client storage stats:', error);
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
