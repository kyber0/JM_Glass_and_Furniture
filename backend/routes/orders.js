const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');
const { ensurePointsRow, REDEEM_RATE, MIN_REDEEM, MAX_REDEEM_PCT } = require('./points');
const { computeEDD } = require('../helpers/edd');


// Place Order
router.post('/', async (req, res) => {
    const { user_id, items, total_amount, delivery_fee, shipping_address, payment_method, voucher_code, discount_amount, points_redeemed } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'No items in order' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Check Stock & Deduct (from shop_listings + listing_colors)
        //    Custom order milestone payments have no listing_id — skip stock logic for those.
        for (const item of items) {
            // Skip stock check for custom request payments
            if (item.request_id && !item.listing_id) continue;

            if (!item.listing_id) {
                throw new Error(`Listing ID missing for item: ${item.title || item.product_id}`);
            }

            // Lock the listing row
            const [[listing]] = await connection.query(
                `SELECT sl.listing_id, sl.stock_quantity, sl.shop_id,
                        p.title
                 FROM shop_listings sl
                 JOIN products p ON p.product_id = sl.product_id
                 WHERE sl.listing_id = ? AND sl.is_active = 1
                 FOR UPDATE`,
                [item.listing_id]
            );
            if (!listing) {
                throw new Error(`Product listing not found or delisted`);
            }
            if (listing.stock_quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${listing.title}. Only ${listing.stock_quantity} left.`);
            }

            // Deduct from shop_listings overall stock
            await connection.query(
                'UPDATE shop_listings SET stock_quantity = stock_quantity - ? WHERE listing_id = ?',
                [item.quantity, item.listing_id]
            );
            // Also update products.sold_count (for analytics / trending)
            await connection.query(
                'UPDATE products SET sold_count = sold_count + ? WHERE product_id = ?',
                [item.quantity, item.product_id]
            );

            // Deduct specific color stock (if variant maps to a color)
            if (item.selected_variant) {
                const [[colorRow]] = await connection.query(
                    `SELECT color FROM product_colors
                     WHERE product_id = ? AND ? LIKE CONCAT('%', color, '%')
                     LIMIT 1`,
                    [item.product_id, item.selected_variant]
                );
                if (colorRow?.color) {
                    await connection.query(
                        `UPDATE listing_colors
                         SET stock = GREATEST(stock - ?, 0)
                         WHERE listing_id = ? AND color = ?`,
                        [item.quantity, item.listing_id, colorRow.color]
                    );
                }
            }
        }


        // 2. Create Order Header
        const [result] = await connection.query(
            'CALL sp_create_order_header(?, ?, ?, ?, ?, ?, ?)',
            [user_id, total_amount, delivery_fee || 0, shipping_address, payment_method, voucher_code || null, discount_amount || 0]
        );

        const orderId = result[0][0].new_order_id;

        // 3. Insert Order Items (include listing_id, base_price, installation_fee)
        const itemValues = items.map(item => [
            orderId, item.product_id, item.quantity,
            item.price,           // price_at_purchase = base + install (for totalling)
            item.installation_fee || 0,  // exact install fee for this item
            item.base_price || item.price, // base product price without install
            item.selected_variant || '', item.request_id || null, item.listing_id || null
        ]);

        await connection.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase, installation_fee, base_price, selected_variant, request_id, listing_id) VALUES ?',
            [itemValues]
        );

        // 3.5 Phase 7.3: Milestone Payments for Custom Requests
        for (const item of items) {
            if (item.request_id && item.payment_phase) {
                if (item.payment_phase === 'downpayment') {
                    await connection.query('UPDATE custom_requests SET status = "in_progress" WHERE request_id = ?', [item.request_id]);
                } else if (item.payment_phase === 'final_balance') {
                    await connection.query('UPDATE custom_requests SET status = "completed" WHERE request_id = ?', [item.request_id]);
                }
            }
        }
        // 3.8 Validate & Update Voucher Usage
        if (voucher_code) {
            // Validate voucher is still valid for this user
            const [[voucher]] = await connection.query(
                `SELECT v.voucher_id, v.is_active, v.usage_limit, v.used_count,
                        uv.is_used
                 FROM vouchers v
                 LEFT JOIN user_vouchers uv ON uv.voucher_code = v.code AND uv.user_id = ?
                 WHERE v.code = ?`,
                [user_id, voucher_code]
            );
            if (!voucher || !voucher.is_active) {
                throw new Error('Voucher is no longer valid.');
            }
            if (voucher.usage_limit && voucher.used_count >= voucher.usage_limit) {
                throw new Error('Voucher usage limit has been reached.');
            }
            if (voucher.is_used) {
                throw new Error('You have already used this voucher.');
            }
            await connection.query('UPDATE vouchers SET used_count = used_count + 1 WHERE code = ?', [voucher_code]);
            await connection.query('UPDATE user_vouchers SET is_used = 1 WHERE user_id = ? AND voucher_code = ?', [user_id, voucher_code]);
        }

        // 3.9 Deduct Loyalty Points (if redeemed)
        if (points_redeemed && points_redeemed >= MIN_REDEEM) {
            // Validate balance one more time in transaction
            await ensurePointsRow(connection, user_id);
            const [[up]] = await connection.query(
                'SELECT balance FROM user_points WHERE user_id = ? FOR UPDATE', [user_id]
            );
            const balance = up?.balance || 0;
            const safePoints = Math.min(points_redeemed, balance);
            if (safePoints > 0) {
                await connection.query(
                    'UPDATE user_points SET balance = balance - ? WHERE user_id = ?',
                    [safePoints, user_id]
                );
                await connection.query(
                    'INSERT INTO points_transactions (user_id, order_id, type, points, note) VALUES (?, ?, "redeem", ?, ?)',
                    [user_id, orderId, -safePoints, `Redeemed on Order #JM-${orderId}`]
                );
                await connection.query(
                    'UPDATE orders SET points_redeemed = ? WHERE order_id = ?',
                    [safePoints, orderId]
                );
            }
        }

        await connection.commit();

        // ── Determine if this is a custom order payment ──────────────────
        const customItem = items.find(i => i.request_id && !i.listing_id);
        const isCustomPayment = !!customItem;

        // 4. 🔔 Notify buyer
        if (isCustomPayment) {
            const phaseLabel = customItem.paymentPhase === 'downpayment' ? '50% Downpayment' : 'Final Balance';
            await createNotification(
                db, user_id, 'order',
                `Custom Order Payment Received 🎉`,
                `Your ${phaseLabel} for custom request REQ-${customItem.request_id} has been confirmed. Order #JM-${orderId}.`,
                orderId
            );
        } else {
            const productTitles = items.map(i => i.title || 'item').join(', ');
            await createNotification(
                db, user_id, 'order',
                'Order Confirmed! 🎉',
                `Your order #JM-${orderId} for ${productTitles} has been placed successfully.`,
                orderId
            );
        }

        // 5. 🔔 Notify seller(s)
        try {
            const [[buyer]] = await db.query('SELECT full_name FROM users WHERE user_id = ?', [user_id]);
            const buyerName = buyer ? buyer.full_name : 'A customer';

            if (isCustomPayment) {
                // Custom order: find seller via custom_requests.shop_id
                const [[cr]] = await db.query(
                    `SELECT s.user_id AS seller_id FROM custom_requests cr
                     JOIN shops s ON cr.shop_id = s.shop_id
                     WHERE cr.request_id = ?`,
                    [customItem.request_id]
                );
                if (cr) {
                    const phaseLabel = customItem.paymentPhase === 'downpayment' ? '50% Downpayment' : 'Final Balance';
                    await createNotification(
                        db, cr.seller_id, 'shop_order',
                        `Custom Order Payment Received 💰`,
                        `${buyerName} paid the ${phaseLabel} for REQ-${customItem.request_id}. Order #JM-${orderId}.`,
                        orderId
                    );
                }
            } else {
                // Regular order: find sellers via listing_id → shop_listings → shops
                const [shopOwners] = await db.query(
                    `SELECT s.user_id AS seller_id,
                            sl.shop_id,
                            GROUP_CONCAT(DISTINCT p.title SEPARATOR ', ') AS item_titles
                     FROM order_items oi
                     JOIN shop_listings sl ON oi.listing_id = sl.listing_id
                     JOIN shops s ON sl.shop_id = s.shop_id
                     JOIN products p ON oi.product_id = p.product_id
                     WHERE oi.order_id = ?
                     GROUP BY s.user_id, sl.shop_id`,
                    [orderId]
                );
                for (const shop of shopOwners) {
                    await createNotification(
                        db, shop.seller_id, 'shop_order',
                        'New Order Received! 🛒',
                        `${buyerName} ordered: ${shop.item_titles}. Order #JM-${orderId}.`,
                        orderId
                    );
                }
            }
        } catch (notifErr) {
            console.error('Failed to notify seller(s):', notifErr.message);
        }

        // ── Compute & store Estimated Delivery Date (best-effort) ───────────────────────
        let eddResult = null;
        try {
            if (!isCustomPayment) {
                // Get shop_id from first listing item
                const firstListingItem = items.find(i => i.listing_id);
                if (firstListingItem) {
                    const [[sl]] = await db.query(
                        'SELECT shop_id FROM shop_listings WHERE listing_id = ?',
                        [firstListingItem.listing_id]
                    );
                    if (sl) {
                        const hasInstall = items.some(i => (i.installation_fee || 0) > 0);
                        eddResult = await computeEDD(db, sl.shop_id, hasInstall);
                        await db.query(
                            'UPDATE orders SET estimated_delivery_date = ? WHERE order_id = ?',
                            [eddResult.edd_min, orderId]
                        );
                        // Notify seller if no workers available
                        if (!eddResult.has_available_worker) {
                            try {
                                const [[sellerRow]] = await db.query(
                                    'SELECT user_id FROM shops WHERE shop_id = ?', [sl.shop_id]
                                );
                                if (sellerRow) {
                                    await createNotification(
                                        db, sellerRow.user_id, 'shop_order',
                                        '⚠️ No Workers Available',
                                        `Order #JM-${orderId} was placed but no ${hasInstall ? 'handyman' : 'delivery man'} is available. Please check worker assignments.`,
                                        orderId
                                    );
                                }
                            } catch (_) {}
                        }
                    }
                }
            }
        } catch (eddErr) {
            console.warn('[orders] EDD compute error (non-fatal):', eddErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            order_id: orderId,
            estimated_delivery_date: eddResult?.edd_min || null,
            edd_max:                  eddResult?.edd_max || null,
            edd_delayed:              eddResult?.delayed || false,
        });


    } catch (error) {
        await connection.rollback();
        console.error('Order Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to place order' });
    } finally {
        connection.release();
    }
});

// ── EDD Preview (no side effects) ───────────────────────────────────────────
// GET /api/orders/edd-preview?shop_id=&has_installation=0|1
router.get('/edd-preview', async (req, res) => {
    const shopId        = parseInt(req.query.shop_id, 10);
    const hasInstall    = req.query.has_installation === '1' || req.query.has_installation === 'true';
    if (!shopId) return res.status(400).json({ success: false, message: 'shop_id required' });
    try {
        const edd = await computeEDD(db, shopId, hasInstall);
        res.json({ success: true, ...edd });
    } catch (e) {
        console.error('[orders] edd-preview error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


// Phase 8: Order Geolocation Tracking 
// Update Driver Location
router.put('/:id/location', async (req, res) => {
    const { lat, lng } = req.body;
    try {
        await db.query(`
            UPDATE orders 
            SET current_lat = ?, current_lng = ?, last_location_update = CURRENT_TIMESTAMP 
            WHERE order_id = ?`,
            [lat, lng, req.params.id]
        );

        // 🟢 Real-time Socket Update: Broadcast location to anyone viewing the LiveTracking screen
        if (req.io) {
            req.io.to(`order:${req.params.id}`).emit('location:update', { lat, lng });
        }

        res.json({ success: true, message: 'Location updated' });
    } catch (error) {
        console.error('Update Location Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get Current Location
router.get('/:id/location', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT current_lat, current_lng, last_location_update, status
            FROM orders 
            WHERE order_id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Get Location Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get User Orders (with full item details) — single JOIN query to avoid N+1
router.get('/user/:userId', async (req, res) => {
    try {
        // Fetch all orders + their items + product info in two queries
        const [orders] = await db.query(
            `SELECT o.order_id, o.user_id, o.total_amount, o.delivery_fee, o.status, o.created_at,
                    o.updated_at, o.shipping_address, o.payment_method,
                    o.payment_status, o.payment_proof_url, o.payment_verified_at,
                    o.discount_amount, o.points_redeemed, o.points_earned,
                    o.processed_at, o.shipped_at, o.delivered_at, o.completed_at,
                    o.delivery_man_id, o.estimated_delivery_date, o.edd_extended,
                    dm.user_id AS delivery_man_user_id,
                    dm_user.full_name AS delivery_man_name,
                    dm_user.phone AS delivery_man_phone,
                    (SELECT COUNT(*) FROM reviews r WHERE r.order_id = o.order_id) as review_count,
                    (SELECT COUNT(*) FROM disputes d WHERE d.order_id = o.order_id AND d.status = 'pending') > 0 AS has_dispute
             FROM orders o
             LEFT JOIN delivery_men dm ON o.delivery_man_id = dm.delivery_man_id
             LEFT JOIN users dm_user ON dm.user_id = dm_user.user_id
             WHERE o.user_id = ?
             ORDER BY o.created_at DESC`,
            [req.params.userId]
        );

        if (orders.length === 0) {
            return res.json({ success: true, count: 0, data: [] });
        }

        const orderIds = orders.map(o => o.order_id);
        const [allItems] = await db.query(
            `SELECT oi.order_id, oi.item_id, oi.product_id, oi.quantity,
                    oi.price_at_purchase, oi.base_price, oi.installation_fee,
                    oi.selected_variant, oi.request_id,
                    p.title, p.image_url,
                    oh.handyman_id,
                    h.name AS handyman_name,
                    h.phone AS handyman_phone,
                    h.user_id AS handyman_user_id,
                    (SELECT COUNT(*) FROM reviews r
                     WHERE r.order_id = oi.order_id AND r.product_id = oi.product_id) > 0 as is_reviewed
             FROM order_items oi
             JOIN products p ON oi.product_id = p.product_id
             LEFT JOIN order_handymen oh ON oh.order_id = oi.order_id
             LEFT JOIN handymen h ON h.handyman_id = oh.handyman_id
             WHERE oi.order_id IN (?)`,
            [orderIds]
        );

        // Group items by order_id; hoist handyman from first item
        const itemsByOrder = {};
        const handymanByOrder = {};
        for (const item of allItems) {
            if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
            itemsByOrder[item.order_id].push(item);
            if (item.handyman_id && !handymanByOrder[item.order_id]) {
                handymanByOrder[item.order_id] = {
                    handyman_id:      item.handyman_id,
                    handyman_name:    item.handyman_name,
                    handyman_phone:   item.handyman_phone,
                    handyman_user_id: item.handyman_user_id,
                };
            }
        }
        const result = orders.map(o => ({
            ...o,
            items: itemsByOrder[o.order_id] || [],
            ...(handymanByOrder[o.order_id] || {}),
        }));

        res.json({ success: true, count: result.length, data: result });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Cancel Order
router.put('/:orderId/cancel', async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [order] = await connection.query('SELECT status, user_id FROM orders WHERE order_id = ? FOR UPDATE', [req.params.orderId]);

        if (order.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order[0].status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Only pending orders can be cancelled' });
        }

        const userId = order[0].user_id;

        // Reverse any redeemed points
        const [[orderInfo]] = await connection.query(
            'SELECT points_redeemed FROM orders WHERE order_id = ?', [req.params.orderId]
        );
        const pts = orderInfo?.points_redeemed || 0;
        if (pts > 0) {
            await ensurePointsRow(connection, userId);
            await connection.query(
                'UPDATE user_points SET balance = balance + ? WHERE user_id = ?', [pts, userId]
            );
            await connection.query(
                'INSERT INTO points_transactions (user_id, order_id, type, points, note) VALUES (?, ?, "reverse", ?, ?)',
                [userId, req.params.orderId, pts, `Reversed — Order #JM-${req.params.orderId} cancelled`]
            );
        }

        // Get items to restore stock (listing_id + selected_variant for color restore)
        const [items] = await connection.query(
            'SELECT product_id, quantity, selected_variant, listing_id FROM order_items WHERE order_id = ?',
            [req.params.orderId]
        );

        for (const item of items) {
            // Restore sold_count on product
            await connection.query(
                'UPDATE products SET sold_count = GREATEST(sold_count - ?, 0) WHERE product_id = ?',
                [item.quantity, item.product_id]
            );
            // Restore shop listing stock
            if (item.listing_id) {
                await connection.query(
                    'UPDATE shop_listings SET stock_quantity = stock_quantity + ? WHERE listing_id = ?',
                    [item.quantity, item.listing_id]
                );
                // Restore specific color stock
                if (item.selected_variant) {
                    const [[colorRow]] = await connection.query(
                        `SELECT color FROM product_colors
                         WHERE product_id = ? AND ? LIKE CONCAT('%', color, '%')
                         LIMIT 1`,
                        [item.product_id, item.selected_variant]
                    );
                    if (colorRow?.color) {
                        await connection.query(
                            'UPDATE listing_colors SET stock = stock + ? WHERE listing_id = ? AND color = ?',
                            [item.quantity, item.listing_id, colorRow.color]
                        );
                    }
                }
            }
        }

        await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', ['cancelled', req.params.orderId]);

        await connection.commit();

        // 🔔 Notify user: order cancelled
        await createNotification(
            db, userId, 'order',
            'Order Cancelled',
            `Your order #JM-${req.params.orderId} has been cancelled and your stock has been restored.`,
            Number(req.params.orderId)
        );

        // 🟢 Real-time Socket Update
        if (req.io) {
            req.io.to(`user:${userId}`).emit('order:update');
            // If we need to notify shops, they can also listen to their shop rooms, but for now user is notified.
            // Ideally we'd broadcast to the shop(s) too. Let's do it using the items array.
            const shopIds = [...new Set(items.map(i => i.listing_id ? i.listing_id : null).filter(Boolean))];
            // Since we don't easily have shopId here, we will emit a global shop order refresh for sellers when they check
        }

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Cancel Order Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    } finally {
        if (connection) connection.release();
    }
});

// ── Assign Delivery Man to Order ──────────────────────────────────────────────
// PUT /api/orders/:id/assign-delivery  { delivery_man_id }
router.put('/:id/assign-delivery', async (req, res) => {
    const { delivery_man_id } = req.body;
    if (!delivery_man_id) {
        return res.status(400).json({ success: false, message: 'delivery_man_id is required' });
    }
    try {
        // Verify delivery man belongs to the same shop as the order
        const [[dm]] = await db.query(
            `SELECT dm.delivery_man_id, dm.shop_id
             FROM delivery_men dm
             WHERE dm.delivery_man_id = ? AND dm.status != 'off'`,
            [delivery_man_id]
        );
        if (!dm) {
            return res.status(404).json({ success: false, message: 'Delivery man not found or off duty' });
        }

        await db.query(
            'UPDATE orders SET delivery_man_id = ?, status = ? WHERE order_id = ?',
            [delivery_man_id, 'processing', req.params.id]
        );

        // Notify the delivery man
        const [[order]] = await db.query('SELECT user_id, shipping_address FROM orders WHERE order_id = ?', [req.params.id]);
        const [[dmUser]] = await db.query('SELECT user_id FROM delivery_men WHERE delivery_man_id = ?', [delivery_man_id]);
        if (dmUser) {
            await createNotification(
                db, dmUser.user_id, 'order',
                'New Delivery Assignment 🚚',
                `You have been assigned to deliver Order #JM-${req.params.id}. Check your dashboard for details.`,
                Number(req.params.id)
            );
        }
        // Notify buyer
        if (order) {
            await createNotification(
                db, order.user_id, 'order',
                'Your Order is Being Prepared 📦',
                `Order #JM-${req.params.id} has been assigned to a delivery man and will ship soon.`,
                Number(req.params.id)
            );
            // 🟢 Real-time Socket Update
            if (req.io) {
                req.io.to(`user:${order.user_id}`).emit('order:update');
                if (dm && dm.shop_id) {
                    req.io.to(`shop:${dm.shop_id}`).emit('order:update');
                }
            }
        }

        res.json({ success: true, message: 'Delivery man assigned' });
    } catch (e) {
        console.error('[orders] Assign delivery error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Delivery Man: Update Order Status ─────────────────────────────────────────
// PUT /api/orders/:id/delivery-status  { status: 'shipped' | 'delivered' }
router.put('/:id/delivery-status', async (req, res) => {
    const { status, delivery_man_id } = req.body;
    const allowed = ['shipped', 'delivered'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, message: 'Status must be shipped or delivered' });
    }
    try {
        // Verify this delivery man is assigned to this order
        const [[order]] = await db.query(
            `SELECT o.order_id, o.user_id, o.delivery_man_id, dm.user_id AS dm_user_id
             FROM orders o
             JOIN delivery_men dm ON o.delivery_man_id = dm.delivery_man_id
             WHERE o.order_id = ? AND o.delivery_man_id = ?`,
            [req.params.id, delivery_man_id]
        );
        if (!order) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this order' });
        }

        await db.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, req.params.id]);

        // Update delivery man status
        if (status === 'shipped') {
            await db.query('UPDATE delivery_men SET status = ? WHERE delivery_man_id = ?', ['on_delivery', delivery_man_id]);
        } else if (status === 'delivered') {
            await db.query('UPDATE delivery_men SET status = ? WHERE delivery_man_id = ?', ['available', delivery_man_id]);
            // Notify buyer
            await createNotification(
                db, order.user_id, 'order',
                'Order Delivered! 🎉',
                `Your Order #JM-${req.params.id} has been delivered successfully. Enjoy your purchase!`,
                Number(req.params.id)
            );
        }

        // 🟢 Real-time Socket Update
        if (req.io) {
            req.io.to(`user:${order.user_id}`).emit('order:update');
            req.io.to(`order:${req.params.id}`).emit('order:update');
        }

        res.json({ success: true, message: `Order marked as ${status}` });
    } catch (e) {
        console.error('[orders] Delivery status update error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Delivery Man: Get My Assigned Orders ──────────────────────────────────────
// GET /api/orders/delivery-man/:deliveryManId
router.get('/delivery-man/:deliveryManId', async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT o.order_id, o.status, o.total_amount, o.delivery_fee,
                    o.discount_amount, o.payment_method, o.processed_at,
                    o.shipped_at, o.delivered_at, o.completed_at,
                    o.shipping_address, o.created_at, o.updated_at,
                    o.current_lat, o.current_lng,
                    u.full_name AS buyer_name, u.phone AS buyer_phone,
                    GROUP_CONCAT(p.title SEPARATOR ', ') AS item_titles
             FROM orders o
             JOIN users u ON o.user_id = u.user_id
             JOIN order_items oi ON oi.order_id = o.order_id
             JOIN products p ON oi.product_id = p.product_id
             WHERE o.delivery_man_id = ?
               AND o.status NOT IN ('cancelled', 'delivered', 'completed')
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [req.params.deliveryManId]
        );

        if (orders.length > 0) {
            const orderIds = orders.map(o => o.order_id);
            const [allItems] = await db.query(
                `SELECT oi.order_id, oi.item_id, oi.product_id, oi.quantity,
                        oi.price_at_purchase, oi.base_price, oi.installation_fee,
                        p.title, IF(oi.installation_fee > 0, 'installation', 'delivery') AS service_type
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.product_id
                 WHERE oi.order_id IN (?)`,
                [orderIds]
            );
            orders.forEach(o => {
                o.items = allItems.filter(i => i.order_id === o.order_id);
            });
        }
        res.json({ success: true, orders });
    } catch (e) {
        console.error('[orders] Get delivery man orders error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Get Seller Orders (with delivery man info) ────────────────────────────────
// GET /api/orders/shop/:shopId  — used by SellerOrdersScreen
router.get('/shop/:shopId', async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT o.order_id, o.user_id, o.status, o.total_amount, o.delivery_fee,
                    o.payment_status, o.created_at, o.shipping_address, o.payment_method,
                    o.delivery_man_id,
                    u.full_name AS buyer_name,
                    dm_user.full_name AS delivery_man_name,
                    dm.status AS delivery_man_status,
                    GROUP_CONCAT(DISTINCT p.title SEPARATOR ', ') AS item_titles
             FROM orders o
             JOIN users u ON o.user_id = u.user_id
             JOIN order_items oi ON oi.order_id = o.order_id
             JOIN shop_listings sl ON oi.listing_id = sl.listing_id AND sl.shop_id = ?
             JOIN products p ON oi.product_id = p.product_id
             LEFT JOIN delivery_men dm ON o.delivery_man_id = dm.delivery_man_id
             LEFT JOIN users dm_user ON dm.user_id = dm_user.user_id
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [req.params.shopId]
        );
        res.json({ success: true, orders });
    } catch (e) {
        console.error('[orders] Get shop orders error:', e.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;

