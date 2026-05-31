const db = require('./config/db');

async function run() {
    try {
        console.log('Adding geolocation columns to orders table...');
        await db.query(`ALTER TABLE orders ADD COLUMN current_lat DECIMAL(10,8) NULL, ADD COLUMN current_lng DECIMAL(11,8) NULL, ADD COLUMN last_location_update TIMESTAMP NULL;`);
        console.log('Success!');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log('Columns already exist.');
        else console.error('Error:', e);
    } finally {
        process.exit();
    }
}

run();
