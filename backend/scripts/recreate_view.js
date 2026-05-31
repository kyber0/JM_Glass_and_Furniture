/**
 * recreate_view.js
 * Recreates vw_product_details to work with the new catalog model
 * (products no longer have shop_id or stock_quantity).
 *
 * Run: node backend/scripts/recreate_view.js
 */
const db = require('../config/db');

const sql = `
CREATE OR REPLACE VIEW vw_product_details AS
SELECT
    p.product_id,
    p.title,
    p.price,
    p.base_price,
    p.image_url,
    p.description,
    p.theme,
    p.service_type,
    p.is_active,
    p.is_catalog_active,
    p.sold_count,
    p.created_at,
    c.name          AS category_name,
    c.category_id,
    COALESCE(AVG(r.rating), 0)          AS avg_rating,
    COUNT(DISTINCT r.review_id)         AS review_count,
    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('"', ps.size, '"') SEPARATOR ','), ']')
     FROM product_sizes ps WHERE ps.product_id = p.product_id)  AS sizes,
    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"color":"', pc.color, '"}') SEPARATOR ','), ']')
     FROM product_colors pc WHERE pc.product_id = p.product_id) AS colors,
    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"label":"', psp.spec_label, '","value":"', psp.spec_value, '"}') SEPARATOR ','), ']')
     FROM product_specs psp WHERE psp.product_id = p.product_id) AS specs
FROM products p
JOIN categories c ON p.category_id = c.category_id
LEFT JOIN reviews r ON p.product_id = r.product_id
GROUP BY p.product_id, c.name, c.category_id, p.service_type
`;

db.query(sql)
    .then(() => { console.log('✅ vw_product_details recreated successfully'); process.exit(0); })
    .catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
