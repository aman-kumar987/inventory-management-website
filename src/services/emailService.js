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
 * @desc    Sends a scrap approval notification email to a manager.
 * @param {object} approver - The user object of the approver (Cluster Manager).
 * @param {object} requester - The user object of the person who requested.
 * @param {object} inventory - The inventory record related to the request.
 */
exports.sendScrapRequestEmail = async (approver, requester, inventory) => {
    const approvalUrl = `${process.env.BASE_URL}/approvals/scrap`;

    const mailOptions = {
        from: `"Inventory App" <no-reply@inventory.com>`,
        to: approver.email,
        subject: 'New Scrap Request for Approval',
        html: `
             <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Scrap Approval Required</h2>
                <p>Hello ${approver.name},</p>
                <p>A new scrap request has been submitted by <strong>${requester.name}</strong> and requires your approval.</p>
                <h3>Details:</h3>
                <ul>
                    <li><strong>Item:</strong> ${inventory.item.item_code}</li>
                    <li><strong>Plant:</strong> ${inventory.plant.name}</li>
                    <li><strong>Reservation No:</strong> ${inventory.reservationNumber}</li>
                </ul>
                <p style="margin: 25px 0;">
                    <a href="${approvalUrl}" style="background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">
                        View Pending Approvals
                    </a>
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Scrap approval email sent to manager: ${approver.email}`);
    } catch (error) {
        console.error('Error sending scrap approval email:', error);
    }
};

