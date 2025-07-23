const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const bcrypt = require('bcrypt');

// Helper function to get data for forms
const getFormData = () => Promise.all([
    prisma.plant.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }),
    prisma.cluster.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } })
]);

const getPlantsInCluster = async (clusterId) => {
    if (!clusterId) return [];
    return prisma.plant.findMany({ where: { clusterId, isDeleted: false }, orderBy: { name: 'asc' } });
};

exports.listUsers = async (req, res, next) => {
    try {
        const { user } = req.session; // The currently logged-in SUPER_ADMIN
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';

        const whereClause = {
            isDeleted: false,
            // THE FIX: Exclude the logged-in user from the list
            id: { not: user.id },
            role: { not: 'UNASSIGNED' }, // Continue to hide unassigned users
        };

        if (searchTerm) {
            whereClause.OR = [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } },
            ];
        }

        const [users, totalRecords, plants, clusters] = await Promise.all([
            prisma.user.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { name: 'asc' },
                include: { plant: true, cluster: true }
            }),
            prisma.user.count({ where: whereClause }),
            prisma.plant.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }),
            prisma.cluster.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } })
        ]);
        
        res.render('users/index', {
            title: 'User Management',
            users,
            plants,
            clusters,
            currentPage: page,
            totalPages: Math.ceil(totalRecords / limit),
            totalItems: totalRecords,
            searchTerm,
        });
    } catch (error) {
        next(error);
    }
};

// 2. RENDER ADD FORM (New Function)
exports.renderAddForm = async (req, res, next) => {
    try {
        const [plants, clusters] = await getFormData();
        res.render('users/add-edit', {
            title: 'Add New User',
            user: {},
            plants,
            clusters
        });
    } catch (error) {
        next(error);
    }
};

// 3. RENDER EDIT FORM (New Function)
exports.renderEditForm = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) {
            req.session.flash = { type: 'error', message: 'User not found.' };
            return res.redirect('/users');
        }
        const [plants, clusters] = await getFormData();
        res.render('users/add-edit', {
            title: 'Edit User',
            user,
            plants,
            clusters
        });
    } catch (error) {
        next(error);
    }
};


exports.createUser = async (req, res, next) => {
    const { name, email, password, role, status, plantId, clusterId } = req.body;
    try {
        const existingUser = await prisma.user.findFirst({ where: { email, isDeleted: false } });
        if (existingUser) {
            req.session.flash = { type: 'error', message: 'A user with this email already exists.' };
            return res.redirect('/users/new');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                name, email, role, status,
                plantId: plantId || null,
                clusterId: clusterId || null,
                password: hashedPassword,
                createdBy: req.session.user.id
            }
        });
        await logActivity({ /* ... */ });
        req.session.flash = { type: 'success', message: 'User created successfully.' };
        res.redirect('/users');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an existing user and destroy their active sessions.
 * @route   POST /users/:id/edit
 */
exports.updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, role, status, plantId, clusterId, password } = req.body;
    
    try {
        // ... (validation logic for existing user remains the same)
        const existingUser = await prisma.user.findFirst({
            where: { email, isDeleted: false, id: { not: id } }
        });
        if (existingUser) {
            req.session.flash = { type: 'error', message: 'Another user with this email already exists.' };
            return res.redirect('/users');
        }

        let dataToUpdate = {
            name, email, role, status, plantId,
            clusterId: clusterId || null,
            updatedBy: req.session.user.id
        };

        if (password) {
            dataToUpdate.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: dataToUpdate
        });

        // THE FIX: Using a more robust JSON query to find and destroy sessions
        await prisma.$queryRaw`DELETE FROM "session" WHERE sess -> 'user' ->> 'id' = ${id}`;

        await logActivity({
            userId: req.session.user.id, action: 'USER_UPDATE', ipAddress: req.ip,
            details: { updatedUserId: updatedUser.id, email: updatedUser.email }
        });

        req.session.flash = { type: 'success', message: 'User updated successfully. Their active sessions have been logged out.' };
        res.redirect('/users');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Soft delete a user
 * @route   POST /users/:id/delete
 */
exports.softDeleteUser = async (req, res, next) => {
    const { id } = req.params;
    
    // Prevent a user from deleting themselves
    if (id === req.session.user.id) {
        req.session.flash = { type: 'error', message: "You cannot delete your own account." };
        return res.redirect('/users');
    }

    try {
        const deletedUser = await prisma.user.update({
            where: { id },
            data: { 
                isDeleted: true,
                status: 'INACTIVE',
                updatedBy: req.session.user.id
            }
        });

        await logActivity({
            userId: req.session.user.id, action: 'USER_DELETE', ipAddress: req.ip,
            details: { deletedUserId: deletedUser.id, email: deletedUser.email }
        });

        req.session.flash = { type: 'success', message: `User ${deletedUser.name} has been moved to trash.` };
        res.redirect('/users');
    } catch (error) {
        next(error);
    }
};

exports.showMyRequests = async (req, res, next) => {
    try {
        const { user } = req.session;

        // Fetch both types of scrap requests initiated by the current user
        const inventoryScrapRequests = await prisma.scrapApproval.findMany({
            where: { requestedById: user.id },
            include: {
                inventory: { include: { item: true } },
                approvedBy: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const consumptionScrapRequests = await prisma.consumptionScrapApproval.findMany({
            where: { requestedById: user.id },
            include: {
                consumption: { include: { item: true } },
                approvedBy: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Add a 'type' to each request and merge them
        const allRequests = [
            ...inventoryScrapRequests.map(r => ({ ...r, type: 'Inventory' })),
            ...consumptionScrapRequests.map(r => ({ ...r, type: 'Consumption' }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort by most recent

        res.render('users/my-requests', {
            title: 'My Approval Requests',
            requests: allRequests,
        });
    } catch (error) {
        next(error);
    }
};