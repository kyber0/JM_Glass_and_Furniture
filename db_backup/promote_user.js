const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306 // fallback
        });

        console.log('Connected to database.');

        // Update the first user to be a seller
        const [result] = await connection.execute(
            "UPDATE users SET role = 'seller' WHERE email = 'keaneth@email.com' OR role = 'customer' LIMIT 1"
        );

        console.log(`Updated user(s) to Seller role. Rows affected: ${result.affectedRows}`);

        await connection.end();
    } catch (error) {
        console.error('Error updating user role:', error);
    }
})();
