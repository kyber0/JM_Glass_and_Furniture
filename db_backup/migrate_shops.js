const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

(async () => {
    try {
        console.log('Connecting to database...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        // 1. Create shops table
        console.log('Creating shops table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS shops (
                shop_id INT(11) NOT NULL AUTO_INCREMENT,
                user_id INT(11) NOT NULL UNIQUE,
                shop_name VARCHAR(100) NOT NULL,
                description TEXT,
                address TEXT,
                tin_number VARCHAR(50),
                is_verified TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (shop_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 2. Add shop_id column to products if not exists
        console.log('Checking product table columns...');
        const [columns] = await connection.query(`SHOW COLUMNS FROM products LIKE 'shop_id'`);
        if (columns.length === 0) {
            console.log('Adding shop_id to products...');
            await connection.query(`
                ALTER TABLE products 
                ADD COLUMN shop_id INT(11),
                ADD CONSTRAINT fk_products_shop
                FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE SET NULL
            `);
            console.log('Added shop_id column.');
        } else {
            console.log('shop_id column already exists.');
        }

        console.log('✅ Migration completed successfully!');
        await connection.end();
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
})();
