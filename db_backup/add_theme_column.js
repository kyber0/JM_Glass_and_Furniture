const db = require('./config/db');

async function addThemeColumn() {
    try {
        const connection = await db.getConnection();
        console.log('Connected to database...');

        // Check if column exists
        const [columns] = await connection.query("SHOW COLUMNS FROM products LIKE 'theme'");

        if (columns.length === 0) {
            console.log('Adding theme column...');
            await connection.query("ALTER TABLE products ADD COLUMN theme VARCHAR(50) DEFAULT NULL AFTER category_id");
            console.log('Theme column added successfully!');
        } else {
            console.log('Theme column already exists.');
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Error adding theme column:', error);
        process.exit(1);
    }
}

addThemeColumn();
