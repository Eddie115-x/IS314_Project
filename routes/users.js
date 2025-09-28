const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User, LeaveBalance, LeaveType } = require('../models');
const { initializeEmployeeLeaveBalances } = require('../utils/leaveBalance');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Admin: create/register a new user/employee
router.post('/', [
  authenticateToken,
  authorizeRoles('admin'),
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('firstName').isLength({ min: 2 }).withMessage('First name is required'),
  body('lastName').isLength({ min: 2 }).withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['employee', 'manager', 'hr', 'admin']).withMessage('Invalid role'),
  body('department').notEmpty().withMessage('Department is required'),
  body('position').notEmpty().withMessage('Position is required'),
  body('managerId').optional().isInt().withMessage('managerId must be an integer'),
  body('hireDate').isISO8601().withMessage('Valid hire date is required')
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

    // Enforce unique constraints manually for clearer error messages
    const existingByEmail = await User.findOne({ where: { email: req.body.email } });
    if (existingByEmail) {
      return res.status(409).json({ error: 'Conflict', message: 'Email already in use' });
    }
    const existingByEmpId = await User.findOne({ where: { employeeId: req.body.employeeId } });
    if (existingByEmpId) {
      return res.status(409).json({ error: 'Conflict', message: 'Employee ID already in use' });
    }

    const newUser = await User.create({
      employeeId: req.body.employeeId,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role || 'employee',
      department: req.body.department,
      position: req.body.position,
      managerId: req.body.managerId || null,
      hireDate: req.body.hireDate,
      isActive: true
    });

    // Initialize leave balances for the new user
    await initializeEmployeeLeaveBalances(newUser.id);

    const userResponse = newUser.toJSON();
    delete userResponse.password;

    return res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({
      error: 'User Creation Failed',
      message: 'An error occurred while creating user'
    });
  }
});

// Get all users (HR/Admin only)
router.get('/', [authenticateToken, authorizeRoles('hr', 'admin')], [
  query('role').optional().isIn(['employee', 'manager', 'hr', 'admin']),
  query('department').optional().notEmpty(),
  query('isActive').optional().isBoolean(),
  query('search').optional().notEmpty(),
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

    const { role, department, isActive, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (role) whereClause.role = role;
    if (department) whereClause.department = department;
    if (isActive !== undefined) whereClause.isActive = isActive;

    // Add search functionality
    if (search) {
      whereClause[Op.or] = [
        { employeeId: { [Op.iLike]: `%${search}%` } },
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { department: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password'] },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'User Retrieval Failed',
      message: 'An error occurred while retrieving users'
    });
  }
});

// Get current user's leave balance
router.get('/leave-balance', authenticateToken, [
  query('year').optional().isInt({ min: 2020, max: 2030 })
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

    const year = req.query.year || new Date().getFullYear();
    const leaveBalances = await LeaveBalance.findAll({
      where: {
        userId: req.user.id,
        year: parseInt(year)
      },
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color', 'description', 'monthlyProRata', 'maxCarryForward']
        }
      ]
    });

    res.json({ balances: leaveBalances });
  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({
      error: 'Leave Balance Retrieval Failed',
      message: 'An error occurred while retrieving leave balance'
    });
  }
});

// Get team members (for managers)
router.get('/team/members', [authenticateToken, authorizeRoles('manager')], async (req, res) => {
  try {
    const teamMembers = await User.findAll({
      where: { managerId: req.user.id },
      attributes: { exclude: ['password'] },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    res.json({ teamMembers });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({
      error: 'Team Retrieval Failed',
      message: 'An error occurred while retrieving team members'
    });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    // Check if user has permission to view this user
    if (req.user.id !== parseInt(req.params.id) && 
        !['hr', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You do not have permission to view this user'
      });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'User Retrieval Failed',
      message: 'An error occurred while retrieving user'
    });
  }
});

// Update user (HR/Admin only)
router.put('/:id', [authenticateToken, authorizeRoles('hr', 'admin')], [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('department').optional().notEmpty().withMessage('Department cannot be empty'),
  body('position').optional().notEmpty().withMessage('Position cannot be empty'),
  body('role').optional().isIn(['employee', 'manager', 'hr', 'admin']).withMessage('Valid role is required'),
  body('managerId').optional().isInt().withMessage('Valid manager ID is required'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
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

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    const updateData = {};
    const allowedFields = ['firstName', 'lastName', 'email', 'department', 'position', 'role', 'managerId', 'isActive'];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    await user.update(updateData);

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      message: 'User updated successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'User Update Failed',
      message: 'An error occurred while updating user'
    });
  }
});

// Get user's leave balance
router.get('/:id/leave-balance', authenticateToken, [
  query('year').optional().isInt({ min: 2020, max: 2030 })
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

    // Check if user has permission to view this user's leave balance
    if (req.user.id !== parseInt(req.params.id) && 
        !['hr', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You do not have permission to view this user\'s leave balance'
      });
    }

    const year = req.query.year || new Date().getFullYear();
    const leaveBalances = await LeaveBalance.findAll({
      where: {
        userId: req.params.id,
        year: parseInt(year)
      },
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color', 'description']
        }
      ]
    });

    res.json({ leaveBalances });
  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({
      error: 'Leave Balance Retrieval Failed',
      message: 'An error occurred while retrieving leave balance'
    });
  }
});

// Update user's leave balance (HR/Admin only)
router.put('/:id/leave-balance', [authenticateToken, authorizeRoles('hr', 'admin')], [
  body('leaveTypeId').isInt().withMessage('Valid leave type ID is required'),
  body('year').isInt({ min: 2020, max: 2030 }).withMessage('Valid year is required'),
  body('totalDays').isFloat({ min: 0 }).withMessage('Total days must be a positive number'),
  body('usedDays').optional().isFloat({ min: 0 }).withMessage('Used days must be a positive number'),
  body('carriedOverDays').optional().isFloat({ min: 0 }).withMessage('Carried over days must be a positive number')
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

    const { leaveTypeId, year, totalDays, usedDays = 0, carriedOverDays = 0 } = req.body;

    // Check if user exists
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    // Check if leave type exists
    const leaveType = await LeaveType.findByPk(leaveTypeId);
    if (!leaveType) {
      return res.status(404).json({
        error: 'Leave Type Not Found',
        message: 'Leave type not found'
      });
    }

    // Find or create leave balance
    const [leaveBalance, created] = await LeaveBalance.findOrCreate({
      where: {
        userId: req.params.id,
        leaveTypeId,
        year: parseInt(year)
      },
      defaults: {
        totalDays: parseFloat(totalDays),
        usedDays: parseFloat(usedDays),
        carriedOverDays: parseFloat(carriedOverDays)
      }
    });

    if (!created) {
      await leaveBalance.update({
        totalDays: parseFloat(totalDays),
        usedDays: parseFloat(usedDays),
        carriedOverDays: parseFloat(carriedOverDays)
      });
    }

    res.json({
      message: 'Leave balance updated successfully',
      leaveBalance
    });
  } catch (error) {
    console.error('Update leave balance error:', error);
    res.status(500).json({
      error: 'Leave Balance Update Failed',
      message: 'An error occurred while updating leave balance'
    });
  }
});

// Get user statistics (HR/Admin only)
router.get('/:id/statistics', [authenticateToken, authorizeRoles('hr', 'admin')], async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    // Get leave statistics
    const { Leave: LeaveModel } = require('../models');
    const leaveStats = await LeaveModel.findAll({
      where: { userId: req.params.id },
      attributes: [
        'status',
        [LeaveModel.Sequelize.fn('COUNT', LeaveModel.Sequelize.col('id')), 'count'],
        [LeaveModel.Sequelize.fn('SUM', LeaveModel.Sequelize.col('numberOfDays')), 'totalDays']
      ],
      group: ['status']
    });

    // Get current year leave balance
    const currentYear = new Date().getFullYear();
    const leaveBalances = await LeaveBalance.findAll({
      where: {
        userId: req.params.id,
        year: currentYear
      },
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color']
        }
      ]
    });

    res.json({
      user,
      leaveStats,
      leaveBalances
    });
  } catch (error) {
    console.error('Get user statistics error:', error);
    res.status(500).json({
      error: 'Statistics Retrieval Failed',
      message: 'An error occurred while retrieving user statistics'
    });
  }
});

module.exports = router; 