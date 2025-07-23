const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    console.log('--- Production Seeding Started ---');

    // 1. Clean up all data to ensure a fresh start
    console.log('Cleaning database...');
    // The order is important to avoid foreign key constraint errors
    await prisma.consumptionScrapApproval.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.scrapApproval.deleteMany({});
    await prisma.activityLog.deleteMany({});
    await prisma.changeHistory.deleteMany({});
    await prisma.currentStock.deleteMany({});
    await prisma.consumption.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.itemGroup.deleteMany({});
    await prisma.plant.deleteMany({});
    await prisma.cluster.deleteMany({});
    console.log('Database cleaned successfully.');

    // 2. Create the absolute minimum required master data
    console.log('Creating essential master data...');
    const corporateCluster = await prisma.cluster.create({
        data: { name: 'Corporate Head Office' }
    });
    
    const corporatePlant = await prisma.plant.create({
        data: { name: 'Main Office', clusterId: corporateCluster.id }
    });

    // 3. Create the single Super Admin user
    const saltRounds = 10;
    // IMPORTANT: Change this password before giving it to the client
    const password = 'Password123!'; 
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const superAdmin = await prisma.user.create({
        data: {
            name: 'Super Admin',
            email: 'admin@example.com', // The client can change this later
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            plantId: corporatePlant.id,
            clusterId: corporateCluster.id,
        },
    });

    console.log('--- Seeding Finished Successfully ---');
    console.log('A clean database has been prepared.');
    console.log('The initial SUPER_ADMIN account has been created:');
    console.log(`  Email: admin@example.com`);
    console.log(`  Password: ${password}`);
}

main()
    .catch((e) => {
        console.error('Production seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });