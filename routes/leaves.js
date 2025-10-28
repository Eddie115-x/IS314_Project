const express = require('express');
const { body, query, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const moment = require('moment');
const { Op } = require('sequelize');
const { sequelize, Leave, LeaveType, LeaveBalance, User, Notification } = require('../models');
const { initializeEmployeeLeaveBalances } = require('../utils/leaveBalance');
const { authenticateToken, isManagerOrHR } = require('../middleware/auth');
const { createNotification, createLeaveSubmissionNotifications, sendBulkNotifications } = require('../utils/notifications');
const AuditLogger = require('../utils/auditLogger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'leave-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image, PDF, and document files are allowed'));
    }
  }
});

// Get all leave types
router.get('/types', authenticateToken, async (req, res) => {
  try {
    let leaveTypes = await LeaveType.findAll();
    
    // If no leave types exist, create default ones
    if (leaveTypes.length === 0) {
      const defaultTypes = [
        { name: 'Annual Leave', description: 'Regular annual leave', defaultDays: 20 },
        { name: 'Sick Leave', description: 'Medical leave', defaultDays: 10 },
        { name: 'Personal Leave', description: 'Personal time off', defaultDays: 5 },
        { name: 'Maternity Leave', description: 'Maternity leave', defaultDays: 90 },
        { name: 'Paternity Leave', description: 'Paternity leave', defaultDays: 14 }
      ];
      
      leaveTypes = await LeaveType.bulkCreate(defaultTypes);
    }
    
    res.json(leaveTypes);
  } catch (error) {
    console.error('Error fetching leave types:', error);
    res.status(500).json({ message: 'Error fetching leave types' });
  }
});

// Submit leave application
router.post('/', [
  authenticateToken,
  upload.array('attachment', 5), // Allow up to 5 files
  body('leaveTypeId').isInt().withMessage('Valid leave type is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('reason').isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters'),
  body('isHalfDay').optional().isBoolean(),
  body('halfDayType').optional().isIn(['morning', 'afternoon']),
  body('emergencyContact').optional().isLength({ min: 5, max: 100 }),
  body('handoverNotes').optional().isLength({ max: 1000 })
], async (req, res) => {
  console.log('=== LEAVE SUBMISSION DEBUG START ===');
  console.log('POST /leaves route hit');
  console.log('User authenticated:', !!req.user);
  console.log('User ID:', req.user ? req.user.id : 'null');
  console.log('Request headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Bearer ...' : 'null'
  });
  console.log('Request body keys:', Object.keys(req.body));
  console.log('Request body:', req.body);
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input data',
        details: errors.array()
      });
    }

    // Debug file upload information
    console.log('File upload info:', {
      hasFiles: !!req.files,
      filesCount: req.files ? req.files.length : 0,
      fileNames: req.files ? req.files.map(f => f.originalname) : []
    });

    const {
      leaveTypeId,
      startDate,
      endDate,
      reason,
      isHalfDay = false,
      halfDayType,
      emergencyContact,
      handoverNotes
    } = req.body;

    console.log('Extracted data:', {
      leaveTypeId, startDate, endDate, reason,
      isHalfDay, halfDayType, emergencyContact, handoverNotes
    });

    // Validate dates
    const start = moment(startDate);
    const end = moment(endDate);
    const today = moment().startOf('day');

    console.log('Date validation:', {
      start: start.format('YYYY-MM-DD'),
      end: end.format('YYYY-MM-DD'),
      today: today.format('YYYY-MM-DD'),
      startBeforeToday: start.isBefore(today),
      endBeforeStart: end.isBefore(start)
    });

    if (start.isBefore(today)) {
      console.log('Start date validation failed - date in past');
      return res.status(400).json({
        error: 'Invalid Date',
        message: 'Start date cannot be in the past'
      });
    }

    if (end.isBefore(start)) {
      console.log('End date validation failed - before start date');
      return res.status(400).json({
        error: 'Invalid Date',
        message: 'End date cannot be before start date'
      });
    }

    // Calculate number of days
    let numberOfDays = end.diff(start, 'days') + 1;
    if (isHalfDay) {
      numberOfDays = numberOfDays - 0.5;
    }

    console.log('Calculated days:', numberOfDays);

    // Check leave balance (initialize if missing)
    const currentYear = moment().year();
    let leaveBalance = await LeaveBalance.findOne({
      where: {
        userId: req.user.id,
        leaveTypeId,
        year: currentYear
      }
    });

    // If no balance exists for the user for this year, initialize balances and re-check
    if (!leaveBalance) {
      try {
        console.log('No leave balance found for user', req.user.id, '- initializing balances for year', currentYear);
        await initializeEmployeeLeaveBalances(req.user.id, currentYear);
        leaveBalance = await LeaveBalance.findOne({
          where: {
            userId: req.user.id,
            leaveTypeId,
            year: currentYear
          }
        });
      } catch (initErr) {
        console.error('Error initializing leave balances for user', req.user.id, initErr);
      }
    }

    console.log('Leave balance check:', {
      currentYear,
      userId: req.user.id,
      leaveTypeId,
      balanceFound: !!leaveBalance,
      remainingDays: leaveBalance ? leaveBalance.remainingDays : 'N/A'
    });

    if (!leaveBalance || leaveBalance.remainingDays < numberOfDays) {
      console.log('Insufficient leave balance');
      return res.status(400).json({
        error: 'Insufficient Leave Balance',
        message: 'You do not have enough leave days remaining'
      });
    }

    // Check for overlapping leave requests
    const overlappingLeave = await Leave.findOne({
      where: {
        userId: req.user.id,
        status: ['pending', 'approved'],
        [Op.or]: [
          {
            startDate: {
              [Op.between]: [startDate, endDate]
            }
          },
          {
            endDate: {
              [Op.between]: [startDate, endDate]
            }
          },
          {
            [Op.and]: [
              { startDate: { [Op.lte]: startDate } },
              { endDate: { [Op.gte]: endDate } }
            ]
          }
        ]
      }
    });

    console.log('Overlapping leave check:', {
      overlappingFound: !!overlappingLeave,
      overlappingId: overlappingLeave ? overlappingLeave.id : null
    });

    if (overlappingLeave) {
      console.log('Overlapping leave found');
      return res.status(400).json({
        error: 'Overlapping Leave',
        message: 'You have an overlapping leave request for these dates'
      });
    }

    // Prevent rapid duplicate submissions: check for a very recent pending leave with identical key fields
    try {
      const recentDuplicate = await Leave.findOne({
        where: {
          userId: req.user.id,
          leaveTypeId,
          startDate,
          endDate,
          numberOfDays,
          status: 'pending',
          createdAt: { [Op.gte]: moment().subtract(5, 'minutes').toDate() }
        }
      });

      if (recentDuplicate) {
        console.warn('Duplicate leave submission detected, returning existing record id:', recentDuplicate.id);
        return res.status(409).json({
          error: 'Duplicate Submission',
          message: 'A similar leave request was submitted recently. Please check your leave history.',
          existing: recentDuplicate
        });
      }
    } catch (dupErr) {
      console.error('Error checking for duplicate leave submissions:', dupErr);
      // continue - not fatal
    }

    // Create leave application
    const leaveData = {
      userId: req.user.id,
      leaveTypeId,
      startDate,
      endDate,
      numberOfDays,
      reason,
      isHalfDay,
      halfDayType,
      emergencyContact,
      handoverNotes,
      attachmentPath: req.files && req.files.length > 0 ? req.files[0].path : null
    };

    // Debug logging
    console.log('Leave request data:', {
      userId: req.user.id,
      leaveTypeId,
      startDate,
      endDate,
      numberOfDays,
      reason: reason.substring(0, 50) + '...',
      filesCount: req.files ? req.files.length : 0,
      attachmentPath: leaveData.attachmentPath
    });

    // Use a transactional findOrCreate to ensure only one leave is created for the same key
    // This defends against duplicate inserts when the client accidentally submits multiple
    // identical requests concurrently. We match on userId, leaveTypeId, startDate, endDate,
    // numberOfDays and pending status.
    const t = await sequelize.transaction();
    let leave;
    try {
      const [foundLeave, created] = await Leave.findOrCreate({
        where: {
          userId: req.user.id,
          leaveTypeId,
          startDate,
          endDate,
          numberOfDays,
          status: 'pending'
        },
        defaults: leaveData,
        transaction: t
      });

      if (!created) {
        // Roll back and return the existing record instead of creating a duplicate
        await t.rollback();
        console.warn('Duplicate leave submission prevented by findOrCreate, existing id:', foundLeave.id);
        return res.status(409).json({
          error: 'Duplicate Submission',
          message: 'A similar leave request already exists. Please check your leave history.',
          existing: foundLeave
        });
      }

      await t.commit();
      leave = foundLeave;
      console.log('Leave created successfully with ID:', leave.id);
    } catch (createErr) {
      try { await t.rollback(); } catch (rbErr) { console.error('Rollback error:', rbErr); }
      throw createErr;
    }

    // Log leave creation
    await AuditLogger.logDataModification(req.user.id, 'leave', leave.id, 'create', null, {
      leaveTypeId,
      startDate,
      endDate,
      numberOfDays,
      reason: reason.substring(0, 100) // Truncate for audit log
    }, req);

    // Create tailored notifications for this submission (employee + manager(s)) in one operation
    try {
      // Ensure both employee and manager notifications are created
      let notifications = await createLeaveSubmissionNotifications(leave, req.user);
      // Some DBs or bulk operations may return an empty array on failure - treat that as an error
      if (!notifications || notifications.length === 0) {
        throw new Error('No notifications were created by helper');
      }
      console.log('Notifications created for leave submission:', notifications.map(n => ({ id: n.id, userId: n.userId, recipientRole: n.recipientRole, title: n.title })));
    } catch (notifErr) {
      console.error('Failed to create leave submission notifications via helper:', notifErr);
      // Fallback: try to create notifications directly here so we don't lose them
      try {
        const fallback = [];
        // Employee confirmation
        fallback.push({
          userId: req.user.id,
          title: 'Leave Submitted',
          message: `${req.user.firstName} ${req.user.lastName} submitted a leave request (${leave.numberOfDays} day(s))`,
          type: 'info',
          category: 'system',
          recipientRole: 'employee',
          relatedId: leave.id,
          relatedType: 'leave'
        });

        // Determine managers to notify
        let managers = [];
        if (req.user.managerId) {
          const mgr = await User.findByPk(req.user.managerId);
          if (mgr) managers.push(mgr);
        } else {
          managers = await User.findAll({ where: { role: { [Op.in]: ['manager', 'hr', 'admin'] }, isActive: true } });
        }

        managers.forEach(m => {
          fallback.push({
            userId: m.id,
            title: 'New Leave Request',
            message: `${req.user.firstName} ${req.user.lastName} has submitted a leave request (${leave.numberOfDays} day(s))`,
            type: 'info',
            category: 'leave_request',
            recipientRole: 'manager',
            relatedId: leave.id,
            relatedType: 'leave'
          });
        });

        console.log('Fallback: creating', fallback.length, 'notifications directly');
        const created = await sendBulkNotifications(fallback);
        console.log('Fallback notifications created count:', created ? created.length : 0);
      } catch (fallbackErr) {
        console.error('Fallback notification creation also failed:', fallbackErr);
      }
    }

    console.log('Leave submission completed successfully');
    console.log('=== LEAVE SUBMISSION DEBUG END ===');
    
    res.status(201).json({
      message: 'Leave application submitted successfully',
      leave
    });
  } catch (error) {
    console.error('Leave submission error:', error);
    console.error('Error stack:', error.stack);
    console.log('=== LEAVE SUBMISSION DEBUG END ===');
    res.status(500).json({
      error: 'Leave Submission Failed',
      message: 'An error occurred while submitting leave application'
    });
  }
});

// Get all leaves for current user (general route)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const leaves = await Leave.findAll({
      where: { userId: req.user.id },
      include: [
        { model: LeaveType, as: 'leaveType', attributes: ['name', 'color'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    res.json(leaves);
  } catch (error) {
    console.error('Error fetching leaves:', error);
    res.status(500).json({
      error: 'Leave Retrieval Failed',
      message: 'An error occurred while fetching leave applications'
    });
  }
});

// Get user's leave applications
router.get('/my-leaves', authenticateToken, [
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
  query('year').optional().isInt({ min: 2020, max: 2030 }),
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

    const { status, year, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { userId: req.user.id };
    if (status) whereClause.status = status;
    if (year) {
      whereClause.startDate = {
        [Op.gte]: `${year}-01-01`,
        [Op.lte]: `${year}-12-31`
      };
    }

    const { count, rows: leaves } = await Leave.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      leaves,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({
      error: 'Leave Retrieval Failed',
      message: 'An error occurred while retrieving leave applications'
    });
  }
});

// Get leave application by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const leave = await Leave.findByPk(req.params.id, {
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color', 'description']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position', 'managerId']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });

    if (!leave) {
      return res.status(404).json({
        error: 'Leave Not Found',
        message: 'Leave application not found'
      });
    }

    // Normalize include aliases for backward compatibility (client expects .User/.Approver)
    const out = leave.toJSON();
    out.User = out.user || null;
    out.Approver = out.approver || null;

    // Check if user has permission to view this leave
    if (leave.userId !== req.user.id && 
        !['manager', 'hr', 'admin'].includes(req.user.role) &&
        req.user.id !== leave.approvedBy) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You do not have permission to view this leave application'
      });
    }

    res.json({ leave: out });
  } catch (error) {
    console.error('Get leave error:', error);
    res.status(500).json({
      error: 'Leave Retrieval Failed',
      message: 'An error occurred while retrieving leave application'
    });
  }
});

// Cancel leave application
router.put('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const leave = await Leave.findByPk(req.params.id);

    if (!leave) {
      return res.status(404).json({
        error: 'Leave Not Found',
        message: 'Leave application not found'
      });
    }

    if (leave.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You can only cancel your own leave applications'
      });
    }

    if (leave.status !== 'pending') {
      return res.status(400).json({
        error: 'Cannot Cancel',
        message: 'Only pending leave applications can be cancelled'
      });
    }

    await leave.update({ status: 'cancelled' });

    res.json({
      message: 'Leave application cancelled successfully',
      leave
    });
  } catch (error) {
    console.error('Cancel leave error:', error);
    res.status(500).json({
      error: 'Leave Cancellation Failed',
      message: 'An error occurred while cancelling leave application'
    });
  }
});

// Get pending leave applications for approval (Managers/HR)
router.get('/pending/approvals', [authenticateToken, isManagerOrHR], [
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

    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = { status: 'pending' };

    // If user is a manager, only show leaves from their team
    if (req.user.role === 'manager') {
      const teamMembers = await User.findAll({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      const teamMemberIds = teamMembers.map(member => member.id);
      whereClause.userId = { [Op.in]: teamMemberIds };
    }

    const { count, rows: leaves } = await Leave.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position']
        }
      ],
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    // Convert to plain objects and preserve previous .User alias for clients
    const formattedLeaves = leaves.map(l => {
      const obj = l.toJSON();
      obj.User = obj.user || null;
      return obj;
    });

    res.json({
      leaves: formattedLeaves,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get pending leaves error:', error);
    res.status(500).json({
      error: 'Leave Retrieval Failed',
      message: 'An error occurred while retrieving pending leave applications'
    });
  }
});

// HR/Managers: Get all leave applications (with filters)
router.get('/all', [authenticateToken, isManagerOrHR], [
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
  query('userId').optional().isInt(),
  query('department').optional().notEmpty(),
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

    const { status, userId, department, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (userId) whereClause.userId = parseInt(userId);

    // If manager, restrict to their team; HR/Admin can see all
    let userFilter = {};
    if (req.user.role === 'manager') {
      const teamMembers = await User.findAll({ where: { managerId: req.user.id }, attributes: ['id'] });
      const teamMemberIds = teamMembers.map(m => m.id);
      whereClause.userId = whereClause.userId ? whereClause.userId : { [Op.in]: teamMemberIds };
      if (department) {
        userFilter.department = department;
      }
    } else if (department) {
      userFilter.department = department;
    }

    const { count, rows: leaves } = await Leave.findAndCountAll({
      where: whereClause,
      include: [
        { model: LeaveType, as: 'leaveType', attributes: ['name', 'color'] },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position'], where: Object.keys(userFilter).length ? userFilter : undefined }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Format to include .User alias for compatibility
    const formattedLeaves = leaves.map(l => {
      const obj = l.toJSON();
      obj.User = obj.user || null;
      return obj;
    });

    res.json({
      leaves: formattedLeaves,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all leaves error:', error);
    res.status(500).json({
      error: 'Leave Retrieval Failed',
      message: 'An error occurred while retrieving leave applications'
    });
  }
});

// Approve/Reject leave application
router.put('/:id/approve', [authenticateToken, isManagerOrHR], [
  body('action').isIn(['approve', 'reject']).withMessage('Action must be either approve or reject'),
  body('rejectionReason').optional().isLength({ min: 5, max: 500 }).withMessage('Rejection reason must be between 5 and 500 characters')
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

  const { action, rejectionReason, managerNotes } = req.body;

    const leave = await Leave.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'managerId']
        },
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name']
        }
      ]
    });

    if (!leave) {
      return res.status(404).json({
        error: 'Leave Not Found',
        message: 'Leave application not found'
      });
    }

    if (leave.status !== 'pending') {
      return res.status(400).json({
        error: 'Invalid Action',
        message: 'Only pending leave applications can be approved or rejected'
      });
    }

    // Check if user has permission to approve this leave
    if (req.user.role === 'manager') {
      const leaveJson = leave.toJSON();
      const requesterManagerId = leaveJson.user ? leaveJson.user.managerId : null;
      if (requesterManagerId !== req.user.id) {
        return res.status(403).json({
          error: 'Access Denied',
          message: 'You can only approve leave applications from your team members'
        });
      }
    }

    const updateData = {
      approvedBy: req.user.id,
      approvedAt: new Date(),
      ...(managerNotes && { managerNotes })
    };

    if (action === 'approve') {
      updateData.status = 'approved';
    } else {
      updateData.status = 'rejected';
      updateData.rejectionReason = rejectionReason;
    }

    await leave.update(updateData);

    // Log leave approval/rejection
    await AuditLogger.logDataModification(req.user.id, 'leave', leave.id, action, {
      status: 'pending'
    }, {
      status: action === 'approve' ? 'approved' : 'rejected',
      approvedBy: req.user.id,
      approvedAt: new Date(),
      ...(action === 'reject' && { rejectionReason }),
      ...(managerNotes && { managerNotes })
    }, req);

    // Send notification to employee
    await createNotification({
      userId: leave.userId,
      title: `Leave ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      message: `Your leave request for ${leave.leaveType.name} has been ${action === 'approve' ? 'approved' : 'rejected'}`,
      type: action === 'approve' ? 'success' : 'error',
      category: action === 'approve' ? 'leave_approval' : 'leave_rejection',
      relatedId: leave.id,
      relatedType: 'leave'
    });

    res.json({
      message: `Leave application ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      leave
    });
  } catch (error) {
    console.error('Approve leave error:', error);
    res.status(500).json({
      error: 'Leave Approval Failed',
      message: 'An error occurred while processing leave application'
    });
  }
});

module.exports = router; 