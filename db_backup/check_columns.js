const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};

async function checkColumns() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        const [columns] = await connection.query(`
            DESCRIBE shops;
        `);

        console.log('Columns in shops table:');
        columns.forEach(col => console.log(col.Field));

    } catch (error) {
        console.error('Error checking columns:', error);
    } finally {
        if (connection) await connection.end();
    }
}

checkColumns();
