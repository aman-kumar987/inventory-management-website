const { prisma } = require('../config/db');
const { validationResult } = require('express-validator');
const { sanitize } = require('../utils/sanitizer');
const { logActivity } = require('../services/activityLogService');
const xlsx = require('xlsx');
// Re-usable function to get item groups
const getItemGroups = () => prisma.itemGroup.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } });

/**
 * @desc    Display list of non-deleted items (paginated and searchable)
 */
exports.listItems = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';

        const whereClause = {
            isDeleted: false,
            OR: [
                { item_code: { contains: searchTerm, mode: 'insensitive' } },
                { item_description: { contains: searchTerm, mode: 'insensitive' } },
                { itemGroup: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ],
        };

        const [items, totalItems] = await Promise.all([
            prisma.item.findMany({ where: whereClause, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { itemGroup: true } }),
            prisma.item.count({ where: whereClause }),
        ]);

        res.render('master/items/index', {
            title: 'Item Master',
            items,
            currentPage: page,
            limit,
            totalPages: Math.ceil(totalItems / limit),
            totalItems,
            searchTerm,
            filters: req.query, // ✅ FIXED HERE
            user: req.session.user
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Render the form to create a new item
 */
exports.renderNewForm = async (req, res, next) => {
    try {
        res.render('master/items/add-edit', {
            title: 'Add New Item', item: {}, itemGroups: await getItemGroups(), errors: [],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process the creation of a new item
 */
exports.createItem = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { /* ... */ }

    try {
        const { item_code, item_description, uom, itemGroupId } = req.body;
        const existingItem = await prisma.item.findFirst({
            where: { item_code: { equals: item_code, mode: 'insensitive' }, isDeleted: false }
        });

        if (existingItem) {
            req.session.flash = { type: 'error', message: 'An active item with this Item Code already exists.' };
            return res.status(400).render('master/items/add-edit', {
                title: 'Add New Item', item: req.body, itemGroups: await getItemGroups(), errors: [],
            });
        }

        const newItem = await prisma.item.create({
            data: {
                item_code: sanitize(item_code), item_description: sanitize(item_description), uom: sanitize(uom),
                itemGroupId, createdBy: req.session.user.id,
            },
        });

        await logActivity({
            userId: req.session.user.id, action: 'ITEM_CREATE', ipAddress: req.ip,
            details: { itemId: newItem.id, itemCode: newItem.item_code }
        });

        req.session.flash = { type: 'success', message: 'Item created successfully.' };
        res.redirect('/items');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Render the form to edit an existing item
 */
exports.renderEditForm = async (req, res, next) => {
    try {
        const item = await prisma.item.findFirst({ where: { id: req.params.id, isDeleted: false } });
        if (!item) {
            req.session.flash = { type: 'error', message: 'Item not found.' };
            return res.redirect('/items');
        }
        res.render('master/items/add-edit', {
            title: 'Edit Item', item, itemGroups: await getItemGroups(), errors: [],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process the update of an item
 */
exports.updateItem = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { /* ... */ }

    try {
        const { item_code, item_description, uom, itemGroupId } = req.body;
        const existingItem = await prisma.item.findFirst({
            where: {
                item_code: { equals: item_code, mode: 'insensitive' },
                id: { not: req.params.id }, isDeleted: false
            }
        });
        if (existingItem) {
            req.session.flash = { type: 'error', message: 'Another active item with this Item Code already exists.' };
            return res.redirect(`/items/${req.params.id}/edit`);
        }

        const updatedItem = await prisma.item.update({
            where: { id: req.params.id },
            data: {
                item_code: sanitize(item_code), item_description: sanitize(item_description), uom: sanitize(uom),
                itemGroupId, updatedBy: req.session.user.id,
            },
        });

        await logActivity({
            userId: req.session.user.id, action: 'ITEM_UPDATE', ipAddress: req.ip,
            details: { itemId: updatedItem.id, itemCode: updatedItem.item_code }
        });

        req.session.flash = { type: 'success', message: 'Item updated successfully.' };
        res.redirect('/items');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Soft delete an item and all its related transactional records
 * @route   POST /items/:id/delete
 */
exports.softDeleteItem = async (req, res, next) => {
    const { id: itemId } = req.params;
    const { user } = req.session;

    try {
        const itemToDelete = await prisma.item.findUnique({ where: { id: itemId } });
        if (!itemToDelete || itemToDelete.isDeleted) {
            req.session.flash = { type: 'error', message: 'Item not found or already deleted.' };
            return res.redirect('/items');
        }

        // Use a transaction to ensure all or nothing is deleted
        await prisma.$transaction(async (tx) => {
            // 1. Delete the summary stock record completely.
            await tx.currentStock.deleteMany({
                where: { itemId: itemId }
            });

            // 2. Soft delete related transactional logs
            await tx.inventory.updateMany({
                where: { itemId: itemId },
                data: { isDeleted: true, updatedBy: user.id }
            });
            await tx.consumption.updateMany({
                where: { itemId: itemId },
                data: { isDeleted: true, updatedBy: user.id }
            });

            // 3. Finally, soft delete the item itself.
            await tx.item.update({
                where: { id: itemId },
                data: { isDeleted: true, updatedBy: user.id },
            });
        });

        // Log the action after the transaction is successful
        await logActivity({
            userId: user.id,
            action: 'ITEM_DELETE',
            ipAddress: req.ip,
            details: { itemId: itemToDelete.id, itemCode: itemToDelete.item_code, note: 'Cascading soft delete performed.' }
        });

        req.session.flash = { type: 'success', message: `Item '${itemToDelete.item_code}' and its related records have been moved to trash.` };
        res.redirect('/items');

    } catch (error) {
        console.error("Item soft delete failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to delete the item.' };
        res.redirect('/items');
    }
};

// Placeholder for Export/Import functionality if needed later
exports.exportItems = async (req, res) => { res.send('To be implemented'); };
exports.importItems = async (req, res) => { res.send('To be implemented'); };