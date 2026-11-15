require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path'); // 👈 ADD THIS LINE

const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 1. MIDDLEWARE & STATIC FILES
// ==========================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net"], // Allow SweetAlert2 CDN
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"], // Allow styles
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https:"],
        },
    },
}));
app.use(cors()); 
app.use(express.json());

// 👇 ADD THESE TWO LINES TO SERVE YOUR FRONTEND 👇
// This tells Express to look in the 'frontend' folder for CSS, JS, and images
app.use(express.static(path.join(__dirname, '../frontend')));

// This serves your index.html when someone visits the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// Rate Limiter: Max 5 requests per 15 minutes per IP address
const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: { 
        success: false, 
        message: 'Too many messages sent from this IP, please try again later.' 
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ==========================================
// 2. ROUTES
// ==========================================

// Test Route
app.get('/', (req, res) => {
    res.send('Secure Portfolio Backend is Running! ️');
});


// Contact Form Route
app.post('/api/contact', 
    contactLimiter, 
    [
        body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Invalid name.'),
        body('email').trim().isEmail().normalizeEmail().withMessage('Invalid email.'),
        body('message').trim().isLength({ min: 10, max: 2000 }).withMessage('Message too short or long.')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, message: 'Invalid input data.' });
            }

            const { name, email, message } = req.body;

            // 1. SAVE TO SQL DATABASE
            const query = 'INSERT INTO messages (name, email, message) VALUES (?, ?, ?)';
            await db.execute(query, [name, email, message]);

            // 2. SETUP NODemailer TRANSPORTER
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            // 3. EMAIL TO YOU (The Admin)
            const adminMailOptions = {
                from: `"Portfolio Bot" <${process.env.EMAIL_USER}>`,
                to: process.env.EMAIL_USER, // Sends to your own email
                subject: `🔔 New Message from ${name}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f9f9; border-radius: 10px;">
                        <h2 style="color: #023436;">New Contact Form Submission</h2>
                        <p><strong>From:</strong> ${name} (${email})</p>
                        <p><strong>Message:</strong><br/>${message}</p>
                        <hr/>
                        <p style="font-size: 12px; color: #666;">Sent automatically from your Node.js Backend.</p>
                    </div>
                `
            };

            // 4. AUTO-REPLY EMAIL TO THE CLIENT
            const clientMailOptions = {
                from: `"Portfolio Bot" <${process.env.EMAIL_USER}>`,
                to: email, // Sends to the user who filled out the form
                subject: `Thank you for contacting me!`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background: #ffffff; border-left: 5px solid #03B5AA;">
                        <h2 style="color: #023436;">Hi ${name},</h2>
                        <p>Thank you for reaching out through my portfolio! I have successfully received your message.</p>
                        <p>I review my inbox daily and will get back to you within 24 hours.</p>
                        <p>Best regards,<br/><strong>Your Name</strong><br/><em>Full-Stack Developer & Cybersecurity Enthusiast</em></p>
                    </div>
                `
            };

            // 5. SEND THE EMAILS
            await transporter.sendMail(adminMailOptions);
            await transporter.sendMail(clientMailOptions);

            console.log(`✅ Email sent to Admin and Client successfully!`);
            
            res.status(201).json({ 
                success: true, 
                message: 'Message received and email sent!' 
            });

        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, message: 'Server error. Please try again.' });
        }
    }
);

// 1. Admin Login Route
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    // Check credentials against .env
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        // Generate a secure JWT token (expires in 1 hour)
        const token = jwt.sign({ user: username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// 2. Security Middleware (Protects Admin Routes)
const protect = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]; // Gets "Bearer <token>"
    
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded.user;
            next(); // User is verified, proceed
        } catch (error) {
            res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

// 3. Get All Messages (Protected)
app.get('/api/admin/messages', protect, async (req, res) => {
    try {
        // Fetch messages, newest first
        const [rows] = await db.execute('SELECT * FROM messages ORDER BY created_at DESC');
        res.json({ success: true, messages: rows });
    } catch (error) {
        console.error('Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 4. Delete a Message (Protected)
app.delete('/api/admin/messages/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        await db.execute('DELETE FROM messages WHERE id = ?', [id]);
        res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ==========================================
// 3. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Secure Server running on http://localhost:${PORT}`);
});