const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
};

async function run() {
    let conn;
    for (const port of [8889, 3306]) {
        try {
            conn = await mysql.createConnection({ ...dbConfig, port });
            console.log('Connected on port', port);
            break;
        } catch (e) { }
    }
    if (!conn) { console.error('No DB connection'); process.exit(1); }

    await conn.query(`
        CREATE TABLE IF NOT EXISTS payment_methods (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type ENUM('cod','gcash','bank') NOT NULL,
            label VARCHAR(100) NOT NULL,
            account_name VARCHAR(100),
            account_number VARCHAR(100),
            is_default TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('payment_methods table created or already exists.');
    await conn.end();
    process.exit(0);
}

run();
