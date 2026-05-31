const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // Check/add shops.status column
    const [cols] = await c.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='shops' AND COLUMN_NAME='status'`,
        [process.env.DB_NAME]
    );
    if (cols.length === 0) {
        await c.query(`ALTER TABLE shops ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'`);
        console.log('[OK] shops.status column added');
    } else {
        console.log('[SKIP] shops.status already exists');
    }

    // Create the shop-ids upload folder
    const uploadDir = path.join(__dirname, '../../uploads/shop-ids');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('[OK] uploads/shop-ids/ folder created');
    } else {
        console.log('[SKIP] uploads/shop-ids/ folder already exists');
    }

    await c.end();
    console.log('Done!');
})().catch(e => { console.error(e.message); process.exit(1); });
