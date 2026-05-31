const express = require('express');
const router = express.Router();
const db = require('../config/db');

const EARN_RATE = 100;   // ₱100 spent = 1 point
const REDEEM_RATE = 100;  // 100 pts = ₱10 discount
const MIN_REDEEM = 100;  // minimum points to redeem
const MAX_REDEEM_PCT = 0.5; // max 50% of subtotal

// Helper — ensure user_points row exists
async function ensurePointsRow(conn, userId) {
    await conn.query(
        'INSERT IGNORE INTO user_points (user_id, balance, lifetime) VALUES (?, 0, 0)',
        [userId]
    );
}

// GET /api/points/:userId — balance + recent transactions
router.get('/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        await ensurePointsRow(db, userId);
        const [[row]] = await db.query(
            'SELECT balance, lifetime FROM user_points WHERE user_id = ?', [userId]
        );
        const [transactions] = await db.query(
            `SELECT txn_id, order_id, type, points, note, created_at
             FROM points_transactions
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 30`,
            [userId]
        );
        res.json({
            success: true,
            balance: row?.balance || 0,
            lifetime: row?.lifetime || 0,
            earn_rate: EARN_RATE,
            redeem_rate: REDEEM_RATE,
            min_redeem: MIN_REDEEM,
            transactions
        });
    } catch (err) {
        console.error('Points GET error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/points/:userId/preview — validate & preview a redemption
router.post('/:userId/preview', async (req, res) => {
    const { userId } = req.params;
    const { points_to_redeem, subtotal } = req.body;

    if (!points_to_redeem || !subtotal) {
        return res.status(400).json({ success: false, message: 'points_to_redeem and subtotal required' });
    }

    try {
        const [[row]] = await db.query(
            'SELECT balance FROM user_points WHERE user_id = ?', [userId]
        );
        const balance = row?.balance || 0;

        if (points_to_redeem < MIN_REDEEM) {
            return res.status(400).json({ success: false, message: `Minimum ${MIN_REDEEM} points required` });
        }
        if (points_to_redeem > balance) {
            return res.status(400).json({ success: false, message: 'Not enough points' });
        }

        const PESO_PER_POINT = 10 / REDEEM_RATE;          // e.g. 100pts = ₱10 → 0.10 ₱/pt
        const maxDiscount = subtotal * MAX_REDEEM_PCT;
        const requestedDiscount = points_to_redeem * PESO_PER_POINT;
        const appliedDiscount = Math.min(requestedDiscount, maxDiscount);
        const appliedPoints = Math.floor(appliedDiscount / PESO_PER_POINT);

        res.json({
            success: true,
            balance,
            points_applied: appliedPoints,
            discount_amount: appliedDiscount,
            note: appliedPoints < points_to_redeem
                ? `Capped at 50% of order subtotal (₱${appliedDiscount.toFixed(2)} off)`
                : null
        });
    } catch (err) {
        console.error('Points preview error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
module.exports.ensurePointsRow = ensurePointsRow;
module.exports.EARN_RATE = EARN_RATE;
module.exports.REDEEM_RATE = REDEEM_RATE;
module.exports.MIN_REDEEM = MIN_REDEEM;
module.exports.MAX_REDEEM_PCT = MAX_REDEEM_PCT;
