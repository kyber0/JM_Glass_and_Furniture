const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

async function createReportedProblemsTable() {
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
            CREATE TABLE IF NOT EXISTS reported_problems (
                id INT(11) NOT NULL AUTO_INCREMENT,
                user_id INT(11) NULL,
                issue_type VARCHAR(100) NOT NULL,
                description TEXT NOT NULL,
                status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('Table reported_problems created or already exists.');

        console.log('Migration successful.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

createReportedProblemsTable();
