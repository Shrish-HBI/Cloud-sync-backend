import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import activityService from '../services/activity.service.js';
import logger from '../utils/logger.js';

class ClientController {
  /**
   * Get client dashboard stats
   */
  async getDashboardStats(req, res, next) {
    try {
      const userId = req.user.id;

      // Get client info
      const clients = await query(
        `SELECT * FROM v_client_stats WHERE user_id = ?`,
        [userId]
      );

      if (clients.length === 0) {
        throw new AppError('Client not found', 404, 'CLIENT_NOT_FOUND');
      }

      const client = clients[0];

      // Get recent activity
      const recentActivity = await query(
        `SELECT * FROM activity_logs 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [userId]
      );

      // Get unread alerts
      const alerts = await query(
        `SELECT * FROM alerts 
         WHERE client_id = ? AND is_read = FALSE
         ORDER BY created_at DESC`,
        [client.id]
      );

      res.json({
        success: true,
        data: {
          stats: {
            storageQuotaGb: parseFloat(client.storage_quota_gb),
            storageUsedGb: parseFloat(client.storage_used_gb),
            storageUsedPercent: parseFloat(client.storage_used_percent),
            egressUsedGb: parseFloat(client.egress_used_gb),
            egressFreeLimitGb: parseFloat(client.egress_free_limit_gb),
            egressUsedPercent: parseFloat(client.egress_used_percent),
            chargeableEgressGb: Math.max(0, parseFloat(client.chargeable_egress_gb)),
            filesCount: parseInt(client.files_count),
            foldersCount: parseInt(client.folders_count),
            status: client.status
          },
          recentActivity,
          alerts
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get client alerts
   */
  async getAlerts(req, res, next) {
    try {
      const userId = req.user.id;

      // Get client ID
      const clients = await query('SELECT id FROM clients WHERE user_id = ?', [userId]);
      
      if (clients.length === 0) {
        throw new AppError('Client not found', 404, 'CLIENT_NOT_FOUND');
      }

      const alerts = await query(
        `SELECT * FROM alerts 
         WHERE client_id = ? 
         ORDER BY created_at DESC`,
        [clients[0].id]
      );

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark alert as read
   */
  async markAlertRead(req, res, next) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      // Verify alert belongs to user
      const alerts = await query(
        `SELECT a.* FROM alerts a
         JOIN clients c ON a.client_id = c.id
         WHERE a.id = ? AND c.user_id = ?`,
        [alertId, userId]
      );

      if (alerts.length === 0) {
        throw new AppError('Alert not found', 404, 'ALERT_NOT_FOUND');
      }

      await query('UPDATE alerts SET is_read = TRUE WHERE id = ?', [alertId]);

      res.json({
        success: true,
        message: 'Alert marked as read'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(req, res, next) {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      // Verify alert belongs to user
      const alerts = await query(
        `SELECT a.* FROM alerts a
         JOIN clients c ON a.client_id = c.id
         WHERE a.id = ? AND c.user_id = ?`,
        [alertId, userId]
      );

      if (alerts.length === 0) {
        throw new AppError('Alert not found', 404, 'ALERT_NOT_FOUND');
      }

      await query('UPDATE alerts SET is_dismissed = TRUE WHERE id = ?', [alertId]);

      res.json({
        success: true,
        message: 'Alert dismissed'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get download history
   */
  async getDownloads(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;

      // Get client ID
      const clients = await query('SELECT id FROM clients WHERE user_id = ?', [userId]);
      
      if (clients.length === 0) {
        throw new AppError('Client not found', 404, 'CLIENT_NOT_FOUND');
      }

      const clientId = clients[0].id;

      const parsedLimit = parseInt(limit);
      const parsedOffset = parseInt(offset);

      // Get download history
      const downloads = await query(
        `SELECT 
          dh.id,
          dh.file_id,
          dh.file_name,
          dh.file_size_bytes,
          dh.downloaded_at,
          dh.ip_address,
          dh.status,
          f.path as file_path
         FROM download_history dh
         LEFT JOIN files f ON dh.file_id = f.id
         WHERE dh.client_id = ?
         ORDER BY dh.downloaded_at DESC
         LIMIT ${parsedLimit} OFFSET ${parsedOffset}`,
        [clientId]
      );

      // Get total count
      const countResult = await query(
        'SELECT COUNT(*) as total FROM download_history WHERE client_id = ?',
        [clientId]
      );

      res.json({
        success: true,
        data: {
          downloads: downloads.map(d => ({
            id: d.id,
            fileId: d.file_id,
            fileName: d.file_name,
            filePath: d.file_path,
            fileSizeBytes: d.file_size_bytes,
            fileSizeMb: parseFloat((d.file_size_bytes / (1024 * 1024)).toFixed(2)),
            status: d.status,
            downloadedAt: d.downloaded_at,
            ipAddress: d.ip_address
          })),
          total: countResult[0].total,
          limit: parsedLimit,
          offset: parsedOffset
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ClientController();
