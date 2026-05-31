const db = require('./config/db');

async function createWalletTable() {
    try {
        console.log('Creating user_vouchers table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_vouchers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT(11) NOT NULL,
                voucher_code VARCHAR(50) CHARACTER SET utf8 NOT NULL,
                claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_used TINYINT(1) DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (voucher_code) REFERENCES vouchers(code) ON DELETE CASCADE,
                UNIQUE KEY unique_user_voucher (user_id, voucher_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('Success!');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

createWalletTable();
