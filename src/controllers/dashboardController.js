const { prisma } = require('../config/db');


/**
 * @desc Display the main dashboard with statistics cards.
 * @route GET /dashboard
 */
exports.showDashboard = async (req, res, next) => {
    try {
        const { user } = req.session;
        const { plantId: plantFilter = 'all', dataType = 'inventory', stockType: stockTypeFilter = 'all' } = req.query;

        // Step 1: Determine accessible plants based on user role
        let plantScope = { isDeleted: false };
        if (user.role === 'CLUSTER_MANAGER') {
            plantScope.clusterId = user.clusterId;
        } else if (user.role === 'USER' || user.role === 'VIEWER') {
            plantScope.id = user.plantId;
        }

        const accessiblePlants = await prisma.plant.findMany({ where: plantScope, orderBy: { name: 'asc' } });
        if (user.role !== 'USER' && user.role !== 'VIEWER') {
            accessiblePlants.unshift({ id: 'all', name: 'All Plants' });
        }

        // Step 2: Prepare for data aggregation
        let dataTitle = '';
        // THE FIX: Fetch all item groups at the start and create the map
        const itemGroups = await prisma.itemGroup.findMany({ where: { isDeleted: false } });
        const itemGroupMap = new Map(itemGroups.map(g => [g.id, { id: g.id, name: g.name, value: 0 }]));

        const baseWhere = {
            isDeleted: false,
            item: { isDeleted: false, itemGroup: { isDeleted: false } },
        };
        if (plantFilter !== 'all') {
            baseWhere.plantId = plantFilter;
        } else if (user.role === 'CLUSTER_MANAGER') {
            baseWhere.plant = { clusterId: user.clusterId };
        } else if (user.role === 'USER' || user.role === 'VIEWER') {
            baseWhere.plantId = user.plantId;
        }

        // Step 3: Fetch and process data based on selected data type
        if (dataType === 'inventory') {
            dataTitle = 'Available Inventory';
            if (stockTypeFilter !== 'all') {
                dataTitle += ` (${stockTypeFilter.charAt(0).toUpperCase() + stockTypeFilter.slice(1)})`;
            }

            if (stockTypeFilter === 'scrapped') {
                const scrappedData = await prisma.inventory.groupBy({
                    by: ['itemId'],
                    where: baseWhere,
                    _sum: { scrappedQty: true },
                });
                const items = await prisma.item.findMany({ where: { id: { in: scrappedData.map(d => d.itemId) } }, select: { id: true, itemGroupId: true } });
                const itemToGroupMap = new Map(items.map(i => [i.id, i.itemGroupId]));
                
                scrappedData.forEach(item => {
                    const groupId = itemToGroupMap.get(item.itemId);
                    if (groupId && itemGroupMap.has(groupId)) {
                        itemGroupMap.get(groupId).value += Number(item._sum.scrappedQty || 0n);
                    }
                });
            } else {
                const stockData = await prisma.currentStock.findMany({
                    where: baseWhere,
                    include: { item: { select: { itemGroupId: true } } }
                });
                stockData.forEach(stock => {
                    const group = itemGroupMap.get(stock.item.itemGroupId);
                    if (group) {
                        if (stockTypeFilter === 'new') group.value += Number(stock.newQty);
                        else if (stockTypeFilter === 'oldUsed') group.value += Number(stock.oldUsedQty);
                        else group.value += Number(stock.newQty) + Number(stock.oldUsedQty);
                    }
                });
            }
        } else { // dataType === 'consumption'
            dataTitle = 'Net Consumption';
            const consumptionData = await prisma.consumption.groupBy({
                by: ['itemId'],
                where: { ...baseWhere, oldAndReceived: false },
                _sum: { quantity: true },
            });
            const items = await prisma.item.findMany({ where: { id: { in: consumptionData.map(d => d.itemId) } }, select: { id: true, itemGroupId: true } });
            const itemToGroupMap = new Map(items.map(i => [i.id, i.itemGroupId]));

            consumptionData.forEach(item => {
                const groupId = itemToGroupMap.get(item.itemId);
                if (groupId && itemGroupMap.has(groupId)) {
                    itemGroupMap.get(groupId).value += Number(item._sum.quantity || 0n);
                }
            });
        }

        const cardData = Array.from(itemGroupMap.values());
        
        // Step 4: Calculate Quick Stats for the top cards
        let totalQuantity = 0;
        let topGroup = { name: 'N/A', value: -1 };

        cardData.forEach(card => {
            totalQuantity += card.value;
            if (card.value > topGroup.value) {
                topGroup = card;
            }
        });

        const quickStats = {
            totalQuantity,
            groupCount: cardData.filter(c => c.value > 0).length,
            topGroupName: topGroup.name
        };

        // Step 5: Render the view with all necessary data
        res.render('dashboard/index', {
            title: 'Dashboard',
            accessiblePlants,
            selectedPlantId: plantFilter,
            dataType,
            stockType: stockTypeFilter,
            dataTitle,
            cardData,
            user,
            itemGroups, // Pass the full list for linking
            quickStats 
        });

    } catch (error) {
        console.error('Dashboard Error:', error);
        next(error);
    }
};



/**
 * @desc Display the drill-down summary for a specific Item Group, with filters and view modes.
 * @route GET /dashboard/summary
 */
exports.getGroupSummary = async (req, res, next) => {
    try {
        const { user } = req.session;
        // CHANGE: Ab hum 'plantId' ke bajaye 'search' term lenge
        const { itemGroupId, search = '', dataType = 'inventory' } = req.query;

        if (!itemGroupId) { /* ... error handling ... */ }
        const itemGroup = await prisma.itemGroup.findUnique({ where: { id: itemGroupId } });
        if (!itemGroup) { /* ... error handling ... */ }

        // --- Accessible Plants (ab filter ke liye zaroori nahi, lekin aage kaam aa sakta hai) ---
        let plantScope = { isDeleted: false };
        if (user.role === 'CLUSTER_MANAGER') plantScope.clusterId = user.clusterId;
        else if (user.role === 'USER' || user.role === 'VIEWER') plantScope.id = user.plantId;
        const accessiblePlants = await prisma.plant.findMany({ where: plantScope, orderBy: { name: 'asc' } });
        if (user.role !== 'USER' && user.role !== 'VIEWER') {
            accessiblePlants.unshift({ id: 'all', name: 'All Plants' });
        }
        
        // --- Data Fetching Logic (Updated with Search) ---
        let summaryData = [];
        let viewTitle = '';

        // CHANGE: Base filter mein ab search logic hai
        const baseWhere = {
            isDeleted: false,
            item: {
                itemGroupId: itemGroupId,
                isDeleted: false
            }
        };

        if (search) {
            baseWhere.OR = [
                { plant: { name: { contains: search, mode: 'insensitive' } } },
                { item: { item_code: { contains: search, mode: 'insensitive' } } },
                { item: { item_description: { contains: search, mode: 'insensitive' } } }
            ];
        }

        if (dataType === 'consumption') {
            // ... (consumption logic waisa hi hai, bas naya baseWhere use karega)
            viewTitle = `Consumption Summary for ${itemGroup.name}`;
            const consumptions = await prisma.consumption.groupBy({
                by: ['plantId', 'itemId'],
                where: { ...baseWhere, oldAndReceived: false },
                _sum: { quantity: true },
            });
            // ... (baaki ka mapping logic waisa hi hai)
             const items = await prisma.item.findMany({ where: { id: { in: consumptions.map(c => c.itemId) } } });
            const plants = await prisma.plant.findMany({ where: { id: { in: consumptions.map(c => c.plantId) } } });
            const itemMap = new Map(items.map(i => [i.id, i]));
            const plantMap = new Map(plants.map(p => [p.id, p]));
            summaryData = consumptions.map(c => ({
                plantId: c.plantId, itemId: c.itemId,
                plantName: plantMap.get(c.plantId)?.name || 'N/A',
                itemCode: itemMap.get(c.itemId)?.item_code || 'N/A',
                itemDescription: itemMap.get(c.itemId)?.item_description || '-',
                uom: itemMap.get(c.itemId)?.uom || 'N/A',
                consumed: c._sum.quantity || 0,
            }));

        } else { // 'inventory' view
            // ... (inventory logic waisa hi hai, bas naya baseWhere use karega)
            viewTitle = `Inventory Summary for ${itemGroup.name}`;
            const liveStocks = await prisma.currentStock.findMany({ where: baseWhere, include: { item: true, plant: true } });
            const consumptionData = await prisma.consumption.groupBy({ by: ['itemId', 'plantId'], where: { ...baseWhere, oldAndReceived: false }, _sum: { quantity: true } });
            const consumptionMap = new Map(consumptionData.map(c => [`${c.plantId}-${c.itemId}`, c._sum.quantity || 0]));
            summaryData = liveStocks.map(stock => ({
                plantName: stock.plant.name,
                itemCode: stock.item.item_code,
                itemDescription: stock.item.item_description,
                uom: stock.item.uom,
                newQty: stock.newQty,
                oldUsedQty: stock.oldUsedQty,
                consumed: consumptionMap.get(`${stock.plantId}-${stock.itemId}`) || 0,
                netAvailable: stock.newQty + stock.oldUsedQty,
            }));
        }
        
        res.render('dashboard/summary', {
            title: viewTitle,
            summaryData,
            itemGroup,
            user,
            accessiblePlants,
            filters: req.query,
            dataType
        });

    } catch (error) {
        next(error);
    }
};