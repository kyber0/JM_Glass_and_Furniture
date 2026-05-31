const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');
const { recalcEDDForShop } = require('../helpers/edd');




// GET /api/handymen/shop/:shopId - List all handymen with active order count
router.get('/shop/:shopId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                h.*,
                COUNT(o.order_id) AS active_order_count
            FROM handymen h
            LEFT JOIN order_handymen oh ON oh.handyman_id = h.handyman_id
            LEFT JOIN orders o
                ON o.order_id = oh.order_id
                AND o.status NOT IN ('delivered', 'cancelled', 'completed')
            WHERE h.shop_id = ?
            GROUP BY h.handyman_id
            ORDER BY h.name ASC
        `, [req.params.shopId]);
        res.json({ success: true, handymen: rows });
    } catch (error) {
        console.error('Get Handymen Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/handymen/tasks/:shopId - List active tasks for all handymen in a shop
router.get('/tasks/:shopId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT v.*
            FROM vw_active_handyman_tasks v
            JOIN handymen h ON v.handyman_id = h.handyman_id
            WHERE h.shop_id = ?
            ORDER BY v.created_at DESC`,
            [req.params.shopId]
        );
        res.json({ success: true, tasks: rows });
    } catch (error) {
        console.error('Get Handyman Tasks Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/handymen/:id/orders - Get orders assigned to a specific handyman
router.get('/:id/orders', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                o.order_id,
                o.status,
                o.total_amount,
                o.created_at,
                u.full_name AS buyer_name,
                u.email AS buyer_email
            FROM orders o
            JOIN order_handymen oh ON oh.order_id = o.order_id AND oh.handyman_id = ?
            JOIN users u ON o.user_id = u.user_id
            WHERE o.status NOT IN ('delivered', 'cancelled', 'completed')
            ORDER BY o.created_at DESC
        `, [req.params.id]);
        res.json({ success: true, orders: rows });
    } catch (error) {
        console.error('Get Handyman Orders Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// POST /api/handymen - Add a new handyman
router.post('/', async (req, res) => {
    const { shop_id, name, phone } = req.body;
    if (!shop_id || !name) {
        return res.status(400).json({ success: false, message: 'shop_id and name are required' });
    }
    try {
        const [result] = await db.query(
            'INSERT INTO handymen (shop_id, name, phone, status) VALUES (?, ?, ?, ?)',
            [shop_id, name, phone || null, 'available']
        );
        res.status(201).json({ success: true, handyman_id: result.insertId, message: 'Handyman added' });
    } catch (error) {
        console.error('Add Handyman Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT /api/handymen/:id - Update a handyman (name, phone, status)
router.put('/:id', async (req, res) => {
    const { name, phone, status } = req.body;
    try {
        await db.query(
            `UPDATE handymen
             SET name = COALESCE(?, name),
                 phone = COALESCE(?, phone),
                 status = COALESCE(?, status)
             WHERE handyman_id = ?`,
            [name, phone, status, req.params.id]
        );
        res.json({ success: true, message: 'Handyman updated' });
    } catch (error) {
        console.error('Update Handyman Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// DELETE /api/handymen/:id - Remove a handyman
router.delete('/:id', async (req, res) => {
    try {
        // Remove handyman assignments from junction table (4NF — no direct FK on orders)
        await db.query('DELETE FROM order_handymen WHERE handyman_id = ?', [req.params.id]);
        await db.query('DELETE FROM handymen WHERE handyman_id = ?', [req.params.id]);
        res.json({ success: true, message: 'Handyman removed' });
    } catch (error) {
        console.error('Delete Handyman Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Handyman self-service: Get my tasks ───────────────────────────────────────
// GET /api/handymen/my-tasks?userId=<userId>
router.get('/my-tasks', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    try {
        // Find handyman record linked to this user
        const [[hm]] = await db.query('SELECT handyman_id FROM handymen WHERE user_id = ?', [userId]);
        if (!hm) return res.status(404).json({ success: false, message: 'No handyman record linked to this account' });

        const [tasks] = await db.query(
            `SELECT
                o.order_id, o.status, o.total_amount, o.delivery_fee,
                o.discount_amount, o.payment_method, o.processed_at,
                o.shipped_at, o.delivered_at, o.completed_at,
                o.shipping_address, o.created_at, o.updated_at,
                u.full_name AS buyer_name, u.phone AS buyer_phone,
                GROUP_CONCAT(p.title SEPARATOR ', ') AS item_titles
             FROM order_handymen oh
             JOIN orders o ON oh.order_id = o.order_id
             JOIN users u ON o.user_id = u.user_id
             JOIN order_items oi ON oi.order_id = o.order_id
             JOIN products p ON oi.product_id = p.product_id
             WHERE oh.handyman_id = ?
               AND o.status NOT IN ('cancelled', 'delivered', 'completed')
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [hm.handyman_id]
        );

        if (tasks.length > 0) {
            const orderIds = tasks.map(t => t.order_id);
            const [allItems] = await db.query(
                `SELECT oi.order_id, oi.item_id, oi.product_id, oi.quantity,
                        oi.price_at_purchase, oi.base_price, oi.installation_fee,
                        p.title, 'installation' AS service_type
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.product_id
                 WHERE oi.order_id IN (?)`,
                [orderIds]
            );
            tasks.forEach(t => {
                t.items = allItems.filter(i => i.order_id === t.order_id);
            });
        }
        res.json({ success: true, handyman_id: hm.handyman_id, tasks });
    } catch (e) {
        console.error('[handymen] my-tasks error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Handyman self-service: Update my status ───────────────────────────────────
// PUT /api/handymen/my-status  { userId, status: 'available'|'busy'|'off' }
router.put('/my-status', async (req, res) => {
    const { userId, status } = req.body;
    const allowed = ['available', 'busy', 'off'];
    if (!userId || !allowed.includes(status)) {
        return res.status(400).json({ success: false, message: 'userId and valid status are required' });
    }
    try {
        const [[hm]] = await db.query(
            'SELECT handyman_id, shop_id FROM handymen WHERE user_id = ?', [userId]
        );
        if (!hm) return res.status(404).json({ success: false, message: 'Handyman not found' });
        await db.query('UPDATE handymen SET status = ? WHERE handyman_id = ?', [status, hm.handyman_id]);

        // Recalculate EDD for active orders in this shop when going off/busy
        if (status === 'off' || status === 'busy') {
            try {
                const extended = await recalcEDDForShop(db, hm.shop_id);
                for (const ord of extended) {
                    // Notify buyer that their order EDD was extended
                    const [[orderRow]] = await db.query(
                        'SELECT user_id FROM orders WHERE order_id = ?', [ord.order_id]
                    );
                    if (orderRow) {
                        const newDate = new Date(ord.new_edd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                        await createNotification(
                            db, orderRow.user_id, 'order_update',
                            '🚚 Delivery Estimate Updated',
                            `Your order #JM-${ord.order_id} delivery has been rescheduled to ${newDate} due to worker availability.`,
                            ord.order_id
                        ).catch(() => {});
                    }
                }
            } catch (eddErr) {
                console.warn('[handymen] EDD recalc error (non-fatal):', eddErr.message);
            }
        }

        res.json({ success: true, message: `Status updated to ${status}` });
    } catch (e) {
        console.error('[handymen] my-status error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


module.exports = router;

