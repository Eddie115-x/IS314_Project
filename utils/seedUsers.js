const { User } = require('../models');
const bcrypt = require('bcryptjs');

async function seedUsers() {
    try {
        console.log('👥 Starting user seeding...');

        // Clear existing users to ensure clean seeding
        await User.destroy({ where: {} });
        console.log('🗑️ Cleared existing users');

        // Create default admin user
        const adminUser = await User.create({
            employeeId: 'ADMIN001',
            firstName: 'System',
            lastName: 'Administrator',
            email: 'admin@company.com',
            password: 'admin123',
            department: 'IT',
            position: 'System Administrator',
            role: 'admin',
            hireDate: '2024-01-01',
            isActive: true
        });

        console.log('✅ Admin user created successfully');

        // Create default manager user
        const managerUser = await User.create({
            employeeId: 'MGR001',
            firstName: 'Department',
            lastName: 'Manager',
            email: 'manager@company.com',
            password: 'manager123',
            department: 'Sales',
            position: 'Sales Manager',
            role: 'manager',
            hireDate: '2024-01-01',
            isActive: true
        });

        console.log('✅ Manager user created successfully');

        // Create default HR user
        const hrUser = await User.create({
            employeeId: 'HR001',
            firstName: 'HR',
            lastName: 'Officer',
            email: 'hr@company.com',
            password: 'hr123456',
            department: 'Human Resources',
            position: 'HR Officer',
            role: 'hr',
            hireDate: '2024-01-01',
            isActive: true
        });

        console.log('✅ HR user created successfully');

        // Create default employee user
        const employeeUser = await User.create({
            employeeId: 'EMP001',
            firstName: 'Regular',
            lastName: 'Employee',
            email: 'employee@company.com',
            password: 'employee123',
            department: 'Sales',
            position: 'Sales Representative',
            managerId: managerUser.id,
            role: 'employee',
            hireDate: '2024-01-01',
            isActive: true
        });

        console.log('✅ Employee user created successfully');

        console.log('🎉 All users seeded successfully!');
        return true;

    } catch (error) {
        console.error('❌ Error seeding users:', error);
        throw error;
    }
}

module.exports = { seedUsers };
