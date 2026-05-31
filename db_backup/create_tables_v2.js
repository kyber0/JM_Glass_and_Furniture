const db = require('./config/db');

async function createTables() {
    try {
        console.log('Creating custom_requests table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS custom_requests (
                request_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                shop_id INT NOT NULL,
                product_id INT DEFAULT NULL,
                status ENUM('pending', 'accepted', 'rejected', 'completed') DEFAULT 'pending',
                details TEXT,
                budget DECIMAL(10, 2),
                images JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE SET NULL
            )
        `);

        console.log('Creating messages table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                message TEXT,
                is_read TINYINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                request_id INT DEFAULT NULL,
                FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (request_id) REFERENCES custom_requests(request_id) ON DELETE SET NULL
            )
        `);

        console.log('Tables created successfully.');
        process.exit();
    } catch (error) {
        console.error('Error creating tables:', error);
        process.exit(1);
    }
}

createTables();
