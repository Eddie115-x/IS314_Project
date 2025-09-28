const express = require('express');
const { body, query, validationResult, param } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const AuditLogger = require('../utils/auditLogger');
const ExcelExporter = require('../utils/excelExport');
const { User } = require('../models');

const router = express.Router();

// All audit routes require admin authentication
router.use(authenticateToken);
router.use(authorizeRoles(['admin']));

/**
 * GET /api/audit/logs
 * Get audit logs with filtering
 */
router.get('/logs', [
  query('userId').optional().isInt().withMessage('User ID must be an integer'),
  query('action').optional().isString().withMessage('Action must be a string'),
  query('entityType').optional().isString().withMessage('Entity type must be a string'),
  query('category').optional().isIn(['authentication', 'authorization', 'data_access', 'data_modification', 'system', 'security']).withMessage('Invalid category'),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
  query('search').optional().isString().withMessage('Search term must be a string'),
  query('sortBy').optional().isIn(['createdAt', 'action', 'category', 'severity', 'userId']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const filters = {
      userId: req.query.userId ? parseInt(req.query.userId) : null,
      action: req.query.action || null,
      entityType: req.query.entityType || null,
      category: req.query.category || null,
      severity: req.query.severity || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      search: req.query.search || null,
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc',
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    const auditLogs = await AuditLogger.getAuditLogs(filters);

    // Log this audit access
    await AuditLogger.logDataAccess(req.user.id, 'audit_log', null, 'read', req);

    res.json({
      success: true,
      data: auditLogs.rows,
      pagination: {
        total: auditLogs.count,
        limit: filters.limit,
        offset: filters.offset,
        pages: Math.ceil(auditLogs.count / filters.limit)
      },
      filters: filters
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      error: 'Audit Log Retrieval Failed',
      message: 'An error occurred while fetching audit logs'
    });
  }
});

/**
 * GET /api/audit/realtime
 * Get real-time audit log updates
 */
router.get('/realtime', [
  query('lastId').optional().isInt().withMessage('Last ID must be an integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const lastId = req.query.lastId ? parseInt(req.query.lastId) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    // Get new audit logs since lastId
    const newLogs = await AuditLogger.getRealtimeLogs(lastId, limit);

    // Log this real-time access
    await AuditLogger.logDataAccess(req.user.id, 'audit_realtime', null, 'read', req);

    res.json({
      success: true,
      data: newLogs,
      timestamp: new Date().toISOString(),
      hasNewData: newLogs.length > 0
    });
  } catch (error) {
    console.error('Error fetching real-time audit logs:', error);
    res.status(500).json({
      error: 'Real-time Audit Log Retrieval Failed',
      message: 'An error occurred while fetching real-time audit logs'
    });
  }
});

/**
 * GET /api/audit/stats
 * Get audit statistics
 */
router.get('/stats', [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('groupBy').optional().isIn(['hour', 'day', 'week', 'month']).withMessage('Group by must be hour, day, week, or month')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const stats = await AuditLogger.getAuditStats(
      req.query.startDate || null,
      req.query.endDate || null,
      req.query.groupBy || 'day'
    );

    // Log this audit access
    await AuditLogger.logDataAccess(req.user.id, 'audit_stats', null, 'read', req);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({
      error: 'Audit Stats Retrieval Failed',
      message: 'An error occurred while fetching audit statistics'
    });
  }
});

/**
 * GET /api/audit/alerts
 * Get security alerts and anomalies
 */
router.get('/alerts', [
  query('severity').optional().isIn(['high', 'critical']).withMessage('Severity must be high or critical'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const alerts = await AuditLogger.getSecurityAlerts(
      req.query.severity || null,
      req.query.limit ? parseInt(req.query.limit) : 50
    );

    // Log this alerts access
    await AuditLogger.logDataAccess(req.user.id, 'audit_alerts', null, 'read', req);

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Error fetching security alerts:', error);
    res.status(500).json({
      error: 'Security Alerts Retrieval Failed',
      message: 'An error occurred while fetching security alerts'
    });
  }
});

/**
 * GET /api/audit/logs/:id
 * Get a single audit log by ID
 */
router.get('/logs/:id', [
  param('id').isInt().withMessage('Audit ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const auditId = parseInt(req.params.id);
    
    // Get the audit log with user details
    const auditLog = await AuditLogger.getAuditLogById(auditId);

    if (!auditLog) {
      return res.status(404).json({
        error: 'Audit Log Not Found',
        message: `Audit log with ID ${auditId} not found`
      });
    }

    // Log this audit access
    await AuditLogger.logDataAccess(req.user.id, 'audit_log_detail', auditId, 'read', req);

    res.json({
      success: true,
      data: auditLog
    });
  } catch (error) {
    console.error('Error fetching audit log by ID:', error);
    res.status(500).json({
      error: 'Audit Log Retrieval Failed',
      message: 'An error occurred while fetching the audit log'
    });
  }
});

/**
 * GET /api/audit/users/:userId
 * Get audit logs for a specific user
 */
router.get('/users/:userId', [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const userId = parseInt(req.params.userId);
    
    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'The specified user does not exist'
      });
    }

    const filters = {
      userId,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    const auditLogs = await AuditLogger.getAuditLogs(filters);

    // Log this audit access
    await AuditLogger.logDataAccess(req.user.id, 'user_audit', userId, 'read', req);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          employeeId: user.employeeId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        auditLogs: auditLogs.rows,
        pagination: {
          total: auditLogs.count,
          limit: filters.limit,
          offset: filters.offset,
          pages: Math.ceil(auditLogs.count / filters.limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    res.status(500).json({
      error: 'User Audit Log Retrieval Failed',
      message: 'An error occurred while fetching user audit logs'
    });
  }
});

/**
 * GET /api/audit/entities/:entityType/:entityId
 * Get audit logs for a specific entity
 */
router.get('/entities/:entityType/:entityId', [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const { entityType, entityId } = req.params;
    const entityIdInt = parseInt(entityId);

    const filters = {
      entityType,
      entityId: entityIdInt,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    const auditLogs = await AuditLogger.getAuditLogs(filters);

    // Log this audit access
    await AuditLogger.logDataAccess(req.user.id, 'entity_audit', entityIdInt, 'read', req);

    res.json({
      success: true,
      data: {
        entityType,
        entityId: entityIdInt,
        auditLogs: auditLogs.rows,
        pagination: {
          total: auditLogs.count,
          limit: filters.limit,
          offset: filters.offset,
          pages: Math.ceil(auditLogs.count / filters.limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching entity audit logs:', error);
    res.status(500).json({
      error: 'Entity Audit Log Retrieval Failed',
      message: 'An error occurred while fetching entity audit logs'
    });
  }
});

/**
 * POST /api/audit/clean
 * Clean old audit logs (admin only)
 */
router.post('/clean', [
  body('retentionDays').isInt({ min: 1, max: 3650 }).withMessage('Retention days must be between 1 and 3650')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input data',
        details: errors.array()
      });
    }

    const { retentionDays } = req.body;

    const deletedCount = await AuditLogger.cleanOldLogs(retentionDays);

    // Log this admin action
    await AuditLogger.logSystem('clean_audit_logs', `Cleaned ${deletedCount} old audit logs (retention: ${retentionDays} days)`, 'medium', {
      retentionDays,
      deletedCount
    });

    res.json({
      success: true,
      message: `Successfully cleaned ${deletedCount} old audit logs`,
      data: {
        deletedCount,
        retentionDays
      }
    });
  } catch (error) {
    console.error('Error cleaning audit logs:', error);
    res.status(500).json({
      error: 'Audit Cleanup Failed',
      message: 'An error occurred while cleaning old audit logs'
    });
  }
});

/**
 * GET /api/audit/export
 * Export audit logs (admin only)
 */
router.get('/export', [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('format').optional().isIn(['json', 'csv', 'excel']).withMessage('Format must be json, csv, or excel')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const filters = {
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: 10000, // Large limit for export
      offset: 0
    };

    const auditLogs = await AuditLogger.getAuditLogs(filters);
    const format = req.query.format || 'json';

    // Log this export action
    await AuditLogger.logDataAccess(req.user.id, 'audit_export', null, 'export', req);

    if (format === 'excel') {
      // Generate Excel with multiple worksheets
      const exporter = new ExcelExporter();
      await exporter.exportAuditLogsToExcel(filters);
      const buffer = await exporter.exportToBuffer();

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(buffer);
    } else if (format === 'csv') {
      // Generate CSV
      const csvHeaders = 'ID,User ID,Action,Entity Type,Entity ID,Category,Severity,Description,IP Address,User Agent,Success,Error Message,Created At\n';
      const csvRows = auditLogs.rows.map(log => {
        const user = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
        return `${log.id},${log.userId || ''},"${log.action}","${log.entityType}",${log.entityId || ''},"${log.category}","${log.severity}","${log.description || ''}","${log.ipAddress || ''}","${log.userAgent || ''}",${log.isSuccessful},"${log.errorMessage || ''}","${log.createdAt}"`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeaders + csvRows);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: auditLogs.rows,
        exportInfo: {
          totalRecords: auditLogs.count,
          exportDate: new Date().toISOString(),
          filters
        }
      });
    }
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({
      error: 'Audit Export Failed',
      message: 'An error occurred while exporting audit logs'
    });
  }
});

/**
 * GET /api/audit/export-excel
 * Export audit logs to Excel with multiple worksheets (admin only)
 */
router.get('/export-excel', [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('category').optional().isIn(['authentication', 'authorization', 'data_access', 'data_modification', 'system', 'security']).withMessage('Invalid category'),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
  query('userId').optional().isInt().withMessage('User ID must be an integer'),
  query('auditId').optional().isInt().withMessage('Audit ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your query parameters',
        details: errors.array()
      });
    }

    const filters = {
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      category: req.query.category || null,
      severity: req.query.severity || null,
      userId: req.query.userId ? parseInt(req.query.userId) : null,
      auditId: req.query.auditId ? parseInt(req.query.auditId) : null
    };

    // Log this export action
    await AuditLogger.logDataAccess(req.user.id, 'audit_excel_export', null, 'export', req);

    // Generate Excel with multiple worksheets
    const exporter = new ExcelExporter();
    await exporter.exportAuditLogsToExcel(filters);
    const buffer = await exporter.exportToBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `audit_logs_${timestamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Error exporting audit logs to Excel:', error);
    res.status(500).json({
      error: 'Excel Export Failed',
      message: 'An error occurred while exporting audit logs to Excel'
    });
  }
});

module.exports = router; 