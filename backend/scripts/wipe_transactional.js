/**
 * backend/scripts/wipe_transactional.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wipes all transactional / demo data WHILE PRESERVING:
 *   • ALL users (admin, sellers, customer, workers – all login credentials)
 *   • All 3 shops (Cristo Rey, Buluang Bato, Sagrada Baao)
 *   • handymen & delivery_men table rows (worker → shop assignments)
 *   • Products created by admin (created_by = 5) and their meta
 *   • Catalog / config tables (categories, vehicle_tiers, etc.)
 *
 * WIPED (full reset):
 *   orders, order_items, order_handymen, cart_items,
 *   messages, notifications, points_transactions, user_points,
 *   user_vouchers, vouchers, reviews, review_tags,
 *   custom_requests, custom_request_images, disputes,
 *   reported_problems, activity_logs, favorites,
 *   stock_alerts, payment_installments, payouts,
 *   user_addresses, payment_methods, distance_cache,
 *   shop_listings, listing_colors  (sellers re-list fresh)
 *   non-admin products + their meta
 *
 * Run:
 *   node backend/scripts/wipe_transactional.js
 */

require('dotenv').config();
const db = require('../config/db');

const ADMIN_USER_ID = 5; // admin123@gmail.com

async function wipe() {
    const conn = await db.getConnection();
    try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('⚠️  Foreign key checks OFF\n');

        // ── 1. Full-truncate transactional tables ─────────────────────────
        const TRUNCATE = [
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
            'payment_methods',
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

        for (const t of TRUNCATE) {
            await conn.query(`TRUNCATE TABLE \`${t}\``);
            console.log(`✅  Truncated: ${t}`);
        }

        // ── 2. Shop listings — wipe so sellers can re-list fresh ──────────
        await conn.query('TRUNCATE TABLE listing_colors');
        await conn.query('TRUNCATE TABLE shop_listings');
        console.log('✅  Truncated: shop_listings, listing_colors');

        // ── 3. Products — keep only admin products, wipe the rest ─────────
        const [adminProducts] = await conn.query(
            'SELECT product_id FROM products WHERE created_by = ?', [ADMIN_USER_ID]
        );
        const keepIds = adminProducts.map(p => p.product_id);
        console.log(`\nℹ️   Keeping ${keepIds.length} admin product(s): [${keepIds.join(', ')}]`);

        if (keepIds.length > 0) {
            const ph = keepIds.map(() => '?').join(',');
            await conn.query(`DELETE FROM product_images WHERE product_id NOT IN (${ph})`, keepIds);
            await conn.query(`DELETE FROM product_colors WHERE product_id NOT IN (${ph})`, keepIds);
            await conn.query(`DELETE FROM product_sizes  WHERE product_id NOT IN (${ph})`, keepIds);
            await conn.query(`DELETE FROM product_specs  WHERE product_id NOT IN (${ph})`, keepIds);
            await conn.query(`DELETE FROM products       WHERE product_id NOT IN (${ph})`, keepIds);
        } else {
            // No admin products found — wipe everything
            await conn.query('TRUNCATE TABLE product_images');
            await conn.query('TRUNCATE TABLE product_colors');
            await conn.query('TRUNCATE TABLE product_sizes');
            await conn.query('TRUNCATE TABLE product_specs');
            await conn.query('TRUNCATE TABLE products');
        }
        console.log('✅  Non-admin products and their meta removed');

        // ── 4. Preserved (logged for confirmation) ────────────────────────
        const [users]   = await conn.query('SELECT user_id, full_name, email, role FROM users ORDER BY user_id');
        const [shops]   = await conn.query('SELECT shop_id, shop_name FROM shops');
        const [hmCount] = await conn.query('SELECT COUNT(*) AS c FROM handymen');
        const [dmCount] = await conn.query('SELECT COUNT(*) AS c FROM delivery_men');

        console.log('\n─── PRESERVED ───────────────────────────────────────────');
        console.log('Users kept:');
        users.forEach(u => console.log(`  [${u.user_id}] ${u.full_name} (${u.role}) – ${u.email}`));
        console.log('\nShops kept:');
        shops.forEach(s => console.log(`  [${s.shop_id}] ${s.shop_name}`));
        console.log(`\nHandymen records: ${hmCount[0].c}`);
        console.log(`Delivery men records: ${dmCount[0].c}`);
        console.log(`Admin products kept: ${keepIds.length} (IDs: ${keepIds.join(', ')})`);

        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('\n✅  Foreign key checks restored');
        console.log('🎉  Database wipe complete!');

    } catch (e) {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        console.error('\n❌  Wipe failed:', e.message);
        throw e;
    } finally {
        conn.release();
        process.exit(0);
    }
}

wipe();
