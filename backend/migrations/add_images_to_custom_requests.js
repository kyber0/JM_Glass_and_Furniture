/**
 * Migration: Add `images` column to `custom_requests` table
 * Stores a JSON array of uploaded image paths for each custom request.
 */
const db = require('../config/db');

async function up() {
    // Check if column already exists to make this migration idempotent
    const [cols] = await db.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'custom_requests'
          AND COLUMN_NAME  = 'images'
    `);

    if (cols.length > 0) {
        console.log('✅ Column `images` already exists in `custom_requests`. Skipping.');
        return;
    }

    await db.query(`
        ALTER TABLE custom_requests
        ADD COLUMN images JSON NULL DEFAULT NULL
        AFTER service_type
    `);

    console.log('✅ Added `images` column to `custom_requests` successfully.');
}

up()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    });
