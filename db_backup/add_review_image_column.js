const db = require('./config/db');

async function addImageColumn() {
    try {
        console.log('Checking reviews table columns...');
        const [columns] = await db.query('SHOW COLUMNS FROM reviews');
        const columnNames = columns.map(col => col.Field);

        if (!columnNames.includes('image_url')) {
            console.log('Adding image_url column...');
            await db.query('ALTER TABLE reviews ADD COLUMN image_url VARCHAR(255) DEFAULT NULL');
            console.log('image_url column added successfully.');
        } else {
            console.log('image_url column already exists.');
        }
    } catch (error) {
        console.error('Error adding column:', error);
    } finally {
        process.exit();
    }
}

addImageColumn();
