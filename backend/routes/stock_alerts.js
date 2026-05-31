const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');

// POST /api/stock-alerts — subscribe to in-stock alert
router.post('/', async (req, res) => {
    const { user_id, product_id } = req.body;
    if (!user_id || !product_id) {
        return res.status(400).json({ success: false, message: 'user_id and product_id required' });
    }
    try {
        await db.query(
            'INSERT IGNORE INTO stock_alerts (user_id, product_id) VALUES (?, ?)',
            [user_id, product_id]
        );
        res.json({ success: true, message: 'You\'ll be notified when this item is back in stock!' });
    } catch (err) {
        console.error('Stock alert subscribe error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/stock-alerts — unsubscribe
router.delete('/', async (req, res) => {
    const { user_id, product_id } = req.body;
    try {
        await db.query(
            'DELETE FROM stock_alerts WHERE user_id = ? AND product_id = ?',
            [user_id, product_id]
        );
        res.json({ success: true, message: 'Notification removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/stock-alerts/check — check if user has alert for a product
router.get('/check', async (req, res) => {
    const { user_id, product_id } = req.query;
    try {
        const [[row]] = await db.query(
            'SELECT id FROM stock_alerts WHERE user_id = ? AND product_id = ?',
            [user_id, product_id]
        );
        res.json({ success: true, subscribed: !!row });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;
