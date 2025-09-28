const express = require('express');
const { query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const moment = require('moment');
const { Leave, User, LeaveType, LeaveBalance } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Get leave statistics dashboard (HR/Admin only)
router.get('/dashboard', [authenticateToken, authorizeRoles('hr', 'admin')], [
  query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
  query('department').optional().notEmpty()
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

    const { startDate, endDate, department } = req.query;
    const whereClause = {};

    if (startDate && endDate) {
      whereClause.startDate = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Get leave statistics by status
    const leaveStats = await Leave.findAll({
      where: whereClause,
      attributes: [
        'status',
        [Leave.Sequelize.fn('COUNT', Leave.Sequelize.col('id')), 'count'],
        [Leave.Sequelize.fn('SUM', Leave.Sequelize.col('numberOfDays')), 'totalDays']
      ],
      group: ['status']
    });

    // Get leave statistics by type
    const leaveTypeStats = await Leave.findAll({
      where: whereClause,
      include: [
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color']
        }
      ],
      attributes: [
        'leaveTypeId',
        [Leave.Sequelize.fn('COUNT', Leave.Sequelize.col('id')), 'count'],
        [Leave.Sequelize.fn('SUM', Leave.Sequelize.col('numberOfDays')), 'totalDays']
      ],
      group: ['leaveTypeId', 'LeaveType.id', 'LeaveType.name', 'LeaveType.color']
    });

    // Get department statistics
    const departmentStats = await Leave.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['department'],
          where: department ? { department } : {}
        }
      ],
      attributes: [
        [Leave.Sequelize.fn('COUNT', Leave.Sequelize.col('id')), 'count'],
        [Leave.Sequelize.fn('SUM', Leave.Sequelize.col('numberOfDays')), 'totalDays']
      ],
      group: ['User.department']
    });

    // Get pending approvals count
    const pendingCount = await Leave.count({
      where: { status: 'pending' }
    });

    // Get total employees
    const totalEmployees = await User.count({
      where: { isActive: true }
    });

    res.json({
      leaveStats,
      leaveTypeStats,
      departmentStats,
      pendingCount,
      totalEmployees
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      error: 'Dashboard Retrieval Failed',
      message: 'An error occurred while retrieving dashboard statistics'
    });
  }
});

// Get leave report by date range (HR/Admin only)
router.get('/leave-report', [authenticateToken, authorizeRoles('hr', 'admin')], [
  query('startDate').isISO8601().withMessage('Valid start date is required'),
  query('endDate').isISO8601().withMessage('Valid end date is required'),
  query('department').optional().notEmpty(),
  query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
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

    const { startDate, endDate, department, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      startDate: {
        [Op.between]: [startDate, endDate]
      }
    };

    if (status) whereClause.status = status;

    const { count, rows: leaves } = await Leave.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['id', 'firstName', 'lastName', 'email', 'department', 'position'],
          where: department ? { department } : {}
        },
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color']
        },
        {
          model: User,
          as: 'Approver',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['startDate', 'ASC']],
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
    console.error('Leave report error:', error);
    res.status(500).json({
      error: 'Leave Report Failed',
      message: 'An error occurred while generating leave report'
    });
  }
});

// Get employee leave summary (HR/Admin only)
router.get('/employee-summary', [authenticateToken, authorizeRoles('hr', 'admin')], [
  query('year').optional().isInt({ min: 2020, max: 2030 }),
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

    const { year = new Date().getFullYear(), department, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const userWhereClause = { isActive: true };
    if (department) userWhereClause.department = department;

    const { count, rows: users } = await User.findAndCountAll({
      where: userWhereClause,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: LeaveBalance,
          where: { year: parseInt(year) },
          required: false,
          include: [
            {
              model: LeaveType,
              as: 'leaveType',
              attributes: ['name', 'color']
            }
          ]
        }
      ],
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
    console.error('Employee summary error:', error);
    res.status(500).json({
      error: 'Employee Summary Failed',
      message: 'An error occurred while generating employee summary'
    });
  }
});

// Get department leave report (HR/Admin only)
router.get('/department-report', [authenticateToken, authorizeRoles('hr', 'admin')], [
  query('year').optional().isInt({ min: 2020, max: 2030 }),
  query('month').optional().isInt({ min: 1, max: 12 })
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

    const { year = new Date().getFullYear(), month } = req.query;

    let dateFilter = {};
    if (month) {
      const startDate = moment(`${year}-${month.toString().padStart(2, '0')}-01`);
      const endDate = startDate.clone().endOf('month');
      dateFilter = {
        startDate: {
          [Op.between]: [startDate.format('YYYY-MM-DD'), endDate.format('YYYY-MM-DD')]
        }
      };
    } else {
      dateFilter = {
        startDate: {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`]
        }
      };
    }

    const departmentStats = await Leave.findAll({
      where: dateFilter,
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['department']
        }
      ],
      attributes: [
        [Leave.Sequelize.fn('COUNT', Leave.Sequelize.col('id')), 'totalRequests'],
        [Leave.Sequelize.fn('SUM', Leave.Sequelize.col('numberOfDays')), 'totalDays'],
        [Leave.Sequelize.fn('AVG', Leave.Sequelize.col('numberOfDays')), 'averageDays'],
        'status'
      ],
      group: ['User.department', 'status']
    });

    res.json({ departmentStats });
  } catch (error) {
    console.error('Department report error:', error);
    res.status(500).json({
      error: 'Department Report Failed',
      message: 'An error occurred while generating department report'
    });
  }
});

// Get manager team report (Managers only)
router.get('/team-report', [authenticateToken, authorizeRoles('manager')], [
  query('year').optional().isInt({ min: 2020, max: 2030 }),
  query('month').optional().isInt({ min: 1, max: 12 })
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

    const { year = new Date().getFullYear(), month } = req.query;

    // Get team members
    const teamMembers = await User.findAll({
      where: { managerId: req.user.id, isActive: true },
      attributes: { exclude: ['password'] }
    });

    const teamMemberIds = teamMembers.map(member => member.id);

    let dateFilter = {};
    if (month) {
      const startDate = moment(`${year}-${month.toString().padStart(2, '0')}-01`);
      const endDate = startDate.clone().endOf('month');
      dateFilter = {
        startDate: {
          [Op.between]: [startDate.format('YYYY-MM-DD'), endDate.format('YYYY-MM-DD')]
        }
      };
    } else {
      dateFilter = {
        startDate: {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`]
        }
      };
    }

    // Get team leave statistics
    const teamLeaves = await Leave.findAll({
      where: {
        ...dateFilter,
        userId: { [Op.in]: teamMemberIds }
      },
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['id', 'firstName', 'lastName', 'department']
        },
        {
          model: LeaveType,
          as: 'leaveType',
          attributes: ['name', 'color']
        }
      ],
      order: [['startDate', 'ASC']]
    });

    // Get team leave balances
    const teamBalances = await LeaveBalance.findAll({
      where: {
        userId: { [Op.in]: teamMemberIds },
        year: parseInt(year)
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
      teamMembers,
      teamLeaves,
      teamBalances
    });
  } catch (error) {
    console.error('Team report error:', error);
    res.status(500).json({
      error: 'Team Report Failed',
      message: 'An error occurred while generating team report'
    });
  }
});

module.exports = router; 