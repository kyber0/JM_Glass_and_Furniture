const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

async function createNotificationsTable() {
    let connection;
    try {
        console.log(`Connecting to database ${dbConfig.database} on port ${dbConfig.port}...`);
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected successfully!');

        console.log('Creating notifications table...');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                notification_id INT(11) NOT NULL AUTO_INCREMENT,
                user_id INT(11) NOT NULL,
                type ENUM('order', 'promo', 'message', 'delivery', 'system') NOT NULL DEFAULT 'system',
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                is_read TINYINT(1) DEFAULT 0,
                icon VARCHAR(50),
                icon_color VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (notification_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        console.log('✅ notifications table created successfully!');

    } catch (error) {
        console.error('❌ Failed to create table:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

createNotificationsTable();
