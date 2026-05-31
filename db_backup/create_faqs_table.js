const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

async function createFaqsTable() {
    let connection;
    try {
        const ports = [process.env.DB_PORT || 8889, 3306, 8888];
        const uniquePorts = [...new Set(ports)];

        for (const port of uniquePorts) {
            try {
                connection = await mysql.createConnection({ ...dbConfig, port });
                console.log(`Connected on port ${port}`);
                break;
            } catch (err) {
                // Ignore
            }
        }

        if (!connection) throw new Error('Could not connect to database');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS faqs (
                id INT(11) NOT NULL AUTO_INCREMENT,
                question VARCHAR(255) NOT NULL,
                answer TEXT NOT NULL,
                display_order INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('Table faqs created or already exists.');

        // Seed if empty
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM faqs');
        if (rows[0].count === 0) {
            await connection.query(`
                INSERT INTO faqs (question, answer, display_order) VALUES
                ('How do I place an order?', 'To place an order, browse our design themes or categories, select the item you want, click "Add to Cart," and proceed to Checkout. You will be able to review your order details before confirming.', 1),
                ('What are the available payment methods?', 'We currently accept Cash on Delivery (COD) and GCash. You can select your preferred payment method during the checkout process.', 2),
                ('Can I track my order?', 'Yes! Once your order is confirmed, you can track its status in the "My Orders" tab within your Profile or Menu.', 3),
                ('How do I become a seller?', 'Go to your Profile and tap "Become a Seller." You will need to upload valid ID and permit images for verification. Once approved, you can start adding your own products.', 4),
                ('What is your return policy?', 'If you receive a damaged or incorrect item, please contact our support team immediately. We offer returns or replacements within 7 days of delivery for valid issues.', 5)
            `);
            console.log('Inserted default FAQs.');
        } else {
            console.log('faqs table already has data.');
        }

        console.log('Migration successful.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

createFaqsTable();
