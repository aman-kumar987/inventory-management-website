const { prisma } = require('../config/db');
const { Prisma } = require('@prisma/client');

exports.listLogs = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 25;
        const skip = (page - 1) * limit;
        
        const { search = '', userFilter, actionFilter, fromDate, toDate } = req.query;

        // The main where clause object
        const whereClause = { AND: [] };

        if (search) {
            whereClause.AND.push({
                OR: [
                    { action: { contains: search, mode: 'insensitive' } },
                    { ipAddress: { contains: search, mode: 'insensitive' } },
                    { user: { name: { contains: search, mode: 'insensitive' } } },
                    { user: { email: { contains: search, mode: 'insensitive' } } },
                ]
            });
        }
        if (userFilter) whereClause.AND.push({ userId: userFilter });
        if (actionFilter) whereClause.AND.push({ action: actionFilter });
        if (fromDate) whereClause.AND.push({ createdAt: { gte: new Date(fromDate) } });
        if (toDate) {
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);
            whereClause.AND.push({ createdAt: { lte: endDate } });
        }

        if (whereClause.AND.length === 0) {
            delete whereClause.AND;
        }

        const [logs, totalRecords, users, actions] = await Promise.all([
            prisma.activityLog.findMany({
                where: whereClause, // <-- Using the correct variable name
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { name: true, email: true } } }
            }),
            // --- THE FIX IS HERE ---
            // Changed 'where' to 'whereClause' to match the defined variable
            prisma.activityLog.count({ where: whereClause }),
            
            prisma.user.findMany({ where: { isDeleted: false }, select: { id: true, name: true }, orderBy: {name: 'asc'} }),
            prisma.activityLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: {action: 'asc'} })
        ]);

        res.render('logs/index', {
            title: 'Audit Log',
            logs,
            users,
            actions: actions.map(a => a.action),
            currentPage: page,
            totalPages: Math.ceil(totalRecords / limit),
            totalItems: totalRecords,
            limit: limit,
            filters: req.query,
            // Pass the search term separately for the input value
            searchTerm: search 
        });
    } catch (error) {
        next(error);
    }
};