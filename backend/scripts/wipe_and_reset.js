/**
 * wipe_and_reset.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wipes ALL application data except admin user accounts.
 * Run ONCE before applying the catalog-model migration.
 *
 *   node backend/scripts/wipe_and_reset.js
 *
 * ⚠️  THIS IS IRREVERSIBLE — take a mysqldump backup first!
 */

const db = require('../config/db');

async function run() {
    console.log('\n⚠️  STARTING FULL DATA WIPE — non-admin data will be deleted.\n');

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Disable FK checks so we can truncate in any order
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        const tablesToWipe = [
            // Order & payment data
            'payment_installments',
            'order_items',
            'orders',
            'payouts',

            // Cart & favorites
            'cart_items',
            'favorites',

            // Reviews & ratings
            'reviews',

            // Products & catalog
            'product_images',
            'product_colors',
            'product_sizes',
            'product_specs',
            'products',

            // Shop & sellers
            'shop_listings',      // new table (may not exist yet — safe to ignore)
            'listing_colors',     // new table (may not exist yet — safe to ignore)
            'order_handymen',
            'handymen',
            'shops',

            // Custom requests
            'custom_requests',

            // Notifications & messages
            'notifications',
            'messages',

            // Points & vouchers
            'points_transactions',
            'user_points',
            'user_vouchers',
            'vouchers',

            // Addresses & payment methods
            'addresses',
            'payment_methods',

            // Stock alerts
            'stock_alerts',

            // Misc
            'reports',
            'disputes',
        ];

        for (const table of tablesToWipe) {
            try {
                await conn.query(`TRUNCATE TABLE \`${table}\``);
                console.log(`  ✅ Truncated: ${table}`);
            } catch (err) {
                // Table may not exist yet (e.g., shop_listings before migration)
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    console.log(`  ⏭️  Skipped (not found): ${table}`);
                } else {
                    throw err;
                }
            }
        }

        // Wipe non-admin users
        const [adminResult] = await conn.query(`DELETE FROM users WHERE role != 'admin'`);
        console.log(`  ✅ Removed ${adminResult.affectedRows} non-admin user(s) from users table`);

        // Re-enable FK checks
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        await conn.commit();
        console.log('\n✅ Wipe complete. Admin credentials preserved.\n');
    } catch (err) {
        await conn.rollback();
        await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
        console.error('\n❌ Wipe failed — rolled back:', err.message);
        process.exit(1);
    } finally {
        conn.release();
        process.exit(0);
    }
}

run();
