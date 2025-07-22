const { prisma } = require('../config/db');
const { logActivity } = require('../services/activityLogService');
const { sendApprovalConfirmationEmail, sendRejectionEmail } = require('../services/emailService'); 
/**
 * @desc    List all pending scrap approval requests.
 * @route   GET /approvals/scrap
 */
exports.listScrapApprovals = async (req, res, next) => {
    try {
        const { user } = req.session;
        const searchTerm = req.query.search || '';

        let plantIds = [];
        if (user.role === 'CLUSTER_MANAGER') {
            const plantsInCluster = await prisma.plant.findMany({
                where: { clusterId: user.clusterId }, select: { id: true }
            });
            plantIds = plantsInCluster.map(p => p.id);
            if (plantIds.length === 0) plantIds = ['-1'];
        }
        
        const lowerSearchTerm = searchTerm.toLowerCase();
        let allRequests = [];

        // --- Search by Type logic ---
        const searchInventory = !lowerSearchTerm || !'consumption'.includes(lowerSearchTerm);
        const searchConsumption = !lowerSearchTerm || !'inventory'.includes(lowerSearchTerm);

        // 1. Fetch Inventory Scrap Approvals
        if (searchInventory) {
            const where = {
                status: 'PENDING',
                inventory: plantIds.length > 0 ? { plantId: { in: plantIds } } : undefined,
            };
            if (searchTerm) {
                where.OR = [
                    { inventory: { item: { item_code: { contains: searchTerm, mode: 'insensitive' } } } },
                    { inventory: { item: { item_description: { contains: searchTerm, mode: 'insensitive' } } } },
                    { inventory: { plant: { name: { contains: searchTerm, mode: 'insensitive' } } } },
                    // FIX: 'requestedBy' ab akele hai, inventory ke andar nahi
                    { requestedBy: { name: { contains: searchTerm, mode: 'insensitive' } } }
                ];
            }
            const inventoryApprovals = await prisma.scrapApproval.findMany({
                where,
                include: { requestedBy: true, inventory: { include: { item: true, plant: true } } }
            });
            allRequests.push(...inventoryApprovals.map(r => ({ ...r, type: 'Inventory', currentScrapQty: r.inventory.scrappedQty })));
        }

        // 2. Fetch Consumption Scrap Approvals
        if (searchConsumption) {
             const where = {
                status: 'PENDING',
                consumption: plantIds.length > 0 ? { plantId: { in: plantIds } } : undefined,
            };
            if (searchTerm) {
                where.OR = [
                    { consumption: { item: { item_code: { contains: searchTerm, mode: 'insensitive' } } } },
                    { consumption: { item: { item_description: { contains: searchTerm, mode: 'insensitive' } } } },
                    { consumption: { plant: { name: { contains: searchTerm, mode: 'insensitive' } } } },
                    // FIX: 'requestedBy' ab akele hai, consumption ke andar nahi
                    { requestedBy: { name: { contains: searchTerm, mode: 'insensitive' } } }
                ];
            }
            const consumptionApprovals = await prisma.consumptionScrapApproval.findMany({
                where,
                include: { requestedBy: true, consumption: { include: { item: true, plant: true } } }
            });
            allRequests.push(...consumptionApprovals.map(r => ({ ...r, type: 'Consumption', currentScrapQty: 0 })));
        }
        
        // 3. Sort all requests by date
        allRequests.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        // Final filter for 'type' if searched
        const finalRequests = lowerSearchTerm === 'inventory' || lowerSearchTerm === 'consumption'
            ? allRequests.filter(r => r.type.toLowerCase().includes(lowerSearchTerm))
            : allRequests;

        res.render('approvals/scrap', {
            title: 'Scrap Approval Requests',
            layout: 'layouts/approvals',
            requests: finalRequests,
            scrapRequestCount: finalRequests.length,
            searchTerm
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
    const { id } = req.params;
    const { action } = req.body;
    const { user: approver } = req.session;

    if (!['approve', 'reject'].includes(action)) {
        req.session.flash = { type: 'error', message: 'Invalid action.' };
        return res.redirect('/approvals/scrap');
    }

    try {
        let emailPayload = { requestor: null, itemCode: null, approvalRecord: null };

        await prisma.$transaction(async (tx) => {
            const approvalRequest = await tx.scrapApproval.findUnique({
                where: { id },
                include: { inventory: { include: { item: true } }, requestedBy: true }
            });

            if (!approvalRequest || approvalRequest.status !== 'PENDING') {
                throw new Error('Approval request not found or already processed.');
            }
            
            emailPayload = {
                requestor: approvalRequest.requestedBy,
                itemCode: approvalRequest.inventory.item.item_code,
                approvalRecord: approvalRequest
            };

            if (action === 'approve') {
                const inventory = approvalRequest.inventory;
                const requestedScrapQty = BigInt(approvalRequest.requestedQty);

                // THE FIX: Update the inventory log to reflect the approved scrap
                await tx.inventory.update({
                    where: { id: approvalRequest.inventoryId },
                    data: {
                        scrappedQty: requestedScrapQty,
                        // Recalculate the total for the log entry
                        total: BigInt(inventory.newQty) + BigInt(inventory.oldUsedQty) + requestedScrapQty
                    }
                });

                // NOTE: We DO NOT change CurrentStock here. The usable stock (new + old)
                // was already correct. This approval simply confirms the scrap portion of the delivery.

                await tx.scrapApproval.update({
                    where: { id },
                    data: { status: 'APPROVED', approvedById: approver.id, processedAt: new Date() }
                });

                await logActivity({
                    userId: approver.id, action: 'SCRAP_REQUEST_APPROVE', ipAddress: req.ip,
                    details: { approvalId: id, inventoryId: inventory.id, approvedQty: Number(requestedScrapQty) }
                });
                req.session.flash = { type: 'success', message: 'Scrap request approved.' };

            } else { // Reject logic
                await tx.scrapApproval.update({
                    where: { id },
                    data: { status: 'REJECTED', approvedById: approver.id, processedAt: new Date() }
                });

                await logActivity({
                    userId: approver.id,
                    action: 'SCRAP_REQUEST_REJECT',
                    ipAddress: req.ip,
                    details: { approvalId: id, inventoryId: approvalRequest.inventoryId }
                });
                req.session.flash = { type: 'info', message: 'Scrap request rejected.' };
            }
        });

        if (emailPayload.requestor) {
            if (action === 'approve') {
                sendApprovalConfirmationEmail(emailPayload.requestor, emailPayload.approvalRecord, emailPayload.itemCode).catch(console.error);
            } else {
                sendRejectionEmail(emailPayload.requestor, emailPayload.approvalRecord, emailPayload.itemCode).catch(console.error);
            }
        }
        res.redirect('/approvals/scrap');

    } catch(error) {
        console.error("Failed to process scrap request:", error);
        req.session.flash = { type: 'error', message: `Failed to process request: ${error.message}` };
        res.redirect('/approvals/scrap');
    }
};

exports.processConsumptionScrapRequest = async (req, res, next) => {
    const { id } = req.params;
    const { action } = req.body;
    const { user: approver } = req.session;

    if (!['approve', 'reject'].includes(action)) {
        req.session.flash = { type: 'error', message: 'Invalid action.' };
        return res.redirect('/approvals/scrap');
    }

    try {
        let emailPayload = null;

        await prisma.$transaction(async (tx) => {
            const approvalRequest = await tx.consumptionScrapApproval.findUnique({
                where: { id },
                include: {
                    requestedBy: true,
                    consumption: { include: { item: true, plant: true } }
                }
            });

            if (!approvalRequest || approvalRequest.status !== 'PENDING') {
                throw new Error('Approval request not found or already processed.');
            }

            emailPayload = {
                requestor: approvalRequest.requestedBy,
                itemCode: approvalRequest.consumption.item.item_code,
                approvalRecord: approvalRequest
            };

            const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
            
            await tx.consumptionScrapApproval.update({
                where: { id },
                data: {
                    status: newStatus,
                    approvedById: approver.id,
                    processedAt: new Date()
                }
            });

            if (action === 'approve') {
                await tx.inventory.create({
                    data: {
                        reservationNumber: `SCRAP-FROM-CONS-${approvalRequest.consumption.id.substring(0, 8)}`,
                        date: new Date(),
                        plantId: approvalRequest.consumption.plantId,
                        itemId: approvalRequest.consumption.itemId,
                        newQty: 0,
                        oldUsedQty: 0,
                        scrappedQty: approvalRequest.requestedQty,
                        total: approvalRequest.requestedQty,
                        remarks: `Scrap approved from consumption record. Original remarks: ${approvalRequest.remarks || ''}`,
                        createdBy: approver.id,
                    }
                });
                req.session.flash = { type: 'success', message: 'Request has been APPROVED.' };
            } else { // action === 'reject'
                await tx.currentStock.upsert({
                    where: {
                        plantId_itemId: {
                            plantId: approvalRequest.consumption.plantId,
                            itemId: approvalRequest.consumption.itemId,
                        }
                    },
                    update: {
                        oldUsedQty: { increment: approvalRequest.requestedQty }
                    },
                    create: {
                        plantId: approvalRequest.consumption.plantId,
                        itemId: approvalRequest.consumption.itemId,
                        oldUsedQty: approvalRequest.requestedQty
                    }
                });
                req.session.flash = { type: 'info', message: 'Request has been REJECTED and item returned to stock.' };
            }

            await logActivity({
                userId: approver.id,
                action: newStatus === 'APPROVED' ? 'SCRAP_REQUEST_APPROVE' : 'SCRAP_REQUEST_REJECT',
                ipAddress: req.ip,
                details: { approvalId: id, consumptionId: approvalRequest.consumptionId, quantity: approvalRequest.requestedQty }
            });
        });

        if (emailPayload.requestor) {
            if (action === 'approve') {
                sendApprovalConfirmationEmail(emailPayload.requestor, emailPayload.approvalRecord, emailPayload.itemCode).catch(console.error);
            } else {
                sendRejectionEmail(emailPayload.requestor, emailPayload.approvalRecord, emailPayload.itemCode).catch(console.error);
            }
        }
        res.redirect('/approvals/scrap');

    } catch (error) {
        console.error("Failed to process consumption scrap request:", error);
        req.session.flash = { type: 'error', message: `Failed to process request: ${error.message}` };
        res.redirect('/approvals/scrap');
    }
};

/**
 * @desc    List all users pending approval and data needed for approval (plants, roles).
 */
exports.listUserApprovals = async (req, res, next) => {
    try {
        const searchTerm = req.query.search || '';

        const whereClause = {
            status: 'PENDING_APPROVAL',
            isDeleted: false
        };

        if (searchTerm) {
            whereClause.OR = [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { email: { contains: searchTerm, mode: 'insensitive' } }
            ];
        }

        const [pendingUsers, plants, clusters, scrapRequestCount] = await Promise.all([
            prisma.user.findMany({
                where: whereClause,
                orderBy: { createdAt: 'asc' }
            }),
            prisma.plant.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }),
            prisma.cluster.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' } }),
            prisma.scrapApproval.count({ where: { status: 'PENDING' } })
        ]);

        const assignableRoles = ['USER', 'VIEWER', 'CLUSTER_MANAGER'];
        
        res.render('approvals/users', {
            title: 'New User Approvals',
            layout: 'layouts/approvals',
            requests: pendingUsers,
            plants,
            clusters,
            assignableRoles,
            scrapRequestCount,
            userRequestCount: pendingUsers.length,
            searchTerm // Search term ko view mein pass karein
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Process a new user approval request (Approve or Reject)
 */
exports.processUserRequest = async (req, res, next) => {
    const { id } = req.params; // User ID
    // NAYA: Form se 'clusterId' bhi aa sakta hai
    const { action, plantId, role, clusterId } = req.body;

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
            // NAYI VALIDATION: Role ke hisaab se check karein
            if (role === 'CLUSTER_MANAGER' && !clusterId) {
                req.session.flash = { type: 'error', message: 'You must assign a cluster to approve a Cluster Manager.' };
                return res.redirect('/approvals/users');
            }
            if ((role === 'USER' || role === 'VIEWER') && !plantId) {
                req.session.flash = { type: 'error', message: 'You must assign a plant to approve a User or Viewer.' };
                return res.redirect('/approvals/users');
            }

            let dataToUpdate = {
                status: 'ACTIVE',
                role: role,
                updatedBy: req.session.user.id
            };

            // NAYA LOGIC: Role ke hisaab se data update karein
            if (role === 'CLUSTER_MANAGER') {
                dataToUpdate.clusterId = clusterId;
                // Note: Hum manager ke liye plantId null kar sakte hain ya wahi rehne de sakte hain.
                // Abhi ke liye hum use wahi rehne dete hain jo register karte samay select hua tha.
            } else {
                const plant = await prisma.plant.findUnique({ where: { id: plantId } });
                if (!plant) throw new Error('Selected plant not found.');
                dataToUpdate.plantId = plantId;
                dataToUpdate.clusterId = plant.clusterId; // Cluster ID plant se aayega
            }

            await prisma.user.update({
                where: { id },
                data: dataToUpdate
            });
            req.session.flash = { type: 'success', message: `User ${userToProcess.name} has been approved and activated.` };
        
        } else { // action === 'reject'
            await prisma.user.update({
                where: { id },
                data: { isDeleted: true, status: 'INACTIVE', updatedBy: req.session.user.id }
            });
            req.session.flash = { type: 'info', message: `User registration for ${userToProcess.name} has been rejected.` };
        }
        
        res.redirect('/approvals/users');

    } catch(error) {
        console.error("Failed to process user request:", error);
        req.session.flash = { type: 'error', message: `Failed to process request: ${error.message}` };
        res.redirect('/approvals/users');
    }
};