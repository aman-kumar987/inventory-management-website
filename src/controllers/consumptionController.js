const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const { sanitize } = require('../utils/sanitizer');
const ExcelJS = require('exceljs');
const { sendScrapRequestEmail, sendApprovalConfirmationEmail } = require('../services/emailService');
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
    // consumptionController.js
    const availableStock = await prisma.currentStock.findMany({
        where: {
            plantId: { in: accessiblePlantIds },
            // Naya logic: Stock tabhi mana jayega jab ya to newQty > 0 ho YA oldUsedQty > 0 ho
            OR: [
                { newQty: { gt: 0 } },
                { oldUsedQty: { gt: 0 } }
            ],
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
 * @desc    Process and create new consumption records with new category logic.
 * @route   POST /consumption
 */
exports.createConsumption = async (req, res, next) => {
    const { date, lineItems } = req.body;
    const { user } = req.session;

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
        req.session.flash = { type: 'error', message: 'At least one consumption entry is required.' };
        return res.redirect('/consumption/new');
    }

    const consumptionDate = new Date(date);
    if (!date || isNaN(consumptionDate.getTime())) {
        req.session.flash = { type: 'error', message: 'A valid date is required.' };
        return res.redirect('/consumption/new');
    }

    try {
        const logDetails = [];

        await prisma.$transaction(async (tx) => {
            for (const [index, item] of lineItems.entries()) {
                const entryNum = index + 1;
                const {
                    plantId, location, subLocation, quantity: qtyString, remarks, isReturnable,
                    new_itemCode, new_assetNo, new_serialNo, new_poNo, consumeFromCategory,
                    oldReceived, old_itemCode, old_assetNo, old_serialNo, old_poNo, old_faultRemark, receivedAsCategory
                } = item;
                const quantity = parseInt(qtyString);
                const stockPlantId = user.role === 'USER' ? user.plantId : plantId;

                const stockToConsume = await tx.currentStock.findUnique({ where: { plantId_itemId: { plantId: stockPlantId, itemId: new_itemCode } } });
                if (!stockToConsume) throw new Error(`Entry #${entryNum}: Stock for new item not found.`);
                if (consumeFromCategory === 'New' && stockToConsume.newQty < quantity) throw new Error(`Entry #${entryNum}: Insufficient 'New' stock.`);
                if (consumeFromCategory === 'OldUsed' && stockToConsume.oldUsedQty < quantity) throw new Error(`Entry #${entryNum}: Insufficient 'Old & Used' stock.`);

                const stockUpdateData = consumeFromCategory === 'New' ? { newQty: { decrement: quantity } } : { oldUsedQty: { decrement: quantity } };
                await tx.currentStock.update({ where: { plantId_itemId: { plantId: stockPlantId, itemId: new_itemCode } }, data: stockUpdateData });

                let approvalRequired = false;
                if (oldReceived === 'on' && old_itemCode) {
                    if (receivedAsCategory === 'OldUsed') {
                        await tx.currentStock.upsert({
                            where: { plantId_itemId: { plantId: stockPlantId, itemId: old_itemCode } },
                            update: { oldUsedQty: { increment: quantity } },
                            create: { plantId: stockPlantId, itemId: old_itemCode, oldUsedQty: quantity }
                        });
                    } else if (receivedAsCategory === 'Scrapped') {
                        if (user.role === 'SUPER_ADMIN' || user.role === 'CLUSTER_MANAGER') {
                            await tx.inventory.create({
                                data: {
                                    reservationNumber: `SCRAP-FROM-CONS-${Date.now()}`,
                                    date: new Date(),
                                    plantId: stockPlantId,
                                    itemId: old_itemCode,
                                    scrappedQty: quantity,
                                    total: quantity,
                                    remarks: `Direct scrap from consumption by ${user.name}. Fault: ${sanitize(old_faultRemark) || ''}`,
                                    createdBy: user.id,
                                }
                            });
                        } else {
                            approvalRequired = true;
                        }
                    }
                }

                const consumptionRecord = await tx.consumption.create({
                    data: {
                        date: consumptionDate,
                        plantId: stockPlantId,
                        consumption_location: sanitize(location),
                        sub_location: sanitize(subLocation),
                        quantity: quantity,
                        isReturnable: isReturnable === 'on',
                        remarks: sanitize(remarks),
                        itemId: new_itemCode,
                        newInstallation: true,
                        new_itemCode,
                        new_assetNo: sanitize(new_assetNo),
                        new_serialNo: sanitize(new_serialNo),
                        new_poNo: sanitize(new_poNo),
                        oldAndReceived: oldReceived === 'on',
                        old_itemCode: oldReceived === 'on' ? old_itemCode : null,
                        old_assetNo: oldReceived === 'on' ? sanitize(old_assetNo) : null,
                        old_serialNo: oldReceived === 'on' ? sanitize(old_serialNo) : null,
                        old_poNo: oldReceived === 'on' ? sanitize(old_poNo) : null,
                        old_faultRemark: oldReceived === 'on' ? sanitize(old_faultRemark) : null,
                        createdBy: user.id,
                    }
                });

                if (approvalRequired) {
                    const approval = await tx.consumptionScrapApproval.create({
                        data: {
                            consumptionId: consumptionRecord.id,
                            requestedQty: quantity,
                            status: 'PENDING',
                            remarks: `Scrap received during consumption: ${sanitize(item.old_faultRemark) || ''}`,
                            requestedById: user.id
                        }
                    });
                    await logActivity({
                        userId: user.id, action: 'SCRAP_REQUEST_CREATE', ipAddress: req.ip,
                        details: { approvalId: approval.id, consumptionId: consumptionRecord.id, requestedQty: quantity }
                    });
                    if (user.clusterId) {
                        const approver = await tx.user.findFirst({ where: { clusterId: user.clusterId, role: 'CLUSTER_MANAGER', isDeleted: false } });
                        if (approver) {
                            const itemDetails = await tx.item.findUnique({ where: { id: consumptionRecord.itemId } });
                            const plantDetails = await tx.plant.findUnique({ where: { id: consumptionRecord.plantId } });
                            // THE FIX: Pass the correct object with all details
                            const emailDetails = {
                                item: itemDetails,
                                plant: plantDetails,
                                requestedQty: quantity,
                                remarks: sanitize(item.old_faultRemark) || ''
                            };
                            sendScrapRequestEmail(approver, user, emailDetails).catch(console.error);
                        }
                    }
                }
                logDetails.push({ consumptionId: consumptionRecord.id, itemId: new_itemCode, quantity });
            }
        });

        await logActivity({
            userId: user.id, action: 'CONSUMPTION_CREATE', ipAddress: req.ip,
            details: { date, itemCount: logDetails.length, items: logDetails }
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
            searchTerm: search, filters: req.query, limit: limit
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
        const [consumption, allMasterItems] = await Promise.all([
            prisma.consumption.findUnique({
                where: { id: req.params.id },
                include: { item: true, plant: true, oldItem: true }
            }),
            prisma.item.findMany({ where: { isDeleted: false }, orderBy: { item_code: 'asc' } })
        ]);

        if (!consumption) {
            req.session.flash = { type: 'error', message: 'Consumption record not found.' };
            return res.redirect('/consumption');
        }

        // NAYA: Current available stock fetch karein
        const currentStock = await prisma.currentStock.findUnique({
            where: {
                plantId_itemId: {
                    plantId: consumption.plantId,
                    itemId: consumption.itemId,
                }
            }
        });

        res.render('consumption/edit', {
            title: 'Edit Consumption',
            consumption,
            items: allMasterItems,
            // NAYA: Stock data ko view mein pass karein
            currentStock: {
                newQty: Number(currentStock?.newQty || 0n),
                oldUsedQty: Number(currentStock?.oldUsedQty || 0n)
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an existing consumption record.
 * If the editor is an Admin/Manager, it also auto-approves any related pending scrap requests,
 * creates a specific audit log, and sends a confirmation email.
 */
exports.updateConsumption = async (req, res, next) => {
    const { id } = req.params;
    const { user: approver } = req.session; // The user editing is the approver

    const {
        quantity,
        location,
        sub_location,
        remarks,
        isReturnable,
        date,
        // These fields are not editable on the form but are included for completeness
        old_itemCode,
        new_itemCode,
        old_assetNo,
        old_serialNo,
        old_poNo,
        old_faultRemark,
        new_assetNo,
        new_serialNo,
        new_poNo
    } = req.body;

    const newQuantity = parseInt(quantity, 10);

    if (isNaN(newQuantity) || newQuantity <= 0) {
        req.session.flash = { type: 'error', message: 'Quantity must be a positive number.' };
        return res.redirect(`/consumption/${id}/edit`);
    }

    try {
        let emailPayload = null;

        await prisma.$transaction(async (tx) => {
            const originalConsumption = await tx.consumption.findUnique({
                where: { id },
                include: { item: true }
            });

            if (!originalConsumption) {
                throw new Error("Consumption record not found.");
            }

            // Step 1: Calculate the difference in quantity
            const quantityDiff = newQuantity - Number(originalConsumption.quantity);

            // Step 2: If quantity is changed, validate and update stock
            if (quantityDiff !== 0) {
                const stock = await tx.currentStock.findUnique({
                    where: {
                        plantId_itemId: {
                            plantId: originalConsumption.plantId,
                            itemId: originalConsumption.itemId
                        }
                    }
                });

                const stockUpdateData = {};

                if (quantityDiff > 0) { // --- CASE: Quantity INCREASED ---
                    const totalAvailableStock = Number(stock?.newQty || 0n) + Number(stock?.oldUsedQty || 0n);
                    if (totalAvailableStock < quantityDiff) {
                        throw new Error(`Insufficient stock. Cannot increase quantity by ${quantityDiff}. Only ${totalAvailableStock} more available.`);
                    }
                    // Decrease stock (assuming from 'New' for simplicity during edits)
                    stockUpdateData.newQty = { decrement: quantityDiff };

                } else { // --- CASE: Quantity DECREASED ---
                    // THE FIX: Add the difference back to the 'Old & Used' category
                    stockUpdateData.oldUsedQty = { increment: -quantityDiff }; // -quantityDiff makes the number positive
                }

                await tx.currentStock.update({
                    where: {
                        plantId_itemId: {
                            plantId: originalConsumption.plantId,
                            itemId: originalConsumption.itemId,
                        }
                    },
                    data: stockUpdateData
                });
            }

            // Step 3: Update the consumption record itself
            await tx.consumption.update({
                where: { id },
                data: {
                    quantity: newQuantity,
                    date: new Date(date),
                    consumption_location: sanitize(location),
                    sub_location: sanitize(sub_location),
                    remarks: sanitize(remarks),
                    isReturnable: isReturnable === 'on',
                    new_assetNo: sanitize(new_assetNo),
                    new_serialNo: sanitize(new_serialNo),
                    new_poNo: sanitize(new_poNo),
                    old_assetNo: sanitize(old_assetNo),
                    old_serialNo: sanitize(old_serialNo),
                    old_poNo: sanitize(old_poNo),
                    old_faultRemark: sanitize(old_faultRemark),
                    updatedBy: approver.id
                }
            });

            // Step 4: Handle any associated pending scrap approvals
            const pendingApproval = await tx.consumptionScrapApproval.findFirst({
                where: { consumptionId: id, status: 'PENDING' },
                include: { requestedBy: true }
            });

            if (pendingApproval) {
                const approvedRecord = await tx.consumptionScrapApproval.update({
                    where: { id: pendingApproval.id },
                    data: {
                        status: 'APPROVED',
                        requestedQty: newQuantity,
                        approvedById: approver.id,
                        processedAt: new Date()
                    }
                });

                await logActivity({
                    userId: approver.id,
                    action: 'SCRAP_REQUEST_APPROVE',
                    ipAddress: req.ip,
                    details: { approvalId: approvedRecord.id, consumptionId: id, approvedQty: newQuantity }
                });
                
                emailPayload = {
                    requestor: pendingApproval.requestedBy,
                    approvalRecord: approvedRecord,
                    itemCode: originalConsumption.item.item_code
                };
            }

            // Step 5: Log the main update action
            await logActivity({
                userId: approver.id,
                action: 'CONSUMPTION_UPDATE',
                ipAddress: req.ip,
                details: { consumptionId: id, change: { from: Number(originalConsumption.quantity), to: newQuantity } }
            });
        });

        // Step 6: Send confirmation email if an approval was processed
        if (emailPayload) {
            sendApprovalConfirmationEmail(
                emailPayload.requestor,
                emailPayload.approvalRecord,
                emailPayload.itemCode,
                approver.name
            ).catch(console.error);
        }

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


exports.showConsumptionDetails = async (req, res, next) => {
    try {
        const { user } = req.session;
        // CHANGE: itemGroupId aur dataType ko bhi read karein
        const { itemId, plantId, itemGroupId, dataType } = req.query;

        if (!itemId || !plantId) { /* ... error handling ... */ }
        const item = await prisma.item.findUnique({ where: { id: itemId } });
        const plant = await prisma.plant.findUnique({ where: { id: plantId } });
        if (!item || !plant) { /* ... error handling ... */ }

        const consumptionEntries = await prisma.consumption.findMany({
            where: {
                itemId: itemId,
                plantId: plantId,
                isDeleted: false,
                oldAndReceived: false
            },
            orderBy: { date: 'desc' }
        });

        res.render('consumption/details', {
            title: `Consumption Details`,
            item,
            plant,
            consumptionEntries,
            user,
            // CHANGE: In values ko view ko pass karein
            itemGroupId,
            plantId, // plantId pehle se tha, bas confirm kar rahe hain
            dataType
        });
    } catch (error) {
        next(error);
    }
};