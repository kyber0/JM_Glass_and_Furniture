/**
 * Migration: Move existing upload files into organized subfolders
 * and update database paths accordingly.
 *
 * uploads/custom-xxx.jpg  →  uploads/custom/custom-xxx.jpg
 * uploads/logo-xxx.jpg    →  uploads/shops/logo-xxx.jpg
 * uploads/review-xxx.jpg  →  uploads/reviews/review-xxx.jpg
 * uploads/<other>.jpg     →  uploads/products/<other>.jpg
 */
const db = require('./config/db');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

function moveFile(filename, subfolder) {
    const src = path.join(UPLOADS_DIR, filename);
    const dest = path.join(UPLOADS_DIR, subfolder, filename);
    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        return true;
    }
    return false;
}

async function migrate() {
    console.log('Moving files to organized subfolders...\n');

    // 1. Move physical files
    const files = fs.readdirSync(UPLOADS_DIR).filter(f => {
        const full = path.join(UPLOADS_DIR, f);
        return fs.statSync(full).isFile();
    });

    let moved = { products: 0, custom: 0, reviews: 0, shops: 0 };

    for (const file of files) {
        if (file.startsWith('custom-')) {
            if (moveFile(file, 'custom')) moved.custom++;
        } else if (file.startsWith('logo-')) {
            if (moveFile(file, 'shops')) moved.shops++;
        } else if (file.startsWith('review-')) {
            if (moveFile(file, 'reviews')) moved.reviews++;
        } else {
            // Everything else is a product image
            if (moveFile(file, 'products')) moved.products++;
        }
    }

    console.log(`Moved files: products=${moved.products}, custom=${moved.custom}, reviews=${moved.reviews}, shops=${moved.shops}\n`);

    // 2. Update database paths
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // Products: uploads/xxx → uploads/products/xxx
        let [res] = await connection.query(
            `UPDATE products SET image_url = REPLACE(image_url, 'uploads/', 'uploads/products/') WHERE image_url LIKE 'uploads/%' AND image_url NOT LIKE 'uploads/products/%' AND image_url NOT LIKE 'uploads/custom/%' AND image_url NOT LIKE 'uploads/shops/%' AND image_url NOT LIKE 'uploads/reviews/%'`
        );
        console.log(`products.image_url: ${res.affectedRows} updated`);

        // Product images table
        [res] = await connection.query(
            `UPDATE product_images SET image_url = REPLACE(image_url, 'uploads/', 'uploads/products/') WHERE image_url LIKE 'uploads/%' AND image_url NOT LIKE 'uploads/products/%' AND image_url NOT LIKE 'uploads/custom/%' AND image_url NOT LIKE 'uploads/shops/%' AND image_url NOT LIKE 'uploads/reviews/%'`
        );
        console.log(`product_images.image_url: ${res.affectedRows} updated`);

        // Shops: uploads/logo-xxx → uploads/shops/logo-xxx
        [res] = await connection.query(
            `UPDATE shops SET logo_url = REPLACE(logo_url, 'uploads/', 'uploads/shops/') WHERE logo_url LIKE 'uploads/%' AND logo_url NOT LIKE 'uploads/shops/%'`
        );
        console.log(`shops.logo_url: ${res.affectedRows} updated`);

        // Reviews: uploads/review-xxx → uploads/reviews/review-xxx
        [res] = await connection.query(
            `UPDATE reviews SET image_url = REPLACE(image_url, 'uploads/', 'uploads/reviews/') WHERE image_url LIKE 'uploads/%' AND image_url NOT LIKE 'uploads/reviews/%'`
        );
        console.log(`reviews.image_url: ${res.affectedRows} updated`);

        // Custom requests: JSON array of image paths
        const [rows] = await connection.query(
            `SELECT request_id, images FROM custom_requests WHERE images IS NOT NULL AND images != '[]'`
        );
        let crCount = 0;
        for (const row of rows) {
            try {
                let images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
                if (Array.isArray(images)) {
                    let changed = false;
                    images = images.map(url => {
                        if (typeof url === 'string' && url.startsWith('uploads/') && !url.startsWith('uploads/custom/')) {
                            changed = true;
                            return url.replace('uploads/', 'uploads/custom/');
                        }
                        return url;
                    });
                    if (changed) {
                        await connection.query(`UPDATE custom_requests SET images = ? WHERE request_id = ?`, [JSON.stringify(images), row.request_id]);
                        crCount++;
                    }
                }
            } catch (e) { /* skip */ }
        }
        console.log(`custom_requests.images: ${crCount} updated`);

        await connection.commit();
        console.log('\n✅ Migration completed!');
    } catch (err) {
        await connection.rollback();
        console.error('❌ Migration failed, rolled back:', err.message);
    } finally {
        connection.release();
        process.exit(0);
    }
}

migrate();
