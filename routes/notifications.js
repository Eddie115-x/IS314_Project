const express = require('express');
const { query, validationResult } = require('express-validator');
const { Notification } = require('../models');
const { Op } = require('sequelize');
const Sequelize = require('sequelize');
const { authorizeRoles } = require('../middleware/auth');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's notifications
router.get('/', authenticateToken, [
  query('isRead').optional().isBoolean(),
  query('type').optional().isIn(['info', 'success', 'warning', 'error']),
  query('category').optional().isIn(['leave_request', 'leave_approval', 'leave_rejection', 'system', 'reminder']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
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

    const { isRead, type, category, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Users always see notifications explicitly addressed to them.
    // Additionally, include notifications targeted at their role (e.g., manager/HR) so role-targeted messages are visible in lists.
    // Use a case-insensitive comparison for recipientRole to tolerate casing differences in stored data.
    const roleValue = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
    const whereClause = {
      [Op.or]: [
        { userId: req.user.id },
        // Case-insensitive match on recipientRole; cast enum to text first so lower() works in Postgres
        Sequelize.where(Sequelize.fn('lower', Sequelize.cast(Sequelize.col('recipientRole'), 'text')), roleValue)
      ]
    };

    // Debug: log who is requesting notifications and the role used for matching
    console.log('GET /api/notifications requested by user:', { userId: req.user.id, role: req.user.role });
    if (isRead !== undefined) whereClause.isRead = isRead;
    if (type) whereClause.type = type;
    if (category) whereClause.category = category;

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Debug: log result summary before returning
    try {
      const ids = notifications.map(n => n.id).slice(0, 10);
      console.log(`GET /api/notifications -> returning ${notifications.length} rows (showing up to 10 ids):`, ids);
    } catch (e) {
      console.error('Error logging notifications preview:', e);
    }

    res.json({
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      error: 'Notification Retrieval Failed',
      message: 'An error occurred while retrieving notifications'
    });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification Not Found',
        message: 'Notification not found'
      });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You can only mark your own notifications as read'
      });
    }

    await notification.update({
      isRead: true,
      readAt: new Date()
    });

    res.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      error: 'Notification Update Failed',
      message: 'An error occurred while marking notification as read'
    });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const result = await Notification.update(
      {
        isRead: true,
        readAt: new Date()
      },
      {
        where: {
          userId: req.user.id,
          isRead: false
        }
      }
    );

    res.json({
      message: 'All notifications marked as read',
      updatedCount: result[0]
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      error: 'Notification Update Failed',
      message: 'An error occurred while marking notifications as read'
    });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification Not Found',
        message: 'Notification not found'
      });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You can only delete your own notifications'
      });
    }

    await notification.destroy();

    res.json({
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      error: 'Notification Deletion Failed',
      message: 'An error occurred while deleting notification'
    });
  }
});

// Get unread notification count
router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    });

    res.json({
      unreadCount: count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      error: 'Count Retrieval Failed',
      message: 'An error occurred while retrieving unread count'
    });
  }
});

// Get notification by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification Not Found',
        message: 'Notification not found'
      });
    }

    // Enforce access: user can view notification if any of:
    // - they are the explicit recipient (notification.userId === req.user.id)
    // - the notification has a recipientRole and the user's role matches that role (e.g., manager/HR notifications)
    // This allows role-targeted notifications to be visible to users in that role while preventing employees from accessing manager/HR notifications.
    if (notification.userId !== req.user.id) {
      if (!notification.recipientRole || notification.recipientRole !== req.user.role) {
        return res.status(403).json({
          error: 'Access Denied',
          message: 'You can only view your own notifications'
        });
      }
    }

    res.json({ notification });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({
      error: 'Notification Retrieval Failed',
      message: 'An error occurred while retrieving notification'
    });
  }
});

// Admin audit endpoint - list notifications across users with recipientRole and filters
router.get('/audit/all', [authenticateToken, authorizeRoles('admin')], [
  query('userId').optional().isInt(),
  query('recipientRole').optional().isIn(['employee','manager','hr','admin']),
  query('category').optional().isIn(['leave_request', 'leave_approval', 'leave_rejection', 'system', 'reminder']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 })
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

    const { userId, recipientRole, category, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (userId) whereClause.userId = parseInt(userId);
    if (recipientRole) whereClause.recipientRole = recipientRole;
    if (category) whereClause.category = category;

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Audit notifications error:', error);
    res.status(500).json({
      error: 'Audit Retrieval Failed',
      message: 'An error occurred while retrieving notifications for audit'
    });
  }
});

module.exports = router; 