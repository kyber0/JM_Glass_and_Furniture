const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// helper — silently delete a file if it exists on disk
const unlinkFile = (filePath) => {
    if (!filePath) return;
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore — file may already be gone */ }
};


// Multer Storage config for Profile Pictures
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/profiles/'),
    filename: (req, file, cb) => cb(null, 'profile-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Register
router.post('/register', async (req, res) => {
    const { email, password, full_name, phone, address, referred_by_code } = req.body;

    try {

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Call Stored Procedure
        const [result] = await db.query(
            'CALL sp_register_user(?, ?, ?, ?, ?)',
            [email, hashedPassword, full_name, phone, address]
        );

        const userId = result[0][0].new_user_id;

        // Generate unique referral code
        const referralCode = `JM-${userId.toString(36).toUpperCase().padStart(5, '0')}`;
        await db.query(
            'UPDATE users SET referral_code = ?, referred_by_code = ? WHERE user_id = ?',
            [referralCode, referred_by_code || null, userId]
        );

        // Create Token
        const token = jwt.sign({ id: userId, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            token,
            user: { id: userId, email, full_name, role: 'customer', profile_image: null, referral_code: referralCode }
        });
    } catch (error) {
        if (error.sqlState === '45000') {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        console.error('Register Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.user_id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                phone: user.phone,
                address: user.address,
                profile_image: user.profile_image
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Guest Login
router.post('/guest', async (req, res) => {
    try {
        // Generate a valid JWT for a "guest" user with ID 0
        const token = jwt.sign({ id: 0, role: 'guest' }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                id: 0,
                email: 'guest@jmglass.com',
                full_name: 'Guest User',
                role: 'guest',
                phone: null,
                address: null,
                profile_image: null
            }
        });
    } catch (error) {
        console.error('Guest Login Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Update Profile
router.put('/profile', upload.single('profile_image'), async (req, res) => {
    const { user_id, full_name, phone, address } = req.body;

    try {
        // Build dynamic update — only update fields that are provided
        const fields = [];
        const values = [];
        if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
        if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
        if (address !== undefined) { fields.push('address = ?'); values.push(address); }

        let oldImagePath = null;
        if (req.file) {
            // Grab old image path before overwriting it
            const [existing] = await db.query('SELECT profile_image FROM users WHERE user_id = ?', [user_id]);
            if (existing.length > 0) oldImagePath = existing[0].profile_image;

            const imagePath = `uploads/profiles/${req.file.filename}`;
            fields.push('profile_image = ?');
            values.push(imagePath);
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        values.push(user_id);
        await db.query(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, values);

        // Delete old profile image from disk (only if a new one was uploaded)
        if (oldImagePath) unlinkFile(oldImagePath);

        // Fetch updated user data
        const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
        const user = rows[0];

        res.json({
            success: true,
            user: {
                id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                phone: user.phone,
                address: user.address,
                profile_image: user.profile_image
            }
        });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Change Password
router.put('/change-password', async (req, res) => {
    const { user_id, current_password, new_password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [user_id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(new_password, salt);
        await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [newHash, user_id]);

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
