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
        const connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Get user ID
        const [users] = await connection.query("SELECT user_id, full_name, role FROM users WHERE email LIKE 'keaneth%' OR role='seller' LIMIT 1");

        if (users.length === 0) {
            console.log('No user found.');
            process.exit(1);
        }

        const user = users[0];
        console.log(`Found user: ${user.full_name} (ID: ${user.user_id}, Role: ${user.role})`);

        // Check if shop exists
        const [shops] = await connection.query('SELECT * FROM shops WHERE user_id = ?', [user.user_id]);

        if (shops.length > 0) {
            console.log('Shop already exists for this user.');
        } else {
            console.log('Creating shop...');
            await connection.query(`
                INSERT INTO shops (user_id, shop_name, description, address, tin_number, is_verified)
                VALUES (?, ?, ?, ?, ?, 1)
            `, [user.user_id, `${user.full_name}'s Glass Shop`, 'Quality glass and furniture.', 'Test Address, Philippines', '123-456-789']);
            console.log('✅ Shop created successfully!');
        }

        await connection.end();
    } catch (error) {
        console.error('Error:', error);
    }
})();
