const { prisma } = require('../config/db');

/**
 * @desc Display the main dashboard with statistics cards.
 * @route GET /dashboard
 */
exports.showDashboard = async (req, res, next) => {
    try {
        const { user } = req.session;

        // Get filter params
        const selectedPlantId = req.query.plantId || 'all';
        const dataType = req.query.dataType || 'netStock';

        // Step 1: Determine accessible plants based on role
        let plantScope = {};
        if (user.role === 'CLUSTER_MANAGER') {
            plantScope = { clusterId: user.clusterId, isDeleted: false };
        } else if (user.role === 'USER' || user.role === 'VIEWER') {
            plantScope = { id: user.plantId, isDeleted: false };
        } else {
            plantScope = { isDeleted: false };
        }

        const accessiblePlants = await prisma.plant.findMany({
            where: plantScope,
            orderBy: { name: 'asc' }
        });

        // Step 2: Add "All" option if user is not a USER/VIEWER
        const includeAllOption = user.role !== 'USER' && user.role !== 'VIEWER';
        if (includeAllOption) {
            accessiblePlants.unshift({ id: 'all', name: 'All Plants' });
        }

        let dataTitle = '';
        let cardData = [];

        // Step 3: Aggregation filter base
        const filter = {
            isDeleted: false,
            item: { isDeleted: false }
        };

        if (selectedPlantId !== 'all') {
            filter.plantId = selectedPlantId;
        } else if (user.role === 'CLUSTER_MANAGER') {
            filter.plant = { clusterId: user.clusterId };
        }

        // ========== CASE 1: Net Available Stock ==========
        if (dataType === 'netStock') {
            dataTitle = 'Net Available Stock';

            const stocks = await prisma.currentStock.findMany({
                where: {
                    ...filter,
                    item: { isDeleted: false, itemGroup: { isDeleted: false } }
                },
                include: {
                    item: {
                        select: { itemGroupId: true }
                    }
                }
            });

            const grouped = stocks.reduce((acc, stock) => {
                const groupId = stock.item.itemGroupId;
                acc[groupId] = (acc[groupId] || 0) + stock.totalQty;
                return acc;
            }, {});

            const aggregationResult = Object.entries(grouped).map(([itemGroupId, sum]) => ({
                itemGroupId,
                _sum: { totalQty: sum }
            }));

            const itemGroupIds = aggregationResult.map(d => d.itemGroupId);
            const itemGroups = await prisma.itemGroup.findMany({ where: { id: { in: itemGroupIds } } });
            const itemGroupMap = new Map(itemGroups.map(g => [g.id, g.name]));

            cardData = aggregationResult.map(d => ({
                name: itemGroupMap.get(d.itemGroupId) || 'Unknown Group',
                value: d._sum.totalQty
            }));

            // ========== CASE 2: Inventory - Consumption ==========
        } else if (dataType === 'inventoryConsumptionDiff') {
            dataTitle = 'Inventory - Consumption';

            // Step 1: Fetch inventory grouped by itemGroupId
            const inventory = await prisma.currentStock.findMany({
                where: {
                    ...filter,
                    item: { isDeleted: false, itemGroup: { isDeleted: false } }
                },
                include: {
                    item: {
                        select: { itemGroupId: true }
                    }
                }
            });

            const inventoryGrouped = {};
            inventory.forEach(entry => {
                const groupId = entry.item.itemGroupId;
                if (groupId) {
                    inventoryGrouped[groupId] = (inventoryGrouped[groupId] || 0) + entry.totalQty;
                }
            });

            // Step 2: Fetch consumption grouped by itemGroupId
            const consumption = await prisma.consumption.findMany({
                where: {
                    ...filter,
                    item: { isDeleted: false, itemGroup: { isDeleted: false } }
                },
                include: {
                    item: {
                        select: { itemGroupId: true }
                    }
                }
            });

            const consumptionGrouped = {};
            consumption.forEach(entry => {
                const groupId = entry.item.itemGroupId;
                if (groupId) {
                    consumptionGrouped[groupId] = (consumptionGrouped[groupId] || 0) + entry.quantity;
                }
            });

            // Step 3: Combine both groups
            const allGroupIds = new Set([
                ...Object.keys(inventoryGrouped),
                ...Object.keys(consumptionGrouped)
            ]);

            const itemGroups = await prisma.itemGroup.findMany({
                where: { id: { in: [...allGroupIds] } }
            });

            const itemGroupMap = new Map(itemGroups.map(g => [g.id, g.name]));

            cardData = Array.from(allGroupIds).map(groupId => {
                const inventoryQty = inventoryGrouped[groupId] || 0;
                const consumedQty = consumptionGrouped[groupId] || 0;
                return {
                    name: itemGroupMap.get(groupId) || 'Unknown Group',
                    value: inventoryQty - consumedQty
                };
            });
        // ========== CASE 3: Total Consumed ==========
        } else {
            dataTitle = 'Total Consumed';

            const consumptions = await prisma.consumption.findMany({
                where: {
                    ...filter,
                    item: { isDeleted: false, itemGroup: { isDeleted: false } }
                },
                include: {
                    item: {
                        select: { itemGroupId: true }
                    }
                }
            });

            const grouped = consumptions.reduce((acc, entry) => {
                if (entry.item.itemGroupId) {
                    const groupId = entry.item.itemGroupId;
                    acc[groupId] = (acc[groupId] || 0) + entry.quantity;
                }
                return acc;
            }, {});

            const aggregationResult = Object.entries(grouped).map(([itemGroupId, sum]) => ({
                itemGroupId,
                _sum: { quantity: sum }
            }));

            const itemGroupIds = aggregationResult.map(d => d.itemGroupId);
            const itemGroups = await prisma.itemGroup.findMany({ where: { id: { in: itemGroupIds } } });
            const itemGroupMap = new Map(itemGroups.map(g => [g.id, g.name]));

            cardData = aggregationResult.map(d => ({
                name: itemGroupMap.get(d.itemGroupId) || 'Unknown Group',
                value: d._sum.quantity || 0
            }));
        }

        res.render('dashboard/index', {
            title: 'Dashboard',
            accessiblePlants,
            selectedPlantId,
            dataType,
            dataTitle,
            cardData,
            user
        });

    } catch (error) {
        console.error('Dashboard Error:', error);
        next(error);
    }
};
