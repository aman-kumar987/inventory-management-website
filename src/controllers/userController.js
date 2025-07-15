const { prisma } = require('../config/db');
const { validationResult } = require('express-validator');
const { logActivity } = require('../services/activityLogService');
const bcrypt = require('bcrypt');

/**
 * @desc    Display list of all users and form to add/edit
 * @route   GET /users
 */
exports.listUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const searchTerm = req.query.search || '';
        
        let editUser = null;
        if (req.query.edit) {
            editUser = await prisma.user.findUnique({ where: { id: req.query.edit } });
        }

        const whereClause = {
            isDeleted: false,
            OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } },
            ],
        };

        const [users, totalRecords, plants, clusters] = await Promise.all([
            prisma.user.findMany({
                where: whereClause, skip, take: limit, orderBy: { name: 'asc' },
                include: { plant: true, cluster: true }
            }),
            prisma.user.count({ where: whereClause }),
            prisma.plant.findMany({ where: { isDeleted: false } }),
            prisma.cluster.findMany({ where: { isDeleted: false } })
        ]);
        
        res.render('users/index', {
            title: 'User Management',
            users,
            plants,
            clusters,
            editUser,
            currentPage: page,
            totalPages: Math.ceil(totalRecords / limit),
            totalItems: totalRecords,
            searchTerm,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create a new user
 * @route   POST /users
 */
exports.createUser = async (req, res, next) => {
    // Add express-validator checks in a separate validator file for production
    const { name, email, password, role, status, plantId, clusterId } = req.body;
    
    try {
        const existingUser = await prisma.user.findFirst({ where: { email, isDeleted: false } });
        if (existingUser) {
            req.session.flash = { type: 'error', message: 'A user with this email already exists.' };
            return res.redirect('/users');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name, email, role, status, plantId,
                clusterId: clusterId || null,
                password: hashedPassword,
                createdBy: req.session.user.id
            }
        });

        await logActivity({
            userId: req.session.user.id, action: 'USER_CREATE', ipAddress: req.ip,
            details: { createdUserId: newUser.id, email: newUser.email, role: newUser.role }
        });

        req.session.flash = { type: 'success', message: 'User created successfully.' };
        res.redirect('/users');
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update an existing user
 * @route   POST /users/:id/edit
 */
exports.updateUser = async (req, res, next) => {
    const { id } = req.params;
    const { name, email, role, status, plantId, clusterId, password } = req.body;
    
    try {
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

        // Only update password if a new one is provided
        if (password) {
            dataToUpdate.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: dataToUpdate
        });

        await logActivity({
            userId: req.session.user.id, action: 'USER_UPDATE', ipAddress: req.ip,
            details: { updatedUserId: updatedUser.id, email: updatedUser.email }
        });

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