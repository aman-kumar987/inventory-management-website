const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const { sanitize } = require('../utils/sanitizer');
/**
 * @desc    Display list of all clusters and form to add/edit
 */
exports.listClusters = async (req, res, next) => {
    try {
        const editClusterId = req.query.edit;
        let clusterToEdit = null;
        if (editClusterId) {
            clusterToEdit = await prisma.cluster.findUnique({ where: { id: editClusterId } });
        }
        const clusters = await prisma.cluster.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } });
        res.render('master/clusters/index', {
            title: 'Cluster Management',
            clusters,
            clusterToEdit
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create a new cluster
 */
exports.createCluster = async (req, res, next) => {
    const { name } = req.body;
    try {
        const newCluster = await prisma.cluster.create({
            data: { name: sanitize(name), createdBy: req.session.user.id }
        });
        await logActivity({
            userId: req.session.user.id, action: 'CLUSTER_CREATE', ipAddress: req.ip,
            details: { clusterId: newCluster.id, name: newCluster.name }
        });
        req.session.flash = { type: 'success', message: 'Cluster created successfully.' };
        res.redirect('/clusters');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an existing cluster
 */
exports.updateCluster = async (req, res, next) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const updatedCluster = await prisma.cluster.update({
            where: { id },
            data: { name: sanitize(name), updatedBy: req.session.user.id }
        });
        await logActivity({
            userId: req.session.user.id, action: 'CLUSTER_UPDATE', ipAddress: req.ip,
            details: { clusterId: updatedCluster.id, newName: updatedCluster.name }
        });
        req.session.flash = { type: 'success', message: 'Cluster updated successfully.' };
        res.redirect('/clusters');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Soft delete a cluster and its related plants and their transactional records.
 *          This will NOT delete master Item or User records.
 * @route   POST /clusters/:id/delete
 */
exports.softDeleteCluster = async (req, res, next) => {
    const { id: clusterId } = req.params;
    const { user } = req.session;

    try {
        const clusterToDelete = await prisma.cluster.findUnique({ where: { id: clusterId } });
        if (!clusterToDelete || clusterToDelete.isDeleted) {
            req.session.flash = { type: 'error', message: 'Cluster not found or already deleted.' };
            return res.redirect('/clusters');
        }

        await prisma.$transaction(async (tx) => {
            // 1. Find all plants within this cluster
            const plantsInCluster = await tx.plant.findMany({ 
                where: { clusterId: clusterId, isDeleted: false },
                select: { id: true }
            });
            const plantIds = plantsInCluster.map(p => p.id);

            if (plantIds.length > 0) {
                // 2. Delete summary and soft-delete transactional records for these plants
                await tx.currentStock.deleteMany({ where: { plantId: { in: plantIds } } });
                await tx.inventory.updateMany({ where: { plantId: { in: plantIds } }, data: { isDeleted: true, updatedBy: user.id } });
                await tx.consumption.updateMany({ where: { plantId: { in: plantIds } }, data: { isDeleted: true, updatedBy: user.id } });
                
                // IMPORTANT: We do NOT delete Users. An admin must re-assign them manually.
                // We will set their clusterId to null to un-link them.
                await tx.user.updateMany({
                    where: { clusterId: clusterId },
                    data: { clusterId: null, updatedBy: user.id }
                });

                // 3. Soft-delete the plants themselves
                await tx.plant.updateMany({ 
                    where: { id: { in: plantIds } }, 
                    data: { isDeleted: true, updatedBy: user.id } 
                });
            }

            // 4. Finally, soft-delete the cluster itself
            await tx.cluster.update({
                where: { id: clusterId },
                data: { isDeleted: true, updatedBy: user.id }
            });
        });

        await logActivity({
            userId: user.id, action: 'CLUSTER_DELETE', ipAddress: req.ip,
            details: { clusterId: clusterId, name: clusterToDelete.name, note: 'Cascading soft delete on related plants and transactions.' }
        });

        req.session.flash = { type: 'success', message: `Cluster '${clusterToDelete.name}' and all its plants have been moved to trash.` };
        res.redirect('/clusters');

    } catch (error) {
        console.error("Cluster soft delete failed:", error);
        req.session.flash = { type: 'error', message: 'Failed to delete the cluster.' };
        res.redirect('/clusters');
    }
};