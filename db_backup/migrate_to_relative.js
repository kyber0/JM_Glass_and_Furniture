/**
 * Migration: Convert absolute image URLs in the database to relative paths.
 * 
 * Before: "http://192.168.x.x:3000/uploads/image.jpg"
 * After:  "uploads/image.jpg"
 * 
 * This only needs to be run ONCE.
 * After this, the backend middleware will dynamically add the current host.
 */
const db = require('./config/db');

async function migrate() {
    console.log('Migrating image URLs to relative paths...\n');

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // 1. products.image_url — strip everything before "uploads/"
        let [res] = await connection.query(
            `UPDATE products SET image_url = CONCAT('uploads/', SUBSTRING_INDEX(image_url, '/uploads/', -1)) WHERE image_url LIKE '%/uploads/%'`
        );
        console.log(`products.image_url: ${res.affectedRows} rows updated`);

        // 2. product_images.image_url
        [res] = await connection.query(
            `UPDATE product_images SET image_url = CONCAT('uploads/', SUBSTRING_INDEX(image_url, '/uploads/', -1)) WHERE image_url LIKE '%/uploads/%'`
        );
        console.log(`product_images.image_url: ${res.affectedRows} rows updated`);

        // 3. shops.logo_url
        [res] = await connection.query(
            `UPDATE shops SET logo_url = CONCAT('uploads/', SUBSTRING_INDEX(logo_url, '/uploads/', -1)) WHERE logo_url LIKE '%/uploads/%'`
        );
        console.log(`shops.logo_url: ${res.affectedRows} rows updated`);

        // 4. reviews.image_url
        [res] = await connection.query(
            `UPDATE reviews SET image_url = CONCAT('uploads/', SUBSTRING_INDEX(image_url, '/uploads/', -1)) WHERE image_url LIKE '%/uploads/%'`
        );
        console.log(`reviews.image_url: ${res.affectedRows} rows updated`);

        // 5. custom_requests.images (JSON array of URLs)
        const [rows] = await connection.query(
            `SELECT request_id, images FROM custom_requests WHERE images IS NOT NULL AND images != '[]' AND images LIKE '%/uploads/%'`
        );
        let crCount = 0;
        for (const row of rows) {
            try {
                let images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
                if (Array.isArray(images)) {
                    images = images.map(url => {
                        if (typeof url === 'string' && url.includes('/uploads/')) {
                            return 'uploads/' + url.split('/uploads/').pop();
                        }
                        return url;
                    });
                    await connection.query(
                        `UPDATE custom_requests SET images = ? WHERE request_id = ?`,
                        [JSON.stringify(images), row.request_id]
                    );
                    crCount++;
                }
            } catch (e) {
                console.error(`  Skipping request_id ${row.request_id}:`, e.message);
            }
        }
        console.log(`custom_requests.images: ${crCount} rows updated`);

        await connection.commit();
        console.log('\n✅ Migration completed successfully!');
    } catch (err) {
        await connection.rollback();
        console.error('❌ Migration failed, changes rolled back:', err.message);
    } finally {
        connection.release();
        process.exit(0);
    }
}

migrate();
