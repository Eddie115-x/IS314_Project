const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveType = sequelize.define('LeaveType', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [2, 50]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    defaultDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    monthlyProRata: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: true,
      comment: 'Monthly pro-rata days for this leave type'
    },
    maxCarryForward: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      comment: 'Maximum days that can be carried forward to next year'
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '#007bff'
    },
    requiresApproval: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'leave_types'
  });

  return LeaveType;
}; 