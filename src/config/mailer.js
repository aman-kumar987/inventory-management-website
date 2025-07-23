const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: parseInt(process.env.SMTP_PORT, 10) === 465, // true for 465, false for other ports like 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        ciphers:'SSLv3'
    }
});

// THE FIX: Only try to verify the connection if credentials are provided
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter.verify((error, success) => {
        if (error) {
            console.error('Mail server configuration error:', error);
        } else {
            console.log('Mail server is ready to take our messages');
        }
    });
} else {
    console.warn('⚠️  Email service is not configured. Emails will be skipped. Please set SMTP variables in .env file.');
}

module.exports = transporter;