const db = require('./config/db');

async function migrate() {
    try {
        console.log('Modifying custom_requests table...');
        await db.query('ALTER TABLE custom_requests MODIFY COLUMN product_id INT NULL');
        console.log('Successfully modified product_id to allow NULL.');
        process.exit(0);
    } catch (error) {
        console.error('Migration Error:', error);
        process.exit(1);
    }
}

migrate();
