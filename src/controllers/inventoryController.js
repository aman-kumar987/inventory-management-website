const { prisma } = require('../config/db');
const { validationResult } = require('express-validator');
const { logActivity } = require('../services/activityLogService');
const { sanitize } = require('../utils/sanitizer');
const { sendScrapRequestEmail } = require('../services/emailService');
const ExcelJS = require('exceljs');
const xlsx = require('xlsx');

// --- Re-usable Helper Function ---
const getDropdownData = async (user) => {
    let plantQuery = { isDeleted: false };

    if (user.role === 'CLUSTER_MANAGER') {
        plantQuery = {
            isDeleted: false,
            clusterId: user.clusterId,
            cluster: { isDeleted: false }
        };
    } else if (user.role === 'USER') {
        plantQuery = {
            id: user.plantId,
            isDeleted: false,
            cluster: { isDeleted: false }
        };
    }

    const [plants, items] = await Promise.all([
        prisma.plant.findMany({
            where: plantQuery,
            orderBy: { name: 'asc' }
        }),
        prisma.item.findMany({
            where: {
                isDeleted: false,
                itemGroup: { isDeleted: false }
            },
            orderBy: { item_code: 'asc' }
        })
    ]);

    return { plants, items };
};

/**
 * @desc    Render the form to add new inventory
 * @route   GET /inventory/new
 */
exports.renderNewForm = async (req, res, next) => {
    try {
        const { user } = req.session;
        const { plants, items } = await getDropdownData(user);

        res.render('inventory/add', {
            title: 'Add New Inventory',
            plants,
            items,
            user,
            errors: []
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create new inventory stock
 * @route   POST /inventory
 */
exports.createInventory = async (req, res, next) => {
    const { reservationNumber, date, lineItems } = req.body;
    const { user } = req.session;

    try {
        const logDetails = { reservationNumber, createdItems: [] };
        await prisma.$transaction(async (tx) => {
            for (const item of lineItems) {
                let newQty = 0, oldUsedQty = 0, scrappedQty = 0;
                if (Array.isArray(item.categories)) {
                    item.categories.forEach(cat => {
                        const quantity = parseInt(cat.quantity) || 0;
                        if (quantity > 0) {
                            if (cat.type === 'New') newQty = quantity;
                            if (cat.type === 'OldUsed') oldUsedQty = quantity;
                            if (cat.type === 'Scrapped') scrappedQty = quantity;
                        }
                    });
                }

                let finalScrappedQty = 0;
                let approvalRequired = false;
                if (scrappedQty > 0) {
                    if (user.role === 'SUPER_ADMIN' || user.role === 'CLUSTER_MANAGER') {
                        finalScrappedQty = scrappedQty;
                    } else {
                        approvalRequired = true;
                    }
                }

                const total = newQty + oldUsedQty + finalScrappedQty;

                const inventoryLog = await tx.inventory.create({
                    data: {
                        reservationNumber: sanitize(reservationNumber), // <-- SANITIZED
                        date: new Date(date),
                        plantId: item.plantId,
                        itemId: item.itemId,
                        newQty, oldUsedQty,
                        scrappedQty: finalScrappedQty,
                        total,
                        remarks: sanitize(item.remarks) || null, // <-- SANITIZED
                        createdBy: user.id,
                    }
                });

                logDetails.createdItems.push({
                    inventoryId: inventoryLog.id,
                    itemId: inventoryLog.itemId,
                    totalAdded: total
                });

                if (total > 0) {
                    await tx.currentStock.upsert({
                        where: { plantId_itemId: { plantId: item.plantId, itemId: item.itemId } },
                        update: { totalQty: { increment: total } },
                        create: { plantId: item.plantId, itemId: item.itemId, totalQty: total }
                    });
                }

                if (approvalRequired) {
                    await tx.scrapApproval.create({
                        data: {
                            inventoryId: inventoryLog.id,
                            requestedQty: scrappedQty,
                            status: 'PENDING',
                            remarks: `Initial scrap request on creation: ${sanitize(item.remarks) || ''}`, // <-- SANITIZED
                            requestedById: user.id
                        }
                    });
                }
            }
        });

        await logActivity({
            userId: user.id,
            action: 'INVENTORY_CREATE',
            ipAddress: req.ip,
            details: logDetails
        });

        req.session.flash = { type: 'success', message: `Inventory created successfully.` };
        res.redirect('/inventory/ledger');
    } catch (error) {
        console.error(error);
        req.session.flash = { type: 'error', message: 'Failed to create inventory.' };
        res.redirect('/inventory/new');
    }
};

/**
 * @desc    Display the "Transaction Ledger" view with advanced filtering and scoped by user role.
 * @route   GET /inventory/ledger
 */
exports.showLedgerView = async (req, res, next) => {
    try {
        const { user } = req.session;
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        const {
            search = '', plantFilter, itemGroupFilter,
            newQty, newQtyOp = 'gt',
            oldQty, oldQtyOp = 'gt',
            scrappedQty, scrappedQtyOp = 'gt'
        } = req.query;

        // --- DYNAMICALLY BUILD THE WHERE CLAUSE ---
        const whereClause = { isDeleted: false, AND: [] };

        if (search) {
            whereClause.AND.push({
                OR: [
                    { reservationNumber: { contains: search, mode: 'insensitive' } },
                    { plant: { name: { contains: search, mode: 'insensitive' } } },
                    {
                        item: {
                            OR: [
                                { item_code: { contains: search, mode: 'insensitive' } },
                                { item_description: { contains: search, mode: 'insensitive' } },
                                { itemGroup: { name: { contains: search, mode: 'insensitive' } } }
                            ]
                        }
                    }
                ]
            });
        }

        // --- Add specific dropdown filters ---
        if (plantFilter) whereClause.AND.push({ plantId: plantFilter });
        if (itemGroupFilter) whereClause.AND.push({ item: { itemGroupId: itemGroupFilter } });

        // --- Add quantity filters with dynamic operators (gt, lt, et) ---
        const addQuantityFilter = (field, value, operator) => {
            if (value) {
                const numValue = parseInt(value);
                if (!isNaN(numValue)) {
                    // Translate et, gt, lt to Prisma's operators
                    const prismaOperator = operator === 'et' ? 'equals' : (operator === 'gt' ? 'gte' : 'lte');
                    whereClause.AND.push({ [field]: { [prismaOperator]: numValue } });
                }
            }
        };
        addQuantityFilter('newQty', newQty, newQtyOp);
        addQuantityFilter('oldUsedQty', oldQty, oldQtyOp);
        addQuantityFilter('scrappedQty', scrappedQty, scrappedQtyOp);

        // --- Data Scoping for user roles ---
        let plantScope = {}; // For filtering the dropdown list itself
        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({ where: { clusterId: user.clusterId }, select: { id: true } });
            const plantIds = plantsInCluster.map(p => p.id);
            whereClause.AND.push({ plantId: { in: plantIds.length > 0 ? plantIds : ['non-existent-id'] } });
            plantScope = { id: { in: plantIds } };
        } else if (user.role === 'USER') {
            whereClause.AND.push({ plantId: { equals: user.plantId } });
            plantScope = { id: { equals: user.plantId } };
        }

        if (whereClause.AND.length === 0) delete whereClause.AND;

        // --- FETCH DATA ---
        const [inventoryLedger, totalRecords, plantsForFilter, itemGroups] = await Promise.all([
            prisma.inventory.findMany({ where: whereClause, skip, take: limit, orderBy: { date: 'desc' }, include: { plant: true, item: { include: { itemGroup: true } } } }),
            prisma.inventory.count({ where: whereClause }),
            // Fetch plants for the dropdown, SCOPED by user role
            prisma.plant.findMany({ where: { isDeleted: false, ...plantScope }, orderBy: { name: 'asc' } }),
            prisma.itemGroup.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } })
        ]);

        res.render('inventory/ledger', {
            title: 'Transaction Ledger',
            data: inventoryLedger,
            currentPage: page, limit, totalPages: Math.ceil(totalRecords / limit), totalItems: totalRecords,
            searchTerm: search, user,
            plants: plantsForFilter, // Pass the scoped list of plants
            itemGroups,
            filters: req.query
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Display the "Consolidated Stock Summary" view with advanced filtering,
 *          correctly handling soft-deleted records.
 * @route   GET /inventory/summary (or GET /inventory)
 */
exports.showSummaryView = async (req, res, next) => {
    try {
        const { user } = req.session;
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        const {
            search = '', plantFilter, itemGroupFilter,
            newQty, newQtyOp = 'gt',
            oldQty, oldQtyOp = 'gt',
            scrappedQty, scrappedQtyOp = 'gt',
            consumptionQty, consumptionQtyOp = 'gt',
            totalQty, totalQtyOp = 'gt'
        } = req.query;

        // --- Build a base filter for relations (Item, Plant, etc.) ---
        let whereClause = {
            isDeleted: false, // <-- THE CRITICAL FIX: Only consider active records.
            AND: []
        };

        if (search) {
            whereClause.AND.push({
                OR: [
                    { plant: { name: { contains: search, mode: 'insensitive' } } },
                    {
                        item: {
                            OR: [
                                { item_code: { contains: search, mode: 'insensitive' } },
                                { item_description: { contains: search, mode: 'insensitive' } },
                                { itemGroup: { name: { contains: search, mode: 'insensitive' } } }
                            ]
                        }
                    }
                ]
            });
        }
        if (plantFilter) whereClause.AND.push({ plantId: plantFilter });
        if (itemGroupFilter) whereClause.AND.push({ item: { itemGroupId: itemGroupFilter } });

        let plantScope = {};
        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({ where: { clusterId: user.clusterId }, select: { id: true } });
            const plantIds = plantsInCluster.map(p => p.id);
            whereClause.AND.push({ plantId: { in: plantIds.length > 0 ? plantIds : ['non-existent-id'] } });
            plantScope = { id: { in: plantIds } };
        } else if (user.role === 'USER') {
            whereClause.AND.push({ plantId: { equals: user.plantId } });
            plantScope = { id: { equals: user.plantId } };
        }
        if (whereClause.AND.length === 0) delete whereClause.AND;

        // --- Perform Aggregations ---
        const groupedInventory = await prisma.inventory.groupBy({
            by: ['plantId', 'itemId'],
            where: whereClause,
            _sum: { newQty: true, oldUsedQty: true, scrappedQty: true },
        });

        // The where clause for consumption needs to be consistent
        const groupedConsumption = await prisma.consumption.groupBy({
            by: ['plantId', 'itemId'],
            where: whereClause,
            _sum: { quantity: true },
        });
        const consumptionMap = new Map(groupedConsumption.map(c => [`${c.plantId}-${c.itemId}`, c._sum.quantity || 0]));

        // --- Fetch Details & Merge Data ---
        const itemIds = groupedInventory.map(i => i.itemId);
        const allPlantsForFilter = await prisma.plant.findMany({ where: { isDeleted: false, ...plantScope }, orderBy: { name: 'asc' } });
        const allItemGroupsForFilter = await prisma.itemGroup.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } });

        if (itemIds.length === 0) {
            // No inventory means nothing to show, render empty state but with filter data
            return res.render('inventory/summary', {
                title: 'Consolidated Stock View', data: [], plants: allPlantsForFilter, itemGroups: allItemGroupsForFilter,
                currentPage: 1, totalPages: 1, totalItems: 0, filters: req.query, user
            });
        }

        const items = await prisma.item.findMany({ where: { id: { in: itemIds } }, include: { itemGroup: true } });
        const plantMap = new Map(allPlantsForFilter.map(p => [p.id, p.name]));
        const itemMap = new Map(items.map(i => [i.id, i]));

        let consolidatedData = groupedInventory.map(inv => {
            const itemDetails = itemMap.get(inv.itemId);
            if (!itemDetails) return null;
            const key = `${inv.plantId}-${inv.itemId}`;
            const consumption = consumptionMap.get(key) || 0;
            const newQtySum = inv._sum.newQty || 0;
            const oldUsedQtySum = inv._sum.oldUsedQty || 0;
            const scrappedQtySum = inv._sum.scrappedQty || 0;
            return {
                plant: plantMap.get(inv.plantId) || 'N/A',
                itemGroup: itemDetails.itemGroup.name,
                itemCode: itemDetails.item_code,
                itemDescription: itemDetails.item_description,
                uom: itemDetails.uom,
                newQty: newQtySum, oldUsedQty: oldUsedQtySum, scrappedQty: scrappedQtySum, consumption,
                total: newQtySum + oldUsedQtySum + scrappedQtySum - consumption
            };
        }).filter(Boolean);

        // --- Apply Post-Aggregation Filters (for quantities) ---
        const applyPostFilter = (data, field, value, operator) => {
            if (!value) return data;
            const numValue = parseInt(value);
            if (isNaN(numValue)) return data;
            return data.filter(item => {
                if (operator === 'et') return item[field] === numValue;
                if (operator === 'gt') return item[field] >= numValue;
                if (operator === 'lt') return item[field] <= numValue;
                return true;
            });
        };
        consolidatedData = applyPostFilter(consolidatedData, 'newQty', newQty, newQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'oldUsedQty', oldQty, oldQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'scrappedQty', scrappedQty, scrappedQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'consumption', consumptionQty, consumptionQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'total', totalQty, totalQtyOp);

        // --- Paginate the Final, Filtered Array ---
        const totalRecords = consolidatedData.length;
        const paginatedData = consolidatedData.slice(skip, skip + limit);

        res.render('inventory/summary', {
            title: 'Consolidated Stock View',
            data: paginatedData,
            currentPage: page, limit, totalPages: Math.ceil(totalRecords / limit), totalItems: totalRecords,
            searchTerm: search, user, plants: allPlantsForFilter, itemGroups: allItemGroupsForFilter, filters: req.query
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Render the unified form to edit an inventory record
 * @route   GET /inventory/:id/edit
 */
exports.renderEditForm = async (req, res, next) => {
    try {
        const inventory = await prisma.inventory.findFirst({
            where: { id: req.params.id, isDeleted: false },
            include: { item: true }
        });
        if (!inventory) {
            req.session.flash = { type: 'error', message: 'Inventory record not found.' };
            return res.redirect('/inventory/ledger');
        }
        res.render('inventory/edit', {
            title: 'Edit Inventory',
            inventory,
            user: req.session.user,
            // This line correctly gets the URL from the query string
            returnUrl: req.query.returnUrl || '/inventory/ledger'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process an inventory update. Can be a direct update or trigger an approval with email notification.
 * @route   POST /inventory/:id/edit
 */
exports.updateInventory = async (req, res, next) => {
    const { id } = req.params;
    const { newQty, oldUsedQty, scrappedQty, remarks, returnUrl } = req.body;
    const { user } = req.session;
    const redirectPath = returnUrl || '/inventory/ledger';

    try {
        const originalInventory = await prisma.inventory.findUnique({ where: { id } });
        if (!originalInventory) {
            throw new Error('Inventory record not found.');
        }

        const newScrappedQty = parseInt(scrappedQty, 10) || 0;
        const scrapChange = newScrappedQty - originalInventory.scrappedQty;

        // Case 1: User is an Admin/Manager OR a User who is NOT increasing the scrap quantity.
        if (user.role !== 'USER' || (user.role === 'USER' && scrapChange <= 0)) {
            // --- PERFORM DIRECT UPDATE ---
            const finalOldUsedQty = parseInt(oldUsedQty, 10) || 0;
            const finalNewQty = parseInt(newQty, 10) || 0;

            const newTotal = finalNewQty + finalOldUsedQty + newScrappedQty - originalInventory.consumptionAmount;
            const stockDiff = newTotal - originalInventory.total;

            await prisma.$transaction(async (tx) => {
                await tx.inventory.update({
                    where: { id },
                    data: {
                        newQty: finalNewQty,
                        oldUsedQty: finalOldUsedQty,
                        scrappedQty: newScrappedQty,
                        total: newTotal,
                        remarks: sanitize(remarks),
                        updatedBy: user.id
                    }
                });
                if (stockDiff !== 0) {
                    await tx.currentStock.update({
                        where: { plantId_itemId: { plantId: originalInventory.plantId, itemId: originalInventory.itemId } },
                        data: { totalQty: { increment: stockDiff } }
                    });
                }
            });

            await logActivity({
                userId: user.id,
                action: 'INVENTORY_UPDATE',
                ipAddress: req.ip,
                details: { inventoryId: id }
            });

            req.session.flash = { type: 'success', message: 'Inventory record updated successfully.' };
            return res.redirect(redirectPath);

        } else {
            // --- Case 2: User IS a standard 'USER' and IS increasing the scrap quantity -> TRIGGER APPROVAL ---

            await prisma.$transaction(async (tx) => {
                // 1. Create the approval request
                await tx.scrapApproval.create({
                    data: {
                        inventoryId: id,
                        requestedQty: newScrappedQty,
                        remarks: sanitize(remarks),
                        status: 'PENDING',
                        requestedById: user.id,
                    }
                });

                // 2. Find the approver (Cluster Manager)
                const approver = await tx.user.findFirst({
                    where: {
                        clusterId: user.clusterId,
                        role: 'CLUSTER_MANAGER',
                        isDeleted: false,
                        status: 'ACTIVE'
                    }
                });

                // 3. Send email if an approver is found
                if (approver) {
                    // We need the full inventory object with relations for the email template
                    const fullInventoryDetails = await tx.inventory.findUnique({
                        where: { id },
                        include: { item: true, plant: true }
                    });
                    // Fire-and-forget the email, don't block the user's request
                    sendScrapRequestEmail(approver, user, fullInventoryDetails).catch(console.error);
                }
            });

            await logActivity({
                userId: user.id,
                action: 'SCRAP_REQUEST_CREATE',
                ipAddress: req.ip,
                details: { inventoryId: id, requestedQty: newScrappedQty }
            });

            req.session.flash = { type: 'success', message: 'Scrap change request submitted for approval.' };
            return res.redirect(redirectPath);
        }
    } catch (error) {
        console.error('Inventory update failed:', error);
        req.session.flash = { type: 'error', message: 'Failed to update inventory record.' };
        res.redirect(`/inventory/${id}/edit?returnUrl=${encodeURIComponent(redirectPath)}`);
    }
};

/**
 * @desc    Soft delete a single inventory transaction and revert stock.
 * @route   POST /inventory/:id/delete
 */
exports.softDeleteInventory = async (req, res, next) => {
    const { id } = req.params;
    const { user } = req.session;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Find the inventory record to be deleted
            const inventoryToDelete = await tx.inventory.findUnique({ where: { id } });
            if (!inventoryToDelete || inventoryToDelete.isDeleted) {
                throw new Error("Inventory record not found or already deleted.");
            }

            // 2. Calculate the total stock that was added by this entry
            const stockToRevert = inventoryToDelete.newQty + inventoryToDelete.oldUsedQty + inventoryToDelete.scrappedQty;

            // 3. Revert this amount from the CurrentStock summary table
            if (stockToRevert > 0) {
                await tx.currentStock.update({
                    where: {
                        plantId_itemId: {
                            plantId: inventoryToDelete.plantId,
                            itemId: inventoryToDelete.itemId
                        }
                    },
                    data: {
                        totalQty: { decrement: stockToRevert }
                    }
                });
            }

            // 4. Soft delete the inventory record itself
            await tx.inventory.update({
                where: { id },
                data: { isDeleted: true, updatedBy: user.id }
            });
        });

        // Log the action after the transaction succeeds
        await logActivity({
            userId: user.id,
            action: 'INVENTORY_DELETE',
            ipAddress: req.ip,
            details: { inventoryId: id, note: "Single inventory ledger entry deleted and stock reverted." }
        });

        req.session.flash = { type: 'success', message: 'Inventory record moved to trash and stock adjusted.' };
        res.redirect('/inventory/ledger');

    } catch (error) {
        console.error("Inventory soft delete failed:", error);
        req.session.flash = { type: 'error', message: `Failed to delete record: ${error.message}` };
        res.redirect('/inventory/ledger');
    }
};


// At the top of your controller file, replace the xlsx import with exceljs



/**
 * @desc    Export the filtered Transaction Ledger to a styled Excel file using exceljs.
 * @route   GET /inventory/ledger/export
 */
exports.exportLedger = async (req, res, next) => {
    try {
        const { user } = req.session;

        // --- STEP 1: RE-USE THE EXACT SAME FILTERING LOGIC FROM showLedgerView ---
        const {
            search = '', plantFilter, itemGroupFilter,
            newQty, newQtyOp = 'gt',
            oldQty, oldQtyOp = 'gt',
            scrappedQty, scrappedQtyOp = 'gt'
        } = req.query;

        const whereClause = { isDeleted: false, AND: [] };

        if (search) {
            whereClause.AND.push({
                OR: [
                    { reservationNumber: { contains: search, mode: 'insensitive' } },
                    { item: { item_code: { contains: search, mode: 'insensitive' } } },
                    { item: { item_description: { contains: search, mode: 'insensitive' } } },
                    { plant: { name: { contains: search, mode: 'insensitive' } } },
                    { item: { itemGroup: { name: { contains: search, mode: 'insensitive' } } } },
                ]
            });
        }

        if (plantFilter) whereClause.AND.push({ plantId: plantFilter });
        if (itemGroupFilter) whereClause.AND.push({ item: { itemGroupId: itemGroupFilter } });

        const addQuantityFilter = (field, value, operator) => {
            if (value) {
                const numValue = parseInt(value);
                if (!isNaN(numValue)) {
                    const prismaOperator = operator === 'et' ? 'equals' : (operator === 'gt' ? 'gte' : 'lte');
                    whereClause.AND.push({ [field]: { [prismaOperator]: numValue } });
                }
            }
        };
        addQuantityFilter('newQty', newQty, newQtyOp);
        addQuantityFilter('oldUsedQty', oldQty, oldQtyOp);
        addQuantityFilter('scrappedQty', scrappedQty, scrappedQtyOp);

        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({ where: { clusterId: user.clusterId }, select: { id: true } });
            const plantIds = plantsInCluster.map(p => p.id);
            whereClause.AND.push({ plantId: { in: plantIds.length > 0 ? plantIds : ['non-existent-id'] } });
        } else if (user.role === 'USER') {
            whereClause.AND.push({ plantId: { equals: user.plantId } });
        }

        if (whereClause.AND.length === 0) {
            delete whereClause.AND;
        }
        // --- END OF FILTERING LOGIC ---

        // --- FETCH ALL MATCHING DATA (NO PAGINATION) ---
        const inventoryToExport = await prisma.inventory.findMany({
            where: whereClause,
            orderBy: { date: 'desc' },
            include: { plant: true, item: { include: { itemGroup: true } } },
        });

        // --- CREATE AND STYLE THE EXCEL WORKBOOK USING EXCELJS ---
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Inventory Management App';
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet('Inventory Ledger');

        const columns = [
            { header: 'Reservation No', key: 'reservationNumber', width: 20 },
            { header: 'Date', key: 'date', width: 15, style: { numFmt: 'yyyy-mm-dd' } },
            { header: 'Plant', key: 'plant', width: 25 },
            { header: 'Item Group', key: 'itemGroup', width: 20 },
            { header: 'Item Code', key: 'itemCode', width: 20 },
            { header: 'Item Description', key: 'itemDescription', width: 40 },
            { header: 'UOM', key: 'uom', width: 10 },
            { header: 'New Qty', key: 'newQty', width: 12 },
            { header: 'Old/Used Qty', key: 'oldUsedQty', width: 15 },
            { header: 'Scrapped Qty', key: 'scrappedQty', width: 15 },
            { header: 'Consumed Qty', key: 'consumptionAmount', width: 15 },
            { header: 'Net Total', key: 'total', width: 12 },
            { header: 'Remarks', key: 'remarks', width: 50 },
        ];
        worksheet.columns = columns;

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } };
        headerRow.alignment = { vertical: 'middle' };

        const dataForSheet = inventoryToExport.map(record => ({
            reservationNumber: record.reservationNumber,
            date: new Date(record.date),
            plant: record.plant.name,
            itemGroup: record.item.itemGroup.name,
            itemCode: record.item.item_code,
            itemDescription: record.item.item_description,
            uom: record.item.uom,
            newQty: record.newQty,
            oldUsedQty: record.oldUsedQty,
            scrappedQty: record.scrappedQty,
            consumptionAmount: record.consumptionAmount,
            total: record.total,
            remarks: record.remarks
        }));

        worksheet.addRows(dataForSheet);

        const endColumn = String.fromCharCode(64 + columns.length);
        worksheet.autoFilter = `A1:${endColumn}1`;

        // --- Dynamic filename logic ---
        const now = new Date();
        const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
        const filename = `Inventory-Ledger_${timestamp}.xlsx`;

        // --- Send the file to the browser ---
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Export failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to generate Excel export.' };
        res.redirect('/inventory/ledger');
    }
};

/**
 * @desc    Export the filtered Consolidated Stock Summary to a styled Excel file.
 * @route   GET /inventory/summary/export
 */
exports.exportSummary = async (req, res, next) => {
    try {
        const { user } = req.session;

        // --- STEP 1: RE-USE THE EXACT SAME FILTERING LOGIC ---
        const {
            search = '', plantFilter, itemGroupFilter,
            newQty, newQtyOp = 'gt', oldQty, oldQtyOp = 'gt',
            scrappedQty, scrappedQtyOp = 'gt', consumptionQty, consumptionQtyOp = 'gt',
            totalQty, totalQtyOp = 'gt'
        } = req.query;

        let whereClause = { isDeleted: false, AND: [] };
        if (search) { whereClause.AND.push({ OR: [{ item: { item_code: { contains: search, mode: 'insensitive' } } }, { item: { item_description: { contains: search, mode: 'insensitive' } } }, { plant: { name: { contains: search, mode: 'insensitive' } } }, { item: { itemGroup: { name: { contains: search, mode: 'insensitive' } } } }] }); }
        if (plantFilter) whereClause.AND.push({ plantId: plantFilter });
        if (itemGroupFilter) whereClause.AND.push({ item: { itemGroupId: itemGroupFilter } });
        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({ where: { clusterId: user.clusterId }, select: { id: true } });
            const plantIds = plantsInCluster.map(p => p.id);
            whereClause.AND.push({ plantId: { in: plantIds.length > 0 ? plantIds : ['non-existent-id'] } });
        } else if (user.role === 'USER') {
            whereClause.AND.push({ plantId: { equals: user.plantId } });
        }
        if (whereClause.AND.length === 0) delete whereClause.AND;

        // --- STEP 2: RE-USE THE EXACT SAME DATA AGGREGATION & MERGING LOGIC ---
        const groupedInventory = await prisma.inventory.groupBy({
            by: ['plantId', 'itemId'], where: whereClause,
            _sum: { newQty: true, oldUsedQty: true, scrappedQty: true },
        });
        const groupedConsumption = await prisma.consumption.groupBy({
            by: ['plantId', 'itemId'], where: whereClause,
            _sum: { quantity: true },
        });
        const consumptionMap = new Map(groupedConsumption.map(c => [`${c.plantId}-${c.itemId}`, c._sum.quantity || 0]));

        const itemIds = groupedInventory.map(i => i.itemId);
        if (itemIds.length === 0) {
            req.session.flash = { type: 'info', message: 'No data to export for the selected filters.' };
            return res.redirect('/inventory/summary');
        }

        const [plants, items] = await Promise.all([
            prisma.plant.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }),
            prisma.item.findMany({ where: { id: { in: itemIds } }, include: { itemGroup: true } }),
        ]);
        const plantMap = new Map(plants.map(p => [p.id, p.name]));
        const itemMap = new Map(items.map(i => [i.id, i]));

        let consolidatedData = groupedInventory.map(inv => {
            const itemDetails = itemMap.get(inv.itemId);
            if (!itemDetails) return null;
            const key = `${inv.plantId}-${inv.itemId}`;
            const consumption = consumptionMap.get(key) || 0;
            const newQtySum = inv._sum.newQty || 0;
            const oldUsedQtySum = inv._sum.oldUsedQty || 0;
            const scrappedQtySum = inv._sum.scrappedQty || 0;
            return {
                plant: plantMap.get(inv.plantId) || 'N/A', itemGroup: itemDetails.itemGroup.name,
                itemCode: itemDetails.item_code, itemDescription: itemDetails.item_description, uom: itemDetails.uom,
                newQty: newQtySum, oldUsedQty: oldUsedQtySum, scrappedQty: scrappedQtySum, consumption,
                total: newQtySum + oldUsedQtySum + scrappedQtySum - consumption
            };
        }).filter(Boolean);

        // --- STEP 3: RE-USE THE POST-AGGREGATION FILTER LOGIC ---
        const applyPostFilter = (data, field, value, operator) => {
            if (!value) return data;
            const numValue = parseInt(value);
            if (isNaN(numValue)) return data;
            return data.filter(item => {
                if (operator === 'et') return item[field] === numValue;
                if (operator === 'gt') return item[field] >= numValue;
                if (operator === 'lt') return item[field] <= numValue;
                return true;
            });
        };
        consolidatedData = applyPostFilter(consolidatedData, 'newQty', newQty, newQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'oldUsedQty', oldQty, oldQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'scrappedQty', scrappedQty, scrappedQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'consumption', consumptionQty, consumptionQtyOp);
        consolidatedData = applyPostFilter(consolidatedData, 'total', totalQty, totalQtyOp);

        // --- STEP 4: CREATE AND STYLE THE EXCEL FILE ---
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Stock Summary');
        worksheet.columns = [
            { header: 'Plant', key: 'plant', width: 25 }, { header: 'Item Group', key: 'itemGroup', width: 20 },
            { header: 'Item Code', key: 'itemCode', width: 20 }, { header: 'Item Description', key: 'itemDescription', width: 40 },
            { header: 'UOM', key: 'uom', width: 10 }, { header: 'Total New', key: 'newQty', width: 15 },
            { header: 'Total Old/Used', key: 'oldUsedQty', width: 15 }, { header: 'Total Scrapped', key: 'scrappedQty', width: 15 },
            { header: 'Total Consumed', key: 'consumption', width: 15 },
            { header: 'Net Available Stock', key: 'total', width: 20, font: { bold: true } },
        ];
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } };

        // --- THIS IS THE FIX: The addRows call now receives a valid array ---
        worksheet.addRows(consolidatedData);
        const endColumn = String.fromCharCode(64 + worksheet.columns.length);
        worksheet.autoFilter = `A1:${endColumn}1`;
        // --- STEP 5: SEND THE FILE ---
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `Stock-Summary_${timestamp}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Export failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to generate summary export.' };
        res.redirect('/inventory/summary');
    }
};


exports.syncAndAddInventory = async (req, res, next) => {
    if (!req.file) {
        req.session.flash = { type: 'error', message: 'No file uploaded. Please select a valid Excel file.' };
        return res.redirect('/inventory/ledger');
    }

    const user = req.session.user;
    const fileBuffer = req.file.buffer;
    const results = {
        summary: { totalRows: 0, successCount: 0, errorCount: 0 },
        errors: [],
        templateError: null
    };

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer);
        const worksheet = workbook.worksheets[0];

        // === STEP 1: VALIDATE HEADERS ===
        const requiredHeaders = ['plant', 'item group', 'item', 'item_name', 'uom', 'new', 'old & used', 'scrapped'];
        const headerRow = worksheet.getRow(2);

        if (!headerRow.hasValues) {
            results.templateError = 'Invalid Excel template. Row 2 must contain headers.';
            return res.render('inventory/import-report', { title: 'Import Report', fileName: req.file.originalname, report: results });
        }

        const headerMap = {};
        headerRow.eachCell((cell, colNumber) => {
            if (cell.value) {
                headerMap[cell.value.toString().toLowerCase().trim()] = colNumber;
            }
        });

        const missingHeaders = requiredHeaders.filter(h => !headerMap[h]);
        if (missingHeaders.length > 0) {
            results.templateError = `Missing columns: ${missingHeaders.join(', ')}`;
            return res.render('inventory/import-report', { title: 'Import Report', fileName: req.file.originalname, report: results });
        }

        // === STEP 2: COLLECT DATA ===
        let rowsToProcess = [];

        for (let rowNum = 3; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);
            if (!row.hasValues) continue;

            results.summary.totalRows++;

            const getCell = (key) => row.getCell(headerMap[key])?.value?.toString().trim();
            const rowData = {
                rowNumber: rowNum,
                plant: getCell('plant'),
                group: getCell('item group'),
                itemCode: getCell('item'),
                itemName: getCell('item_name'),
                uom: getCell('uom'),
                newQty: parseInt(getCell('new')) || 0,
                oldQty: parseInt(getCell('old & used')) || 0,
                scrappedQty: parseInt(getCell('scrapped')) || 0
            };

            const missing = [];
            if (!rowData.plant) missing.push('PLANT');
            if (!rowData.group) missing.push('ITEM GROUP');
            if (!rowData.itemCode) missing.push('ITEM');
            if (!rowData.itemName) missing.push('ITEM_NAME');
            if (!rowData.uom) missing.push('UOM');

            if (missing.length > 0) {
                results.errors.push({ row: rowNum, reason: `Missing required fields: ${missing.join(', ')}`, data: rowData });
                results.summary.errorCount++;
                continue;
            }

            if (isNaN(rowData.newQty) || isNaN(rowData.oldQty) || isNaN(rowData.scrappedQty)) {
                results.errors.push({ row: rowNum, reason: 'Invalid quantity values (must be numeric)', data: rowData });
                results.summary.errorCount++;
                continue;
            }

            rowsToProcess.push(rowData);
        }

        if (rowsToProcess.length === 0) {
            results.templateError = 'No valid rows to import.';
            return res.render('inventory/import-report', { title: 'Import Report', fileName: req.file.originalname, report: results });
        }

        // === STEP 3: FETCH EXISTING MASTERS ===
        const [allClusters, allPlants, allGroups, allItems] = await Promise.all([
            prisma.cluster.findMany({ where: { isDeleted: false } }),
            prisma.plant.findMany({ where: { isDeleted: false } }),
            prisma.itemGroup.findMany({ where: { isDeleted: false } }),
            prisma.item.findMany({ where: { isDeleted: false } }),
        ]);

        const clusterMap = new Map(allClusters.map(c => [c.name.toLowerCase(), c]));
        const plantMap = new Map(allPlants.map(p => [p.name.toLowerCase(), p]));
        const groupMap = new Map(allGroups.map(g => [g.name.toLowerCase(), g]));
        const itemMap = new Map(allItems.map(i => [i.item_code.toLowerCase(), i]));

        const defaultCluster = clusterMap.get('north cluster') || allClusters[0];
        if (!defaultCluster) {
            results.templateError = 'Default cluster not found (e.g., North Cluster).';
            return res.render('inventory/import-report', { title: 'Import Report', fileName: req.file.originalname, report: results });
        }

        // === STEP 4: TRANSACTION ===
        await prisma.$transaction(async (tx) => {
            for (const row of rowsToProcess) {
                try {
                    // Plant
                    let plant = plantMap.get(row.plant.toLowerCase());
                    if (!plant) {
                        plant = await tx.plant.create({
                            data: { name: row.plant, clusterId: defaultCluster.id, createdBy: user.id }
                        });
                        plantMap.set(row.plant.toLowerCase(), plant);
                    }

                    // Item Group
                    let group = groupMap.get(row.group.toLowerCase());
                    if (!group) {
                        group = await tx.itemGroup.create({
                            data: { name: row.group, createdBy: user.id }
                        });
                        groupMap.set(row.group.toLowerCase(), group);
                    }

                    // Item
                    let item = itemMap.get(row.itemCode.toLowerCase());
                    if (!item) {
                        item = await tx.item.create({
                            data: {
                                item_code: row.itemCode,
                                item_description: row.itemName,
                                uom: row.uom,
                                itemGroupId: group.id,
                                createdBy: user.id
                            }
                        });
                        itemMap.set(row.itemCode.toLowerCase(), item);
                    }

                    const total = row.newQty + row.oldQty + row.scrappedQty;

                    // Inventory Record
                    await tx.inventory.create({
                        data: {
                            reservationNumber: `IMPORT-${Date.now()}-${row.rowNumber}`,
                            date: new Date(),
                            plantId: plant.id,
                            itemId: item.id,
                            newQty: row.newQty,
                            oldUsedQty: row.oldQty,
                            scrappedQty: row.scrappedQty,
                            total,
                            createdBy: user.id
                        }
                    });

                    // Current Stock
                    if (total > 0) {
                        await tx.currentStock.upsert({
                            where: {
                                plantId_itemId: {
                                    plantId: plant.id,
                                    itemId: item.id
                                }
                            },
                            update: {
                                totalQty: { increment: total }
                            },
                            create: {
                                plantId: plant.id,
                                itemId: item.id,
                                totalQty: total
                            }
                        });
                    }

                    results.summary.successCount++;
                } catch (err) {
                    results.errors.push({ row: row.rowNumber, reason: err.message, data: row });
                    results.summary.errorCount++;
                }
            }
        }, {
            timeout: 30000
        }
        );

        // === STEP 5: Log the activity ===
        await logActivity({
            userId: user.id,
            action: 'INVENTORY_IMPORT',
            ipAddress: req.ip,
            details: {
                fileName: req.file.originalname,
                ...results.summary
            }
        });

        res.render('inventory/import-report', {
            title: 'Inventory Import Report',
            fileName: req.file.originalname,
            report: results
        });

    } catch (err) {
        console.error('Inventory Import Failed:', err);
        results.templateError = 'Unexpected error occurred during import.';
        res.render('inventory/import-report', {
            title: 'Inventory Import Report',
            fileName: req.file.originalname,
            report: results
        });
    }
};

