const db = require('./config/db');

async function addRequestIdColumn() {
    try {
        const [columns] = await db.query("SHOW COLUMNS FROM order_items LIKE 'request_id'");
        if (columns.length === 0) {
            await db.query("ALTER TABLE order_items ADD COLUMN request_id INT DEFAULT NULL");
            console.log("Added request_id column to order_items table.");
        } else {
            console.log("request_id column already exists in order_items table.");
        }
    } catch (error) {
        console.error("Error adding request_id column:", error);
    } finally {
        process.exit();
    }
}

addRequestIdColumn();
