/**
 * Migration: Add Estimated Delivery Date columns
 * Run once: node backend/scripts/migrate_edd.js
 */
const db = require('../config/db');

async function run() {
    const conn = await db.getConnection();
    try {
        // orders table
        const [[ordersCheck]] = await conn.query(`
            SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'orders'
              AND COLUMN_NAME  = 'estimated_delivery_date'
        `);
        if (ordersCheck.cnt === 0) {
            await conn.query(`
                ALTER TABLE orders
                    ADD COLUMN estimated_delivery_date DATE NULL AFTER completed_at,
                    ADD COLUMN edd_extended TINYINT(1) NOT NULL DEFAULT 0 AFTER estimated_delivery_date
            `);
            console.log('✅  estimated_delivery_date + edd_extended added to orders');
        } else {
            console.log('ℹ️  orders columns already exist — skipping');
        }

        // custom_requests table
        const [[crCheck]] = await conn.query(`
            SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'custom_requests'
              AND COLUMN_NAME  = 'estimated_completion_date'
        `);
        if (crCheck.cnt === 0) {
            await conn.query(`
                ALTER TABLE custom_requests
                    ADD COLUMN estimated_completion_date DATE NULL
            `);
            console.log('✅  estimated_completion_date added to custom_requests');
        } else {
            console.log('ℹ️  custom_requests column already exists — skipping');
        }

        console.log('✅  Migration complete.');
    } catch (e) {
        console.error('❌  Migration failed:', e.message);
    } finally {
        conn.release();
        process.exit(0);
    }
}

run();
