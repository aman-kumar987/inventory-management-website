const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const bcrypt = require('bcrypt');

// Helper function to get data for forms
const getFormData = () => Promise.all([
    prisma.plant.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }),
    prisma.cluster.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } })
]);

// 1. LIST USERS (Updated)
exports.listUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';

        const whereClause = {
            isDeleted: false,
            // NAYA BADLAV: Sirf un users ko dikhayein jinka role UNASSIGNED nahi hai
            role: {
                not: 'UNASSIGNED'
            },
            OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } },
            ],
        };

        const [users, totalRecords] = await Promise.all([
            prisma.user.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { name: 'asc' },
                include: { plant: true, cluster: true }
            }),
            prisma.user.count({ where: whereClause })
        ]);
        
        res.render('users/index', {
            title: 'User Management',
            users,
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

// 4. CREATE USER (Updated)
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

// 5. UPDATE USER (Updated)
exports.updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, role, status, plantId, clusterId, password } = req.body;
    try {
        let dataToUpdate = {
            name, email, role, status,
            plantId: plantId || null,
            clusterId: clusterId || null,
            updatedBy: req.session.user.id
        };
        if (password) {
            dataToUpdate.password = await bcrypt.hash(password, 10);
        }
        await prisma.user.update({ where: { id }, data: dataToUpdate });
        await logActivity({ /* ... */ });
        req.session.flash = { type: 'success', message: 'User updated successfully.' };
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