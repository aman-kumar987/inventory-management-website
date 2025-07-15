const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');

/**
 * @desc    List all pending scrap approval requests.
 * @route   GET /approvals/scrap
 */
exports.listScrapApprovals = async (req, res, next) => {
    try {
        const { user } = req.session;
        let whereClause = { status: 'PENDING' };

        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({
                where: { clusterId: user.clusterId },
                select: { id: true }
            });
            const plantIds = plantsInCluster.map(p => p.id);
            if (plantIds.length > 0) {
                whereClause.inventory = { plantId: { in: plantIds } };
            } else {
                // If manager has no plants, there can be no pending requests for them.
                whereClause.id = { equals: 'non-existent-id' }; // Ensures no results
            }
        }
        
        const approvalRequests = await prisma.scrapApproval.findMany({
            where: whereClause,
            include: {
                requestedBy: { select: { name: true } },
                inventory: { include: { item: true, plant: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        
        // --- THIS IS THE CORRECT, SIMPLE RENDER CALL ---
        res.render('approvals/scrap', {
            title: 'Scrap Approval Requests',
            layout: 'layouts/approvals', // We will create this new layout file
            requests: approvalRequests,
            scrapRequestCount: approvalRequests.length
        });

    } catch (error) {
        next(error);
    }
};


/**
 * @desc    Process a scrap approval request (Approve or Reject)
 * @route   POST /approvals/scrap/:id/process
 */
exports.processScrapRequest = async (req, res, next) => {
    const { id } = req.params; // Approval request ID
    const { action } = req.body; // 'approve' or 'reject'
    const { user } = req.session; // The approver

    if (!['approve', 'reject'].includes(action)) {
        req.session.flash = { type: 'error', message: 'Invalid action.' };
        return res.redirect('/approvals/scrap');
    }

    try {
        await prisma.$transaction(async (tx) => {
            const approvalRequest = await tx.scrapApproval.findUnique({
                where: { id },
                include: { inventory: true }
            });

            if (!approvalRequest || approvalRequest.status !== 'PENDING') {
                throw new Error('Approval request not found or already processed.');
            }

            // --- APPROVE LOGIC ---
            if (action === 'approve') {
                const inventory = approvalRequest.inventory;
                const newScrapQty = approvalRequest.requestedQty;
                const scrapDiff = newScrapQty - inventory.scrappedQty; // The change in scrap quantity

                // We must also adjust the Old/Used quantity from which scrap is taken
                const newOldUsedQty = Math.max(0, inventory.oldUsedQty - scrapDiff);
                
                const newTotal = inventory.newQty + newOldUsedQty + newScrapQty - inventory.consumptionAmount;
                const stockDiff = newTotal - inventory.total;

                // 1. Update the inventory record
                const updatedInventory = await tx.inventory.update({
                    where: { id: approvalRequest.inventoryId },
                    data: {
                        scrappedQty: newScrapQty,
                        oldUsedQty: newOldUsedQty, // Also update the old/used qty
                        total: newTotal
                    }
                });

                // --- THE FIX IS HERE: Use upsert instead of update ---
                // 2. Update (or create) the main stock total
                if (stockDiff !== 0) {
                    await tx.currentStock.upsert({
                        where: {
                            plantId_itemId: {
                                plantId: updatedInventory.plantId,
                                itemId: updatedInventory.itemId
                            }
                        },
                        // If it exists, apply the change
                        update: {
                            totalQty: { increment: stockDiff }
                        },
                        // If it doesn't exist, create it with the correct initial stock
                        create: {
                            plantId: updatedInventory.plantId,
                            itemId: updatedInventory.itemId,
                            totalQty: stockDiff
                        }
                    });
                }
                
                // 3. Update the approval request itself
                await tx.scrapApproval.update({
                    where: { id },
                    data: { status: 'APPROVED', approvedById: user.id, processedAt: new Date() }
                });

                await logActivity({
                    userId: user.id, action: 'SCRAP_REQUEST_APPROVE', ipAddress: req.ip,
                    details: { approvalId: id, inventoryId: inventory.id, approvedQty: newScrapQty }
                });
                req.session.flash = { type: 'success', message: 'Scrap request approved.' };

            } else { // --- REJECT LOGIC ---
                await tx.scrapApproval.update({
                    where: { id },
                    data: { status: 'REJECTED', approvedById: user.id, processedAt: new Date() }
                });

                await logActivity({
                    userId: user.id, action: 'SCRAP_REQUEST_REJECT', ipAddress: req.ip,
                    details: { approvalId: id, inventoryId: approvalRequest.inventoryId }
                });
                req.session.flash = { type: 'info', message: 'Scrap request rejected.' };
            }
        });

        res.redirect('/approvals/scrap');

    } catch(error) {
        console.error("Failed to process scrap request:", error);
        req.session.flash = { type: 'error', message: `Failed to process request: ${error.message}` };
        res.redirect('/approvals/scrap');
    }
};

// ... keep the existing listScrapApprovals and processScrapRequest functions ...

/**
 * @desc    List all users pending approval.
 * @route   GET /approvals/users
 */
exports.listUserApprovals = async (req, res, next) => {
    try {
        const pendingUsers = await prisma.user.findMany({
            where: {
                status: 'PENDING_APPROVAL',
                isDeleted: false
            },
            include: {
                plant: true, // Include plant name for context
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        // Get the count of pending scrap requests to pass to the layout
        // This logic is duplicated, a helper function would be good for refactoring later
        const scrapRequestCount = await prisma.scrapApproval.count({ where: { status: 'PENDING' } });
        
        res.render('approvals/users', { // We will create this new view
            title: 'New User Approvals',
            layout: 'layouts/approvals', // Use the same nested layout
            requests: pendingUsers,
            scrapRequestCount, // Pass the count for the other tab
            userRequestCount: pendingUsers.length // Pass count for this tab's badge
        });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process a new user approval request (Approve or Reject)
 * @route   POST /approvals/users/:id/process
 */
exports.processUserRequest = async (req, res, next) => {
    const { id } = req.params; // User ID
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
        req.session.flash = { type: 'error', message: 'Invalid action.' };
        return res.redirect('/approvals/users');
    }

    try {
        const userToProcess = await prisma.user.findUnique({ where: { id } });

        if (!userToProcess || userToProcess.status !== 'PENDING_APPROVAL') {
            throw new Error('User not found or has already been processed.');
        }

        if (action === 'approve') {
            await prisma.user.update({
                where: { id },
                data: {
                    status: 'ACTIVE' // Activate the user
                }
            });
            req.session.flash = { type: 'success', message: `User ${userToProcess.name} has been approved and activated.` };
        } else { // action === 'reject'
            // For rejection, we will soft delete the user record entirely.
            await prisma.user.update({
                where: { id },
                data: {
                    isDeleted: true,
                    status: 'INACTIVE' // Also set to inactive as a safeguard
                }
            });
            req.session.flash = { type: 'info', message: `User registration for ${userToProcess.name} has been rejected.` };
        }
        
        // TODO: Send notification email to the user...

        res.redirect('/approvals/users');

    } catch(error) {
        console.error("Failed to process user request:", error);
        req.session.flash = { type: 'error', message: 'Failed to process user request.' };
        res.redirect('/approvals/users');
    }
};