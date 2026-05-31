const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

async function connectWithFallback() {
    const ports = [process.env.DB_PORT || 8889, 3306, 8888];
    const uniquePorts = [...new Set(ports)];

    for (const port of uniquePorts) {
        try {
            console.log(`Trying to connect to MySQL on port ${port}...`);
            const connection = await mysql.createConnection({
                ...dbConfig,
                port: port
            });
            console.log(`✅ Connected successfully on port ${port}!`);
            return connection;
        } catch (error) {
            console.log(`❌ Failed to connect on port ${port}: ${error.code}`);
        }
    }
    throw new Error('Could not connect to MySQL on any common port.');
}

async function updateSchema() {
    let connection;
    try {
        connection = await connectWithFallback();

        console.log('Adding new columns to products table...');

        // Check if columns exist first to avoid errors
        const [columns] = await connection.query(`SHOW COLUMNS FROM products LIKE 'sizes'`);
        if (columns.length === 0) {
            await connection.query(`ALTER TABLE products ADD COLUMN sizes JSON DEFAULT NULL`);
            console.log('Added sizes column.');
        } else {
            console.log('sizes column already exists.');
        }

        const [colorsCols] = await connection.query(`SHOW COLUMNS FROM products LIKE 'colors'`);
        if (colorsCols.length === 0) {
            await connection.query(`ALTER TABLE products ADD COLUMN colors JSON DEFAULT NULL`);
            console.log('Added colors column.');
        } else {
            console.log('colors column already exists.');
        }

        const [specsCols] = await connection.query(`SHOW COLUMNS FROM products LIKE 'specs'`);
        if (specsCols.length === 0) {
            await connection.query(`ALTER TABLE products ADD COLUMN specs JSON DEFAULT NULL`);
            console.log('Added specs column.');
        } else {
            console.log('specs column already exists.');
        }

        console.log('Updating vw_product_details view...');
        await connection.query('DROP VIEW IF EXISTS vw_product_details');
        await connection.query(`
            CREATE VIEW vw_product_details AS
            SELECT 
                p.product_id,
                p.title,
                p.price,
                p.image_url,
                p.description,
                p.stock_quantity,
                p.sizes,
                p.colors,
                p.specs,
                p.created_at,
                p.shop_id,
                s.user_id AS owner_id,
                c.name AS category_name,
                c.category_id,
                COALESCE(AVG(r.rating), 0) AS avg_rating,
                COUNT(DISTINCT r.review_id) AS review_count,
                COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS sold_count
            FROM products p
            JOIN categories c ON p.category_id = c.category_id
            JOIN shops s ON p.shop_id = s.shop_id
            LEFT JOIN reviews r ON p.product_id = r.product_id
            LEFT JOIN order_items oi ON p.product_id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.order_id AND o.status != 'cancelled'
            GROUP BY p.product_id, c.name, c.category_id
        `);
        console.log('View updated successfully.');

        console.log('✅ Schema update complete!');

    } catch (error) {
        console.error('❌ Schema update failed:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

updateSchema();
