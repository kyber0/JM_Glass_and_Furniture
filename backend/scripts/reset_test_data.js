/**
 * reset_test_data.js
 * Clears all transactional / test data from the database.
 * KEEPS: users, shops, products, categories, config tables.
 * CLEARS: orders, cart, custom_requests, notifications, messages,
 *         reviews, disputes, favorites, points, payouts, activity_logs
 */

const db = require('../config/db');

const TABLES_TO_TRUNCATE = [
    // Must go first (children before parents)
    'order_handymen',
    'order_items',
    'payment_installments',
    'orders',
    'cart_items',
    'custom_request_images',
    'custom_requests',
    'notifications',
    'messages',
    'review_tags',
    'reviews',
    'disputes',
    'reported_problems',
    'favorites',
    'user_vouchers',
    'points_transactions',
    'user_points',
    'payouts',
    'activity_logs',
    'stock_alerts',
];

const RESET_QUERIES = [
    'UPDATE products SET sold_count = 0',
    'UPDATE vouchers SET used_count = 0',
];

async function run() {
    const conn = await db.getConnection();
    try {
        console.log('\n🔴  JM Glass & Furniture — Database Reset');
        console.log('─'.repeat(50));

        // Disable FK checks so we can truncate in any order
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('✓  Foreign key checks disabled\n');

        // Truncate transactional tables
        for (const table of TABLES_TO_TRUNCATE) {
            await conn.query(`TRUNCATE TABLE \`${table}\``);
            console.log(`  🗑  Truncated: ${table}`);
        }

        // Re-enable FK checks
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('\n✓  Foreign key checks re-enabled\n');

        // Reset counters
        for (const sql of RESET_QUERIES) {
            const [result] = await conn.query(sql);
            console.log(`  🔄  ${sql}  (${result.affectedRows} rows)`);
        }

        // Verification summary
        console.log('\n─'.repeat(50));
        console.log('📊  Verification Summary\n');

        const checks = [
            ['users',         'SELECT COUNT(*) AS n FROM users'],
            ['shops',         'SELECT COUNT(*) AS n FROM shops'],
            ['products',      'SELECT COUNT(*) AS n FROM products'],
            ['shop_listings', 'SELECT COUNT(*) AS n FROM shop_listings'],
            ['orders',        'SELECT COUNT(*) AS n FROM orders'],
            ['custom_requests','SELECT COUNT(*) AS n FROM custom_requests'],
            ['notifications', 'SELECT COUNT(*) AS n FROM notifications'],
            ['cart_items',    'SELECT COUNT(*) AS n FROM cart_items'],
            ['reviews',       'SELECT COUNT(*) AS n FROM reviews'],
            ['user_points',   'SELECT COUNT(*) AS n FROM user_points'],
        ];

        for (const [label, sql] of checks) {
            const [[row]] = await conn.query(sql);
            const icon = ['orders','custom_requests','notifications','cart_items','reviews','user_points'].includes(label)
                ? (row.n === 0 ? '✅' : '⚠️ ')
                : '✅';
            console.log(`  ${icon}  ${label.padEnd(20)} ${row.n} rows`);
        }

        console.log('\n🎉  Reset complete! The database is clean and ready.\n');
        process.exit(0);
    } catch (err) {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        console.error('\n❌  Reset FAILED:', err.message);
        process.exit(1);
    } finally {
        conn.release();
    }
}

run();
