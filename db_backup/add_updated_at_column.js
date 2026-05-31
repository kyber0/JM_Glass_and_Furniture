const db = require('./config/db');

async function addUpdatedAtColumn() {
    try {
        const connection = await db.getConnection();
        console.log('Connected to database...');

        // Check if column exists
        const [columns] = await connection.query("SHOW COLUMNS FROM orders LIKE 'updated_at'");

        if (columns.length === 0) {
            console.log('Adding updated_at column...');
            await connection.query("ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            console.log('Column added successfully!');
        } else {
            console.log('Column already exists.');
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}

addUpdatedAtColumn();
