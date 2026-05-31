const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

async function run() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database');

        // Add id_image column
        try {
            await connection.query(`ALTER TABLE shops ADD COLUMN id_image VARCHAR(255) DEFAULT NULL`);
            console.log('✅ Added id_image column to shops');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️  id_image column already exists, skipping.');
            } else throw e;
        }

        // Add permit_image column
        try {
            await connection.query(`ALTER TABLE shops ADD COLUMN permit_image VARCHAR(255) DEFAULT NULL`);
            console.log('✅ Added permit_image column to shops');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️  permit_image column already exists, skipping.');
            } else throw e;
        }

        // Create uploads/sellers directory is handled at runtime by multer
        console.log('✅ Migration complete!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

run();
