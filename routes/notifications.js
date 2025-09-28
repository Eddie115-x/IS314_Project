const express = require('express');
const { query, validationResult } = require('express-validator');
const { Notification } = require('../models');
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

    const whereClause = { userId: req.user.id };
    if (isRead !== undefined) whereClause.isRead = isRead;
    if (type) whereClause.type = type;
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

    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You can only view your own notifications'
      });
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

module.exports = router; 