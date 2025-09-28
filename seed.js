const { seedDatabase } = require('./utils/seedDatabase');

async function runSeed() {
    try {
        console.log('🚀 Starting database seeding...');
        await seedDatabase();
        console.log('✅ Seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

runSeed();
