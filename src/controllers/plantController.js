const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const { sanitize } = require('../utils/sanitizer');
/**
 * @desc    Display list of all plants and form to add/edit
 */
exports.listPlants = async (req, res, next) => {
    try {
        const editPlantId = req.query.edit;
        let plantToEdit = null;
        if (editPlantId) {
            plantToEdit = await prisma.plant.findUnique({ where: { id: editPlantId } });
        }
        const [plants, clusters] = await Promise.all([
            prisma.plant.findMany({ where: { isDeleted: false }, include: { cluster: true }, orderBy: { name: 'asc' } }),
            prisma.cluster.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } })
        ]);
        res.render('master/plants/index', {
            title: 'Plant Management',
            plants,
            clusters,
            plantToEdit
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create a new plant
 */
exports.createPlant = async (req, res, next) => {
    const { name, clusterId } = req.body;
    try {
        const newPlant = await prisma.plant.create({
            data: { name: sanitize(name), clusterId, createdBy: req.session.user.id }
        });
        await logActivity({
            userId: req.session.user.id, action: 'PLANT_CREATE', ipAddress: req.ip,
            details: { plantId: newPlant.id, name: newPlant.name }
        });
        req.session.flash = { type: 'success', message: 'Plant created successfully.' };
        res.redirect('/plants');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an existing plant
 */
exports.updatePlant = async (req, res, next) => {
    const { id } = req.params;
    const { name, clusterId } = req.body;
    try {
        const updatedPlant = await prisma.plant.update({
            where: { id },
            data: { name: sanitize(name), clusterId, updatedBy: req.session.user.id }
        });
        await logActivity({
            userId: req.session.user.id, action: 'PLANT_UPDATE', ipAddress: req.ip,
            details: { plantId: updatedPlant.id, newName: updatedPlant.name }
        });
        req.session.flash = { type: 'success', message: 'Plant updated successfully.' };
        res.redirect('/plants');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Soft delete a plant and its related transactional records.
 *          This will NOT delete master Item or User records.
 * @route   POST /plants/:id/delete
 */
exports.softDeletePlant = async (req, res, next) => {
    const { id: plantId } = req.params;
    const { user } = req.session;

    try {
        const plantToDelete = await prisma.plant.findUnique({ where: { id: plantId } });
        if (!plantToDelete || plantToDelete.isDeleted) {
            req.session.flash = { type: 'error', message: 'Plant not found or already deleted.' };
            return res.redirect('/plants');
        }

        await prisma.$transaction(async (tx) => {
            // 1. Delete summary and soft-delete transactional records for this plant
            await tx.currentStock.deleteMany({ where: { plantId: plantId } });
            await tx.inventory.updateMany({ where: { plantId: plantId }, data: { isDeleted: true, updatedBy: user.id } });
            await tx.consumption.updateMany({ where: { plantId: plantId }, data: { isDeleted: true, updatedBy: user.id } });

            // IMPORTANT: We do NOT delete Users. An admin must re-assign them manually.
            // We will set their plantId to null if possible, but our schema requires a plantId.
            // So, we will instead set their status to INACTIVE. This is a safe business rule.
            await tx.user.updateMany({
                where: { plantId: plantId },
                data: { status: 'INACTIVE', updatedBy: user.id }
            });
            
            // 2. Finally, soft-delete the plant itself
            await tx.plant.update({
                where: { id: plantId },
                data: { isDeleted: true, updatedBy: user.id }
            });
        });

        await logActivity({
            userId: user.id, action: 'PLANT_DELETE', ipAddress: req.ip,
            details: { plantId: plantId, name: plantToDelete.name, note: 'Cascading soft delete on transactions. Associated users set to INACTIVE.' }
        });

        req.session.flash = { type: 'success', message: `Plant '${plantToDelete.name}' and its related records have been moved to trash.` };
        res.redirect('/plants');
    } catch (error) {
        console.error("Plant soft delete failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to delete the plant.' };
        res.redirect('/plants');
    }
};