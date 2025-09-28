const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    type: {
      type: DataTypes.ENUM('info', 'success', 'warning', 'error'),
      defaultValue: 'info',
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('leave_request', 'leave_approval', 'leave_rejection', 'system', 'reminder'),
      allowNull: false
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    relatedId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    relatedType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    actionUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'notifications',
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['isRead']
      },
      {
        fields: ['category']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  return Notification;
}; 