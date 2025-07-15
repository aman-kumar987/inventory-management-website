const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const { sanitize } = require('../utils/sanitizer');
const ExcelJS = require('exceljs');
// --- Re-usable Helper Function ---
const getDropdownData = async (user) => {
    let accessiblePlantIds = [];

    // Determine which plants the current user can access
    if (user.role === 'SUPER_ADMIN') {
        const allPlants = await prisma.plant.findMany({ where: { isDeleted: false, cluster: { isDeleted: false } }, select: { id: true } });
        accessiblePlantIds = allPlants.map(p => p.id);
    } else if (user.role === 'CLUSTER_MANAGER') {
        const clusterPlants = await prisma.plant.findMany({ where: { clusterId: user.clusterId, isDeleted: false, cluster: { isDeleted: false } }, select: { id: true } });
        accessiblePlantIds = clusterPlants.map(p => p.id);
    } else { // 'USER' role
        accessiblePlantIds = [user.plantId];
    }

    const plants = await prisma.plant.findMany({
        where: { id: { in: accessiblePlantIds }, isDeleted: false },
        orderBy: { name: 'asc' }
    });

    // Fetch only items that exist in an ACTIVE CurrentStock record with quantity > 0
    const availableStock = await prisma.currentStock.findMany({
        where: {
            plantId: { in: accessiblePlantIds },
            totalQty: { gt: 0 },
            isDeleted: false,
            item: { isDeleted: false, itemGroup: { isDeleted: false } }
        },
        include: {
            item: {
                select: { id: true, item_code: true, item_description: true }
            }
        }
    });
    // Create a unique list of items that have stock
    const itemsWithStock = availableStock.map(stock => stock.item).filter((item, index, self) =>
        index === self.findIndex((t) => (t.id === item.id))
    );

    // Fetch a complete list of all ACTIVE items for the "Old Received" dropdown
    const allMasterItems = await prisma.item.findMany({
        where: { isDeleted: false, itemGroup: { isDeleted: false } },
        orderBy: { item_code: 'asc' }
    });

    return { plants, items: itemsWithStock, allItems: allMasterItems };
};


// --- Controller Functions ---

/**
 * @desc    Render the form to add new consumption records
 * @route   GET /consumption/new
 */
exports.renderNewForm = async (req, res, next) => {
    try {
        const { user } = req.session;
        const { plants, items, allItems } = await getDropdownData(user);
        res.render('consumption/add', {
            title: 'Add Consumption',
            plants,
            items,
            allItems,
            user,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process and create new consumption records with sanitization.
 * @route   POST /consumption
 */
exports.createConsumption = async (req, res, next) => {
    // Only 'date' is a shared field
    const { date } = req.body;
    const { lineItems } = req.body;
    const { user } = req.session;

    if (!date || !lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        req.session.flash = { type: 'error', message: 'Date and at least one consumption entry are required.' };
        return res.redirect('/consumption/new');
    }

    const consumptionDate = new Date(date);

    try {
        const consumedItemsDetails = [];
        await prisma.$transaction(async (tx) => {
            for (const [index, item] of lineItems.entries()) {
                const entryNum = index + 1;
                
                const { 
                    location, subLocation, quantity: qtyString, remarks, isReturnable: returnableString, 
                    oldReceived: oldReceivedString, new_assetNo, new_serialNo, new_poNo,
                    old_assetNo, old_serialNo, old_poNo, old_faultRemark
                } = item;
                
                const quantity = parseInt(qtyString);
                const isReturnable = returnableString === 'on';
                const oldReceived = oldReceivedString === 'on';
                const stockPlantId = user.role === 'USER' ? user.plantId : item.plantId;

                // --- Validation ---
                if (!location || !quantity || quantity <= 0) throw new Error(`Entry #${entryNum}: Location and a positive Quantity are required.`);
                if (!stockPlantId) throw new Error(`Entry #${entryNum}: Plant is a required field.`);
                if (!item.new_itemCode) throw new Error(`Entry #${entryNum}: 'Item Code (New)' is mandatory.`);
                if (oldReceived && !item.old_itemCode) throw new Error(`Entry #${entryNum}: 'Item Code (Old)' is mandatory when 'Old Received' is Yes.`);

                // Check for sufficient stock...
                const currentStock = await tx.currentStock.findUnique({
                    where: { plantId_itemId: { plantId: stockPlantId, itemId: item.new_itemCode } }
                });
                if (!currentStock || currentStock.totalQty < quantity) {
                    throw new Error(`Insufficient stock for new item at Entry #${entryNum}.`);
                }

                // Create the consumption record with sanitized data
                const consumptionRecord = await tx.consumption.create({
                    data: {
                        date: consumptionDate,
                        plantId: stockPlantId,
                        consumption_location: sanitize(location),
                        sub_location: sanitize(subLocation) || null,
                        quantity: quantity,
                        isReturnable: isReturnable,
                        remarks: sanitize(remarks) || null,
                        itemId: item.new_itemCode,
                        newInstallation: true,
                        new_itemCode: item.new_itemCode,
                        new_assetNo: sanitize(new_assetNo),
                        new_serialNo: sanitize(new_serialNo),
                        new_poNo: sanitize(new_poNo),
                        oldAndReceived: oldReceived,
                        old_itemCode: oldReceived ? item.old_itemCode : null,
                        old_assetNo: oldReceived ? sanitize(old_assetNo) : null,
                        old_serialNo: oldReceived ? sanitize(old_serialNo) : null,
                        old_poNo: oldReceived ? sanitize(old_poNo) : null,
                        old_faultRemark: oldReceived ? sanitize(old_faultRemark) : null,
                        createdBy: user.id,
                    }
                });

                consumedItemsDetails.push({ consumptionId: consumptionRecord.id, itemId: item.new_itemCode, quantity });
                
                // Decrement stock...
                await tx.currentStock.update({
                    where: { plantId_itemId: { plantId: stockPlantId, itemId: item.new_itemCode } },
                    data: { totalQty: { decrement: quantity } },
                });

                // Increment stock if old item was received...
                if (oldReceived && item.old_itemCode) {
                    await tx.currentStock.upsert({
                       where: { plantId_itemId: { plantId: stockPlantId, itemId: item.old_itemCode } },
                       update: { totalQty: { increment: quantity } },
                       create: { plantId: stockPlantId, itemId: item.old_itemCode, totalQty: quantity }
                    });
                }
            }
        });

        await logActivity({
            userId: user.id, action: 'CONSUMPTION_CREATE', ipAddress: req.ip,
            details: { date, itemCount: consumedItemsDetails.length, items: consumedItemsDetails }
        });

        req.session.flash = { type: 'success', message: 'Consumption recorded successfully.' };
        res.redirect('/consumption');

    } catch (error) {
        console.error("Consumption creation failed:", error.message);
        req.session.flash = { type: 'error', message: `Failed to record consumption: ${error.message}` };
        return res.redirect('/consumption/new');
    }
};

/**
 * @desc    Display consumption history with powerful search, filtering, and role-based data scoping.
 * @route   GET /consumption
 */
exports.listConsumptions = async (req, res, next) => {
    try {
        const { user } = req.session;
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        // --- DESTRUCTURE ALL FILTERS ---
        const {
            search = '',
            dateFilter,
            plantFilter,
            itemGroupFilter,
            statusFilter,
            qty, qtyOp = 'gt'
        } = req.query;

        // --- DYNAMICALLY BUILD THE WHERE CLAUSE ---
        const whereClause = { isDeleted: false, AND: [] };

        // 1. EXPANDED Broad Text Search (Your existing logic is correct)
        if (search) {
            whereClause.AND.push({
                OR: [
                    { item: { item_code: { contains: search, mode: 'insensitive' } } },
                    { item: { item_description: { contains: search, mode: 'insensitive' } } },
                    { item: { itemGroup: { name: { contains: search, mode: 'insensitive' } } } },
                    { oldItem: { item_code: { contains: search, mode: 'insensitive' } } },
                    { oldItem: { item_description: { contains: search, mode: 'insensitive' } } },
                    { oldItem: { itemGroup: { name: { contains: search, mode: 'insensitive' } } } },
                    { new_serialNo: { contains: search, mode: 'insensitive' } },
                    { old_serialNo: { contains: search, mode: 'insensitive' } },
                    { new_assetNo: { contains: search, mode: 'insensitive' } },
                    { old_assetNo: { contains: search, mode: 'insensitive' } },
                    { new_poNo: { contains: search, mode: 'insensitive' } },
                    { old_poNo: { contains: search, mode: 'insensitive' } },
                ]
            });
        }
        
        // 2. Add Specific Field Filters (Your existing logic is correct)
        if (dateFilter) { /* ... */ }
        if (plantFilter) whereClause.AND.push({ plantId: plantFilter });
        if (itemGroupFilter) { /* ... */ }
        if (statusFilter !== undefined && statusFilter !== '') { /* ... */ }
        if (qty) { /* ... */ }
        
        // --- THIS IS THE MODIFICATION: Data Scoping for user roles ---
        let plantScope = {}; // For filtering the dropdown list itself
        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({ 
                where: { clusterId: user.clusterId, isDeleted: false }, 
                select: { id: true } 
            });
            const plantIds = plantsInCluster.map(p => p.id);
            whereClause.AND.push({ plantId: { in: plantIds.length > 0 ? plantIds : ['non-existent-id'] } });
            plantScope = { id: { in: plantIds } };
        } else if (user.role === 'USER') {
            whereClause.AND.push({ plantId: { equals: user.plantId } });
            plantScope = { id: { equals: user.plantId } };
        }
        // Super Admins will have no plantId filter pushed, so they see everything.

        if (whereClause.AND.length === 0) {
            delete whereClause.AND;
        }

        // --- FETCH DATA ---
        const [consumptions, totalRecords, plants, itemGroups] = await Promise.all([
            prisma.consumption.findMany({
                where: whereClause, skip, take: limit, orderBy: { date: 'desc' },
                include: {
                    plant: true,
                    item: { include: { itemGroup: true } },
                    oldItem: { include: { itemGroup: true } }
                }
            }),
            prisma.consumption.count({ where: whereClause }),
            // Use the calculated plantScope to filter the dropdown for managers/users
            prisma.plant.findMany({ where: { isDeleted: false, ...plantScope } }),
            prisma.itemGroup.findMany({ where: { isDeleted: false } })
        ]);

        res.render('consumption/index', {
            title: 'Consumption History',
            consumptions, plants, itemGroups,
            currentPage: page, totalPages: Math.ceil(totalRecords / limit), totalItems: totalRecords,
            searchTerm: search, filters: req.query
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Render the form to edit an existing consumption record.
 * @route   GET /consumption/:id/edit
 */
exports.renderEditForm = async (req, res, next) => {
    try {
        // --- THIS IS THE FIX ---
        // We use Promise.all to fetch both the consumption record and the item list concurrently.
        const [consumption, items] = await Promise.all([
            prisma.consumption.findUnique({
                where: { id: req.params.id },
                include: { 
                    item: true, // The 'new' item
                    plant: true,
                    oldItem: true // The 'old' item if it exists
                }
            }),
            prisma.item.findMany({ where: { isDeleted: false }, orderBy: { item_code: 'asc' } })
        ]);
        
        if (!consumption) {
            req.session.flash = { type: 'error', message: 'Consumption record not found.' };
            return res.redirect('/consumption');
        }

        res.render('consumption/edit', {
            title: 'Edit Consumption',
            consumption,
            items // <-- Now we pass the list of all items to the view
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an existing consumption record with sanitization.
 */
exports.updateConsumption = async (req, res, next) => {
    const { id } = req.params;
    const { user } = req.session;
    
    // Destructure all possible fields from the form body
    const { 
        quantity, 
        location, 
        sub_location, 
        remarks, 
        isReturnable, 
        date,
        old_itemCode, new_itemCode,
        old_assetNo, old_serialNo, old_poNo, old_faultRemark,
        new_assetNo, new_serialNo, new_poNo
    } = req.body;
    
    const newQuantity = parseInt(quantity);
    if (isNaN(newQuantity) || newQuantity <= 0) {
        req.session.flash = { type: 'error', message: 'Quantity must be a positive number.' };
        return res.redirect(`/consumption/${id}/edit`);
    }

    try {
        await prisma.$transaction(async (tx) => {
            const originalConsumption = await tx.consumption.findUnique({ where: { id } });
            if (!originalConsumption) throw new Error("Consumption record not found.");
            
            // Complex stock adjustment logic... (as built before)
            // ...

            // Update the consumption record with sanitized data
            await tx.consumption.update({
                where: { id },
                data: {
                    quantity: newQuantity,
                    consumption_location: sanitize(location),
                    sub_location: sanitize(sub_location) || null,
                    remarks: sanitize(remarks),
                    isReturnable: isReturnable === 'on',
                    date: new Date(date),
                    // Also update other potentially edited fields
                    itemId: new_itemCode,
                    new_itemCode: new_itemCode,
                    new_assetNo: sanitize(new_assetNo),
                    new_serialNo: sanitize(new_serialNo),
                    new_poNo: sanitize(new_poNo),
                    old_itemCode: old_itemCode || null,
                    old_assetNo: sanitize(old_assetNo),
                    old_serialNo: sanitize(old_serialNo),
                    old_poNo: sanitize(old_poNo),
                    old_faultRemark: sanitize(old_faultRemark),
                    updatedBy: user.id
                }
            });

            await logActivity({
                userId: user.id, action: 'CONSUMPTION_UPDATE', ipAddress: req.ip,
                details: { consumptionId: id, change: { from: originalConsumption.quantity, to: newQuantity } }
            });
        });

        req.session.flash = { type: 'success', message: 'Consumption record updated successfully.' };
        res.redirect('/consumption');

    } catch (error) {
        console.error("Consumption update failed:", error.message);
        req.session.flash = { type: 'error', message: `Failed to update consumption: ${error.message}` };
        res.redirect(`/consumption/${id}/edit`);
    }
};


/**
 * @desc    Soft delete a consumption record and correctly revert the stock.
 */
exports.softDeleteConsumption = async (req, res, next) => {
    const { id } = req.params;
    const { user } = req.session;
    
    try {
        await prisma.$transaction(async (tx) => {
            const consumptionToDelete = await tx.consumption.findUnique({ where: { id } });
            if (!consumptionToDelete) {
                throw new Error("Consumption record not found.");
            }

            // 1. Reverse the stock change: Add the consumed quantity back to CurrentStock
            await tx.currentStock.update({
                where: {
                    plantId_itemId: {
                        plantId: consumptionToDelete.plantId,
                        itemId: consumptionToDelete.itemId
                    }
                },
                data: {
                    totalQty: { increment: consumptionToDelete.quantity }
                }
            });

            // 2. Soft delete the consumption record itself
            await tx.consumption.update({
                where: { id },
                data: { isDeleted: true, updatedBy: user.id }
            });

             // --- LOG THE DELETE ACTION ---
            await logActivity({
                userId: user.id,
                action: 'CONSUMPTION_DELETE',
                ipAddress: req.ip,
                details: { consumptionId: id, revertedQty: consumptionToDelete.quantity }
            });
        });

        req.session.flash = { type: 'success', message: 'Consumption record deleted and stock was restored.' };
        res.redirect('/consumption');

    } catch (error) {
        console.error("Consumption delete failed:", error);
        req.session.flash = { type: 'error', message: `Failed to delete consumption: ${error.message}` };
        res.redirect('/consumption');
    }
};


/**
 * @desc    Export the filtered Consumption History to a styled Excel file.
 * @route   GET /consumption/export
 */
exports.exportConsumptions = async (req, res, next) => {
    try {
        const { user } = req.session;
        
        // --- STEP 1: RE-USE THE EXACT SAME FILTERING LOGIC ---
        const {
            search = '', plantFilter, itemGroupFilter, statusFilter, dateFilter,
            qty, qtyOp = 'gt'
        } = req.query;

        const whereClause = { isDeleted: false, AND: [] };

        if (search) {
            whereClause.AND.push({
                OR: [
                    { location: { contains: search, mode: 'insensitive' } }, { remarks: { contains: search, mode: 'insensitive' } },
                    { item: { item_code: { contains: search, mode: 'insensitive' } } }, { oldItem: { item_code: { contains: search, mode: 'insensitive' } } },
                    { new_serialNo: { contains: search, mode: 'insensitive' } }, { old_serialNo: { contains: search, mode: 'insensitive' } },
                    { new_assetNo: { contains: search, mode: 'insensitive' } }, { old_assetNo: { contains: search, mode: 'insensitive' } },
                    { new_poNo: { contains: search, mode: 'insensitive' } }, { old_poNo: { contains: search, mode: 'insensitive' } },
                ]
            });
        }
        if (plantFilter) whereClause.AND.push({ plantId: plantFilter });
        if (itemGroupFilter) whereClause.AND.push({ OR: [{ item: { itemGroupId: itemGroupFilter } }, { oldItem: { itemGroupId: itemGroupFilter } }] });
        if (statusFilter !== undefined && statusFilter !== '') whereClause.AND.push({ isReturnable: statusFilter === 'true' });
        if (dateFilter) {
            const dayStart = new Date(dateFilter); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
            whereClause.AND.push({ date: { gte: dayStart, lt: dayEnd } });
        }
        if (qty) {
            const numValue = parseInt(qty);
            if (!isNaN(numValue)) {
                const op = qtyOp === 'et' ? 'equals' : (qtyOp === 'gt' ? 'gte' : 'lte');
                whereClause.AND.push({ quantity: { [op]: numValue } });
            }
        }
        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({ where: { clusterId: user.clusterId }, select: { id: true } });
            const plantIds = plantsInCluster.map(p => p.id);
            whereClause.AND.push({ plantId: { in: plantIds.length > 0 ? plantIds : ['non-existent-id'] } });
        } else if (user.role === 'USER') {
            whereClause.AND.push({ plantId: { equals: user.plantId } });
        }
        if (whereClause.AND.length === 0) delete whereClause.AND;

        // --- STEP 2: FETCH ALL MATCHING DATA (NO PAGINATION) ---
        const consumptionsToExport = await prisma.consumption.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            include: { plant: true, item: true, oldItem: true }
        });

        // --- STEP 3: CREATE AND STYLE THE EXCEL WORKBOOK ---
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Consumption History');
        const columns = [
            { header: 'Date', key: 'date', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Plant', key: 'plant', width: 25 },
            { header: 'Location', key: 'location', width: 25 },
            { header: 'New Item Installed', key: 'newItemCode', width: 20 },
            { header: 'New Asset No', key: 'newAssetNo', width: 20 },
            { header: 'Old Item Received', key: 'oldItemCode', width: 20 },
            { header: 'Old Asset No', key: 'oldAssetNo', width: 20 },
            { header: 'Quantity', key: 'quantity', width: 12 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Remarks', key: 'remarks', width: 50 }
        ];
        worksheet.columns = columns;

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } };

        const dataForSheet = consumptionsToExport.map(record => ({
            date: new Date(record.date),
            plant: record.plant.name,
            location: record.consumption_location,
            newItemCode: record.item?.item_code || 'N/A',
            newAssetNo: record.new_assetNo,
            oldItemCode: record.oldItem?.item_code || '-',
            oldAssetNo: record.old_assetNo,
            quantity: record.quantity,
            status: record.isReturnable ? 'Returnable' : 'Not Returnable',
            remarks: record.remarks
        }));
        worksheet.addRows(dataForSheet);

        // --- THIS IS THE FIX: Add the auto-filter to the header row ---
        const endColumn = String.fromCharCode(64 + columns.length);
        worksheet.autoFilter = `A1:${endColumn}1`;

        // --- STEP 4: SEND THE FILE ---
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Consumption-History_${timestamp}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Consumption export failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to generate consumption export.' };
        res.redirect('/consumption');
    }
};