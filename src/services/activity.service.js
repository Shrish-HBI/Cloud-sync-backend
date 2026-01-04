import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';

class ActivityService {
  /**
   * Log activity
   */
  async logActivity({
    userId,
    userName,
    userRole,
    action,
    details,
    resourceType = null,
    resourceId = null,
    ipAddress = null,
    userAgent = null,
    metadata = {}
  }) {
    try {
      await query(
        `INSERT INTO activity_logs 
        (user_id, user_name, user_role, action, details, resource_type, resource_id, ip_address, user_agent, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          userName,
          userRole,
          action,
          details,
          resourceType,
          resourceId,
          ipAddress,
          userAgent,
          JSON.stringify(metadata)
        ]
      );

      logger.info(`Activity logged: ${action} by ${userName}`);
    } catch (error) {
      logger.error('Error logging activity:', error);
      // Don't throw - logging failure shouldn't break the main operation
    }
  }

  /**
   * Get activity logs with filtering
   */
  async getActivityLogs({ userId, action, resourceType, fromDate, toDate, limit = 50, offset = 0 }) {
    try {
      let whereClauses = [];
      let params = [];

      if (userId) {
        whereClauses.push('user_id = ?');
        params.push(userId);
      }

      if (action) {
        whereClauses.push('action = ?');
        params.push(action);
      }

      if (resourceType) {
        whereClauses.push('resource_type = ?');
        params.push(resourceType);
      }

      if (fromDate) {
        whereClauses.push('created_at >= ?');
        params.push(fromDate);
      }

      if (toDate) {
        whereClauses.push('created_at <= ?');
        params.push(toDate);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) as total FROM activity_logs ${whereClause}`,
        params
      );
      const total = countResult[0].total;

      // Get logs
      const logs = await query(
        `SELECT * FROM activity_logs ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return {
        logs,
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error getting activity logs:', error);
      throw error;
    }
  }
}

export default new ActivityService();
