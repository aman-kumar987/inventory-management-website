// Mailer configuration placeholder
const nodemailer = require('nodemailer');

// Create a reusable transporter object using the credentials from .env
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '587'), // Use a default port if not specified
    // secure: process.env.MAIL_SECURE === 'true', // Use 'true' for port 465, false for others
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
    // Optional: Add tls config if needed for providers like Office365
    // tls: {
    //     ciphers: 'SSLv3'
    // }
});

// Verify the connection configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('Mailer Configuration Error:', error);
    } else {
        console.log('Mail server is ready to take our messages');
    }
});

module.exports = transporter;


// const nodemailer = require('nodemailer');

// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: parseInt(process.env.SMTP_PORT, 10),
//     secure: parseInt(process.env.SMTP_PORT, 10) === 465, // true for 465, false for other ports like 587
//     auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.SMTP_PASS,
//     },
//     tls: {
//         ciphers:'SSLv3'
//     }
// });

// transporter.verify((error, success) => {
//     if (error) {
//         console.error('Mail server configuration error:', error);
//     } else {
//         console.log('Mail server is ready to take our messages');
//     }
// });

// module.exports = transporter;