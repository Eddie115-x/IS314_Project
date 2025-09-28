const { LeaveType, DefaultBalance, Leave, User, UserLeaveBalance } = require('../models');
const { seedUsers } = require('./seedUsers');

async function seedDatabase() {
    try {
        console.log('🌱 Starting database seeding...');

        // Clear existing data
        await LeaveType.destroy({ where: {} });
        await DefaultBalance.destroy({ where: {} });

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

        // Create default balance settings
        const defaultBalance = await DefaultBalance.create({
            annualLeave: 15.0,
            sickLeave: 10.0,
            personalLeave: 3.0,
            maxCarryOver: 0.0,
            isActive: true,
            notes: 'Default Datec leave balance settings'
        });

        console.log('✅ Default balance settings seeded successfully');

        // Seed users (including admin)
        await seedUsers();

        // Seed sample leave requests
        await seedSampleLeaves();

        // Seed user leave balances
        await seedUserLeaveBalances();

        console.log('🎉 Database seeding completed successfully!');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
}

async function seedSampleLeaves() {
    try {
        console.log('🌱 Seeding sample leave requests...');

        // Clear existing leaves
        await Leave.destroy({ where: {} });

        // Get users and leave types for reference
        const users = await User.findAll();
        const leaveTypes = await LeaveType.findAll();

        if (users.length === 0 || leaveTypes.length === 0) {
            console.log('⚠️ No users or leave types found, skipping leave seeding');
            return;
        }

        // Get specific users by role
        const employee = users.find(u => u.role === 'employee');
        const manager = users.find(u => u.role === 'manager');
        const hr = users.find(u => u.role === 'hr');

        if (!employee || !manager || !hr) {
            console.log('⚠️ Required users not found, skipping leave seeding');
            return;
        }

        // Sample leave requests
        const sampleLeaves = [
            {
                userId: employee.id,
                leaveTypeId: leaveTypes.find(lt => lt.name === 'Annual Leave').id,
                startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
                numberOfDays: 4.0,
                numberOfHours: 32.0,
                reason: 'Family vacation',
                status: 'pending',
                managerId: manager.id,
                comments: 'Planning a family trip to the beach',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                userId: employee.id,
                leaveTypeId: leaveTypes.find(lt => lt.name === 'Sick Leave').id,
                startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
                numberOfDays: 2.0,
                numberOfHours: 16.0,
                reason: 'Medical appointment and recovery',
                status: 'approved',
                managerId: manager.id,
                approvedAt: new Date(),
                approvedBy: manager.id,
                comments: 'Had a medical procedure, needed recovery time',
                createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                updatedAt: new Date()
            },
            {
                userId: hr.id,
                leaveTypeId: leaveTypes.find(lt => lt.name === 'Annual Leave').id,
                startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
                endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000), // 16 days from now
                numberOfDays: 3.0,
                numberOfHours: 24.0,
                reason: 'Personal time off',
                status: 'pending',
                managerId: manager.id,
                comments: 'Taking some personal time for relaxation',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                userId: manager.id,
                leaveTypeId: leaveTypes.find(lt => lt.name === 'Bereavement Leave').id,
                startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
                endDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
                numberOfDays: 3.0,
                numberOfHours: 24.0,
                reason: 'Family bereavement',
                status: 'approved',
                managerId: hr.id,
                approvedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
                approvedBy: hr.id,
                comments: 'Family member passed away, needed time for arrangements',
                createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
                updatedAt: new Date()
            }
        ];

        await Leave.bulkCreate(sampleLeaves);
        console.log('✅ Sample leave requests seeded successfully');

    } catch (error) {
        console.error('❌ Error seeding sample leaves:', error);
        // Don't throw error here to allow other seeding to continue
    }
}

async function seedUserLeaveBalances() {
    try {
        console.log('🌱 Seeding user leave balances...');

        // Clear existing balances
        await UserLeaveBalance.destroy({ where: {} });

        // Get users and leave types for reference
        const users = await User.findAll();
        const leaveTypes = await LeaveType.findAll();

        if (users.length === 0 || leaveTypes.length === 0) {
            console.log('⚠️ No users or leave types found, skipping balance seeding');
            return;
        }

        const balances = [];

        for (const user of users) {
            for (const leaveType of leaveTypes) {
                let allocatedDays = 0;
                let usedDays = 0;
                let remainingDays = 0;

                // Set different balances based on role and leave type
                if (leaveType.name === 'Annual Leave') {
                    allocatedDays = user.role === 'admin' ? 20.0 : 15.0;
                    usedDays = user.role === 'employee' ? 2.0 : 0.0; // Employee used 2 days
                } else if (leaveType.name === 'Sick Leave') {
                    allocatedDays = 10.0;
                    usedDays = user.role === 'employee' ? 2.0 : 0.0; // Employee used 2 days
                } else if (leaveType.name === 'Bereavement Leave') {
                    allocatedDays = 3.0;
                    usedDays = user.role === 'manager' ? 3.0 : 0.0; // Manager used 3 days
                } else if (leaveType.name === 'LWOP') {
                    allocatedDays = 0.0;
                    usedDays = 0.0;
                }

                remainingDays = allocatedDays - usedDays;

                balances.push({
                    userId: user.id,
                    leaveTypeId: leaveType.id,
                    allocatedDays: allocatedDays,
                    usedDays: usedDays,
                    remainingDays: remainingDays,
                    year: new Date().getFullYear(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
        }

        await UserLeaveBalance.bulkCreate(balances);
        console.log('✅ User leave balances seeded successfully');

    } catch (error) {
        console.error('❌ Error seeding user leave balances:', error);
        // Don't throw error here to allow other seeding to continue
    }
}

module.exports = { seedDatabase }; 