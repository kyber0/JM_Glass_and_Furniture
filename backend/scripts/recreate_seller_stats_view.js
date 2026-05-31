/**
 * recreate_seller_stats_view.js
 * Recreates vw_seller_dashboard_stats for the catalog model
 * (products no longer have shop_id; stock/listings are in shop_listings).
 */
const db = require('../config/db');

const sql = `
CREATE OR REPLACE VIEW vw_seller_dashboard_stats AS
SELECT
    s.shop_id,
    s.user_id                                            AS seller_id,
    COALESCE(SUM(o.total_amount), 0)                     AS total_revenue,
    COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.order_id END) AS pending_orders,
    COUNT(DISTINCT sl.listing_id)                        AS total_products
FROM shops s
LEFT JOIN shop_listings sl  ON sl.shop_id    = s.shop_id
LEFT JOIN order_items   oi  ON oi.listing_id = sl.listing_id
LEFT JOIN orders        o   ON o.order_id    = oi.order_id
    AND o.status NOT IN ('cancelled')
GROUP BY s.shop_id, s.user_id
`;

db.query(sql)
    .then(() => { console.log('✅ vw_seller_dashboard_stats recreated successfully'); process.exit(0); })
    .catch(e => { console.error('❌ Failed:', e.message); process.exit(1); });
