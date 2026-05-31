const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');

// ── POST /api/disputes ────────────────────────────────────────────────────────
// Buyer files a dispute for a completed order
router.post('/', async (req, res) => {
    const { order_id, user_id, reason, description } = req.body;

    if (!order_id || !user_id || !reason) {
        return res.status(400).json({ success: false, message: 'order_id, user_id, and reason are required.' });
    }

    try {
        // 1. Validate the order belongs to this user and is completed
        const [[order]] = await db.query(
            `SELECT order_id, user_id, status, total_amount FROM orders WHERE order_id = ? AND user_id = ?`,
            [order_id, user_id]
        );

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        if (order.status !== 'completed') {
            return res.status(400).json({ success: false, message: 'Only completed orders can be disputed.' });
        }

        // 2. Check for existing open dispute
        const [[existing]] = await db.query(
            `SELECT dispute_id FROM disputes WHERE order_id = ? AND status = 'pending'`,
            [order_id]
        );
        if (existing) {
            return res.status(409).json({ success: false, message: 'A dispute for this order is already open.' });
        }

        // 3. Insert dispute
        const [result] = await db.query(
            `INSERT INTO disputes (order_id, buyer_id, reason, description, status) VALUES (?, ?, ?, ?, 'pending')`,
            [order_id, user_id, reason, description || null]
        );

        // 4. Notify admins
        const [admins] = await db.query(`SELECT user_id FROM users WHERE role = 'admin'`);
        for (const admin of admins) {
            await createNotification(
                db, admin.user_id, 'dispute',
                '⚠️ New Order Dispute Filed',
                `A buyer has filed a dispute for Order #JM-${order_id}. Reason: ${reason}`,
                result.insertId
            );
        }

        // 5. Notify buyer of receipt
        await createNotification(
            db, user_id, 'dispute',
            '📋 Dispute Submitted',
            `Your dispute for Order #JM-${order_id} has been received. Our team will review it shortly.`,
            result.insertId
        );

        res.status(201).json({
            success: true,
            message: 'Dispute filed successfully. Our team will review it shortly.',
            dispute_id: result.insertId,
        });

    } catch (err) {
        console.error('File dispute error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// ── GET /api/disputes?user_id=X ───────────────────────────────────────────────
// Buyer views their own disputes
router.get('/', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required' });

    try {
        const [rows] = await db.query(
            `SELECT d.dispute_id, d.order_id, d.reason, d.description,
                    d.status, d.resolution_notes, d.created_at, d.resolved_at,
                    o.total_amount
             FROM disputes d
             JOIN orders o ON d.order_id = o.order_id
             WHERE d.buyer_id = ?
             ORDER BY d.created_at DESC`,
            [user_id]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Get disputes error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
