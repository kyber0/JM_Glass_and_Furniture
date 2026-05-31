/**
 * reset_data.js — Wipes all non-admin data from jm_glass_db.
 *
 * USAGE:  node reset_data.js   (or: npm run reset)
 *
 * KEEPS:  admin users, platform_settings, categories,
 *         carousel_banners, vouchers, faqs
 *
 * DELETES: all orders, products, shops, non-admin users,
 *          messages, reviews, uploads, and all transactional data.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Reuse the same pool the server uses — no credential mismatch possible
const db = require('./config/db');

const TRUNCATE_TABLES = [
    'points_transactions',
    'user_points',
    'stock_alerts',
    'user_vouchers',
    'disputes',
    'payouts',
    'reported_problems',
    'reviews',
    'order_items',
    'orders',
    'cart_items',
    'favorites',
    'notifications',
    'messages',
    'custom_requests',
    'user_addresses',
    'activity_logs',
    'product_images',
    'products',
    'handymen',
    'shops',
];

const OPTIONAL_TRUNCATE = [
    'seller_applications',
    'flash_sales',
    'referral_codes',
    'in_stock_alerts',
    'payment_methods',
];

async function tableExists(tableName) {
    const [[{ cnt }]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?`,
        [tableName]
    );
    return cnt > 0;
}

async function truncate(tableName) {
    if (!(await tableExists(tableName))) {
        console.log(`  ⏭  ${tableName} — skipped (table does not exist)`);
        return;
    }
    await db.query(`TRUNCATE TABLE \`${tableName}\``);
    console.log(`  ✅ ${tableName} — truncated`);
}

async function deleteUploads() {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        console.log('  ⏭  uploads/ folder not found — skipped');
        return;
    }
    let count = 0;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else { fs.unlinkSync(full); count++; }
        }
    };
    walk(uploadsDir);
    console.log(`  ✅ uploads/ — deleted ${count} file(s)`);
}

async function main() {
    console.log('\n🔴  JM Glass & Furniture — DATA RESET\n');
    console.log('  Keeps:   admin accounts, settings, categories, CMS, vouchers, FAQs');
    console.log('  Deletes: all orders, products, shops, users (non-admin), uploads\n');
    console.log('  Starting in 3 seconds… (Ctrl+C to cancel)\n');
    await new Promise(r => setTimeout(r, 3000));

    try {
        await db.query('SET FOREIGN_KEY_CHECKS = 0');

        console.log('─── Transactional tables ────────────────────────────────');
        for (const tbl of TRUNCATE_TABLES) await truncate(tbl);

        console.log('\n─── Optional tables ─────────────────────────────────────');
        for (const tbl of OPTIONAL_TRUNCATE) await truncate(tbl);

        console.log('\n─── Non-admin users ─────────────────────────────────────');
        const [result] = await db.query(`DELETE FROM users WHERE role != 'admin'`);
        console.log(`  ✅ users — deleted ${result.affectedRows} non-admin user(s)`);

        // Record reset timestamp so the app can clear local caches (AsyncStorage)
        const now = new Date().toISOString();
        await db.query(`
            INSERT INTO platform_settings (\`key\`, value) VALUES ('last_reset_at', ?)
            ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()
        `, [now, now]);
        console.log(`  ✅ platform_settings.last_reset_at = ${now}`);

        await db.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('\n─── Uploaded files ──────────────────────────────────────');
        await deleteUploads();

        console.log('\n✅  Data reset complete!');
        console.log('    Admin accounts, settings, categories, CMS, vouchers');
        console.log('    and FAQs are all preserved.\n');

    } catch (err) {
        await db.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => { });
        console.error('\n❌  Reset failed:', err.message);
        process.exit(1);
    }

    process.exit(0);
}

main();
