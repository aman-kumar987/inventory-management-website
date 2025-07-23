const { prisma } = require('../config/db');

/**
 * Logs an activity to the database, safely handling non-existent users.
 * @param {object} logData - The data for the log entry.
 * @param {string} [logData.userId] - The ID of the user performing the action.
 * @param {string} logData.action - A standardized code for the action.
 * @param {string} [logData.ipAddress] - The IP address of the user.
 * @param {object} [logData.details] - A JSON object with context-specific details.
 */
const logActivity = async (logData) => {
    try {
        let finalUserId = logData.userId || null;

        // THE FIX: If a userId is provided, verify it exists before logging.
        if (finalUserId) {
            const userExists = await prisma.user.findUnique({
                where: { id: finalUserId },
                select: { id: true } // Only select the ID for performance
            });
            // If the user doesn't exist, set the userId for this log to null.
            if (!userExists) {
                finalUserId = null;
            }
        }

        await prisma.activityLog.create({
            data: {
                userId: finalUserId,
                action: logData.action,
                ipAddress: logData.ipAddress || null,
                details: logData.details || null,
            },
        });
    } catch (error) {
        console.error('Failed to write to activity log:', error);
    }
};

module.exports = {
    logActivity,
};