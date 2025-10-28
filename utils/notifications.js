const { Notification, User } = require('../models');
const { Op } = require('sequelize');

const createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    
    // Emit real-time notification if socket.io is available
    const io = require('../server').io;
    if (io) {
      io.to(`user_${notificationData.userId}`).emit('newNotification', {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        category: notification.category,
        createdAt: notification.createdAt
      });
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

const sendBulkNotifications = async (notifications) => {
  try {
    const createdNotifications = await Notification.bulkCreate(notifications);
    
    // Emit real-time notifications
    const io = require('../server').io;
    if (io) {
      createdNotifications.forEach(notification => {
        io.to(`user_${notification.userId}`).emit('newNotification', {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          category: notification.category,
          createdAt: notification.createdAt
        });
      });
    }
    
    return createdNotifications;
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    throw error;
  }
};

const sendLeaveRequestNotification = async (leave, user) => {
  try {
    // Find manager/HR users who should be notified
    const managers = await User.findAll({
      where: {
        role: { [Op.in]: ['manager', 'hr', 'admin'] },
        isActive: true
      }
    });

    const notifications = managers.map(manager => ({
      userId: manager.id,
      title: 'New Leave Request',
      message: `${user.getFullName()} has submitted a leave request for ${leave.numberOfDays} day(s)`,
      type: 'info',
      category: 'leave_request',
      // mark these as intended for managers so we can enforce access rules
      recipientRole: 'manager',
      relatedId: leave.id,
      relatedType: 'leave'
    }));

    return await sendBulkNotifications(notifications);
  } catch (error) {
    console.error('Error sending leave request notification:', error);
    throw error;
  }
};

/**
 * Create tailored notifications when an employee submits a leave request.
 * This will notify the submitter (employee) and the relevant manager(s) with role-targeted messages.
 * The function attempts to send all notifications in a single bulk call and returns the created notifications.
 */
const createLeaveSubmissionNotifications = async (leave, submitter) => {
  try {
    const notifications = [];

    // Employee confirmation notification
    notifications.push({
      userId: submitter.id,
      title: 'Leave Submitted',
      message: `Your leave request for ${leave.numberOfDays} day(s) has been submitted and is pending approval.`,
      type: 'info',
      category: 'system',
      recipientRole: 'employee',
      relatedId: leave.id,
      relatedType: 'leave'
    });

    // If the submitter has an explicit manager, notify that manager only (tailored).
    if (submitter.managerId) {
      notifications.push({
        userId: submitter.managerId,
        title: 'New Leave Request',
        message: `${submitter.getFullName()} has submitted a leave request for ${leave.numberOfDays} day(s).`,
        type: 'info',
        category: 'leave_request',
        recipientRole: 'manager',
        relatedId: leave.id,
        relatedType: 'leave'
      });
    } else {
      // Fallback: notify all active users with manager/hr/admin roles
      const managers = await User.findAll({
        where: {
          role: { [Op.in]: ['manager', 'hr', 'admin'] },
          isActive: true
        }
      });

      managers.forEach(m => {
        notifications.push({
          userId: m.id,
          title: 'New Leave Request',
          message: `${submitter.getFullName()} has submitted a leave request for ${leave.numberOfDays} day(s).`,
          type: 'info',
          category: 'leave_request',
          recipientRole: 'manager',
          relatedId: leave.id,
          relatedType: 'leave'
        });
      });
    }

    // Use bulk creation which will also emit socket events
    const created = await sendBulkNotifications(notifications);
    return created;
  } catch (error) {
    console.error('Error creating leave submission notifications:', error);
    throw error;
  }
};

const sendLeaveApprovalNotification = async (leave, approver, action) => {
  try {
    const notification = await createNotification({
      userId: leave.userId,
      title: `Leave ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      message: `Your leave request has been ${action === 'approve' ? 'approved' : 'rejected'} by ${approver.getFullName()}`,
      type: action === 'approve' ? 'success' : 'error',
      category: action === 'approve' ? 'leave_approval' : 'leave_rejection',
      relatedId: leave.id,
      relatedType: 'leave'
    });

    return notification;
  } catch (error) {
    console.error('Error sending leave approval notification:', error);
    throw error;
  }
};

const sendSystemNotification = async (userId, title, message, type = 'info') => {
  try {
    const notification = await createNotification({
      userId,
      title,
      message,
      type,
      category: 'system'
    });

    return notification;
  } catch (error) {
    console.error('Error sending system notification:', error);
    throw error;
  }
};

const sendReminderNotification = async (userId, title, message) => {
  try {
    const notification = await createNotification({
      userId,
      title,
      message,
      type: 'warning',
      category: 'reminder'
    });

    return notification;
  } catch (error) {
    console.error('Error sending reminder notification:', error);
    throw error;
  }
};

module.exports = {
  createNotification,
  sendBulkNotifications,
  sendLeaveRequestNotification,
  createLeaveSubmissionNotifications,
  sendLeaveApprovalNotification,
  sendSystemNotification,
  sendReminderNotification
}; 