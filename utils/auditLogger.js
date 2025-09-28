const { Audit } = require('../models');

/**
 * Audit Logger Utility
 * Provides comprehensive logging for all system activities
 */
class AuditLogger {
  /**
   * Log an audit event
   * @param {Object} options - Audit options
   * @param {number} options.userId - User ID who performed the action
   * @param {string} options.action - Action performed
   * @param {string} options.entityType - Type of entity affected
   * @param {number} options.entityId - ID of affected entity
   * @param {Object} options.oldValues - Previous values
   * @param {Object} options.newValues - New values
   * @param {string} options.ipAddress - IP address
   * @param {string} options.userAgent - User agent
   * @param {string} options.sessionId - Session ID
   * @param {string} options.severity - Severity level
   * @param {string} options.category - Event category
   * @param {string} options.description - Human-readable description
   * @param {Object} options.metadata - Additional metadata
   * @param {boolean} options.isSuccessful - Whether action was successful
   * @param {string} options.errorMessage - Error message if failed
   */
  static async log(options) {
    try {
      // Validate input parameters
      if (!options || typeof options !== 'object') {
        console.error('❌ AuditLogger: Invalid options parameter');
        return;
      }

      const {
        userId = null,
        action,
        entityType,
        entityId = null,
        oldValues = null,
        newValues = null,
        ipAddress = null,
        userAgent = null,
        sessionId = null,
        severity = 'low',
        category = 'data_modification',
        description = null,
        metadata = null,
        isSuccessful = true,
        errorMessage = null
      } = options;

      // Validate required fields
      if (!action || typeof action !== 'string') {
        console.error('❌ AuditLogger: Missing or invalid action field');
        return;
      }

      if (!entityType || typeof entityType !== 'string') {
        console.error('❌ AuditLogger: Missing or invalid entityType field');
        return;
      }

      // Validate severity and category
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      const validCategories = ['authentication', 'authorization', 'data_access', 'data_modification', 'system', 'security'];

      if (!validSeverities.includes(severity)) {
        console.error('❌ AuditLogger: Invalid severity level:', severity);
        return;
      }

      if (!validCategories.includes(category)) {
        console.error('❌ AuditLogger: Invalid category:', category);
        return;
      }

      // Sanitize and validate data
      const sanitizedMetadata = this.sanitizeMetadata(metadata);
      const sanitizedDescription = this.sanitizeDescription(description);
      const sanitizedErrorMessage = this.sanitizeErrorMessage(errorMessage);

      // Create audit record
      const auditRecord = await Audit.create({
        userId: userId ? parseInt(userId) : null,
        action: action.trim(),
        entityType: entityType.trim(),
        entityId: entityId ? parseInt(entityId) : null,
        oldValues: this.sanitizeValues(oldValues),
        newValues: this.sanitizeValues(newValues),
        ipAddress: ipAddress ? ipAddress.toString().substring(0, 45) : null,
        userAgent: userAgent ? userAgent.toString().substring(0, 500) : null,
        sessionId: sessionId ? sessionId.toString().substring(0, 255) : null,
        severity,
        category,
        description: sanitizedDescription,
        metadata: sanitizedMetadata,
        isSuccessful: Boolean(isSuccessful),
        errorMessage: sanitizedErrorMessage
      });

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 AUDIT: ${action} on ${entityType}${entityId ? ` (ID: ${entityId})` : ''} by User ${userId || 'System'} - ${severity.toUpperCase()}`);
      }

      return auditRecord;
    } catch (error) {
      console.error('❌ AuditLogger: Failed to log audit event:', {
        error: error.message,
        stack: error.stack,
        options: JSON.stringify(options, null, 2),
        timestamp: new Date().toISOString()
      });

      // Don't throw the error to prevent breaking the main application flow
      return null;
    }
  }

  /**
   * Sanitize metadata object
   */
  static sanitizeMetadata(metadata) {
    try {
      if (!metadata) return null;
      
      if (typeof metadata !== 'object') {
        return { original: metadata.toString() };
      }

      // Remove sensitive information
      const sanitized = { ...metadata };
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
      
      sensitiveKeys.forEach(key => {
        if (sanitized[key]) {
          sanitized[key] = '[REDACTED]';
        }
      });

      return sanitized;
    } catch (error) {
      console.error('❌ Error sanitizing metadata:', error);
      return { error: 'Failed to sanitize metadata' };
    }
  }

  /**
   * Sanitize description
   */
  static sanitizeDescription(description) {
    try {
      if (!description) return null;
      
      const sanitized = description.toString().trim();
      return sanitized.length > 1000 ? sanitized.substring(0, 1000) + '...' : sanitized;
    } catch (error) {
      console.error('❌ Error sanitizing description:', error);
      return 'Description sanitization failed';
    }
  }

  /**
   * Sanitize error message
   */
  static sanitizeErrorMessage(errorMessage) {
    try {
      if (!errorMessage) return null;
      
      const sanitized = errorMessage.toString().trim();
      return sanitized.length > 500 ? sanitized.substring(0, 500) + '...' : sanitized;
    } catch (error) {
      console.error('❌ Error sanitizing error message:', error);
      return 'Error message sanitization failed';
    }
  }

  /**
   * Sanitize values (oldValues/newValues)
   */
  static sanitizeValues(values) {
    try {
      if (!values) return null;
      
      if (typeof values !== 'object') {
        return { value: values.toString() };
      }

      // Remove sensitive fields
      const sanitized = { ...values };
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
      
      sensitiveFields.forEach(field => {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      });

      return sanitized;
    } catch (error) {
      console.error('❌ Error sanitizing values:', error);
      return { error: 'Failed to sanitize values' };
    }
  }

  /**
   * Log authentication events
   */
  static async logAuth(userId, action, isSuccessful = true, errorMessage = null, req = null) {
    try {
      const metadata = {
        timestamp: new Date().toISOString(),
        userAgent: req?.headers?.['user-agent'] || null,
        ipAddress: req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || null
      };

      await this.log({
        userId,
        action,
        entityType: 'user',
        entityId: userId,
        category: 'authentication',
        severity: isSuccessful ? 'low' : 'medium',
        description: `${action} ${isSuccessful ? 'successful' : 'failed'} for user ${userId || 'unknown'}`,
        isSuccessful,
        errorMessage,
        metadata,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      });
    } catch (error) {
      console.error('❌ Error logging authentication event:', {
        error: error.message,
        userId,
        action,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log data access events
   */
  static async logDataAccess(userId, entityType, entityId = null, action = 'read', req = null) {
    try {
      await this.log({
        userId,
        action,
        entityType,
        entityId,
        category: 'data_access',
        severity: 'low',
        description: `${action} access to ${entityType}${entityId ? ` (ID: ${entityId})` : ''}`,
        ipAddress: req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || null,
        userAgent: req?.headers?.['user-agent'] || null
      });
    } catch (error) {
      console.error('❌ Error logging data access event:', {
        error: error.message,
        userId,
        entityType,
        action,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log data modification events
   */
  static async logDataModification(userId, entityType, entityId, action, oldValues = null, newValues = null, req = null) {
    try {
      await this.log({
        userId,
        action,
        entityType,
        entityId,
        oldValues,
        newValues,
        category: 'data_modification',
        severity: 'medium',
        description: `${action} ${entityType} (ID: ${entityId})`,
        ipAddress: req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || null,
        userAgent: req?.headers?.['user-agent'] || null
      });
    } catch (error) {
      console.error('❌ Error logging data modification event:', {
        error: error.message,
        userId,
        entityType,
        entityId,
        action,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log security events
   */
  static async logSecurity(userId, action, description, severity = 'medium', req = null) {
    try {
      await this.log({
        userId,
        action,
        entityType: 'security',
        category: 'security',
        severity,
        description,
        ipAddress: req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || null,
        userAgent: req?.headers?.['user-agent'] || null
      });
    } catch (error) {
      console.error('❌ Error logging security event:', {
        error: error.message,
        userId,
        action,
        description,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log system events
   */
  static async logSystem(action, description, severity = 'low', metadata = null) {
    try {
      await this.log({
        action,
        entityType: 'system',
        category: 'system',
        severity,
        description,
        metadata
      });
    } catch (error) {
      console.error('❌ Error logging system event:', {
        error: error.message,
        action,
        description,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Log authorization events
   */
  static async logAuthorization(userId, action, resource, isSuccessful = true, req = null) {
    try {
      await this.log({
        userId,
        action,
        entityType: 'authorization',
        category: 'authorization',
        severity: isSuccessful ? 'low' : 'high',
        description: `${action} ${isSuccessful ? 'granted' : 'denied'} for resource: ${resource}`,
        isSuccessful,
        ipAddress: req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for'] || null,
        userAgent: req?.headers?.['user-agent'] || null
      });
    } catch (error) {
      console.error('❌ Error logging authorization event:', {
        error: error.message,
        userId,
        action,
        resource,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get audit logs with filtering
   */
  static async getAuditLogs(filters = {}) {
    try {
      const {
        userId = null,
        action = null,
        entityType = null,
        category = null,
        severity = null,
        startDate = null,
        endDate = null,
        search = null,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        limit = 100,
        offset = 0
      } = filters;

      // Validate and sanitize filters
      const validatedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 1000);
      const validatedOffset = Math.max(parseInt(offset) || 0, 0);

      const whereClause = {};
      
      if (userId) whereClause.userId = parseInt(userId);
      if (action) whereClause.action = { [require('sequelize').Op.iLike]: `%${action}%` };
      if (entityType) whereClause.entityType = entityType;
      if (category) whereClause.category = category;
      if (severity) whereClause.severity = severity;
      
      // Add search functionality
      if (search) {
        whereClause[require('sequelize').Op.or] = [
          { action: { [require('sequelize').Op.iLike]: `%${search}%` } },
          { entityType: { [require('sequelize').Op.iLike]: `%${search}%` } },
          { description: { [require('sequelize').Op.iLike]: `%${search}%` } },
          { ipAddress: { [require('sequelize').Op.iLike]: `%${search}%` } }
        ];
      }
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          const start = new Date(startDate);
          if (!isNaN(start.getTime())) {
            whereClause.createdAt[require('sequelize').Op.gte] = start;
          }
        }
        if (endDate) {
          const end = new Date(endDate);
          if (!isNaN(end.getTime())) {
            whereClause.createdAt[require('sequelize').Op.lte] = end;
          }
        }
      }

      // Validate sort parameters
      const validSortFields = ['createdAt', 'action', 'category', 'severity', 'userId'];
      const validSortOrders = ['asc', 'desc'];
      const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const finalSortOrder = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

      return await Audit.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['id', 'employeeId', 'firstName', 'lastName', 'email']
          }
        ],
        order: [[finalSortBy, finalSortOrder.toUpperCase()]],
        limit: validatedLimit,
        offset: validatedOffset
      });
    } catch (error) {
      console.error('❌ Error getting audit logs:', {
        error: error.message,
        filters,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get real-time audit logs
   */
  static async getRealtimeLogs(lastId = 0, limit = 50) {
    try {
      const validatedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

      return await Audit.findAll({
        where: {
          id: {
            [require('sequelize').Op.gt]: parseInt(lastId) || 0
          }
        },
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['id', 'employeeId', 'firstName', 'lastName', 'email']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: validatedLimit
      });
    } catch (error) {
      console.error('❌ Error getting real-time audit logs:', {
        error: error.message,
        lastId,
        limit,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get audit statistics with enhanced grouping
   */
  static async getAuditStats(startDate = null, endDate = null, groupBy = 'day') {
    try {
      const whereClause = {};
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          const start = new Date(startDate);
          if (!isNaN(start.getTime())) {
            whereClause.createdAt[require('sequelize').Op.gte] = start;
          }
        }
        if (endDate) {
          const end = new Date(endDate);
          if (!isNaN(end.getTime())) {
            whereClause.createdAt[require('sequelize').Op.lte] = end;
          }
        }
      }

      const { Op, fn, col, literal } = require('sequelize');
      
      // Determine date grouping based on groupBy parameter
      let dateGrouping;
      switch (groupBy) {
        case 'hour':
          dateGrouping = fn('date_trunc', 'hour', col('createdAt'));
          break;
        case 'day':
          dateGrouping = fn('date_trunc', 'day', col('createdAt'));
          break;
        case 'week':
          dateGrouping = fn('date_trunc', 'week', col('createdAt'));
          break;
        case 'month':
          dateGrouping = fn('date_trunc', 'month', col('createdAt'));
          break;
        default:
          dateGrouping = fn('date_trunc', 'day', col('createdAt'));
      }

      const stats = await Audit.findAll({
        where: whereClause,
        attributes: [
          'category',
          'severity',
          'isSuccessful',
          [dateGrouping, 'dateGroup'],
          [fn('COUNT', col('id')), 'count']
        ],
        group: ['category', 'severity', 'isSuccessful', 'dateGroup'],
        order: [['dateGroup', 'ASC']],
        raw: true
      });

      // Get summary statistics
      const summary = await Audit.findAll({
        where: whereClause,
        attributes: [
          [fn('COUNT', col('id')), 'totalEvents'],
          [fn('COUNT', literal('CASE WHEN "isSuccessful" = true THEN 1 END')), 'successfulEvents'],
          [fn('COUNT', literal('CASE WHEN "isSuccessful" = false THEN 1 END')), 'failedEvents'],
          [fn('COUNT', literal('CASE WHEN "severity" IN (\'high\', \'critical\') THEN 1 END')), 'highSeverityEvents']
        ],
        raw: true
      });

      return {
        detailed: stats,
        summary: summary[0] || {
          totalEvents: 0,
          successfulEvents: 0,
          failedEvents: 0,
          highSeverityEvents: 0
        }
      };
    } catch (error) {
      console.error('❌ Error getting audit statistics:', {
        error: error.message,
        startDate,
        endDate,
        groupBy,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get security alerts and anomalies
   */
  static async getSecurityAlerts(severity = null, limit = 50) {
    try {
      const validatedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
      
      const whereClause = {
        severity: {
          [require('sequelize').Op.in]: severity ? [severity] : ['high', 'critical']
        }
      };

      // Add conditions for security-relevant events
      whereClause[require('sequelize').Op.or] = [
        { category: 'security' },
        { category: 'authentication' },
        { action: { [require('sequelize').Op.in]: ['login', 'logout', 'password_reset', 'failed_login'] } },
        { isSuccessful: false }
      ];

      const alerts = await Audit.findAll({
        where: whereClause,
        include: [
          {
            model: require('../models').User,
            as: 'user',
            attributes: ['id', 'employeeId', 'firstName', 'lastName', 'email']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: validatedLimit
      });

      // Add anomaly detection
      const anomalies = await this.detectAnomalies();

      return {
        alerts,
        anomalies,
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length
      };
    } catch (error) {
      console.error('❌ Error getting security alerts:', {
        error: error.message,
        severity,
        limit,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Detect anomalies in audit logs
   */
  static async detectAnomalies() {
    try {
      const { Op, fn, col, literal } = require('sequelize');
      
      // Get recent activity patterns
      const recentActivity = await Audit.findAll({
        where: {
          createdAt: {
            [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        attributes: [
          'userId',
          'action',
          'ipAddress',
          [fn('COUNT', col('id')), 'count']
        ],
        group: ['userId', 'action', 'ipAddress'],
        having: literal('COUNT(id) > 10'), // Suspicious if more than 10 similar actions
        raw: true
      });

      // Get failed authentication attempts
      const failedAuths = await Audit.findAll({
        where: {
          action: 'login',
          isSuccessful: false,
          createdAt: {
            [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) // Last hour
          }
        },
        attributes: [
          'userId',
          'ipAddress',
          [fn('COUNT', col('id')), 'count']
        ],
        group: ['userId', 'ipAddress'],
        having: literal('COUNT(id) > 5'), // Suspicious if more than 5 failed attempts
        raw: true
      });

      return {
        suspiciousActivity: recentActivity,
        failedAuthAttempts: failedAuths,
        totalAnomalies: recentActivity.length + failedAuths.length
      };
    } catch (error) {
      console.error('❌ Error detecting anomalies:', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return { suspiciousActivity: [], failedAuthAttempts: [], totalAnomalies: 0 };
    }
  }

  /**
   * Get a single audit log by ID with user details
   */
  static async getAuditLogById(auditId) {
    try {
      const { User } = require('../models');
      
      const auditLog = await Audit.findOne({
        where: { id: auditId },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email', 'employeeId', 'role']
          }
        ],
        raw: false
      });

      if (!auditLog) {
        return null;
      }

      // Convert to plain object and format the data
      const auditData = auditLog.get({ plain: true });
      
      // Format timestamps
      if (auditData.createdAt) {
        auditData.createdAt = auditData.createdAt.toISOString();
      }
      if (auditData.updatedAt) {
        auditData.updatedAt = auditData.updatedAt.toISOString();
      }

      // Parse JSON fields if they exist
      if (auditData.oldValues && typeof auditData.oldValues === 'string') {
        try {
          auditData.oldValues = JSON.parse(auditData.oldValues);
        } catch (e) {
          auditData.oldValues = null;
        }
      }

      if (auditData.newValues && typeof auditData.newValues === 'string') {
        try {
          auditData.newValues = JSON.parse(auditData.newValues);
        } catch (e) {
          auditData.newValues = null;
        }
      }

      if (auditData.metadata && typeof auditData.metadata === 'string') {
        try {
          auditData.metadata = JSON.parse(auditData.metadata);
        } catch (e) {
          auditData.metadata = null;
        }
      }

      return auditData;
    } catch (error) {
      console.error('❌ Error getting audit log by ID:', {
        error: error.message,
        auditId,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Clean old audit logs (retention policy)
   */
  static async cleanOldLogs(retentionDays = 365) {
    try {
      const validatedRetentionDays = Math.max(parseInt(retentionDays) || 365, 1);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - validatedRetentionDays);

      const deletedCount = await Audit.destroy({
        where: {
          createdAt: {
            [require('sequelize').Op.lt]: cutoffDate
          }
        }
      });

      console.log(`🧹 Cleaned ${deletedCount} old audit logs (older than ${validatedRetentionDays} days)`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning old audit logs:', {
        error: error.message,
        retentionDays,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}

module.exports = AuditLogger; 