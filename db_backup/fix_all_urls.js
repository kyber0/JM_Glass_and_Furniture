const db = require('./config/db');

async function fixImageUrls() {
    const oldIps = ['192.168.0.103', '192.168.0.100', '192.168.1.5', '192.168.100.46']; // Add any other old IPs here if known
    const newIp = '192.168.100.235';

    console.log(`Migrating image URLs to use IP: ${newIp}`);

    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            for (const oldIp of oldIps) {
                console.log(`Replacing ${oldIp} with ${newIp}...`);

                // 1. Update products table (image_url)
                let [res] = await connection.query(
                    `UPDATE products SET image_url = REPLACE(image_url, ?, ?) WHERE image_url LIKE ?`,
                    [oldIp, newIp, `%${oldIp}%`]
                );
                console.log(`- Updated ${res.affectedRows} rows in 'products' table.`);

                // 2. Update product_images table (image_url)
                [res] = await connection.query(
                    `UPDATE product_images SET image_url = REPLACE(image_url, ?, ?) WHERE image_url LIKE ?`,
                    [oldIp, newIp, `%${oldIp}%`]
                );
                console.log(`- Updated ${res.affectedRows} rows in 'product_images' table.`);

                // 3. Update shops table (logo_url)
                [res] = await connection.query(
                    `UPDATE shops SET logo_url = REPLACE(logo_url, ?, ?) WHERE logo_url LIKE ?`,
                    [oldIp, newIp, `%${oldIp}%`]
                );
                console.log(`- Updated ${res.affectedRows} rows in 'shops' table.`);
            }

            await connection.commit();
            console.log('Migration completed successfully.');
        } catch (err) {
            await connection.rollback();
            console.error('Migration failed, changes rolled back.', err);
            process.exit(1);
        } finally {
            connection.release();
        }

        process.exit(0);
    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
}

fixImageUrls();
