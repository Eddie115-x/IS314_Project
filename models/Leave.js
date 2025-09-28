const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Leave = sequelize.define('Leave', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    leaveTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    numberOfDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      validate: {
        min: 0.5
      }
    },
    numberOfHours: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [10, 500]
      }
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional comments for the leave request'
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
      defaultValue: 'pending',
      allowNull: false
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    attachmentPath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isHalfDay: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    halfDayType: {
      type: DataTypes.ENUM('morning', 'afternoon'),
      allowNull: true
    },
    emergencyContact: {
      type: DataTypes.STRING,
      allowNull: true
    },
    handoverNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'leaves',
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['startDate', 'endDate']
      }
    ]
  });

  return Leave;
}; 