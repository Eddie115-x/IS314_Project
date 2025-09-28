const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { initializeEmployeeLeaveBalances } = require('../utils/leaveBalance');
const AuditLogger = require('../utils/auditLogger');

const router = express.Router();

// Register new employee (admin only)
router.post('/register', [
  authenticateToken,
  body('employeeId').isLength({ min: 3, max: 50 }).withMessage('Employee ID must be between 3 and 50 characters'),
  body('firstName').isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('department').isLength({ min: 2, max: 100 }).withMessage('Department must be between 2 and 100 characters'),
  body('position').isLength({ min: 2, max: 100 }).withMessage('Position must be between 2 and 100 characters'),
  body('role').isIn(['employee', 'manager', 'hr', 'admin']).withMessage('Valid role is required'),
  body('hireDate').isISO8601().withMessage('Valid hire date is required')
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can register new employees' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input data',
        details: errors.array()
      });
    }

    const {
      employeeId,
      firstName,
      lastName,
      email,
      password,
      department,
      position,
      role,
      hireDate
    } = req.body;

    // Check if employee ID already exists
    const existingEmployee = await User.findOne({
      where: { employeeId }
    });

    if (existingEmployee) {
      return res.status(400).json({ message: 'Employee ID already exists' });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({
      where: { email }
    });

    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      employeeId,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      department,
      position,
      role,
      hireDate,
      isActive: true
    });

    // Initialize leave balances for the new employee
    try {
      await initializeEmployeeLeaveBalances(user.id);
    } catch (balanceError) {
      console.error('Error initializing leave balances:', balanceError);
      // Don't fail the registration if balance initialization fails
    }

    // Log successful registration
    await AuditLogger.logDataModification(req.user.id, 'user', user.id, 'create', null, {
      employeeId: user.employeeId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department,
      position: user.position,
      role: user.role
    }, req);

    res.status(201).json({
      message: 'Employee registered successfully',
      user: {
        id: user.id,
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: user.department,
        position: user.position,
        role: user.role,
        hireDate: user.hireDate
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering employee' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
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

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });

    if (!user || !user.isActive) {
      // Log failed login attempt
      await AuditLogger.logAuth(null, 'login', false, 'Invalid credentials', req);
      
      return res.status(401).json({
        error: 'Invalid Credentials',
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await user.checkPassword(password);
    if (!isPasswordValid) {
      // Log failed login attempt
      await AuditLogger.logAuth(user.id, 'login', false, 'Invalid password', req);
      
      return res.status(401).json({
        error: 'Invalid Credentials',
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Log successful login
    await AuditLogger.logAuth(user.id, 'login', true, null, req);

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login Failed',
      message: 'An error occurred during login'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    res.json({
      user
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      error: 'Profile Retrieval Failed',
      message: 'An error occurred while retrieving profile'
    });
  }
});

// Get current user (for frontend auth check)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    res.json(user);
  } catch (error) {
    console.error('Me endpoint error:', error);
    res.status(500).json({
      error: 'User Retrieval Failed',
      message: 'An error occurred while retrieving user data'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required')
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

    const { firstName, lastName, email } = req.body;
    const updateData = {};

    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;

    await req.user.update(updateData);

    const userResponse = req.user.toJSON();
    delete userResponse.password;

    res.json({
      message: 'Profile updated successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Profile Update Failed',
      message: 'An error occurred while updating profile'
    });
  }
});

// Change password
router.put('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
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

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isCurrentPasswordValid = await req.user.checkPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Invalid Password',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await req.user.update({ password: newPassword });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Password Change Failed',
      message: 'An error occurred while changing password'
    });
  }
});

// Reset password for all employees (admin only)
router.post('/reset-all-passwords', [authenticateToken, authorizeRoles('admin')], [
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword').notEmpty().withMessage('Password confirmation is required')
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

    const { newPassword, confirmPassword } = req.body;

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: 'Password Mismatch',
        message: 'Passwords do not match'
      });
    }

    // Get all active users except the current admin
    const users = await User.findAll({
      where: {
        isActive: true,
        id: { [Op.ne]: req.user.id } // Exclude current admin
      },
      attributes: ['id', 'employeeId', 'firstName', 'lastName', 'email']
    });

    if (users.length === 0) {
      return res.status(404).json({
        error: 'No Users Found',
        message: 'No active users found to reset passwords'
      });
    }

    // Update passwords for all users
    const updatePromises = users.map(user => 
      user.update({ password: newPassword })
    );

    await Promise.all(updatePromises);

    // Log the password reset action
    await AuditLogger.logDataModification(req.user.id, 'user', null, 'bulk_password_reset', null, {
      action: 'reset_all_passwords',
      affectedUsers: users.length,
      resetBy: req.user.id
    }, req);

    res.json({
      message: `Successfully reset passwords for ${users.length} employees`,
      affectedUsers: users.length,
      users: users.map(user => ({
        id: user.id,
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }))
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'Password Reset Failed',
      message: 'An error occurred while resetting passwords'
    });
  }
});

// Reset password for specific user (admin only)
router.post('/reset-user-password/:userId', [authenticateToken, authorizeRoles('admin')], [
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
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

    const { newPassword } = req.body;
    const userId = parseInt(req.params.userId);

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'User not found'
      });
    }

    // Update password
    await user.update({ password: newPassword });

    // Log the password reset action
    await AuditLogger.logDataModification(req.user.id, 'user', userId, 'password_reset', null, {
      action: 'reset_user_password',
      targetUserId: userId,
      targetUserEmail: user.email,
      resetBy: req.user.id
    }, req);

    res.json({
      message: 'Password reset successfully',
      user: {
        id: user.id,
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'Password Reset Failed',
      message: 'An error occurred while resetting password'
    });
  }
});

// Logout (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    message: 'Logout successful'
  });
});

module.exports = router; 