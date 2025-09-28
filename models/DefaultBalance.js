module.exports = (sequelize, DataTypes) => {
  const DefaultBalance = sequelize.define('DefaultBalance', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    annualLeave: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 20,
      comment: 'Default annual leave days for new employees'
    },
    sickLeave: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 10,
      comment: 'Default sick leave days for new employees'
    },
    personalLeave: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 5,
      comment: 'Default personal leave days for new employees'
    },
    maxCarryOver: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 5,
      comment: 'Maximum days that can be carried over to next year'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether this default balance setting is active'
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
      comment: 'Admin who last updated these settings'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Notes about these default settings'
    }
  }, {
    tableName: 'default_balances',
    timestamps: true,
    comment: 'Default leave balance settings for new employees and rollover'
  });

  return DefaultBalance;
}; 