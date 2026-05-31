const db = require('./config/db');

async function fixImageUrls() {
    try {
        console.log('Fixing image URLs in database...');
        const [result] = await db.query(
            `UPDATE products SET image_url = REPLACE(image_url, '192.168.0.100', '192.168.0.103') WHERE image_url LIKE '%192.168.0.100%'`
        );
        console.log(`Updated ${result.affectedRows} product image URLs.`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixImageUrls();
