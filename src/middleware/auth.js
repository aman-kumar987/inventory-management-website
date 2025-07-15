const { ROLES } = require('../utils/constants');

// Checks if user is authenticated
exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    req.session.flash = { type: 'error', message: 'You must be logged in to view this page.' };
    res.redirect('/login');
};

// Middleware factory to check for specific roles
exports.hasRole = (roles) => {
    // Ensure roles is an array
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    return (req, res, next) => {
        // This middleware should run after isAuthenticated, so user is guaranteed to exist
        if (!req.session.user) {
            req.session.flash = { type: 'error', message: 'Authentication error.' };
            return res.redirect('/login');
        }
        
        const userRole = req.session.user.role;
        if (requiredRoles.includes(userRole)) {
            return next();
        }

        // Log unauthorized access attempt (we'll add a service for this later)
        console.log(`[AUTH] Unauthorized access attempt by user ${req.session.user.id} to ${req.originalUrl}`);

        // Render an error page instead of just text
        res.status(403).render('error', { 
            title: 'Forbidden', 
            message: 'You do not have permission to access this page or perform this action.' 
        });
    };
};


// Add this line
exports.isSuperAdmin = exports.hasRole([ROLES.SUPER_ADMIN]);