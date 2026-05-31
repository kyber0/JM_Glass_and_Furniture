const db = require('./config/db');

async function addColumnIfMissing(col, type) {
    const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
        [col]
    );
    if (rows.length === 0) {
        await db.query(`ALTER TABLE orders ADD COLUMN ${col} ${type}`);
        console.log(`✅ Added column: ${col}`);
    } else {
        console.log(`ℹ️  Column already exists: ${col}`);
    }
}

async function run() {
    try {
        await addColumnIfMissing('processed_at', 'DATETIME NULL DEFAULT NULL');
        await addColumnIfMissing('shipped_at',   'DATETIME NULL DEFAULT NULL');
        await addColumnIfMissing('delivered_at', 'DATETIME NULL DEFAULT NULL');
        await addColumnIfMissing('completed_at', 'DATETIME NULL DEFAULT NULL');
        console.log('✅ Migration complete');
    } catch (e) {
        console.error('❌ Migration failed:', e.message);
    } finally {
        process.exit();
    }
}
run();
