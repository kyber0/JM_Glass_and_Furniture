const db = require('./config/db');

async function setupDB() {
    try {
        console.log("Setting up fee_config table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS fee_config (
                id INT AUTO_INCREMENT PRIMARY KEY,
                key_name VARCHAR(80) UNIQUE NOT NULL,
                value DECIMAL(10,2) NOT NULL,
                label VARCHAR(120),
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Insert default fees — INSERT IGNORE skips if already seeded
        await db.query(`
            INSERT IGNORE INTO fee_config (key_name, value, label) VALUES
            ('default_shipping_base',         500.00, 'Default Base Shipping Fee'),
            ('free_shipping_threshold',    150000.00, 'Free Shipping Order Minimum (commercial bulk orders only)'),
            ('fragile_surcharge_min',         100.00, 'Glass/Fragile Surcharge (Minimum)'),
            ('fragile_surcharge_max',         500.00, 'Glass/Fragile Surcharge (Maximum)'),
            ('installation_basic_min',        300.00, 'Basic Installation — Min'),
            ('installation_basic_max',        500.00, 'Basic Installation — Max'),
            ('installation_standard_min',     800.00, 'Standard Installation — Min'),
            ('installation_standard_max',    1500.00, 'Standard Installation — Max'),
            ('installation_complex_min',     1500.00, 'Complex Installation — Min'),
            ('installation_complex_max',     5000.00, 'Complex Installation — Max')
        `);

        // Patch live value if the old ₱20,000 default was already seeded
        await db.query(`
            UPDATE fee_config
            SET value = 150000.00,
                label = 'Free Shipping Order Minimum (commercial bulk orders only)'
            WHERE key_name = 'free_shipping_threshold' AND value = 20000.00
        `);

        console.log("Setting up vehicle_tiers table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS vehicle_tiers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(60) NOT NULL,
                base_fee DECIMAL(10,2) NOT NULL,
                rate_per_km DECIMAL(10,2) NOT NULL,
                max_load_desc VARCHAR(100),
                is_active TINYINT(1) DEFAULT 1
            )
        `);

        const [existingTiers] = await db.query('SELECT COUNT(*) as count FROM vehicle_tiers');
        if (existingTiers[0].count === 0) {
            await db.query(`
                INSERT INTO vehicle_tiers (name, base_fee, rate_per_km, max_load_desc) VALUES
                ('Motorcycle',    200, 15, 'Small items (up to 20kg)'),
                ('Pickup Truck',  500, 25, 'Medium items (up to 300kg)'),
                ('Truck',         800, 40, 'Large/bulk items (300kg+)')
            `);
        }

        console.log("Setting up shipping_zones table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS shipping_zones (
                zone_id INT AUTO_INCREMENT PRIMARY KEY,
                label VARCHAR(100) NOT NULL,
                keywords TEXT NOT NULL,
                override_fee DECIMAL(10,2),
                is_active TINYINT(1) DEFAULT 1
            )
        `);

        // Check and alter products table
        try {
            console.log("Altering products table to add is_fragile...");
            await db.query('ALTER TABLE products ADD COLUMN is_fragile TINYINT(1) DEFAULT 0');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("Column is_fragile already exists, skipping.");
            } else {
                throw err;
            }
        }
        
        await db.query(`
            UPDATE products 
            SET is_fragile = 1 
            WHERE title LIKE '%glass%' OR description LIKE '%glass%'
        `);

        console.log("Database setup complete.");
        process.exit(0);
    } catch (error) {
        console.error("Database setup failed:", error);
        process.exit(1);
    }
}

setupDB();
