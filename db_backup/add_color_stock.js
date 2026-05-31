/**
 * Migration: add stock column to product_colors & refresh views
 * Run: node add_color_stock.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    const db = await mysql.createConnection({
        host:     process.env.DB_HOST     || 'localhost',
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'jm_glass_db',
        port:     process.env.DB_PORT     || 3306,
    });

    // 1 – Add stock column to product_colors
    try {
        await db.query(`
            ALTER TABLE product_colors
            ADD COLUMN stock INT NOT NULL DEFAULT 0 AFTER color
        `);
        console.log('✅ product_colors.stock column added.');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('ℹ️  product_colors.stock already exists — skipped.');
        } else throw e;
    }

    // 2 – Refresh vw_product_details so colors includes stock
    await db.query('DROP VIEW IF EXISTS vw_product_details');
    await db.query(`
        CREATE VIEW vw_product_details AS
        SELECT
            p.product_id, p.title, p.price, p.image_url, p.description,
            p.stock_quantity, p.theme, p.service_type, p.is_active, p.created_at, p.shop_id,
            s.user_id              AS owner_id,
            c.name                 AS category_name,
            c.category_id,
            COALESCE(AVG(r.rating), 0)                                                          AS avg_rating,
            COUNT(DISTINCT r.review_id)                                                         AS review_count,
            COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.quantity ELSE 0 END), 0)      AS sold_count,
            (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('"', ps.size, '"')), ']')
             FROM product_sizes ps WHERE ps.product_id = p.product_id)                          AS sizes,
            (SELECT CONCAT('[', GROUP_CONCAT(
                CONCAT('{"color":"', pc.color, '","stock":', COALESCE(pc.stock, 0), '}')
             ), ']')
             FROM product_colors pc WHERE pc.product_id = p.product_id)                         AS colors,
            (SELECT CONCAT('[', GROUP_CONCAT(
                CONCAT('{"label":"', psp.spec_label, '","value":"', psp.spec_value, '"}')
             ), ']')
             FROM product_specs psp WHERE psp.product_id = p.product_id)                        AS specs
        FROM products p
        JOIN  categories   c  ON p.category_id = c.category_id
        JOIN  shops        s  ON p.shop_id      = s.shop_id
        LEFT JOIN reviews       r  ON p.product_id  = r.product_id
        LEFT JOIN order_items   oi ON p.product_id  = oi.product_id
        LEFT JOIN orders        o  ON oi.order_id   = o.order_id AND o.status != 'cancelled'
        GROUP BY p.product_id, c.name, c.category_id, s.user_id, p.service_type
    `);
    console.log('✅ vw_product_details refreshed (colors now include per-color stock).');

    await db.end();
    console.log('🎉 Migration complete.');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
