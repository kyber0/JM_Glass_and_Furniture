const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/analytics/sales - Monthly revenue trend
router.get('/sales', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vw_sales_by_month ORDER BY sale_month ASC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Sales Analytics Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/analytics/top-products - Top selling products platform-wide
router.get('/top-products', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vw_top_selling_products LIMIT 20');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Top Products Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/analytics/customers - Top customers by lifetime spend
router.get('/customers', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vw_customer_lifetime_value LIMIT 50');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Customer LTV Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/analytics/shop/:shopId/top-products - Top products for a specific seller
router.get('/shop/:shopId/top-products', async (req, res) => {
    try {
        // We can reuse the view and just add a WHERE clause! Note: shop_id is in the view.
        const [rows] = await db.query(
            'SELECT * FROM vw_top_selling_products WHERE shop_id = ? LIMIT 10',
            [req.params.shopId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Shop Top Products Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
