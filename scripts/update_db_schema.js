const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const db = require('../backend/config/db');

async function run() {
    try {
        console.log("Adding is_active column...");
        await db.query("ALTER TABLE products ADD COLUMN is_active TINYINT DEFAULT 1");
        console.log("Column added successfully.");
    } catch (e) {
        console.log("Info:", e.message);
    }
    process.exit();
}

run();
