const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveBalance = sequelize.define('LeaveBalance', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    leaveTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'leave_types',
        key: 'id'
      }
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Financial year (e.g., 2024 for FY 2024-25)'
    },
    totalDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      comment: 'Total allocated days for the year'
    },
    usedDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      comment: 'Days used in the current year'
    },
    remainingDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      comment: 'Days remaining for the year'
    },
    carriedOverDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      comment: 'Days carried over from previous year'
    },
    maxCarryOver: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 5,
      comment: 'Maximum days that can be carried over'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    lastUpdatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Admin who last updated this balance'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Admin notes for balance adjustments'
    }
  }, {
    tableName: 'leave_balances',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'leaveTypeId', 'year']
      }
    ]
  });

  return LeaveBalance;
}; 