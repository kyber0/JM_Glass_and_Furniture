const db = require('./config/db');

async function addReviewsColumns() {
    try {
        const connection = await db.getConnection();
        console.log('Connected to database...');

        // Check if columns exist
        const [columns] = await connection.query("SHOW COLUMNS FROM reviews LIKE 'tags'");

        if (columns.length === 0) {
            console.log('Adding tags and order_id columns...');
            await connection.query("ALTER TABLE reviews ADD COLUMN tags JSON DEFAULT NULL AFTER rating");
            await connection.query("ALTER TABLE reviews ADD COLUMN order_id INT(11) DEFAULT NULL AFTER product_id");
            console.log('Columns added successfully!');
        } else {
            console.log('Columns already exist.');
        }

        connection.release();
        process.exit(0);
    } catch (error) {
        console.error('Error adding columns:', error);
        process.exit(1);
    }
}

addReviewsColumns();
