const { prisma } = require('../config/db');
const { validationResult } = require('express-validator');
const { sanitize } = require('../utils/sanitizer');
const { logActivity } = require('../services/activityLogService');

/**
 * @desc    Display list of all item groups and the form to add/edit
 * @route   GET /item-groups
 */
exports.listItemGroups = async (req, res, next) => {
    try {
        const editGroupId = req.query.edit;
        let groupToEdit = null;

        if (editGroupId) {
            groupToEdit = await prisma.itemGroup.findUnique({ where: { id: editGroupId } });
        }

        const itemGroups = await prisma.itemGroup.findMany({
            where: { isDeleted: false },
            orderBy: { name: 'asc' },
        });

        res.render('master/item-groups/index', {
            title: 'Item Groups',
            itemGroups,
            groupToEdit: groupToEdit,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process the creation of a new item group
 * @route   POST /item-groups
 */
exports.createItemGroup = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Handle validation errors here if needed
    }

    try {
        const { name } = req.body;
        const existingGroup = await prisma.itemGroup.findFirst({
            where: { name: { equals: name, mode: 'insensitive' }, isDeleted: false }
        });

        if (existingGroup) {
            req.session.flash = { type: 'error', message: 'An item group with this name already exists.' };
            return res.redirect('/item-groups');
        }

        const newGroup = await prisma.itemGroup.create({
            data: {
                name: sanitize(name),
                createdBy: req.session.user.id,
            },
        });

        await logActivity({
            userId: req.session.user.id, action: 'ITEM_GROUP_CREATE', ipAddress: req.ip,
            details: { itemGroupId: newGroup.id, name: newGroup.name }
        });

        req.session.flash = { type: 'success', message: 'Item Group created successfully.' };
        res.redirect('/item-groups');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process the update of an item group
 * @route   POST /item-groups/:id/edit
 */
exports.updateItemGroup = async (req, res, next) => {
    const { id } = req.params;
    const { name } = req.body;
    const { user } = req.session;

    try {
        const existingGroup = await prisma.itemGroup.findFirst({
            where: {
                name: { equals: name, mode: 'insensitive' },
                isDeleted: false,
                id: { not: id }
            }
        });

        if (existingGroup) {
            req.session.flash = { type: 'error', message: 'Another item group with this name already exists.' };
            return res.redirect('/item-groups');
        }

        const updatedGroup = await prisma.itemGroup.update({
            where: { id },
            data: { name: sanitize(name), updatedBy: user.id }
        });

        await logActivity({
            userId: user.id, action: 'ITEM_GROUP_UPDATE', ipAddress: req.ip,
            details: { itemGroupId: updatedGroup.id, newName: updatedGroup.name }
        });

        req.session.flash = { type: 'success', message: 'Item Group updated successfully.' };
        res.redirect('/item-groups');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Soft delete an item group and its related items and transactions
 * @route   POST /item-groups/:id/delete
 */
exports.softDeleteItemGroup = async (req, res, next) => {
    const { id } = req.params;
    const { user } = req.session;

    try {
        const groupToDelete = await prisma.itemGroup.findUnique({ where: { id } });
        if (!groupToDelete) {
            req.session.flash = { type: 'error', message: 'Item Group not found.' };
            return res.redirect('/item-groups');
        }

        // Use a transaction to ensure all or nothing is deleted
        await prisma.$transaction(async (tx) => {
            // 1. Find all items associated with this group that are not already deleted
            const itemsInGroup = await tx.item.findMany({ 
                where: { itemGroupId: id, isDeleted: false } 
            });
            const itemIds = itemsInGroup.map(item => item.id);

            // 2. If there are items, cascade the delete
            if (itemIds.length > 0) {
                // Delete summary records
                await tx.currentStock.deleteMany({ where: { itemId: { in: itemIds } } });
                
                // Soft-delete transactional records
                await tx.inventory.updateMany({ where: { itemId: { in: itemIds } }, data: { isDeleted: true, updatedBy: user.id } });
                await tx.consumption.updateMany({ where: { itemId: { in: itemIds } }, data: { isDeleted: true, updatedBy: user.id } });
                
                // Soft-delete the items themselves
                await tx.item.updateMany({ where: { id: { in: itemIds } }, data: { isDeleted: true, updatedBy: user.id } });
            }

            // 3. Finally, soft delete the item group itself
            await tx.itemGroup.update({
                where: { id },
                data: { isDeleted: true, updatedBy: user.id }
            });
        });

        await logActivity({
            userId: user.id, action: 'ITEM_GROUP_DELETE', ipAddress: req.ip,
            details: { itemGroupId: id, name: groupToDelete.name, note: 'Cascading soft delete performed on related items.' }
        });

        req.session.flash = { type: 'success', message: `Item Group '${groupToDelete.name}' and all its items have been moved to trash.` };
        res.redirect('/item-groups');
    } catch (error) {
        console.error("Item Group soft delete failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to delete the item group.' };
        res.redirect('/item-groups');
    }
};