const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Audit = sequelize.define('Audit', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User who performed the action (null for system actions)'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Action performed (e.g., login, logout, create, update, delete)'
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Type of entity affected (e.g., user, leave, leave_balance)'
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID of the affected entity'
    },
    oldValues: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Previous values before change'
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'New values after change'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address of the user'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent string'
    },
    sessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Session identifier'
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'low',
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('authentication', 'authorization', 'data_access', 'data_modification', 'system', 'security'),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Human-readable description of the action'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the action'
    },
    isSuccessful: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether the action was successful'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if action failed'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'audits',
    timestamps: true,
    updatedAt: false, // Only track creation time
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['action']
      },
      {
        fields: ['entityType']
      },
      {
        fields: ['category']
      },
      {
        fields: ['severity']
      },
      {
        fields: ['createdAt']
      },
      {
        fields: ['userId', 'createdAt']
      },
      {
        fields: ['entityType', 'entityId']
      }
    ]
  });

  return Audit;
}; 