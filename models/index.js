const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

// Import model functions
const UserModel = require('./User');
const LeaveTypeModel = require('./LeaveType');
const LeaveModel = require('./Leave');
const LeaveBalanceModel = require('./LeaveBalance');
const NotificationModel = require('./Notification');
const DefaultBalanceModel = require('./DefaultBalance');
const AuditModel = require('./Audit');

// Initialize models with sequelize instance
const User = UserModel(sequelize);
const LeaveType = LeaveTypeModel(sequelize);
const Leave = LeaveModel(sequelize);
const LeaveBalance = LeaveBalanceModel(sequelize);
const Notification = NotificationModel(sequelize);
const DefaultBalance = DefaultBalanceModel(sequelize, DataTypes);
const Audit = AuditModel(sequelize);

// Define associations
User.hasMany(Leave, { foreignKey: 'userId', as: 'leaves' });
Leave.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Leave, { foreignKey: 'approvedBy', as: 'approvedLeaves' });
Leave.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

User.hasMany(User, { foreignKey: 'managerId', as: 'subordinates' });
User.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });

LeaveType.hasMany(Leave, { foreignKey: 'leaveTypeId', as: 'leaves' });
Leave.belongsTo(LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });

User.hasMany(LeaveBalance, { foreignKey: 'userId', as: 'leaveBalances' });
LeaveBalance.belongsTo(User, { foreignKey: 'userId', as: 'user' });

LeaveType.hasMany(LeaveBalance, { foreignKey: 'leaveTypeId', as: 'leaveBalances' });
LeaveBalance.belongsTo(LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });

User.hasMany(LeaveBalance, { foreignKey: 'lastUpdatedBy', as: 'updatedBalances' });
LeaveBalance.belongsTo(User, { foreignKey: 'lastUpdatedBy', as: 'lastUpdatedByUser' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// DefaultBalance associations
User.hasMany(DefaultBalance, { foreignKey: 'updatedBy', as: 'updatedDefaultBalances' });
DefaultBalance.belongsTo(User, { foreignKey: 'updatedBy', as: 'updatedByUser' });

// Audit associations
User.hasMany(Audit, { foreignKey: 'userId', as: 'auditLogs' });
Audit.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  User,
  LeaveType,
  Leave,
  LeaveBalance,
  Notification,
  DefaultBalance,
  Audit
}; 