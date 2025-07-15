const { prisma } = require('../config/db');

/**
 * Logs an activity to the database.
 * @param {object} logData - The data for the log entry.
 * @param {string} [logData.userId] - The ID of the user performing the action. Can be null for system events.
 * @param {string} logData.action - A standardized code for the action (e.g., 'LOGIN_SUCCESS', 'ITEM_CREATE').
 * @param {string} [logData.ipAddress] - The IP address of the user.
 * @param {object} [logData.details] - A JSON object containing context-specific details about the event.
 */
const logActivity = async (logData) => {
    try {
        await prisma.activityLog.create({
            data: {
                userId: logData.userId || null,
                action: logData.action,
                ipAddress: logData.ipAddress || null,
                details: logData.details || null,
            },
        });
    } catch (error) {
        // In a real production app, you might want to log this error to a file instead of crashing.
        // For now, we'll just log to the console.
        console.error('Failed to write to activity log:', error);
    }
};

module.exports = {
    logActivity,
};