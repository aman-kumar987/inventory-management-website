const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding Started ---');

    // 1. Clean up existing data to ensure a fresh start
    console.log('Cleaning database...');
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
    console.log('Database cleaned.');

    // 2. Create Master Data: Clusters and Plants
    console.log('Creating Clusters and Plants...');
    const northCluster = await prisma.cluster.create({ data: { name: 'North Cluster' } });
    const southCluster = await prisma.cluster.create({ data: { name: 'South Cluster' } });

    const plantA = await prisma.plant.create({ data: { name: 'Plant A (North)', clusterId: northCluster.id } });
    const plantB = await prisma.plant.create({ data: { name: 'Plant B (North)', clusterId: northCluster.id } });
    const plantC = await prisma.plant.create({ data: { name: 'Plant C (South)', clusterId: southCluster.id } });

    // 3. Create Master Data: Item Groups and Items
    console.log('Creating Item Groups and Items...');
    const electricalGroup = await prisma.itemGroup.create({ data: { name: 'Electrical Components' } });
    const mechanicalGroup = await prisma.itemGroup.create({ data: { name: 'Mechanical Parts' } });

    const motor = await prisma.item.create({ data: { item_code: 'MOT-001', item_description: '10HP Induction Motor', uom: 'NOS', itemGroupId: electricalGroup.id } });
    const cable = await prisma.item.create({ data: { item_code: 'CBL-002', item_description: '100m Copper Cable', uom: 'MTR', itemGroupId: electricalGroup.id } });
    const bearing = await prisma.item.create({ data: { item_code: 'BRG-003', item_description: '6205 Ball Bearing', uom: 'NOS', itemGroupId: mechanicalGroup.id } });

    // 4. Create Users for each role
    console.log('Creating Users...');
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    const superAdmin = await prisma.user.create({ data: { name: 'Super Admin', email: 'admin@example.com', password: hashedPassword, role: 'SUPER_ADMIN', status: 'ACTIVE', plantId: plantA.id, clusterId: northCluster.id } });
    const northManager = await prisma.user.create({ data: { name: 'North Manager', email: 'manager.north@example.com', password: hashedPassword, role: 'CLUSTER_MANAGER', status: 'ACTIVE', plantId: plantA.id, clusterId: northCluster.id } });
    const userA = await prisma.user.create({ data: { name: 'User Plant A', email: 'user.planta@example.com', password: hashedPassword, role: 'USER', status: 'ACTIVE', plantId: plantA.id, clusterId: northCluster.id } });
    const userC = await prisma.user.create({ data: { name: 'User Plant C', email: 'user.plantc@example.com', password: hashedPassword, role: 'USER', status: 'ACTIVE', plantId: plantC.id, clusterId: southCluster.id } });
    const viewer = await prisma.user.create({ data: { name: 'Viewer User', email: 'viewer@example.com', password: hashedPassword, role: 'VIEWER', status: 'ACTIVE', plantId: plantA.id, clusterId: northCluster.id } });

    // 5. Seed Inventory and create CurrentStock records
    console.log('Seeding Inventory and Current Stock...');
    const inventoryData = [
        { reservationNumber: 'RES-001', date: new Date(), plantId: plantA.id, itemId: motor.id, newQty: 50, oldUsedQty: 10, scrappedQty: 0, createdBy: userA.id },
        { reservationNumber: 'RES-001', date: new Date(), plantId: plantA.id, itemId: cable.id, newQty: 1000, oldUsedQty: 250, scrappedQty: 0, createdBy: userA.id },
        { reservationNumber: 'RES-002', date: new Date(), plantId: plantB.id, itemId: motor.id, newQty: 25, oldUsedQty: 5, scrappedQty: 0, createdBy: superAdmin.id },
        { reservationNumber: 'RES-003', date: new Date(), plantId: plantC.id, itemId: bearing.id, newQty: 500, oldUsedQty: 0, scrappedQty: 0, createdBy: userC.id },
    ];

    for (const data of inventoryData) {
        // Create inventory log
        const inv = await prisma.inventory.create({ data });
        // Create or update the stock summary
        await prisma.currentStock.upsert({
            where: { plantId_itemId: { plantId: data.plantId, itemId: data.itemId } },
            update: { newQty: { increment: data.newQty }, oldUsedQty: { increment: data.oldUsedQty } },
            create: { plantId: data.plantId, itemId: data.itemId, newQty: data.newQty, oldUsedQty: data.oldUsedQty }
        });
    }

    // 6. Seed some Consumption data
    console.log('Seeding Consumption...');
    // seed.js ke andar is block ko replace karein
    await prisma.consumption.create({
        data: {
            date: new Date(),
            plantId: plantA.id,
            itemId: motor.id,
            quantity: 5,
            consumption_location: 'Workshop 1',
            sub_location: null, 
            remarks: 'Routine consumption for testing.',
            new_itemCode: motor.id,
            createdBy: userA.id,
        }
    });
    // Update stock for the consumed item
    await prisma.currentStock.update({
        where: { plantId_itemId: { plantId: plantA.id, itemId: motor.id } },
        data: { newQty: { decrement: 5 } }
    });

    // 7. Create a pending scrap approval to test the workflow
    console.log('Creating a pending scrap approval...');
    const scrapInventory = await prisma.inventory.create({
        data: {
            reservationNumber: 'RES-FOR-SCRAP',
            date: new Date(),
            plantId: plantA.id,
            itemId: bearing.id,
            newQty: 10,
            oldUsedQty: 5,
            // User requests to scrap 3, but it needs approval so `scrappedQty` is 0 for now
            scrappedQty: 0,
            createdBy: userA.id
        }
    });
    await prisma.scrapApproval.create({
        data: {
            inventoryId: scrapInventory.id,
            requestedQty: 3,
            status: 'PENDING',
            remarks: 'Bearings are rusted.',
            requestedById: userA.id
        }
    });


    console.log('--- Seeding Finished Successfully! ---');
    console.log('\n--- LOGIN CREDENTIALS ---');
    console.log(`Password for all users: Password123!`);
    console.log('------------------------------------');
    console.log(`- Super Admin:   admin@example.com`);
    console.log(`- Cluster Manager: manager.north@example.com`);
    console.log(`- User (Plant A):  user.planta@example.com`);
    console.log(`- User (Plant C):  user.plantc@example.com`);
    console.log(`- Viewer:          viewer@example.com`);
    console.log('------------------------------------');

}

main()
    .catch((e) => {
        console.error('Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });