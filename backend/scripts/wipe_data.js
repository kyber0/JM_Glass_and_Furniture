/**
 * backend/scripts/wipe_data.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wipes all transactional / user data from the database EXCEPT:
 *   • The admin user row (user_id = 5, admin123@gmail.com)
 *   • Products created by the admin (created_by = 5)
 *   • Product meta rows that belong to those admin products
 *     (product_images, product_colors, product_sizes, product_specs)
 *   • Catalog / config tables: categories, fee_config, platform_settings,
 *     vehicle_tiers, shipping_zones, faqs, carousel_banners
 *
 * Run: node --env-file=backend/.env backend/scripts/wipe_data.js
 */

const db = require('../config/db');

const ADMIN_USER_ID = 5; // admin123@gmail.com

async function wipe() {
    const conn = await db.getConnection();
    try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('⚠️  Foreign key checks OFF');

        // ── 1. Transactional tables — full truncate ───────────────────────
        const FULL_TRUNCATE = [
            'activity_logs',
            'cart_items',
            'custom_request_images',
            'custom_requests',
            'disputes',
            'distance_cache',
            'favorites',
            'messages',
            'notifications',
            'order_handymen',
            'order_items',
            'orders',
            'payment_installments',
            'payouts',
            'points_transactions',
            'reported_problems',
            'review_tags',
            'reviews',
            'stock_alerts',
            'user_addresses',
            'user_points',
            'user_vouchers',
            'vouchers',
        ];

        for (const t of FULL_TRUNCATE) {
            await conn.query(`TRUNCATE TABLE \`${t}\``);
            console.log(`✅  Truncated: ${t}`);
        }

        // ── 2. Workers / staff — remove non-admin shop staff ─────────────
        // These reference shop_id, which we're also wiping
        await conn.query('TRUNCATE TABLE handymen');
        await conn.query('TRUNCATE TABLE delivery_men');
        await conn.query('TRUNCATE TABLE payment_methods');
        console.log('✅  Truncated: handymen, delivery_men, payment_methods');

        // ── 3. Shop listings — remove all (admin has no shop, just products) ─
        await conn.query('TRUNCATE TABLE listing_colors');
        await conn.query('TRUNCATE TABLE shop_listings');
        await conn.query('TRUNCATE TABLE shops');
        console.log('✅  Truncated: shop_listings, listing_colors, shops');

        // ── 4. Products — delete only non-admin products and their meta ───
        // First collect admin product IDs to keep
        const [adminProducts] = await conn.query(
            'SELECT product_id FROM products WHERE created_by = ?', [ADMIN_USER_ID]
        );
        const keepIds = adminProducts.map(p => p.product_id);
        console.log(`ℹ️   Keeping ${keepIds.length} admin product(s):`, keepIds);

        if (keepIds.length > 0) {
            const placeholders = keepIds.map(() => '?').join(',');
            // Delete product meta for NON-admin products
            await conn.query(`DELETE FROM product_images WHERE product_id NOT IN (${placeholders})`, keepIds);
            await conn.query(`DELETE FROM product_colors WHERE product_id NOT IN (${placeholders})`, keepIds);
            await conn.query(`DELETE FROM product_sizes  WHERE product_id NOT IN (${placeholders})`, keepIds);
            await conn.query(`DELETE FROM product_specs  WHERE product_id NOT IN (${placeholders})`, keepIds);
            await conn.query(`DELETE FROM products       WHERE product_id NOT IN (${placeholders})`, keepIds);
        } else {
            // No admin products — truncate everything
            await conn.query('TRUNCATE TABLE product_images');
            await conn.query('TRUNCATE TABLE product_colors');
            await conn.query('TRUNCATE TABLE product_sizes');
            await conn.query('TRUNCATE TABLE product_specs');
            await conn.query('TRUNCATE TABLE products');
        }
        console.log('✅  Non-admin products and their meta removed');

        // ── 5. Users — delete everyone except the admin ───────────────────
        await conn.query('DELETE FROM users WHERE user_id != ?', [ADMIN_USER_ID]);
        console.log(`✅  All users deleted except admin (user_id=${ADMIN_USER_ID})`);

        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅  Foreign key checks restored');
        console.log('\n🎉  Database wipe complete. Admin + admin products preserved.');
    } catch (e) {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        console.error('❌  Wipe failed:', e.message);
        throw e;
    } finally {
        conn.release();
        process.exit(0);
    }
}

wipe();
