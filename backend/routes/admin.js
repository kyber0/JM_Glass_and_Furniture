const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');

// ── Auto-migrate: ensure required columns/tables exist ───────────────────────
(async () => {
    try {
        // users.is_active
        const [cols] = await db.query(`SHOW COLUMNS FROM users LIKE 'is_active'`);
        if (cols.length === 0) {
            await db.query(`ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
            console.log('[admin] ✅ users.is_active column created');
        }
        // products.is_hidden
        const [hidCols] = await db.query(`SHOW COLUMNS FROM products LIKE 'is_hidden'`);
        if (hidCols.length === 0) {
            await db.query(`ALTER TABLE products ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0`);
            console.log('[admin] ✅ products.is_hidden column created');
        }
        // reported_problems.status
        const [rpCols] = await db.query(`SHOW COLUMNS FROM reported_problems LIKE 'status'`);
        if (rpCols.length === 0) {
            await db.query(`ALTER TABLE reported_problems ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'`);
            console.log('[admin] ✅ reported_problems.status column created');
        }

        // shops.rejection_reason
        const [shopsCols] = await db.query(`SHOW COLUMNS FROM shops LIKE 'rejection_reason'`);
        if (shopsCols.length === 0) {
            await db.query(`ALTER TABLE shops ADD COLUMN rejection_reason VARCHAR(255) NULL`);
            console.log('[admin] ✅ shops.rejection_reason column created');
        }
        // activity_logs table
        await db.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                action VARCHAR(100) NOT NULL,
                details TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_created_at (created_at)
            )
        `);
        // platform_settings table
        await db.query(`
            CREATE TABLE IF NOT EXISTS platform_settings (
                \`key\` VARCHAR(100) PRIMARY KEY,
                value TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // payouts table
        await db.query(`
            CREATE TABLE IF NOT EXISTS payouts (
                payout_id INT AUTO_INCREMENT PRIMARY KEY,
                shop_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                bank_name VARCHAR(100) NULL,
                account_name VARCHAR(100) NULL,
                account_number VARCHAR(100) NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL,
                FOREIGN KEY (shop_id) REFERENCES shops(shop_id)
            )
        `);
        // disputes table
        await db.query(`
            CREATE TABLE IF NOT EXISTS disputes (
                dispute_id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                buyer_id INT NULL,
                reason VARCHAR(255) NOT NULL,
                description TEXT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                resolution_notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP NULL,
                FOREIGN KEY (order_id) REFERENCES orders(order_id)
            )
        `);
        // Add buyer_id to disputes if missing (migration guard)
        const [disputeCols] = await db.query(`SHOW COLUMNS FROM disputes LIKE 'buyer_id'`);
        if (disputeCols.length === 0) {
            await db.query(`ALTER TABLE disputes ADD COLUMN buyer_id INT NULL AFTER order_id`);
            console.log('[admin] ✅ disputes.buyer_id column added');
        }
        // carousel banners
        await db.query(`
            CREATE TABLE IF NOT EXISTS carousel_banners (
                banner_id INT AUTO_INCREMENT PRIMARY KEY,
                image_url VARCHAR(255) NOT NULL,
                link_url VARCHAR(255) NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // vouchers
        await db.query(`
            CREATE TABLE IF NOT EXISTS vouchers (
                voucher_id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) NOT NULL UNIQUE,
                discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
                discount_value DECIMAL(10, 2) NOT NULL,
                min_spend DECIMAL(10, 2) DEFAULT 0,
                max_discount DECIMAL(10, 2) NULL,
                usage_limit INT NULL, -- NULL means unlimited
                used_count INT DEFAULT 0,
                start_date DATETIME NULL,
                end_date DATETIME NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Ensure user_addresses.address_id has AUTO_INCREMENT (fix for missing default value error)
        const [[addrTableInfo]] = await db.query(`SHOW CREATE TABLE user_addresses`);
        const createSql = addrTableInfo['Create Table'] || '';
        if (!createSql.includes('AUTO_INCREMENT')) {
            await db.query(`ALTER TABLE user_addresses MODIFY COLUMN address_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY`);
            console.log('[admin] ✅ user_addresses.address_id fixed: AUTO_INCREMENT added');
        }

        // Ensure orders.status ENUM includes 'completed'
        const [[statusCol]] = await db.query(`SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'status'`);
        if (statusCol && !statusCol.COLUMN_TYPE.includes('completed')) {
            await db.query(`ALTER TABLE orders MODIFY COLUMN status ENUM('pending','processing','shipped','delivered','cancelled','completed') NOT NULL DEFAULT 'pending'`);
            console.log("[admin] ✅ orders.status ENUM: 'completed' added");
        }

        // Add commission/fee columns to orders
        const [orderCols] = await db.query(`SHOW COLUMNS FROM orders LIKE 'commission_amount'`);
        if (orderCols.length === 0) {
            await db.query(`
                ALTER TABLE orders 
                ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 0,
                ADD COLUMN commission_amount DECIMAL(10,2) DEFAULT 0,
                ADD COLUMN transaction_fee_pct DECIMAL(5,2) DEFAULT 0,
                ADD COLUMN transaction_fee_fixed DECIMAL(10,2) DEFAULT 0,
                ADD COLUMN transaction_fee_amount DECIMAL(10,2) DEFAULT 0,
                ADD COLUMN seller_net DECIMAL(10,2) DEFAULT NULL
            `);
            console.log('[admin] ✅ orders commission columns added');
        }

        // Insert default platform fees if not existing
        await db.query(`INSERT IGNORE INTO platform_settings (\`key\`, value) VALUES ('commission_rate', '3.00')`);
        await db.query(`INSERT IGNORE INTO platform_settings (\`key\`, value) VALUES ('transaction_fee_pct', '2.00')`);
        await db.query(`INSERT IGNORE INTO platform_settings (\`key\`, value) VALUES ('transaction_fee_fixed', '15.00')`);

        console.log('[admin] ✅ tables ready');


    } catch (err) {
        console.error('[admin] Migration error:', err.message);
    }
})();

// helper to safely insert a log (non-critical)
const addLog = async (userId, action, details) => {
    try { await db.query(`INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)`, [userId, action, details]); }
    catch (_) { }
};

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [[{ totalUsers }]] = await db.query(`SELECT COUNT(*) as totalUsers FROM users WHERE role != 'admin'`);
        const [[{ totalSellers }]] = await db.query(`SELECT COUNT(*) as totalSellers FROM users WHERE role = 'seller'`);
        const [[{ totalOrders }]] = await db.query(`SELECT COUNT(*) as totalOrders FROM orders`);
        const [[{ totalRevenue }]] = await db.query(`SELECT IFNULL(SUM(total_amount),0) as totalRevenue FROM orders WHERE status != 'cancelled'`);

        const [[{ totalCommissionEarned }]] = await db.query(`SELECT IFNULL(SUM(commission_amount),0) as totalCommissionEarned FROM orders WHERE status = 'completed'`);
        const [[{ totalGatewayCosts }]] = await db.query(`SELECT IFNULL(SUM(transaction_fee_amount),0) as totalGatewayCosts FROM orders WHERE status = 'completed'`);

        const [[{ pendingApplications }]] = await db.query(`SELECT COUNT(*) as pendingApplications FROM shops WHERE status = 'pending'`);
        const [[{ totalProducts }]] = await db.query(`SELECT COUNT(*) as totalProducts FROM products`);
        const [[{ totalShops }]] = await db.query(`SELECT COUNT(*) as totalShops FROM shops WHERE status = 'active'`);

        res.json({
            success: true,
            stats: {
                totalUsers, totalSellers, totalOrders,
                totalRevenue: parseFloat(totalRevenue),
                totalCommissionEarned: parseFloat(totalCommissionEarned),
                totalGatewayCosts: parseFloat(totalGatewayCosts),
                pendingApplications, totalProducts, totalShops
            }
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/analytics ──────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
    try {
        // Revenue by day (last 7 days)
        const [revenueByDay] = await db.query(`
            SELECT DATE(created_at) as date, SUM(total_amount) as revenue, COUNT(*) as orders
            FROM orders WHERE status != 'cancelled' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at) ORDER BY date ASC
        `);

        // Orders by status
        const [ordersByStatus] = await db.query(`
            SELECT status, COUNT(*) as count FROM orders GROUP BY status
        `);

        // Top 5 products by sold_count
        const [topProducts] = await db.query(`
            SELECT p.title, p.sold_count, p.price,
                   (SELECT s2.shop_name FROM shop_listings sl2
                    JOIN shops s2 ON s2.shop_id = sl2.shop_id
                    WHERE sl2.product_id = p.product_id
                    ORDER BY sl2.listed_at ASC LIMIT 1) AS shop_name
            FROM products p
            ORDER BY p.sold_count DESC LIMIT 5
        `);

        // Top 5 sellers by revenue
        const [topSellers] = await db.query(`
            SELECT u.full_name, s.shop_name,
                   IFNULL(SUM(oi.price_at_purchase * oi.quantity), 0) as revenue,
                   COUNT(DISTINCT o.order_id) as orders
            FROM shops s
            JOIN users u ON s.user_id = u.user_id
            LEFT JOIN shop_listings sl ON sl.shop_id = s.shop_id
            LEFT JOIN order_items oi ON oi.listing_id = sl.listing_id
            LEFT JOIN orders o ON o.order_id = oi.order_id AND o.status != 'cancelled'
            WHERE s.status = 'active'
            GROUP BY s.shop_id ORDER BY revenue DESC LIMIT 5
        `);

        // New users per day (last 7 days)
        const [userGrowth] = await db.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND role != 'admin'
            GROUP BY DATE(created_at) ORDER BY date ASC
        `);

        res.json({ success: true, data: { revenueByDay, ordersByStatus, topProducts, topSellers, userGrowth } });
    } catch (err) {
        console.error('Admin analytics error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT u.user_id, u.full_name, u.email, u.role, u.created_at, u.is_active,
                   s.shop_name, s.status as shop_status
            FROM users u
            LEFT JOIN shops s ON u.user_id = s.user_id
            WHERE u.role != 'admin'
            ORDER BY u.created_at DESC
        `);
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Admin users error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/users/:id/status ──────────────────────────────────────────
router.put('/users/:id/status', async (req, res) => {
    const { is_active } = req.body;
    try {
        await db.query(`UPDATE users SET is_active = ? WHERE user_id = ?`, [is_active, req.params.id]);
        await addLog(req.params.id, is_active ? 'account_activated' : 'account_deactivated',
            `Admin ${is_active ? 'activated' : 'deactivated'} user #${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Update user status error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/products ───────────────────────────────────────────────────
router.get('/products', async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT p.product_id, p.title, p.price, p.sold_count,
                   p.is_active, p.category_id, p.image_url, p.created_at,
                   p.base_price, p.is_catalog_active,
                   COUNT(DISTINCT sl.listing_id) AS shop_count
            FROM products p
            LEFT JOIN shop_listings sl ON sl.product_id = p.product_id
            GROUP BY p.product_id
            ORDER BY p.created_at DESC
        `);
        res.json({ success: true, data: products });
    } catch (err) {
        console.error('Admin products error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/orders ─────────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
    try {
        const [orders] = await db.query(`
            SELECT o.order_id, o.total_amount, o.status, o.payment_method, o.shipping_address, o.created_at,
                   u.full_name as buyer_name, u.email
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            ORDER BY o.created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: orders });
    } catch (err) {
        console.error('Admin orders error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/orders/:id ─────────────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
    try {
        const [[order]] = await db.query(`
            SELECT o.order_id, o.total_amount, o.status, o.payment_method, o.shipping_address, o.created_at,
                   u.full_name as buyer_name, u.email, u.user_id
            FROM orders o JOIN users u ON o.user_id = u.user_id
            WHERE o.order_id = ?
        `, [req.params.id]);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const [items] = await db.query(`
            SELECT oi.quantity, oi.price_at_purchase, oi.selected_variant,
                   p.title, p.image_url,
                   IFNULL(s.shop_name, 'N/A') AS shop_name
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            LEFT JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            LEFT JOIN shops s ON s.shop_id = sl.shop_id
            WHERE oi.order_id = ?
        `, [req.params.id]);

        res.json({ success: true, data: { ...order, items } });
    } catch (err) {
        console.error('Admin order detail error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/shops ──────────────────────────────────────────────
router.get('/shops', async (req, res) => {
    try {
        const [shops] = await db.query(`
            SELECT s.shop_id, s.shop_name, s.description, s.address, s.tin_number,
                   s.status, s.created_at, u.full_name as owner_name, u.email as owner_email
            FROM shops s
            JOIN users u ON s.user_id = u.user_id
            ORDER BY s.created_at DESC
        `);
        res.json({ success: true, data: shops });
    } catch (err) {
        console.error('Get shops error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/shops/pending ──────────────────────────────────────────────
router.get('/shops/pending', async (req, res) => {
    try {
        const [shops] = await db.query(`
            SELECT s.shop_id, s.shop_name, s.description, s.address, s.tin_number,
                   s.id_image      AS id_image_url,
                   s.permit_image  AS permit_image_url,
                   s.status, s.rejection_reason, s.created_at,
                   u.full_name, u.email, u.phone, u.user_id
            FROM shops s
            JOIN users u ON s.user_id = u.user_id
            ORDER BY s.created_at DESC
        `);
        res.json({ success: true, data: shops });
    } catch (err) {
        console.error('Pending shops error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/shops/:id/status ─────────────────────────────────────────
router.put('/shops/:id/status', async (req, res) => {
    const { status } = req.body;
    try {
        await db.query(`UPDATE shops SET status = ? WHERE shop_id = ?`, [status, req.params.id]);
        res.json({ success: true, message: 'Shop status updated' });
    } catch (err) {
        console.error('Update shop status error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/shops/:id/approve ─────────────────────────────────────────
router.put('/shops/:id/approve', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[shop]] = await connection.query(
            `SELECT s.user_id, s.shop_name, s.address, u.full_name FROM shops s JOIN users u ON s.user_id = u.user_id WHERE s.shop_id = ?`,
            [req.params.id]
        );
        if (!shop) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Shop not found' }); }

        await connection.query(`UPDATE shops SET status = 'active' WHERE shop_id = ?`, [req.params.id]);
        await connection.query(`UPDATE users SET role = 'seller' WHERE user_id = ?`, [shop.user_id]);
        await connection.commit();

        await createNotification(db, shop.user_id, 'system',
            '🎉 Seller Application Approved!',
            `Congratulations! Your shop "${shop.shop_name}" has been approved. You can now log in as a Seller and start selling.`,
            parseInt(req.params.id)
        );
        await addLog(shop.user_id, 'seller_approved', `Shop "${shop.shop_name}" approved by admin`);
        // ── Geocode shop address via Nominatim (non-blocking) ────────────────
        if (shop.address) {
            (async () => {
                try {
                    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(shop.address)}&format=json&limit=1`;
                    const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'JMGlassFurniture/1.0' } });
                    const geoData = await geoRes.json();
                    if (geoData?.[0]?.lat) {
                        await db.query(
                            'UPDATE shops SET latitude = ?, longitude = ? WHERE shop_id = ?',
                            [parseFloat(geoData[0].lat), parseFloat(geoData[0].lon), req.params.id]
                        );
                        console.log(`[Geocode] Shop #${req.params.id} "${shop.shop_name}" → ${geoData[0].lat}, ${geoData[0].lon}`);
                    } else {
                        console.warn(`[Geocode] No result for: "${shop.address}"`);
                    }
                } catch (geoErr) {
                    console.warn(`[Geocode] Failed for shop #${req.params.id}:`, geoErr.message);
                }
            })();
        }

        res.json({ success: true, message: 'Shop approved' });
    } catch (err) {
        await connection.rollback();
        console.error('Approve shop error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally { connection.release(); }
});

// ── PUT /api/admin/shops/:id/reject ──────────────────────────────────────────
router.put('/shops/:id/reject', async (req, res) => {
    const { reason } = req.body;
    try {
        const [[shop]] = await db.query(`SELECT s.user_id, s.shop_name FROM shops s WHERE s.shop_id = ?`, [req.params.id]);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        await db.query(`UPDATE shops SET status = 'rejected', rejection_reason = ? WHERE shop_id = ?`, [reason || null, req.params.id]);
        await createNotification(db, shop.user_id, 'system',
            'Seller Application Update',
            `Your application for "${shop.shop_name}" was not approved. Reason: ${reason || 'Does not meet requirements'}. You may re-apply with correct documents.`,
            parseInt(req.params.id)
        );
        await addLog(shop.user_id, 'seller_rejected', `Shop "${shop.shop_name}" rejected. Reason: ${reason || 'N/A'}`);

        res.json({ success: true, message: 'Shop rejected' });
    } catch (err) {
        console.error('Reject shop error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/logs ───────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
        const [logs] = await db.query(`
            SELECT l.id, l.action, l.details, l.created_at,
                   u.full_name, u.email, u.role
            FROM activity_logs l
            LEFT JOIN users u ON l.user_id = u.user_id
            ORDER BY l.created_at DESC
            LIMIT ?
        `, [limit]);
        res.json({ success: true, data: logs });
    } catch (err) {
        console.error('Admin logs error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/reports ────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
    const status = req.query.status || 'pending';
    try {
        const [rows] = await db.query(`
            SELECT r.id, r.issue_type, r.description, r.status, r.created_at,
                   u.full_name as reporter_name, u.email as reporter_email
            FROM reported_problems r
            LEFT JOIN users u ON r.user_id = u.user_id
            ${status !== 'all' ? 'WHERE r.status = ?' : ''}
            ORDER BY r.created_at DESC
        `, status !== 'all' ? [status] : []);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Admin reports error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/reports/:id/resolve ────────────────────────────────────────
router.put('/reports/:id/resolve', async (req, res) => {
    try {
        await db.query(`UPDATE reported_problems SET status = 'resolved' WHERE id = ?`, [req.params.id]);
        await addLog(null, 'report_resolved', `Report #${req.params.id} marked resolved`);
        res.json({ success: true });
    } catch (err) {
        console.error('Resolve report error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/products/:id/toggle ───────────────────────────────────────
router.put('/products/:id/toggle', async (req, res) => {
    try {
        const [[product]] = await db.query(`SELECT is_hidden, title FROM products WHERE product_id = ?`, [req.params.id]);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        const newVal = product.is_hidden ? 0 : 1;
        await db.query(`UPDATE products SET is_hidden = ? WHERE product_id = ?`, [newVal, req.params.id]);
        await addLog(null, newVal ? 'product_hidden' : 'product_unhidden',
            `Product "${product.title}" ${newVal ? 'hidden' : 'unhidden'} by admin`);
        res.json({ success: true, is_hidden: newVal });
    } catch (err) {
        console.error('Product toggle error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /api/admin/broadcast ─────────────────────────────────────────────────
router.post('/broadcast', async (req, res) => {
    const { title, message, target } = req.body; // target: 'all' | 'buyers' | 'sellers'
    try {
        let whereClause = "WHERE role != 'admin'";
        if (target === 'buyers') whereClause = "WHERE role = 'buyer'";
        if (target === 'sellers') whereClause = "WHERE role = 'seller'";
        const [users] = await db.query(`SELECT user_id FROM users ${whereClause}`);
        for (const u of users) {
            await createNotification(db, u.user_id, 'system', title, message, null);
        }
        await addLog(null, 'broadcast_sent', `Admin broadcast to ${target}: "${title}" (${users.length} users)`);
        res.json({ success: true, sent: users.length });
    } catch (err) {
        console.error('Broadcast error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/announcement ───────────────────────────────────────────────
router.get('/announcement', async (req, res) => {
    try {
        const [[row]] = await db.query(`SELECT value FROM platform_settings WHERE \`key\` = 'announcement'`);
        res.json({ success: true, announcement: row ? row.value : null });
    } catch (err) {
        res.json({ success: true, announcement: null });
    }
});

// ── POST /api/admin/announcement ─────────────────────────────────────────────
router.post('/announcement', async (req, res) => {
    const { text } = req.body;
    try {
        await db.query(`
            INSERT INTO platform_settings (\`key\`, value) VALUES ('announcement', ?)
            ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()
        `, [text, text]);
        await addLog(null, 'announcement_set', `Admin set announcement: "${text}"`);
        res.json({ success: true });
    } catch (err) {
        console.error('Set announcement error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── DELETE /api/admin/announcement ───────────────────────────────────────────
router.delete('/announcement', async (req, res) => {
    try {
        await db.query(`DELETE FROM platform_settings WHERE \`key\` = 'announcement'`);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete announcement error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/analytics/monthly ─────────────────────────────────────────
router.get('/analytics/monthly', async (req, res) => {
    try {
        const [monthly] = await db.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
                   SUM(total_amount) as revenue,
                   COUNT(*) as orders
            FROM orders WHERE status != 'cancelled'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month ASC
        `);
        res.json({ success: true, data: monthly });
    } catch (err) {
        console.error('Monthly analytics error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/profit ─────────────────────────────────────────────────────
router.get('/profit', async (req, res) => {
    try {
        // Summary totals from completed orders
        const [[summary]] = await db.query(`
            SELECT
                IFNULL(SUM(total_amount), 0)            AS grossVolume,
                IFNULL(SUM(commission_amount), 0)       AS totalCommission,
                IFNULL(SUM(transaction_fee_amount), 0)  AS totalGatewayFees,
                IFNULL(SUM(commission_amount) - SUM(transaction_fee_amount), 0) AS netProfit,
                COUNT(*)                                AS totalCompletedOrders
            FROM orders WHERE status = 'completed'
        `);

        // Monthly commission breakdown (last 12 months)
        const [monthly] = await db.query(`
            SELECT
                DATE_FORMAT(created_at, '%Y-%m')        AS month,
                IFNULL(SUM(commission_amount), 0)       AS revenue,
                IFNULL(SUM(transaction_fee_amount), 0)  AS fees,
                IFNULL(SUM(commission_amount) - SUM(transaction_fee_amount), 0) AS net,
                COUNT(*)                                AS orders
            FROM orders
            WHERE status = 'completed'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY month
            ORDER BY month ASC
        `);

        // Per-order transaction log (latest 100 completed)
        // Uses a subquery to get one shop per order, avoiding GROUP BY issues
        const [transactions] = await db.query(`
            SELECT
                o.order_id, o.total_amount, o.commission_rate,
                o.commission_amount, o.transaction_fee_amount,
                IFNULL(o.commission_amount - o.transaction_fee_amount, 0) AS net_profit,
                o.payment_method, o.status, o.created_at,
                u.full_name AS buyer_name,
                (
                    SELECT s2.shop_name FROM order_items oi2
                    LEFT JOIN shop_listings sl2 ON sl2.listing_id = oi2.listing_id
                    LEFT JOIN shops s2 ON s2.shop_id = sl2.shop_id
                    WHERE oi2.order_id = o.order_id
                    LIMIT 1
                ) AS shop_name
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            WHERE o.status = 'completed'
            ORDER BY o.created_at DESC
            LIMIT 100
        `);

        // Top shops by commission generated
        const [topShops] = await db.query(`
            SELECT
                s.shop_id, s.shop_name, u.full_name AS seller_name,
                IFNULL(SUM(o.commission_amount), 0) AS totalCommission,
                COUNT(DISTINCT o.order_id)           AS orderCount
            FROM order_items oi
            LEFT JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            LEFT JOIN shops s ON s.shop_id = sl.shop_id
            JOIN users u ON u.user_id = s.user_id
            JOIN orders o ON o.order_id = oi.order_id AND o.status = 'completed'
            WHERE s.shop_id IS NOT NULL
            GROUP BY s.shop_id, s.shop_name, u.full_name
            ORDER BY totalCommission DESC
            LIMIT 10
        `);

        // Pending payouts total
        const [[{ pendingPayouts }]] = await db.query(`
            SELECT IFNULL(SUM(amount), 0) AS pendingPayouts FROM payouts WHERE status = 'pending'
        `);

        // Current platform fee settings
        const [settingRows] = await db.query(`
            SELECT \`key\`, value FROM platform_settings
            WHERE \`key\` IN ('commission_rate','transaction_fee_pct','transaction_fee_fixed')
        `);
        const feeSettings = {};
        settingRows.forEach(row => { feeSettings[row.key] = row.value; });

        res.json({
            success: true,
            summary: {
                grossVolume: parseFloat(summary.grossVolume),
                totalCommission: parseFloat(summary.totalCommission),
                totalGatewayFees: parseFloat(summary.totalGatewayFees),
                netProfit: parseFloat(summary.netProfit),
                totalCompletedOrders: parseInt(summary.totalCompletedOrders),
                pendingPayouts: parseFloat(pendingPayouts),
            },
            monthly,
            transactions,
            topShops,
            feeSettings,
        });
    } catch (err) {
        console.error('Admin profit error:', err.message, err.sql || '');
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// ── GET /api/admin/gateway-fees ──────────────────────────────────────────────
router.get('/gateway-fees', async (req, res) => {
    try {
        // Summary
        const [[summary]] = await db.query(`
            SELECT
                IFNULL(SUM(transaction_fee_amount), 0)                         AS totalFees,
                IFNULL(SUM(transaction_fee_pct * total_amount / 100), 0)       AS totalPctFees,
                IFNULL(SUM(transaction_fee_fixed), 0)                          AS totalFixedFees,
                COUNT(*)                                                        AS totalOrders,
                IFNULL(AVG(transaction_fee_amount), 0)                         AS avgFeePerOrder,
                IFNULL(AVG(transaction_fee_amount / NULLIF(total_amount,0)*100),0) AS avgFeeRatePct
            FROM orders WHERE status = 'completed'
        `);

        // Fees by payment method
        const [byPaymentMethod] = await db.query(`
            SELECT
                IFNULL(payment_method, 'Unknown')      AS payment_method,
                COUNT(*)                               AS orderCount,
                IFNULL(SUM(transaction_fee_amount), 0) AS totalFees,
                IFNULL(AVG(transaction_fee_amount), 0) AS avgFee
            FROM orders
            WHERE status = 'completed'
            GROUP BY payment_method
            ORDER BY totalFees DESC
        `);

        // Monthly fee trend (last 12 months)
        const [monthly] = await db.query(`
            SELECT
                DATE_FORMAT(created_at, '%Y-%m')        AS month,
                IFNULL(SUM(transaction_fee_amount), 0)  AS revenue,
                COUNT(*)                                AS orders,
                IFNULL(AVG(transaction_fee_amount), 0)  AS avgFee
            FROM orders
            WHERE status = 'completed'
              AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY month
            ORDER BY month ASC
        `);

        // Per-order fee log (latest 100)
        const [transactions] = await db.query(`
            SELECT
                o.order_id, o.total_amount,
                o.transaction_fee_pct, o.transaction_fee_fixed, o.transaction_fee_amount,
                o.payment_method, o.created_at,
                u.full_name AS buyer_name,
                (
                    SELECT s2.shop_name FROM order_items oi2
                    LEFT JOIN shop_listings sl2 ON sl2.listing_id = oi2.listing_id
                    LEFT JOIN shops s2 ON s2.shop_id = sl2.shop_id
                    WHERE oi2.order_id = o.order_id LIMIT 1
                ) AS shop_name
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            WHERE o.status = 'completed'
            ORDER BY o.created_at DESC
            LIMIT 100
        `);

        res.json({
            success: true,
            summary: {
                totalFees: parseFloat(summary.totalFees),
                totalOrders: parseInt(summary.totalOrders),
                avgFeePerOrder: parseFloat(summary.avgFeePerOrder),
                avgFeeRatePct: parseFloat(summary.avgFeeRatePct),
            },
            byPaymentMethod,
            monthly,
            transactions,
        });
    } catch (err) {
        console.error('Gateway fees error:', err.message, err.sql || '');
        res.status(500).json({ success: false, message: 'Server error', detail: err.message });
    }
});

// ── GET /api/admin/handymen ───────────────────────────────────────────────────
router.get('/handymen', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT h.handyman_id, h.name, h.status, h.phone, h.created_at,
                   s.shop_name,
                   COUNT(DISTINCT oh.order_id) as active_orders
            FROM handymen h
            JOIN shops s ON h.shop_id = s.shop_id
            LEFT JOIN order_handymen oh ON oh.handyman_id = h.handyman_id
            LEFT JOIN orders o ON o.order_id = oh.order_id AND o.status NOT IN ('delivered','cancelled')
            GROUP BY h.handyman_id
            ORDER BY s.shop_name, h.name
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Admin handymen error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/delivery-men ───────────────────────────────────────────────
router.get('/delivery-men', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.delivery_man_id, u.full_name as name, d.status, u.phone, d.plate_number, d.created_at,
                   s.shop_name,
                   COUNT(DISTINCT o.order_id) as active_orders
            FROM delivery_men d
            JOIN users u ON d.user_id = u.user_id
            JOIN shops s ON d.shop_id = s.shop_id
            LEFT JOIN orders o ON o.delivery_man_id = d.delivery_man_id AND o.status IN ('processing', 'shipped')
            GROUP BY d.delivery_man_id
            ORDER BY s.shop_name, u.full_name
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Admin delivery men error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/custom-requests ───────────────────────────────────────────
router.get('/custom-requests', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT cr.request_id as id, cr.service_type as title, cr.details as description, cr.status, cr.budget, cr.created_at,
                   buyer.full_name as buyer_name, buyer.email as buyer_email,
                   seller.full_name as seller_name, s.shop_name
            FROM custom_requests cr
            JOIN users buyer ON cr.user_id = buyer.user_id
            LEFT JOIN shops s ON cr.shop_id = s.shop_id
            LEFT JOIN users seller ON s.user_id = seller.user_id
            ORDER BY cr.created_at DESC
            LIMIT 100
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Admin custom requests error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/payouts ───────────────────────────────────────────────────
router.get('/payouts', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.*, s.shop_name, u.full_name as seller_name, u.email as seller_email
            FROM payouts p
            JOIN shops s ON p.shop_id = s.shop_id
            JOIN users u ON s.user_id = u.user_id
            ORDER BY p.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Admin payouts error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/payouts/:id/approve ───────────────────────────────────────
router.put('/payouts/:id/approve', async (req, res) => {
    const { status, reference_number } = req.body;
    try {
        const [[payout]] = await db.query(`
            SELECT p.*, s.user_id, s.shop_name
            FROM payouts p JOIN shops s ON p.shop_id = s.shop_id
            WHERE p.payout_id = ?
        `, [req.params.id]);

        if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });

        await db.query(`
            UPDATE payouts 
            SET status = ?, processed_at = NOW() 
            WHERE payout_id = ?
        `, [status || 'completed', req.params.id]);

        // Optional: save reference_number if we add it to schema, or just logic

        await createNotification(db, payout.user_id, 'system',
            'Payout Processed',
            `Your payout request for ₱${parseFloat(payout.amount).toLocaleString('en-PH')} has been ${status || 'completed'}. ${reference_number ? 'Ref: ' + reference_number : ''}`,
            null
        );

        await addLog(payout.user_id, 'payout_processed', `Admin processed payout #${payout.payout_id} for ${payout.shop_name} (${status || 'completed'})`);

        res.json({ success: true });
    } catch (err) {
        console.error('Approve payout error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/disputes ─────────────────────────────────────────────────
router.get('/disputes', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT DISTINCT d.*,
                   o.total_amount, o.status as order_status,
                   u1.full_name as buyer_name, u1.email as buyer_email,
                   IFNULL(s.shop_name, 'N/A') AS shop_name,
                   u2.full_name as seller_name, u2.email as seller_email
            FROM disputes d
            JOIN orders o ON d.order_id = o.order_id
            JOIN users u1 ON o.user_id = u1.user_id
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            LEFT JOIN shops s ON s.shop_id = sl.shop_id
            LEFT JOIN users u2 ON s.user_id = u2.user_id
            ORDER BY d.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Admin disputes error:', err);
        // If disputes table doesn't exist yet, return empty array instead of 500
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.json({ success: true, data: [] });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/disputes/:id/resolve ─────────────────────────────────────
router.put('/disputes/:id/resolve', async (req, res) => {
    const { action, resolution_notes } = req.body; // action: 'refund_buyer' or 'release_funds'
    try {
        const [[dispute]] = await db.query(`
            SELECT d.*, o.user_id as buyer_id,
                   IFNULL(s.user_id, NULL) as seller_id, o.total_amount
            FROM disputes d
            JOIN orders o ON d.order_id = o.order_id
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            LEFT JOIN shops s ON s.shop_id = sl.shop_id
            WHERE d.dispute_id = ?
            LIMIT 1
        `, [req.params.id]);

        if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

        const status = action === 'refund_buyer' ? 'refunded' : 'rejected';
        const orderStatus = action === 'refund_buyer' ? 'refunded' : 'completed';

        // Update dispute
        await db.query(`
            UPDATE disputes 
            SET status = ?, resolution_notes = ?, resolved_at = NOW() 
            WHERE dispute_id = ?
        `, [status, resolution_notes, req.params.id]);

        // Update order status if refund happened
        await db.query(`UPDATE orders SET status = ? WHERE order_id = ?`, [orderStatus, dispute.order_id]);

        // Notify Buyer
        await createNotification(db, dispute.buyer_id, 'order',
            `Dispute ${status === 'refunded' ? 'Approved' : 'Denied'}`,
            `Your dispute for Order #${dispute.order_id} has been resolved. ${resolution_notes || ''}`,
            null
        );

        // Notify Seller
        await createNotification(db, dispute.seller_id, 'system',
            `Dispute Resolved (Order #${dispute.order_id})`,
            `The dispute has been resolved. Action taken: ${action === 'refund_buyer' ? 'Funds fully refunded to buyer' : 'Funds released to your shop'}.`,
            null
        );

        await addLog(dispute.buyer_id, 'dispute_resolved', `Admin resolved dispute #${req.params.id} (${action})`);

        res.json({ success: true });
    } catch (err) {
        console.error('Resolve dispute error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── DYNAMIC CMS ─────────────────────────────────────────────────────────────

// Get all banners
router.get('/cms/carousel', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM carousel_banners ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add a banner
router.post('/cms/carousel', async (req, res) => {
    const { image_url, link_url } = req.body;
    try {
        await db.query('INSERT INTO carousel_banners (image_url, link_url) VALUES (?, ?)', [image_url, link_url || null]);
        await addLog(req.user?.id || 1, 'cms_banner_added', `Added new carousel banner image`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete a banner
router.delete('/cms/carousel/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM carousel_banners WHERE banner_id = ?', [req.params.id]);
        await addLog(req.user?.id || 1, 'cms_banner_deleted', `Deleted carousel banner #${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get Categories
router.get('/cms/categories', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM categories ORDER BY name ASC');
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add Category
router.post('/cms/categories', async (req, res) => {
    const { name, icon_name } = req.body;
    try {
        await db.query('INSERT INTO categories (name, icon_name) VALUES (?, ?)', [name, icon_name || 'grid-outline']);
        await addLog(req.user?.id || 1, 'cms_category_added', `Added category: ${name}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete Category
router.delete('/cms/categories/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM categories WHERE category_id = ?', [req.params.id]);
        await addLog(req.user?.id || 1, 'cms_category_deleted', `Deleted category #${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error. Make sure no products are using this category.' });
    }
});

// ── VOUCHERS / PROMOTIONS ───────────────────────────────────────────────────

router.get('/vouchers', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vouchers ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [] });
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/vouchers', async (req, res) => {
    const { code, discount_type, discount_value, min_spend, max_discount, usage_limit, start_date, end_date } = req.body;
    try {
        await db.query(`
            INSERT INTO vouchers (code, discount_type, discount_value, min_spend, max_discount, usage_limit, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            code.toUpperCase(), discount_type || 'percentage', discount_value,
            min_spend || 0, max_discount || null, usage_limit || null,
            start_date || null, end_date || null
        ]);

        await addLog(req.user?.id || 1, 'voucher_created', `Generated new promo code: ${code.toUpperCase()}`);
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Voucher code already exists' });
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.put('/vouchers/:id/toggle', async (req, res) => {
    try {
        await db.query(`UPDATE vouchers SET is_active = NOT is_active WHERE voucher_id = ?`, [req.params.id]);
        await addLog(req.user?.id || 1, 'voucher_toggled', `Toggled active status for voucher #${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/vouchers/:id', async (req, res) => {
    try {
        await db.query(`DELETE FROM vouchers WHERE voucher_id = ?`, [req.params.id]);
        await addLog(req.user?.id || 1, 'voucher_deleted', `Deleted voucher #${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/admin/platform-settings ─────────────────────────────────────────
// Returns all key-value pairs as a flat object { key: value }
router.get('/platform-settings', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT \`key\`, value FROM platform_settings`);
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        res.json({ success: true, data: settings });
    } catch (err) {
        console.error('Get platform settings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── PUT /api/admin/platform-settings ─────────────────────────────────────────
// Body: { settings: { key: value, ... } }  — upserts each setting
router.put('/platform-settings', async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ success: false, message: 'settings object required' });
    }
    try {
        const entries = Object.entries(settings);
        for (const [key, value] of entries) {
            await db.query(
                `INSERT INTO platform_settings (\`key\`, value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
                [key, value, value]
            );
        }
        await addLog(null, 'platform_settings_updated', `Admin updated: ${Object.keys(settings).join(', ')}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Update platform settings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /api/admin/announcement ─── (already exists above, kept for reference)
// ── GET /api/admin/maintenance-stats ─────────────────────────────────────────
router.get('/maintenance-stats', async (req, res) => {
    try {
        const [[{ totalProducts }]] = await db.query(`SELECT COUNT(*) as totalProducts FROM products WHERE is_active = 1`);
        const [[{ totalShops }]] = await db.query(`SELECT COUNT(*) as totalShops FROM shops WHERE status = 'active'`);
        const [[{ pendingOrders }]] = await db.query(`SELECT COUNT(*) as pendingOrders FROM orders WHERE status = 'pending'`);
        res.json({ success: true, data: { totalProducts, totalShops, pendingOrders } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// ── POST /api/admin/reset-data ───────────────────────────────────────────────
// Wipes all non-admin data. Requires { confirm: "RESET" } in body.
router.post('/reset-data', async (req, res) => {
    if (req.body?.confirm !== 'RESET') {
        return res.status(400).json({ success: false, message: 'Send { confirm: "RESET" } to proceed.' });
    }
    const TRUNCATE_TABLES = [
        'points_transactions', 'user_points', 'stock_alerts', 'user_vouchers',
        'disputes', 'payouts', 'reported_problems', 'reviews',
        'order_items', 'orders', 'cart_items', 'favorites',
        'notifications', 'messages', 'custom_requests', 'user_addresses',
        'activity_logs', 'product_images', 'products', 'handymen', 'shops',
    ];
    const OPTIONAL = ['seller_applications', 'flash_sales', 'referral_codes', 'payment_methods'];
    try {
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const tbl of [...TRUNCATE_TABLES, ...OPTIONAL]) {
            const [[{ cnt }]] = await db.query(
                `SELECT COUNT(*) AS cnt FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = ?`, [tbl]
            );
            if (cnt > 0) await db.query(`TRUNCATE TABLE \`${tbl}\``);
        }
        const [result] = await db.query(`DELETE FROM users WHERE role != 'admin'`);
        await db.query('SET FOREIGN_KEY_CHECKS = 1');

        // Delete uploaded files
        const fs = require('fs');
        const path = require('path');
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        let fileCount = 0;
        if (fs.existsSync(uploadsDir)) {
            const walk = (dir) => {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, e.name);
                    if (e.isDirectory()) walk(full);
                    else { fs.unlinkSync(full); fileCount++; }
                }
            };
            walk(uploadsDir);
        }

        await addLog(null, 'system_reset', `Admin triggered full data reset. Deleted ${result.affectedRows} users, ${fileCount} uploaded files.`);

        res.json({
            success: true,
            message: 'All non-admin data has been reset.',
            deletedUsers: result.affectedRows,
            deletedFiles: fileCount,
        });
    } catch (err) {
        await db.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => { });
        console.error('Reset data error:', err.message);
        res.status(500).json({ success: false, message: 'Reset failed', detail: err.message });
    }
});

module.exports = router;



