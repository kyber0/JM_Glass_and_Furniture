const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: 'localhost', port: 8889, user: 'root', password: 'root', database: 'jm_glass_db'
    });

    const run = async (label, sql) => {
        try {
            await c.execute(sql);
            console.log('✓', label);
        } catch (e) {
            if (['ER_DUP_FIELDNAME','ER_TABLE_EXISTS_ERROR','ER_DUP_KEYNAME'].includes(e.code)) {
                console.log('↓ already exists:', label);
            } else {
                console.error('✗ FAILED:', label, '|', e.message);
            }
        }
    };

    // 1. Extend role ENUM
    await run(
        'Extend users.role ENUM',
        "ALTER TABLE users MODIFY COLUMN role ENUM('customer','admin','seller','delivery_man','handyman') DEFAULT 'customer'"
    );

    // 2. Add must_change_password flag
    await run(
        'Add users.must_change_password',
        'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0'
    );

    // 3. Create delivery_men table
    await run(
        'Create delivery_men table',
        `CREATE TABLE IF NOT EXISTS delivery_men (
            delivery_man_id INT AUTO_INCREMENT PRIMARY KEY,
            shop_id         INT NOT NULL,
            user_id         INT NOT NULL UNIQUE,
            vehicle_type    ENUM('motorcycle','bicycle','van','truck') DEFAULT 'motorcycle',
            plate_number    VARCHAR(20) NULL,
            status          ENUM('available','on_delivery','off') DEFAULT 'available',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )`
    );

    // 4. Add user_id to handymen (nullable — not all handymen need a login)
    await run(
        'Add handymen.user_id FK',
        'ALTER TABLE handymen ADD COLUMN user_id INT NULL'
    );

    // 5. Add delivery_man_id to orders
    await run(
        'Add orders.delivery_man_id FK',
        'ALTER TABLE orders ADD COLUMN delivery_man_id INT NULL'
    );

    await c.end();
    console.log('\nAll migrations complete.');
})().catch(e => { console.error('Connection error:', e.message); process.exit(1); });
