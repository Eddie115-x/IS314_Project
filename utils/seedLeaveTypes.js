const { LeaveType } = require('../models');

async function seedLeaveTypes() {
  try {
    // Clear existing leave types
    await LeaveType.destroy({ where: {} });

    // Create leave types based on Datec policy
    const leaveTypes = [
      {
        name: 'Annual Leave',
        description: 'Annual leave entitlement for employees',
        defaultDays: 15.0,
        monthlyProRata: 1.25,
        maxCarryForward: 0.0,
        color: '#28a745',
        requiresApproval: true,
        isActive: true
      },
      {
        name: 'Sick Leave',
        description: 'Medical leave for health-related absences',
        defaultDays: 10.0,
        monthlyProRata: 0.83,
        maxCarryForward: 0.0,
        color: '#dc3545',
        requiresApproval: true,
        isActive: true
      },
      {
        name: 'Bereavement Leave',
        description: 'Leave for bereavement purposes',
        defaultDays: 3.0,
        monthlyProRata: 0.25,
        maxCarryForward: 0.0,
        color: '#6c757d',
        requiresApproval: true,
        isActive: true
      },
      {
        name: 'LWOP',
        description: 'Leave Without Pay - applicable when employee exhausts leaves or is non-compliant',
        defaultDays: 0.0,
        monthlyProRata: 0.0,
        maxCarryForward: 0.0,
        color: '#ffc107',
        requiresApproval: true,
        isActive: true
      }
    ];

    await LeaveType.bulkCreate(leaveTypes);
    console.log('✅ Leave types seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding leave types:', error);
  }
}

module.exports = { seedLeaveTypes }; 