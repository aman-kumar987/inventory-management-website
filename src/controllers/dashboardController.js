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

        // Step 3: Aggregation based on filter
        const filter = {
            isDeleted: false,
            item: { isDeleted: false }
        };

        if (selectedPlantId !== 'all') {
            filter.plantId = selectedPlantId;
        } else if (user.role === 'CLUSTER_MANAGER') {
            filter.plant = { clusterId: user.clusterId };
        }

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

        } else {
            // Other types: new, oldUsed, scrapped, consumed
            const typeMap = {
                new: { field: 'newQty', title: 'Total New Stock', table: 'inventory' },
                oldUsed: { field: 'oldUsedQty', title: 'Total Old/Used Stock', table: 'inventory' },
                scrapped: { field: 'scrappedQty', title: 'Total Scrapped Stock', table: 'inventory' },
                consumed: { field: 'quantity', title: 'Total Consumed', table: 'consumption' }
            };

            const { field, title, table } = typeMap[dataType];
            dataTitle = title;

            const whereClause = {
                ...filter,
                itemGroupId: { not: null }
            };

            const aggregationResult = await prisma[table].groupBy({
                by: ['itemGroupId'],
                where: whereClause,
                _sum: { [field]: true }
            });

            const itemGroupIds = aggregationResult.map(d => d.itemGroupId);
            const itemGroups = await prisma.itemGroup.findMany({ where: { id: { in: itemGroupIds } } });
            const itemGroupMap = new Map(itemGroups.map(g => [g.id, g.name]));

            cardData = aggregationResult.map(d => ({
                name: itemGroupMap.get(d.itemGroupId) || 'Unknown Group',
                value: d._sum[field] || 0
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