const db = require('../config/db');
async function run() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS distance_cache (
            id INT AUTO_INCREMENT PRIMARY KEY,
            coord_hash CHAR(64) NOT NULL,
            distance_km DECIMAL(8,2) NOT NULL,
            calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_coord_hash (coord_hash)
        )
    `);
    console.log('✅  distance_cache table ready.');
    process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
