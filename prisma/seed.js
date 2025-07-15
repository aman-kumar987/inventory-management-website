const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding: Cleaning database and creating Super Admin...');

    // --- 1. Clean up all transactional and user data in the correct order ---
    console.log('Cleaning up existing data...');
    // Delete records that depend on others first
    await prisma.passwordResetToken.deleteMany({});
    await prisma.scrapApproval.deleteMany({});
    await prisma.activityLog.deleteMany({});
    await prisma.changeHistory.deleteMany({});
    await prisma.currentStock.deleteMany({});
    await prisma.consumption.deleteMany({});
    await prisma.inventory.deleteMany({});
    
    // Now delete records that are depended upon
    await prisma.user.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.itemGroup.deleteMany({});
    await prisma.plant.deleteMany({});
    await prisma.cluster.deleteMany({});

    // --- 2. Create the absolute bare minimum master data for the Super Admin ---
    console.log('Creating essential master data...');
    const defaultCluster = await prisma.cluster.create({
        data: { name: 'Default Corporate Cluster' }
    });
    
    const defaultPlant = await prisma.plant.create({
        data: { name: 'Head Office', clusterId: defaultCluster.id }
    });

    // --- 3. Create the single Super Admin user ---
    const saltRounds = 10;
    const password = 'Password123!'; // Use a secure, memorable password for development
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const superAdmin = await prisma.user.create({
        data: {
            name: 'Super Admin',
            email: 'admin@example.com',
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            plantId: defaultPlant.id,
            clusterId: defaultCluster.id,
        },
    });

    console.log('--- Seeding Finished ---');
    console.log('Database has been cleaned.');
    console.log(`Super Admin created successfully:`);
    console.log(`  Email: admin@example.com`);
    console.log(`  Password: ${password}`);
}

main()
    .catch((e) => {
        console.error('Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });