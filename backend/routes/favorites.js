const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get user favorites
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const query = `
            SELECT p.*, f.created_at as favorited_at
            FROM favorites f
            JOIN products p ON f.product_id = p.product_id
            WHERE f.user_id = ? AND p.is_active = 1
            ORDER BY f.created_at DESC
        `;
        const [rows] = await db.query(query, [userId]);

        // Also get IDs for quick lookup
        const ids = rows.map(r => r.product_id);

        res.json({ success: true, favorites: rows, ids });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Add favorite
router.post('/', async (req, res) => {
    try {
        const { user_id, product_id } = req.body;

        // Check if already favorited
        const [exists] = await db.query('SELECT * FROM favorites WHERE user_id = ? AND product_id = ?', [user_id, product_id]);
        if (exists.length > 0) {
            return res.json({ success: true, message: 'Already favorited' });
        }

        await db.query('INSERT INTO favorites (user_id, product_id) VALUES (?, ?)', [user_id, product_id]);
        res.json({ success: true, message: 'Added to favorites' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Remove favorite
router.delete('/:userId/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        await db.query('DELETE FROM favorites WHERE user_id = ? AND product_id = ?', [userId, productId]);
        res.json({ success: true, message: 'Removed from favorites' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
