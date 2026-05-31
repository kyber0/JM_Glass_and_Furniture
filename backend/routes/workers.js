/**
 * routes/workers.js
 * Seller-facing API to create and manage delivery man / handyman accounts.
 *
 * POST   /api/workers/delivery-man     → Create delivery man account + return credentials
 * POST   /api/workers/handyman/:id/account → Give an existing handyman a login account
 * GET    /api/workers/shop/:shopId     → List all workers (delivery men + handymen) for a shop
 * PUT    /api/workers/delivery-man/:id → Update delivery man profile / status
 * DELETE /api/workers/:userId          → Deactivate a worker account
 */
const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { createNotification } = require('../utils/notifications.helper');
const { recalcEDDForShop } = require('../helpers/edd');


const QR_SECRET = process.env.QR_SECRET || 'jm_qr_confirm_secret_2024';
const QR_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

const signQR = (orderId, exp) =>
    crypto.createHmac('sha256', QR_SECRET).update(`${orderId}:${exp}`).digest('hex');


// ── GET /api/workers/delivery-man/profile?userId=X ────────────────────────────
// Delivery man fetches their own profile (delivery_man_id, status, shop_id)
router.get('/delivery-man/profile', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    try {
        const [[dm]] = await db.query(
            `SELECT dm.delivery_man_id, dm.shop_id, dm.plate_number, dm.status,
                    u.full_name, u.phone
             FROM delivery_men dm
             JOIN users u ON dm.user_id = u.user_id
             WHERE dm.user_id = ?`,
            [userId]
        );
        if (!dm) return res.status(404).json({ success: false, message: 'Delivery man profile not found' });
        res.json({ success: true, delivery_man: dm });
    } catch (e) {
        console.error('[workers] profile error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a readable random password: 2 words + 4 digits  e.g. "swift-hawk-4821" */
const generatePassword = () => {
    const words = ['swift','brave','cool','neat','sharp','quick','bold','calm','firm','wise',
                   'hawk','rock','lion','star','peak','wave','jade','blue','gold','rose'];
    const w1  = words[Math.floor(Math.random() * words.length)];
    const w2  = words[Math.floor(Math.random() * words.length)];
    const num = String(Math.floor(1000 + Math.random() * 9000));
    return `${w1}-${w2}-${num}`;
};

/**
 * Build a gmail address from a full name.
 * "Bryan Fuentiveros" → "bryanfuentiveros@gmail.com"
 * Strips accents, keeps only a-z0-9, lowercases.
 * If the email is already taken, appends a 3-digit suffix: "bryanfuentiveros123@gmail.com"
 */
const generateEmailFromName = async (fullName, conn) => {
    const base = fullName
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');                        // keep only alphanumeric

    const tryEmail = async (candidate) => {
        const [[existing]] = await conn.query('SELECT user_id FROM users WHERE email = ?', [candidate]);
        return existing ? null : candidate;
    };

    // Try exact name first
    const exact = await tryEmail(`${base}@gmail.com`);
    if (exact) return exact;

    // Try with 3-digit suffix until we find a free slot
    for (let i = 0; i < 100; i++) {
        const suffix = String(Math.floor(100 + Math.random() * 900));
        const candidate = await tryEmail(`${base}${suffix}@gmail.com`);
        if (candidate) return candidate;
    }

    // Fallback: timestamp-based to guarantee uniqueness
    return `${base}${Date.now().toString(36)}@gmail.com`;
};

// ── POST /api/workers/delivery-man ─────────────────────────────────────────────
// Seller creates a delivery man account. Returns plaintext credentials for the seller to share.
router.post('/delivery-man', async (req, res) => {
    const { shop_id, full_name, phone, plate_number } = req.body;
    if (!shop_id || !full_name) {
        return res.status(400).json({ success: false, message: 'shop_id and full_name are required' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Verify shop exists
        const [[shop]] = await conn.query('SELECT shop_id FROM shops WHERE shop_id = ?', [shop_id]);
        if (!shop) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const email   = await generateEmailFromName(full_name, conn);
        const tempPwd = generatePassword();
        const pwdHash = await bcrypt.hash(tempPwd, 10);

        // Create user account with delivery_man role
        const [uResult] = await conn.query(
            `INSERT INTO users (email, password_hash, full_name, phone, role, must_change_password)
             VALUES (?, ?, ?, ?, 'delivery_man', 1)`,
            [email, pwdHash, full_name, phone || null]
        );
        const userId = uResult.insertId;

        // Create delivery_men record
        const [dmResult] = await conn.query(
            `INSERT INTO delivery_men (shop_id, user_id, plate_number)
             VALUES (?, ?, ?)`,
            [shop_id, userId, plate_number || null]
        );

        await conn.commit();

        res.status(201).json({
            success:  true,
            message:  'Delivery man account created',
            credentials: {
                username:     email,
                temp_password: tempPwd,
                note: 'Share these with the worker. They will be asked to change their password on first login.'
            },
            delivery_man: {
                delivery_man_id: dmResult.insertId,
                user_id:         userId,
                full_name,
                phone:           phone || null,
                plate_number:    plate_number || null,
                status:          'available',
            }
        });
    } catch (e) {
        await conn.rollback();
        console.error('[workers] Create delivery man error:', e.message);
        res.status(500).json({ success: false, message: 'Failed to create delivery man account' });
    } finally {
        conn.release();
    }
});

// ── POST /api/workers/handyman/:handymanId/account ─────────────────────────────
// Give an existing handyman record a login account.
router.post('/handyman/:handymanId/account', async (req, res) => {
    const { handymanId } = req.params;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [[handyman]] = await conn.query(
            'SELECT h.*, s.shop_id FROM handymen h JOIN shops s ON h.shop_id = s.shop_id WHERE h.handyman_id = ?',
            [handymanId]
        );
        if (!handyman) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Handyman not found' });
        }
        if (handyman.user_id) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'This handyman already has a login account' });
        }

        const email   = await generateEmailFromName(handyman.name, conn);
        const tempPwd = generatePassword();
        const pwdHash = await bcrypt.hash(tempPwd, 10);

        const [uResult] = await conn.query(
            `INSERT INTO users (email, password_hash, full_name, phone, role, must_change_password)
             VALUES (?, ?, ?, ?, 'handyman', 1)`,
            [email, pwdHash, handyman.name, handyman.phone || null]
        );
        const userId = uResult.insertId;

        await conn.query('UPDATE handymen SET user_id = ? WHERE handyman_id = ?', [userId, handymanId]);

        await conn.commit();

        res.status(201).json({
            success: true,
            message: 'Handyman login account created',
            credentials: {
                username:     email,
                temp_password: tempPwd,
                note: 'Share these with the handyman. They will be asked to change their password on first login.'
            }
        });
    } catch (e) {
        await conn.rollback();
        console.error('[workers] Create handyman account error:', e.message);
        res.status(500).json({ success: false, message: 'Failed to create handyman account' });
    } finally {
        conn.release();
    }
});

// ── GET /api/workers/shop/:shopId ──────────────────────────────────────────────
// List all delivery men and handymen for a shop (with login status).
router.get('/shop/:shopId', async (req, res) => {
    try {
        const [deliveryMen] = await db.query(
            `SELECT dm.*, u.full_name, u.phone, u.email AS username, u.is_active
             FROM delivery_men dm
             JOIN users u ON dm.user_id = u.user_id
             WHERE dm.shop_id = ?
             ORDER BY u.full_name ASC`,
            [req.params.shopId]
        );

        const [handymen] = await db.query(
            `SELECT h.*, u.email AS username, u.is_active, u.must_change_password,
                    CASE WHEN h.user_id IS NOT NULL THEN 1 ELSE 0 END AS has_account
             FROM handymen h
             LEFT JOIN users u ON h.user_id = u.user_id
             WHERE h.shop_id = ?
             ORDER BY h.name ASC`,
            [req.params.shopId]
        );

        res.json({ success: true, delivery_men: deliveryMen, handymen });
    } catch (e) {
        console.error('[workers] Get shop workers error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── PUT /api/workers/delivery-man/:id ─────────────────────────────────────────
// Update delivery man status / vehicle info.
router.put('/delivery-man/:id', async (req, res) => {
    const { status, plate_number } = req.body;
    try {
        // Get shop_id before updating (needed for EDD recalc)
        const [[dm]] = await db.query(
            'SELECT shop_id FROM delivery_men WHERE delivery_man_id = ?', [req.params.id]
        );
        await db.query(
            `UPDATE delivery_men
             SET status       = COALESCE(?, status),
                 plate_number = COALESCE(?, plate_number)
             WHERE delivery_man_id = ?`,
            [status, plate_number, req.params.id]
        );

        // Recalculate EDD when going off/busy
        if (dm && (status === 'off' || status === 'busy')) {
            try {
                const extended = await recalcEDDForShop(db, dm.shop_id);
                for (const ord of extended) {
                    const [[orderRow]] = await db.query(
                        'SELECT user_id FROM orders WHERE order_id = ?', [ord.order_id]
                    );
                    if (orderRow) {
                        const newDate = new Date(ord.new_edd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                        await createNotification(
                            db, orderRow.user_id, 'delivery',
                            '🚚 Delivery Estimate Updated',
                            `Your order #JM-${ord.order_id} delivery has been rescheduled to ${newDate} due to worker availability.`,
                            ord.order_id
                        ).catch(() => {});
                    }
                }
            } catch (eddErr) {
                console.warn('[workers] EDD recalc error (non-fatal):', eddErr.message);
            }
        }

        res.json({ success: true, message: 'Updated' });
    } catch (e) {
        console.error('[workers] Update delivery man error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


// ── GET /api/workers/order/:orderId/qr-token ──────────────────────────────────
// Buyer fetches a signed QR payload to show the field worker.
router.get('/order/:orderId/qr-token', async (req, res) => {
    const orderId = parseInt(req.params.orderId, 10);
    try {
        const [[order]] = await db.query(
            'SELECT order_id, status, qr_confirmed_at FROM orders WHERE order_id = ?', [orderId]
        );
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.qr_confirmed_at) {
            return res.status(400).json({ success: false, message: 'Order QR already confirmed.' });
        }
        const exp   = Date.now() + QR_TTL_MS;
        const sig   = signQR(orderId, exp);
        const token = Buffer.from(JSON.stringify({ order_id: orderId, exp })).toString('base64url') + '.' + sig;
        res.json({ success: true, token, order_id: orderId, expires_at: new Date(exp).toISOString() });
    } catch (e) {
        console.error('[workers] QR token error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── POST /api/workers/scan-qr ─────────────────────────────────────────────────
// Worker scans the customer's QR → confirms delivery or payment+completion.
router.post('/scan-qr', async (req, res) => {
    const { token, worker_user_id, action } = req.body; // action kept for compatibility
    if (!token || !worker_user_id) {
        return res.status(400).json({ success: false, message: 'token and worker_user_id are required.' });
    }

    // Decode + verify token
    let payload;
    try {
        const [b64, sig] = token.split('.');
        payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
        const expected = signQR(payload.order_id, payload.exp);
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
            return res.status(401).json({ success: false, message: 'Invalid QR code.' });
        }
        if (Date.now() > payload.exp) {
            return res.status(401).json({ success: false, message: 'QR code has expired. Please refresh it.' });
        }
    } catch (_) {
        return res.status(401).json({ success: false, message: 'Malformed QR token.' });
    }

    const { order_id: orderId } = payload;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Fetch order + check worker is assigned
        const [[order]] = await conn.query(
            `SELECT o.order_id, o.status, o.payment_method, o.qr_confirmed_at,
                    o.user_id AS buyer_id, o.delivery_man_id,
                    oh.handyman_id,
                    dm.user_id AS dm_user_id
             FROM orders o
             LEFT JOIN order_handymen oh ON oh.order_id = o.order_id
             LEFT JOIN delivery_men dm ON dm.delivery_man_id = o.delivery_man_id
             WHERE o.order_id = ?`,
            [orderId]
        );

        if (!order) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Order not found.' }); }
        if (order.qr_confirmed_at) { await conn.rollback(); return res.status(400).json({ success: false, message: 'This QR has already been used.' }); }

        // Determine incharge worker based on item service types:
        // If any item has an installation_fee > 0 → handyman is incharge, otherwise → delivery man.
        const [[{ has_installation }]] = await conn.query(
            `SELECT MAX(installation_fee) > 0 AS has_installation FROM order_items WHERE order_id = ?`,
            [orderId]
        );

        let inchargeUserId;
        if (has_installation) {
            // Handyman is incharge
            const [[handymanRow]] = await conn.query(
                'SELECT h.user_id FROM handymen h JOIN order_handymen oh ON oh.handyman_id = h.handyman_id WHERE oh.order_id = ?',
                [orderId]
            );
            if (!handymanRow) { await conn.rollback(); return res.status(400).json({ success: false, message: 'No handyman assigned for this installation order.' }); }
            inchargeUserId = handymanRow.user_id;
        } else {
            // Delivery man is incharge
            const [[dmRow]] = await conn.query(
                'SELECT u.user_id FROM delivery_men dm JOIN users u ON u.user_id = dm.user_id WHERE dm.delivery_man_id = ?',
                [order.delivery_man_id]
            );
            if (!dmRow) { await conn.rollback(); return res.status(400).json({ success: false, message: 'No delivery man assigned for this order.' }); }
            inchargeUserId = dmRow.user_id;
        }

        if (String(inchargeUserId) !== String(worker_user_id)) {
            await conn.rollback();
            const role = has_installation ? 'handyman' : 'delivery man';
            return res.status(403).json({ success: false, message: `Only the assigned ${role} can scan this order.` });
        }

        // ── Single-scan: mark order as delivered + completed in one step ──────
        // (action param kept for backward compatibility but always runs full completion)

        // Allow completion from any active status regardless of payment method
        const validCompletionStatuses = ['delivered', 'shipped', 'processing'];

        if (!validCompletionStatuses.includes(order.status)) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: isCOD
                    ? `Order cannot be completed from status: ${order.status}`
                    : 'Order must be delivered before completing.',
            });
        }
        await conn.query(
            `UPDATE orders
             SET status='completed', completed_at=NOW(), qr_confirmed_at=NOW(),
                 delivered_at = COALESCE(delivered_at, NOW()),
                 payment_status = 'paid'
             WHERE order_id=?`,
            [orderId]
        );
        await conn.query(
            `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'order')`,
            [order.buyer_id, '✅ Order Completed!', `Order #JM-${orderId} is complete. Thank you for your purchase!`]
        );
        // Fetch receipt data for the worker
        const [items] = await conn.query(
            `SELECT p.title, oi.quantity, oi.price_at_purchase, oi.base_price, oi.installation_fee
             FROM order_items oi JOIN products p ON p.product_id = oi.product_id
             WHERE oi.order_id = ?`, [orderId]
        );
        const [[fullOrder]] = await conn.query(
            `SELECT o.total_amount, o.delivery_fee, o.payment_method, o.discount_amount,
                    o.points_redeemed, u.full_name AS buyer_name, u.phone AS buyer_phone
             FROM orders o JOIN users u ON u.user_id = o.user_id
             WHERE o.order_id = ?`, [orderId]
        );
        await conn.commit();

        // ── Auto-restore worker status to 'available' ──────────────────────────
        if (order.delivery_man_id) {
            await db.query(
                `UPDATE delivery_men SET status = 'available' WHERE delivery_man_id = ?`,
                [order.delivery_man_id]
            );
        }
        if (order.handyman_id) {
            await db.query(
                `UPDATE handymen SET status = 'available' WHERE handyman_id = ?`,
                [order.handyman_id]
            );
        }

        // 🔴 Real-time: notify customer's OrderDetailScreen live
        if (req.io) {
            req.io.to(`user:${order.buyer_id}`).emit('order:update');
            req.io.to(`order:${orderId}`).emit('order:update');
        }

        return res.json({
            success: true,
            message: 'Order completed and payment confirmed.',
            receipt: { order_id: orderId, ...fullOrder, items },
        });
    } catch (e) {
        await conn.rollback();
        console.error('[workers] scan-qr error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    } finally {
        conn.release();
    }
});

// ── PUT /api/workers/order/:orderId/complete ───────────────────────────────────
// Worker (delivery man or handyman) marks an order as completed.
router.put('/order/:orderId/complete', async (req, res) => {
    const { userId } = req.body;
    const { orderId } = req.params;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Fetch order + verify worker is assigned
        const [[order]] = await conn.query(
            `SELECT o.order_id, o.status, o.user_id AS buyer_id, o.delivery_man_id,
                    h.handyman_id
             FROM orders o
             LEFT JOIN handymen h ON h.user_id = ?
             LEFT JOIN delivery_men dm ON dm.user_id = ?
             WHERE o.order_id = ?
               AND (o.delivery_man_id = dm.delivery_man_id OR h.handyman_id IS NOT NULL)`,
            [userId, userId, orderId]
        );

        if (!order) {
            await conn.rollback();
            return res.status(403).json({ success: false, message: 'Order not found or not assigned to you.' });
        }
        if (['completed', 'cancelled'].includes(order.status)) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: `Order is already ${order.status}.` });
        }

        await conn.query(
            `UPDATE orders SET status='completed', completed_at=NOW(), qr_confirmed_at=NOW(), updated_at=NOW() WHERE order_id=?`,
            [orderId]
        );

        // ── Auto-restore worker status to 'available' ──────────────────────
        if (order.delivery_man_id) {
            await conn.query(
                `UPDATE delivery_men SET status = 'available' WHERE delivery_man_id = ?`,
                [order.delivery_man_id]
            );
        }
        if (order.handyman_id) {
            await conn.query(
                `UPDATE handymen SET status = 'available' WHERE handyman_id = ?`,
                [order.handyman_id]
            );
        }

        // Notify the buyer
        await conn.query(
            `INSERT INTO notifications (user_id, title, message, type)
             VALUES (?, 'Order Completed ✅', ?, 'order')`,
            [order.buyer_id, `Order #JM-${orderId} has been marked as completed. Thank you!`]
        );

        await conn.commit();

        // 🔴 Real-time: notify customer's OrderDetailScreen live
        if (req.io) {
            req.io.to(`user:${order.buyer_id}`).emit('order:update');
            req.io.to(`order:${orderId}`).emit('order:update');
        }

        res.json({ success: true, message: 'Order marked as completed.' });
    } catch (e) {
        await conn.rollback();
        console.error('[workers] complete order error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    } finally {
        conn.release();
    }
});

// ── GET /api/workers/delivery-man/:dmId/history ────────────────────────────────
// Delivery man's completed order history.
router.get('/delivery-man/:dmId/history', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT o.order_id, o.status, o.total_amount, o.updated_at,
                    u.full_name AS buyer_name,
                    o.shipping_address,
                    GROUP_CONCAT(p.title SEPARATOR ', ') AS item_titles
             FROM orders o
             JOIN users u ON o.user_id = u.user_id
             LEFT JOIN order_items oi ON oi.order_id = o.order_id
             LEFT JOIN products p ON oi.product_id = p.product_id
             WHERE o.delivery_man_id = ?
               AND o.status IN ('delivered', 'completed')
             GROUP BY o.order_id
             ORDER BY o.updated_at DESC
             LIMIT 50`,
            [req.params.dmId]
        );
        res.json({ success: true, history: rows });
    } catch (e) {
        console.error('[workers] delivery history error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── GET /api/workers/handyman/:userId/history ──────────────────────────────────
// Handyman's completed task history.
router.get('/handyman/:userId/history', async (req, res) => {
    try {
        const [[hm]] = await db.query(
            'SELECT handyman_id FROM handymen WHERE user_id = ?', [req.params.userId]
        );
        if (!hm) return res.json({ success: true, history: [] });

        const [rows] = await db.query(
            `SELECT o.order_id, o.status, o.total_amount, o.updated_at,
                    u.full_name AS buyer_name,
                    o.shipping_address,
                    GROUP_CONCAT(p.title SEPARATOR ', ') AS item_titles
             FROM orders o
             JOIN users u ON o.user_id = u.user_id
             JOIN order_handymen oh ON oh.order_id = o.order_id
             LEFT JOIN order_items oi ON oi.order_id = o.order_id
             LEFT JOIN products p ON oi.product_id = p.product_id
             WHERE oh.handyman_id = ?
               AND o.status IN ('delivered', 'completed')
             GROUP BY o.order_id
             ORDER BY o.updated_at DESC
             LIMIT 50`,
            [hm.handyman_id]
        );
        res.json({ success: true, history: rows });
    } catch (e) {
        console.error('[workers] handyman history error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── DELETE /api/workers/:userId ────────────────────────────────────────────────
// Deactivate a worker account (soft delete — just marks is_active = 0).
router.delete('/:userId', async (req, res) => {
    try {
        await db.query('UPDATE users SET is_active = 0 WHERE user_id = ? AND role IN (?, ?)',
            [req.params.userId, 'delivery_man', 'handyman']);
        res.json({ success: true, message: 'Worker account deactivated' });
    } catch (e) {
        console.error('[workers] Deactivate worker error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;

