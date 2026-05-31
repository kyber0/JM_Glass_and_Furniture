const db = require('./config/db');

async function createProductImagesTable() {
    try {
        console.log('Creating product_images table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS product_images (
                image_id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                image_url VARCHAR(255) NOT NULL,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            )
        `);
        console.log('product_images table created successfully.');
    } catch (error) {
        console.error('Error creating table:', error);
    } finally {
        process.exit();
    }
}

createProductImagesTable();
