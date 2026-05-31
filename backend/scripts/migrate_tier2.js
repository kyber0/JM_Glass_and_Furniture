/**
 * Tier 2 DB Migration — MySQL 5.7+ compatible
 * Run once from the backend folder: node scripts/migrate_tier2.js
 */
const db = require('../config/db');

async function columnExists(table, column) {
    const [[row]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return row.cnt > 0;
}

async function migrate() {
    console.log('Starting Tier 2 migration...\n');

    // reviews: seller_reply
    if (!await columnExists('reviews', 'seller_reply')) {
        await db.query('ALTER TABLE reviews ADD COLUMN seller_reply TEXT NULL');
        console.log('+ reviews.seller_reply added');
    } else { console.log('- reviews.seller_reply already exists'); }

    if (!await columnExists('reviews', 'replied_at')) {
        await db.query('ALTER TABLE reviews ADD COLUMN replied_at TIMESTAMP NULL');
        console.log('+ reviews.replied_at added');
    } else { console.log('- reviews.replied_at already exists'); }

    // stock_alerts table
    await db.query(`
        CREATE TABLE IF NOT EXISTS stock_alerts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            product_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_alert (user_id, product_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
        )
    `);
    console.log('+ stock_alerts table ready');

    // users: referral columns
    if (!await columnExists('users', 'referral_code')) {
        await db.query('ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) NULL');
        await db.query('ALTER TABLE users ADD UNIQUE INDEX idx_referral_code (referral_code)');
        console.log('+ users.referral_code added');
    } else { console.log('- users.referral_code already exists'); }

    if (!await columnExists('users', 'referred_by_code')) {
        await db.query('ALTER TABLE users ADD COLUMN referred_by_code VARCHAR(20) NULL');
        console.log('+ users.referred_by_code added');
    } else { console.log('- users.referred_by_code already exists'); }

    if (!await columnExists('users', 'referral_rewarded')) {
        await db.query('ALTER TABLE users ADD COLUMN referral_rewarded TINYINT(1) DEFAULT 0');
        console.log('+ users.referral_rewarded added');
    } else { console.log('- users.referral_rewarded already exists'); }

    // Seed referral codes for existing users that don't have one
    await db.query(`
        UPDATE users
        SET referral_code = CONCAT('JM-', UPPER(SUBSTRING(MD5(user_id), 1, 6)))
        WHERE referral_code IS NULL
    `);
    console.log('+ Referral codes seeded');

    console.log('\nMigration complete!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Fatal migration error:', err.message);
    process.exit(1);
});
