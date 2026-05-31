/**
 * Migration: add service_types to shop_listings
 * Run once: node backend/scripts/add_service_types_to_listings.js
 */
const db = require('../config/db');

(async () => {
    try {
        // Check if column already exists
        const [cols] = await db.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'shop_listings'
              AND COLUMN_NAME  = 'service_types'
        `);
        if (cols.length > 0) {
            console.log('ℹ️  service_types column already exists — skipping');
            process.exit(0);
        }

        await db.query(`
            ALTER TABLE shop_listings
            ADD COLUMN service_types VARCHAR(100) NOT NULL DEFAULT 'delivery'
            AFTER stock_quantity
        `);
        console.log('✅  service_types column added to shop_listings');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('ℹ️  service_types column already exists — skipping');
        } else {
            console.error('❌  Migration failed:', err.message);
            process.exit(1);
        }
    } finally {
        process.exit(0);
    }
})();
