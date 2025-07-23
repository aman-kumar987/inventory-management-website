const { prisma } = require('../config/db');
const bcrypt = require('bcrypt');
const { logActivity } = require('../services/activityLogService');

// Helper to get plants in the manager's cluster
const getPlantsInCluster = async (clusterId) => {
    if (!clusterId) return [];
    return prisma.plant.findMany({ where: { clusterId, isDeleted: false }, orderBy: { name: 'asc' } });
};

/**
 * @desc    List users within the manager's cluster and show add/edit form.
 * @route   GET /cluster/users
 */
exports.listUsers = async (req, res, next) => {
    try {
        const { user: manager } = req.session;

        const plantsInCluster = await getPlantsInCluster(manager.clusterId);
        
        const usersInCluster = await prisma.user.findMany({
            where: {
                isDeleted: false,
                clusterId: manager.clusterId,
                role: { in: ['USER', 'VIEWER'] }
            },
            include: { plant: true },
            orderBy: { name: 'asc' }
        });

        res.render('cluster/users', {
            title: 'Manage Cluster Users',
            users: usersInCluster,
            plants: plantsInCluster,
            editUser: null 
        });
    } catch (error) { // THE FIX: Added the missing curly braces
        next(error);
    }
};

/**
 * @desc    Create a new user within the manager's cluster.
 * @route   POST /cluster/users
 */
exports.createUser = async (req, res, next) => {
    const { name, email, password, role, plantId } = req.body;
    const { user: manager } = req.session;

    try {
        // --- SECURITY CHECKS ---
        if (role === 'SUPER_ADMIN' || role === 'CLUSTER_MANAGER') {
            req.session.flash = { type: 'error', message: 'You do not have permission to create administrator-level accounts.' };
            return res.redirect('/cluster/users');
        }
        const plantsInCluster = await getPlantsInCluster(manager.clusterId);
        if (!plantsInCluster.some(p => p.id === plantId)) {
            req.session.flash = { type: 'error', message: 'You can only assign users to plants within your own cluster.' };
            return res.redirect('/cluster/users');
        }
        const existingUser = await prisma.user.findFirst({ where: { email, isDeleted: false } });
        if (existingUser) {
            req.session.flash = { type: 'error', message: 'A user with this email already exists.' };
            return res.redirect('/cluster/users');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                name, email, password: hashedPassword, role, plantId,
                clusterId: manager.clusterId, // Assign to their own cluster
                createdBy: manager.id, status: 'ACTIVE'
            }
        });

        await logActivity({
            userId: manager.id, action: 'USER_CREATE_BY_MANAGER', ipAddress: req.ip,
            details: { createdUserId: newUser.id, email: newUser.email }
        });

        req.session.flash = { type: 'success', message: 'User created successfully.' };
        res.redirect('/cluster/users');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update a user within the manager's cluster and destroy their active sessions.
 * @route   POST /cluster/users/:id/edit
 */
exports.updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, role, plantId, password } = req.body;
    const { user: manager } = req.session;

    try {
        // ... (security checks remain the same)
        const userToUpdate = await prisma.user.findUnique({ where: { id } });
        if (!userToUpdate || userToUpdate.clusterId !== manager.clusterId) {
            req.session.flash = { type: 'error', message: 'You can only edit users within your own cluster.' };
            return res.redirect('/cluster/users');
        }
        if (role === 'SUPER_ADMIN' || role === 'CLUSTER_MANAGER') {
            req.session.flash = { type: 'error', message: 'You cannot promote users to an administrator role.' };
            return res.redirect('/cluster/users');
        }

        let dataToUpdate = { name, email, role, plantId, updatedBy: manager.id };
        if (password) {
            dataToUpdate.password = await bcrypt.hash(password, 10);
        }

        await prisma.user.update({ where: { id }, data: dataToUpdate });

        // THE FIX: Using a more robust JSON query to find and destroy sessions
        await prisma.$queryRaw`DELETE FROM "session" WHERE sess -> 'user' ->> 'id' = ${id}`;

        await logActivity({
            userId: manager.id, action: 'USER_UPDATE_BY_MANAGER', ipAddress: req.ip,
            details: { updatedUserId: id, email: email }
        });

        req.session.flash = { type: 'success', message: 'User updated successfully. Their active sessions have been logged out.' };
        res.redirect('/cluster/users');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Soft delete a user within the manager's cluster.
 * @route   POST /cluster/users/:id/delete
 */
exports.softDeleteUser = async (req, res, next) => {
    const { id } = req.params;
    const { user: manager } = req.session;

    try {
        // --- SECURITY CHECK ---
        const userToDelete = await prisma.user.findUnique({ where: { id } });
        if (!userToDelete || userToDelete.clusterId !== manager.clusterId) {
            req.session.flash = { type: 'error', message: 'You can only delete users within your own cluster.' };
            return res.redirect('/cluster/users');
        }
        
        await prisma.user.update({
            where: { id },
            data: { isDeleted: true, status: 'INACTIVE', updatedBy: manager.id }
        });

        await logActivity({
            userId: manager.id, action: 'USER_DELETE_BY_MANAGER', ipAddress: req.ip,
            details: { deletedUserId: id, email: userToDelete.email }
        });

        req.session.flash = { type: 'success', message: 'User moved to trash.' };
        res.redirect('/cluster/users');
    } catch (error) {
        next(error);
    }
};