const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

async function setup() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // 1. Create handymen table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS handymen (
                handyman_id INT(11) NOT NULL AUTO_INCREMENT,
                shop_id INT(11) NOT NULL,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                status ENUM('available', 'busy', 'off') DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (handyman_id),
                FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ handymen table created (or already exists).');

        // 2. Add handyman_id column to orders if it doesn't exist
        try {
            await connection.query(`
                ALTER TABLE orders 
                ADD COLUMN handyman_id INT(11) DEFAULT NULL,
                ADD FOREIGN KEY (handyman_id) REFERENCES handymen(handyman_id) ON DELETE SET NULL
            `);
            console.log('✅ handyman_id column added to orders.');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️  handyman_id column already exists in orders.');
            } else {
                throw e;
            }
        }

        console.log('\n✅ Handyman setup completed successfully!');
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

setup();
