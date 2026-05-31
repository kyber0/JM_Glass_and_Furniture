/**
 * Points System DB Migration
 * Run: node backend/scripts/migrate_points.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });

    console.log('Connected. Running points migration...');

    // 1. user_points table
    await conn.query(`
        CREATE TABLE IF NOT EXISTS user_points (
            user_id    INT PRIMARY KEY,
            balance    INT NOT NULL DEFAULT 0,
            lifetime   INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
    `);
    console.log('[OK] user_points table');

    // 2. points_transactions table
    await conn.query(`
        CREATE TABLE IF NOT EXISTS points_transactions (
            txn_id     INT AUTO_INCREMENT PRIMARY KEY,
            user_id    INT NOT NULL,
            order_id   INT NULL,
            type       ENUM('earn','redeem','reverse') NOT NULL,
            points     INT NOT NULL,
            note       VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)  REFERENCES users(user_id),
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        )
    `);
    console.log('[OK] points_transactions table');

    // 3. Add columns to orders (safe check)
    const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
           AND COLUMN_NAME IN ('points_redeemed','points_earned')`,
        [process.env.DB_NAME]
    );
    const existingCols = cols.map(c => c.COLUMN_NAME);

    if (!existingCols.includes('points_redeemed')) {
        await conn.query(`ALTER TABLE orders ADD COLUMN points_redeemed INT NOT NULL DEFAULT 0`);
        console.log('[OK] orders.points_redeemed added');
    } else {
        console.log('[SKIP] orders.points_redeemed already exists');
    }

    if (!existingCols.includes('points_earned')) {
        await conn.query(`ALTER TABLE orders ADD COLUMN points_earned INT NOT NULL DEFAULT 0`);
        console.log('[OK] orders.points_earned added');
    } else {
        console.log('[SKIP] orders.points_earned already exists');
    }

    await conn.end();
    console.log('\n✅ Points migration complete!');
}

run().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
