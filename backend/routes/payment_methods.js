const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all payment methods for a user
router.get('/user/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [req.params.userId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Payment Methods Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// POST — add a new payment method
router.post('/', async (req, res) => {
    const { user_id, type, label, account_name, account_number, is_default } = req.body;

    if (!user_id || !type || !label) {
        return res.status(400).json({ success: false, message: 'user_id, type, and label are required' });
    }

    try {
        if (is_default) {
            await db.query('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [user_id]);
        }

        const [existing] = await db.query('SELECT COUNT(*) as count FROM payment_methods WHERE user_id = ?', [user_id]);
        const makeDefault = is_default || existing[0].count === 0 ? 1 : 0;

        const [result] = await db.query(
            'INSERT INTO payment_methods (user_id, type, label, account_name, account_number, is_default) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, type, label, account_name || null, account_number || null, makeDefault]
        );

        res.status(201).json({ success: true, id: result.insertId, message: 'Payment method added' });
    } catch (error) {
        console.error('Add Payment Method Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT — update a payment method
router.put('/:id', async (req, res) => {
    const { label, account_name, account_number } = req.body;
    try {
        await db.query(
            'UPDATE payment_methods SET label = ?, account_name = ?, account_number = ? WHERE id = ?',
            [label, account_name || null, account_number || null, req.params.id]
        );
        res.json({ success: true, message: 'Payment method updated' });
    } catch (error) {
        console.error('Update Payment Method Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// DELETE a payment method
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM payment_methods WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Payment method deleted' });
    } catch (error) {
        console.error('Delete Payment Method Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT — set as default
router.put('/:id/default', async (req, res) => {
    const { user_id } = req.body;
    try {
        await db.query('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [user_id]);
        await db.query('UPDATE payment_methods SET is_default = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Default payment method updated' });
    } catch (error) {
        console.error('Set Default Payment Method Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
