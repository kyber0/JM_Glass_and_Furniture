const mysql = require('mysql2/promise');
require('dotenv').config(); // Defaults to .env in current dir

async function createFavoritesTable() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        console.log('Connected to MySQL');

        const query = `
            CREATE TABLE IF NOT EXISTS favorites (
                favorite_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
                UNIQUE KEY unique_favorite (user_id, product_id)
            );
        `;

        await connection.query(query);
        console.log('Favorites table created successfully');

        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('Error creating favorites table:', error);
        process.exit(1);
    }
}

createFavoritesTable();
