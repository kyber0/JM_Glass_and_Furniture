const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

async function addLogoColumn() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Check if column exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'logo_url'
        `, [process.env.DB_NAME]);

        if (columns.length === 0) {
            console.log('Adding logo_url column to shops table...');
            await connection.query(`
                ALTER TABLE shops
                ADD COLUMN logo_url VARCHAR(255) DEFAULT NULL;
            `);
            console.log('logo_url column added successfully.');
        } else {
            console.log('logo_url column already exists.');
        }

    } catch (error) {
        console.error('Error adding column:', error);
    } finally {
        if (connection) await connection.end();
    }
}

addLogoColumn();
