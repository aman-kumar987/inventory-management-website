const transporter = require('../config/mailer'); 

/**
 * @desc    Sends a password reset email to a user.
 * @param {string} userEmail - The recipient's email address.
 * @param {string} resetToken - The non-hashed reset token.
 */
exports.sendPasswordResetEmail = async (userEmail, resetToken) => {
    const resetUrl = `${process.env.BASE_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
        from: `"Inventory App" <no-reply@inventory.com>`,
        to: userEmail,
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Password Reset Request</h2>
                <p>You requested a password reset for your Inventory App account.</p>
                <p>Please click the link below to set a new password. This link will expire in 1 hour.</p>
                <p style="margin: 25px 0;">
                    <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">
                        Reset Your Password
                    </a>
                </p>
                <p>If you did not request this, please ignore this email.</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Password reset email sent to:', userEmail);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        // We re-throw the error so the controller that called this function can handle it.
        throw new Error('Could not send password reset email.');
    }
};

/**
 * @desc    Sends a detailed scrap approval notification to a manager.
 */
exports.sendScrapRequestEmail = async (approver, requester, details) => {
    const approvalUrl = `${process.env.BASE_URL}/approvals/scrap`;
    const mailOptions = {
        from: `"Inventory App" <no-reply@inventory.com>`,
        to: approver.email,
        subject: `New Scrap Request for ${details.item.item_code}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px; max-width: 600px; margin: auto;">
                <h2 style="color: #4f46e5; border-bottom: 2px solid #ddd; padding-bottom: 10px;">Scrap Approval Required</h2>
                <p>Hello ${approver.name},</p>
                <p>A new scrap request has been submitted by <strong>${requester.name}</strong> and requires your approval.</p>
                <h3 style="color: #333;">Details:</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Item Code:</strong></td><td style="padding: 8px;">${details.item.item_code}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Description:</strong></td><td style="padding: 8px;">${details.item.item_description}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Plant:</strong></td><td style="padding: 8px;">${details.plant.name}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Requested Qty:</strong></td><td style="padding: 8px; font-weight: bold; color: #c00;">${details.requestedQty}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Remarks:</strong></td><td style="padding: 8px;">${details.remarks || 'N/A'}</td></tr>
                </table>
                <p style="text-align: center; margin: 25px 0;">
                    <a href="${approvalUrl}" style="background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">View Pending Approvals</a>
                </p>
            </div>
        `,
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending scrap approval email:', error);
    }
};

/**
 * @desc    Sends an email to the requester about their approved request.
 */
exports.sendApprovalConfirmationEmail = async (requestor, approval, itemCode, approverName) => {
    const mailOptions = {
        from: `"Inventory App" <no-reply@inventory.com>`,
        to: requestor.email,
        subject: `✅ Approved: Your Scrap Request for ${itemCode}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px; max-width: 600px; margin: auto;">
                <h2 style="color: #16a34a; border-bottom: 2px solid #ddd; padding-bottom: 10px;">Request Approved</h2>
                <p>Hello ${requestor.name},</p>
                <p>Good news! Your scrap request has been approved.</p>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Item Code:</strong></td><td style="padding: 8px;">${itemCode}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Approved Qty:</strong></td><td style="padding: 8px; font-weight: bold;">${approval.requestedQty}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Approved By:</strong></td><td style="padding: 8px;">${approverName}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Date Processed:</strong></td><td style="padding: 8px;">${new Date(approval.processedAt).toLocaleString('en-IN')}</td></tr>
                </table>
                <p>Thank you.</p>
            </div>
        `,
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending approval confirmation email:', error);
    }
};

/**
 * @desc    Sends an email to the requester about their rejected request.
 */
exports.sendRejectionEmail = async (requestor, approval, itemCode, approverName) => {
    const mailOptions = {
        from: `"Inventory App" <no-reply@inventory.com>`,
        to: requestor.email,
        subject: `❌ Rejected: Your Scrap Request for ${itemCode}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px; max-width: 600px; margin: auto;">
                <h2 style="color: #dc2626; border-bottom: 2px solid #ddd; padding-bottom: 10px;">Request Rejected</h2>
                <p>Hello ${requestor.name},</p>
                <p>Unfortunately, your scrap request has been rejected.</p>
                 <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Item Code:</strong></td><td style="padding: 8px;">${itemCode}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Requested Qty:</strong></td><td style="padding: 8px; font-weight: bold;">${approval.requestedQty}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Rejected By:</strong></td><td style="padding: 8px;">${approverName}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #555;"><strong>Date Processed:</strong></td><td style="padding: 8px;">${new Date(approval.processedAt).toLocaleString('en-IN')}</td></tr>
                </table>
                <p>If you have any questions, please contact your manager.</p>
            </div>
        `,
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending rejection email:', error);
    }
};