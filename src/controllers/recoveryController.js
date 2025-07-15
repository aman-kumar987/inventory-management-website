const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');

/**
 * @desc    Display the main Data Recovery page with different tabs
 * @route   GET /recovery
 */
exports.renderRecoveryPage = async (req, res, next) => {
    try {
        const view = req.query.view || 'items'; // Default to the 'items' tab
        let data = [];
        let title = 'Data Recovery';

        switch (view) {
            case 'item-groups':
                data = await prisma.itemGroup.findMany({ where: { isDeleted: true }, orderBy: { updatedAt: 'desc' } });
                title = 'Deleted Item Groups';
                break;
            case 'plants':
                data = await prisma.plant.findMany({ where: { isDeleted: true }, include: { cluster: true }, orderBy: { updatedAt: 'desc' } });
                title = 'Deleted Plants';
                break;
            case 'clusters':
                data = await prisma.cluster.findMany({ where: { isDeleted: true }, orderBy: { updatedAt: 'desc' } });
                title = 'Deleted Clusters';
                break;
            case 'users':
                data = await prisma.user.findMany({ where: { isDeleted: true }, include: { plant: true }, orderBy: { updatedAt: 'desc' } });
                title = 'Deleted Users';
                break;
            case 'items':
            default:
                data = await prisma.item.findMany({ where: { isDeleted: true }, include: { itemGroup: true }, orderBy: { updatedAt: 'desc' } });
                title = 'Deleted Items';
                break;
        }

        res.render('recovery/index', {
            title,
            currentView: view,
            data
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Restore a soft-deleted record with selective cascading "undelete" logic.
 * @route   POST /recovery/undo
 */
exports.undoSoftDelete = async (req, res, next) => {
    const { id, model } = req.body;
    const { user } = req.session;

    try {
        if (!id || !model) throw new Error('Invalid request. Missing ID or model name.');
        
        // --- THIS IS THE FIX ---
        // Create a mapping from the URL/form value to the actual Prisma model key.
        const modelMap = {
            'items': 'item',
            'item-groups': 'itemGroup',
            'plants': 'plant',
            'clusters': 'cluster',
            'users': 'user'
        };
        const modelName = modelMap[model]; // e.g., 'item-groups' -> 'itemGroup'

        // Now, validate against the allowed keys of the map.
        if (!modelName) {
            throw new Error('Invalid model type for recovery.');
        }
        // --- END OF FIX ---

        await prisma.$transaction(async (tx) => {
            // Helper function to recalculate and restore CurrentStock...
            const recreateCurrentStock = async (itemId, plantId) => { /* ... no changes here ... */ };

            // --- CASCADING UNDO LOGIC WITH PARENT VALIDATION ---
            if (modelName === 'item') {
                const item = await tx.item.findUnique({ where: { id }, include: { itemGroup: true } });
                if (item.itemGroup.isDeleted) throw new Error('Cannot restore item: its Item Group is deleted. Restore the group first.');
                
                await tx.inventory.updateMany({ where: { itemId: id, isDeleted: true }, data: { isDeleted: false, updatedBy: user.id } });
                await tx.consumption.updateMany({ where: { itemId: id, isDeleted: true }, data: { isDeleted: false, updatedBy: user.id } });
                
                const affectedPlants = await tx.inventory.findMany({ where: { itemId: id, isDeleted: false }, distinct: ['plantId'], select: { plantId: true } });
                for (const plant of affectedPlants) {
                    await recreateCurrentStock(id, plant.plantId);
                }
            }

            if (modelName === 'plant') {
                const plant = await tx.plant.findUnique({ where: { id }, include: { cluster: true } });
                if (plant.cluster.isDeleted) throw new Error('Cannot restore Plant: its Cluster is deleted. Restore the Cluster first.');
                
                await tx.inventory.updateMany({ where: { plantId: id, isDeleted: true }, data: { isDeleted: false, updatedBy: user.id } });
                await tx.consumption.updateMany({ where: { plantId: id, isDeleted: true }, data: { isDeleted: false, updatedBy: user.id } });
                
                const affectedItems = await tx.inventory.findMany({ where: { plantId: id, isDeleted: false }, distinct: ['itemId'], select: { itemId: true } });
                for (const item of affectedItems) {
                    await recreateCurrentStock(item.itemId, id);
                }
            }
            
            if (modelName === 'user') {
                const userToRestore = await tx.user.findUnique({ where: { id }, include: { plant: true } });
                if (userToRestore.plant.isDeleted) throw new Error('Cannot restore User: their assigned Plant is deleted. Restore the Plant first.');
            }
            
            // For cluster and itemGroup, no cascade is needed, so they just fall through.
            
            // Finally, restore the main record itself
            await tx[modelName].update({
                where: { id },
                data: { isDeleted: false, status: (modelName === 'user' ? 'ACTIVE' : undefined), updatedBy: user.id }
            });
        });
        
        await logActivity({
            userId: user.id, action: 'DATA_RESTORE', ipAddress: req.ip,
            details: { model: modelName, recordId: id }
        });

        req.session.flash = { type: 'success', message: `${model.replace('-', ' ')} has been restored successfully.` };
        // Redirect back to the same tab the user was on
        res.redirect(`/recovery?view=${model}`);

    } catch (error) {
        console.error("Undo delete failed:", error.message);
        req.session.flash = { type: 'error', message: `Failed to restore: ${error.message}` };
        res.redirect(req.headers.referer || '/recovery');
    }
};