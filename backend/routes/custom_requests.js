const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const { createNotification } = require('../utils/notifications.helper');
const { autoAssignWorker }   = require('../utils/autoAssign');
const { computeEDD }         = require('../helpers/edd');


// Configure Multer for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/custom/'),
    filename: (req, file, cb) => cb(null, 'custom-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ─── Helper: sanitize array fields from multipart ────────────────────────────
const first = (v) => (Array.isArray(v) ? v[0] : v);

// ─── POST / — Create a new custom request ────────────────────────────────────
router.post('/', upload.array('images', 5), async (req, res) => {
    let {
        user_id, shop_id, product_id, details, budget, service_type,
        fragility_level, installation_complexity
    } = req.body;

    // Sanitize duplicate form fields from multipart
    user_id               = first(user_id);
    shop_id               = first(shop_id);
    product_id            = first(product_id);
    details               = first(details);
    budget                = first(budget);
    service_type          = first(service_type);
    fragility_level       = first(fragility_level) || 'none';
    installation_complexity = first(installation_complexity) || 'standard';

    const images = (req.files || []).map(f => `uploads/custom/${f.filename}`);

    try {
        const [result] = await db.query(
            `INSERT INTO custom_requests
             (user_id, shop_id, product_id, details, budget, service_type,
              fragility_level, installation_complexity, images)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user_id, shop_id, product_id || null,
                details, budget || null,
                service_type || 'Delivery',
                fragility_level,
                installation_complexity,
                JSON.stringify(images)
            ]
        );

        // Notify buyer
        await createNotification(
            db, user_id, 'custom_request',
            'Custom Request Sent',
            'Your custom request has been submitted! The seller will review it shortly.',
            result.insertId
        );

        // Notify shop owner
        const [shops] = await db.query('SELECT user_id FROM shops WHERE shop_id = ?', [shop_id]);
        if (shops.length > 0) {
            await createNotification(
                db, shops[0].user_id, 'custom_request',
                'New Custom Request',
                `A customer submitted a new custom ${service_type || 'request'} to your shop. Tap to review.`,
                result.insertId
            );
        }

        // Pass shop_id so the message lands in the seller's shop inbox
        // and the buyer's personal inbox (channel = seller's shop)
        
        // 🟢 Real-time Socket Update
        if (req.io) {
            req.io.to(`user:${user_id}`).emit('request:update');
            req.io.to(`shop:${shop_id}`).emit('request:update');
        }

        res.status(201).json({
            success: true,
            request_id: result.insertId,
            message: 'Custom request sent successfully',
            images,
            raw_images: images,
            shop_id: parseInt(shop_id),
        });
    } catch (error) {
        console.error('Create Custom Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ─── GET /user/:userId — Buyer's request list ────────────────────────────────
router.get('/user/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT cr.*,
                   s.shop_name, s.user_id AS shop_owner_id,
                   s.latitude  AS shop_lat,
                   s.longitude AS shop_lng,
                   p.title     AS product_title,
                   p.image_url AS product_image
            FROM custom_requests cr
            JOIN  shops    s ON cr.shop_id    = s.shop_id
            LEFT JOIN products p ON cr.product_id = p.product_id
            WHERE cr.user_id = ?
            ORDER BY cr.created_at DESC
        `, [req.params.userId]);
        res.json({ success: true, requests: rows });
    } catch (error) {
        console.error('Get User Requests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ─── GET /shop/:shopId — Seller's request list ───────────────────────────────
router.get('/shop/:shopId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT cr.*,
                   u.full_name      AS user_name,
                   u.email          AS user_email,
                   u.profile_image  AS user_profile_image,
                   s.latitude       AS shop_lat,
                   s.longitude      AS shop_lng,
                   p.title          AS product_title,
                   p.image_url      AS product_image
            FROM custom_requests cr
            JOIN  users    u ON cr.user_id  = u.user_id
            JOIN  shops    s ON cr.shop_id  = s.shop_id
            LEFT JOIN products p ON cr.product_id = p.product_id
            WHERE cr.shop_id = ?
            ORDER BY cr.created_at DESC
        `, [req.params.shopId]);
        res.json({ success: true, requests: rows });
    } catch (error) {
        console.error('Get Shop Requests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ─── GET /:requestId — Single request detail ────────────────────────────────
router.get('/:requestId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT cr.*,
                   s.shop_name, s.user_id AS shop_owner_id,
                   s.latitude  AS shop_lat,
                   s.longitude AS shop_lng,
                   u.full_name      AS user_name,
                   u.email          AS user_email,
                   u.profile_image  AS user_profile_image,
                   p.title          AS product_title,
                   p.image_url      AS product_image
            FROM custom_requests cr
            LEFT JOIN shops    s ON cr.shop_id    = s.shop_id
            LEFT JOIN users    u ON cr.user_id    = u.user_id
            LEFT JOIN products p ON cr.product_id = p.product_id
            WHERE cr.request_id = ?
        `, [req.params.requestId]);

        if (rows.length === 0)
            return res.status(404).json({ success: false, message: 'Request not found' });

        res.json({ success: true, request: rows[0] });
    } catch (error) {
        console.error('Get Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ─── PUT /:requestId/quote — Seller sends a price quote ──────────────────────
router.put('/:requestId/quote', async (req, res) => {
    const { quoted_price, fragility_level, installation_complexity, negotiation_notes } = req.body;

    if (!quoted_price || isNaN(parseFloat(quoted_price))) {
        return res.status(400).json({ success: false, message: 'quoted_price is required' });
    }

    try {
        await db.query(
            `UPDATE custom_requests
             SET status = 'negotiating',
                 quoted_price = ?,
                 fragility_level = ?,
                 installation_complexity = ?,
                 negotiation_notes = ?
             WHERE request_id = ?`,
            [
                parseFloat(quoted_price),
                fragility_level || 'none',
                installation_complexity || 'standard',
                negotiation_notes || null,
                req.params.requestId
            ]
        );

        // Notify buyer
        const [[req_row]] = await db.query('SELECT user_id, shop_id FROM custom_requests WHERE request_id = ?', [req.params.requestId]);
        if (req_row) {
            await createNotification(
                db, req_row.user_id, 'custom_request',
                'Seller Sent a Quote 💬',
                `Your custom request has a new price quote of ₱${parseFloat(quoted_price).toLocaleString('en-PH')}. Tap to review and accept.`,
                parseInt(req.params.requestId)
            );
            
            // 🟢 Real-time Socket Update
            if (req.io) {
                req.io.to(`user:${req_row.user_id}`).emit('request:update');
                req.io.to(`shop:${req_row.shop_id}`).emit('request:update');
            }
        }

        res.json({ success: true, message: 'Quote sent to customer' });
    } catch (error) {
        console.error('Quote Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ─── PUT /:requestId/status — Update request status ─────────────────────────
router.put('/:requestId/status', async (req, res) => {
    const { status, quoted_price, fragility_level, installation_complexity, negotiation_notes } = req.body;

    const ALLOWED = ['pending','negotiating','accepted','in_progress','ready','completed','rejected'];
    if (!ALLOWED.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    try {
        // Build dynamic update — only overwrite quote fields when provided
        const fields = ['status = ?'];
        const vals   = [status];

        if (quoted_price !== undefined) { fields.push('quoted_price = ?');            vals.push(parseFloat(quoted_price)); }
        if (fragility_level)            { fields.push('fragility_level = ?');         vals.push(fragility_level); }
        if (installation_complexity)    { fields.push('installation_complexity = ?'); vals.push(installation_complexity); }
        if (negotiation_notes !== undefined) { fields.push('negotiation_notes = ?');  vals.push(negotiation_notes || null); }

        vals.push(req.params.requestId);
        await db.query(`UPDATE custom_requests SET ${fields.join(', ')} WHERE request_id = ?`, vals);

        // Notifications
        const [[request]] = await db.query('SELECT * FROM custom_requests WHERE request_id = ?', [req.params.requestId]);
        if (request) {
            const statusMessages = {
                accepted:    { title: 'Request Accepted! ✅', body: `Your custom request has been accepted at ₱${parseFloat(request.quoted_price || request.budget || 0).toLocaleString('en-PH')}.` },
                rejected:    { title: 'Request Declined',     body: 'Unfortunately your custom request was declined by the seller.' },
                in_progress: { title: 'Work Started 🔨',      body: 'The seller has started working on your custom order!' },
                ready:       { title: 'Order Ready! 📦',       body: 'Your custom order is ready. Please pay the final balance to complete your order.' },
                completed:   { title: 'Order Completed 🎉',   body: 'Your custom order has been completed. Enjoy!' },
                negotiating: { title: 'Quote Updated 💬',      body: 'The seller updated the price quote on your custom request.' },
            };

            const notif = statusMessages[status];
            if (notif) {
                await createNotification(
                    db, request.user_id,
                    'custom_request',
                    notif.title, notif.body,
                    request.request_id
                );
            }

            // Also notify seller when buyer accepts (status→accepted by buyer)
            if (status === 'accepted' && request.shop_id) {
                const [[shop]] = await db.query('SELECT user_id FROM shops WHERE shop_id = ?', [request.shop_id]);
                if (shop) {
                    await createNotification(
                        db, shop.user_id, 'custom_request',
                        'Customer Accepted Your Quote ✅',
                        'The customer has accepted your price quote. You can now start working on the order.',
                        request.request_id
                    );
                }
            }
        }

        // ── Auto-assign Handyman when request moves to in_progress ──────────────
        if (status === 'in_progress' && request?.shop_id) {
            setImmediate(() => autoAssignWorker(db, request.request_id, request.shop_id, 'handyman').catch(e =>
                console.error('[AutoAssign] Handyman/Request error:', e.message)
            ));
        }

        // ── Auto-assign Delivery Man when request moves to ready ────────────────
        if (status === 'ready' && request?.shop_id) {
            setImmediate(() => autoAssignWorker(db, request.request_id, request.shop_id, 'delivery_man').catch(e =>
                console.error('[AutoAssign] DeliveryMan/Request error:', e.message)
            ));
        }

        // ── Compute EDD when buyer accepts the quote ─────────────────────────────────────
        if (status === 'accepted' && request?.shop_id) {
            try {
                const isInstall = request.service_type === 'Installation';
                const edd = await computeEDD(db, request.shop_id, isInstall, true);
                await db.query(
                    'UPDATE custom_requests SET estimated_completion_date = ? WHERE request_id = ?',
                    [edd.edd_min, request.request_id]
                );
                // Notify buyer of their EDD
                const eddDate = new Date(edd.edd_min).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                await createNotification(
                    db, request.user_id, 'custom_request',
                    '🚚 Estimated Completion Date Set',
                    `Your custom order REQ-${request.request_id} is estimated to be ready by ${eddDate}${edd.delayed ? ' (delayed due to worker availability)' : ''}.`,
                    request.request_id
                ).catch(() => {});
            } catch (eddErr) {
                console.warn('[custom_requests] EDD compute error (non-fatal):', eddErr.message);
            }
        }

        // 🟢 Real-time Socket Update
        if (req.io && request) {
            req.io.to(`user:${request.user_id}`).emit('request:update');
            if (request.shop_id) {
                req.io.to(`shop:${request.shop_id}`).emit('request:update');
            }
        }

        res.json({ success: true, message: 'Status updated' });

    } catch (error) {
        console.error('Update Status Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
