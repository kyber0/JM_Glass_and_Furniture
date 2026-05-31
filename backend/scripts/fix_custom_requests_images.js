/**
 * Fix: Adds the `images` JSON column to custom_requests if it doesn't exist.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'jm_glass_db',
        port: Number(process.env.DB_PORT) || 3306,
    });

    try {
        // 1. Show current columns
        const [cols] = await conn.query('SHOW COLUMNS FROM custom_requests');
        console.log('\nCurrent columns in custom_requests:');
        cols.forEach(c => console.log(' -', c.Field, '|', c.Type));

        // 2. Check if `images` already exists
        const hasImages = cols.some(c => c.Field === 'images');
        if (hasImages) {
            console.log('\n✅ Column `images` already exists. No action needed.');
        } else {
            await conn.query(`
                ALTER TABLE custom_requests
                ADD COLUMN images JSON NULL DEFAULT NULL
                AFTER service_type
            `);
            console.log('\n✅ Successfully added `images` column to custom_requests!');
        }

        // 3. Confirm final state
        const [finalCols] = await conn.query('SHOW COLUMNS FROM custom_requests');
        console.log('\nFinal columns:');
        finalCols.forEach(c => console.log(' -', c.Field, '|', c.Type));

    } finally {
        await conn.end();
    }
})().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
