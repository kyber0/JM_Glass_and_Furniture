/**
 * routes/listings.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seller shop-listing management.
 * Mounted at /api/listings  (requireAny() in server.js)
 *
 *   POST   /api/listings              — avail a product (create listing)
 *   PUT    /api/listings/:listingId   — update price or stock
 *   DELETE /api/listings/:listingId   — delist (deactivate)
 *   GET    /api/listings/shop/:shopId — all listings for a shop (seller view)
 *   GET    /api/listings/public/:shopId — active listings (buyer view)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// Helper: get platform price deviation %
async function getDeviationPct() {
    const [[row]] = await db.query(
        "SELECT value FROM platform_settings WHERE `key` = 'price_deviation_pct'"
    );
    return row ? parseFloat(row.value) : 20; // default 20%
}

// ── POST /api/listings  — avail a product ────────────────────────────────────
router.post('/', async (req, res) => {
    const { shop_id, product_id, custom_price, stock_quantity, color_stocks, service_types } = req.body;

    if (!shop_id || !product_id || !custom_price) {
        return res.status(400).json({ success: false, message: 'shop_id, product_id and custom_price are required' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Validate product exists in catalog
        const [[product]] = await conn.query(
            'SELECT product_id, base_price, title FROM products WHERE product_id = ? AND is_catalog_active = 1 AND is_active = 1',
            [product_id]
        );
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found in catalog' });
        }

        // Validate price deviation
        const deviationPct = await getDeviationPct();
        const base = parseFloat(product.base_price);
        const requested = parseFloat(custom_price);
        const minPrice = base * (1 - deviationPct / 100);
        const maxPrice = base * (1 + deviationPct / 100);

        if (requested < minPrice || requested > maxPrice) {
            return res.status(400).json({
                success: false,
                message: `Price must be within ±${deviationPct}% of the base price ₱${base.toFixed(2)} (₱${minPrice.toFixed(2)} – ₱${maxPrice.toFixed(2)})`,
                min_price: minPrice,
                max_price: maxPrice,
                base_price: base,
            });
        }

        // Check not already listed
        const [[existing]] = await conn.query(
            'SELECT listing_id FROM shop_listings WHERE shop_id = ? AND product_id = ?',
            [shop_id, product_id]
        );
        if (existing) {
            await conn.rollback();
            return res.status(409).json({ success: false, message: 'Product is already listed in your shop. Edit the listing instead.' });
        }

        // Normalise service_types to comma-separated string
        const stStr = Array.isArray(service_types)
            ? service_types.join(',')
            : (service_types || 'delivery');

        // Create listing
        const [result] = await conn.query(
            'INSERT INTO shop_listings (shop_id, product_id, custom_price, stock_quantity, service_types, is_active) VALUES (?,?,?,?,?,1)',
            [shop_id, product_id, requested, parseInt(stock_quantity) || 0, stStr]
        );
        const listingId = result.insertId;

        // Insert per-color stock if provided
        if (color_stocks && Object.keys(color_stocks).length) {
            const colorRows = Object.entries(color_stocks).map(([color, stock]) => [listingId, color, parseInt(stock) || 0]);
            await conn.query('INSERT INTO listing_colors (listing_id, color, stock) VALUES ?', [colorRows]);
        }

        await conn.commit();
        res.status(201).json({
            success: true,
            message: `"${product.title}" is now listed in your shop!`,
            listing_id: listingId,
        });
    } catch (err) {
        await conn.rollback();
        console.error('List product error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        conn.release();
    }
});

// ── PUT /api/listings/:listingId  — update price / stock ─────────────────────
router.put('/:listingId', async (req, res) => {
    const { listingId } = req.params;
    const { custom_price, stock_quantity, is_active, color_stocks, service_types } = req.body;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Validate listing exists
        const [[listing]] = await conn.query(
            `SELECT sl.listing_id, sl.shop_id, p.base_price
             FROM shop_listings sl JOIN products p ON p.product_id = sl.product_id
             WHERE sl.listing_id = ?`,
            [listingId]
        );
        if (!listing) {
            return res.status(404).json({ success: false, message: 'Listing not found' });
        }

        const fields = [];
        const vals   = [];

        if (custom_price !== undefined) {
            // Validate deviation
            const deviationPct = await getDeviationPct();
            const base = parseFloat(listing.base_price);
            const requested = parseFloat(custom_price);
            const minPrice = base * (1 - deviationPct / 100);
            const maxPrice = base * (1 + deviationPct / 100);
            if (requested < minPrice || requested > maxPrice) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Price must be within ±${deviationPct}% of base price ₱${base.toFixed(2)}`,
                    min_price: minPrice,
                    max_price: maxPrice,
                });
            }
            fields.push('custom_price = ?'); vals.push(requested);
        }
        if (stock_quantity !== undefined) { fields.push('stock_quantity = ?'); vals.push(parseInt(stock_quantity) || 0); }
        if (is_active !== undefined)      { fields.push('is_active = ?');      vals.push(Number(is_active)); }
        if (service_types !== undefined)  {
            const stStr = Array.isArray(service_types) ? service_types.join(',') : (service_types || 'delivery');
            fields.push('service_types = ?'); vals.push(stStr);
        }

        if (fields.length) {
            vals.push(listingId);
            await conn.query(`UPDATE shop_listings SET ${fields.join(', ')} WHERE listing_id = ?`, vals);
        }

        // Update color stocks if provided
        if (color_stocks) {
            for (const [color, stock] of Object.entries(color_stocks)) {
                await conn.query(
                    `INSERT INTO listing_colors (listing_id, color, stock) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
                    [listingId, color, parseInt(stock) || 0]
                );
            }
        }

        await conn.commit();
        res.json({ success: true, message: 'Listing updated' });
    } catch (err) {
        await conn.rollback();
        console.error('Update listing error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        conn.release();
    }
});

// ── DELETE /api/listings/:listingId  — delist ─────────────────────────────────
router.delete('/:listingId', async (req, res) => {
    try {
        await db.query('UPDATE shop_listings SET is_active = 0 WHERE listing_id = ?', [req.params.listingId]);
        res.json({ success: true, message: 'Product delisted from your shop' });
    } catch (err) {
        console.error('Delist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/listings/shop/:shopId  — seller manages their listings ───────────
router.get('/shop/:shopId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT sl.*,
                   p.title, p.description, p.base_price, p.image_url,
                   p.theme, p.service_type,
                   cat.name AS category_name,
                   (SELECT image_url FROM product_images pi WHERE pi.product_id = p.product_id LIMIT 1) AS first_image,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('color', pc.color))
                    FROM product_colors pc WHERE pc.product_id = p.product_id) AS colors,
                   (SELECT JSON_ARRAYAGG(ps.size)
                    FROM product_sizes ps WHERE ps.product_id = p.product_id) AS sizes,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('color', lc.color, 'stock', lc.stock))
                    FROM listing_colors lc WHERE lc.listing_id = sl.listing_id) AS color_stocks
            FROM shop_listings sl
            JOIN products p ON p.product_id = sl.product_id
            LEFT JOIN categories cat ON cat.category_id = p.category_id
            WHERE sl.shop_id = ?
            ORDER BY sl.listed_at DESC
        `, [req.params.shopId]);
        res.json({ success: true, listings: rows });
    } catch (err) {
        console.error('Get shop listings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/listings/public/:shopId  — buyer views a shop's products ─────────
router.get('/public/:shopId', async (req, res) => {
    const { category_id, search } = req.query;
    try {
        const conditions = ['sl.shop_id = ?', 'sl.is_active = 1', 'p.is_active = 1'];
        const params     = [req.params.shopId];

        if (category_id) { conditions.push('p.category_id = ?'); params.push(category_id); }
        if (search)      { conditions.push('p.title LIKE ?');     params.push(`%${search}%`); }

        const [rows] = await db.query(`
            SELECT sl.listing_id, sl.shop_id, sl.custom_price, sl.stock_quantity,
                   p.product_id, p.title, p.description, p.base_price, p.image_url,
                   p.theme, p.service_type, p.sold_count,
                   cat.name AS category_name,
                   (SELECT image_url FROM product_images pi WHERE pi.product_id = p.product_id LIMIT 1) AS first_image,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('image_url', pi2.image_url))
                    FROM product_images pi2 WHERE pi2.product_id = p.product_id) AS images,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('color', pc.color))
                    FROM product_colors pc WHERE pc.product_id = p.product_id) AS colors,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('color', lc.color, 'stock', lc.stock))
                    FROM listing_colors lc WHERE lc.listing_id = sl.listing_id) AS color_stocks,
                   (SELECT JSON_ARRAYAGG(ps.size)
                    FROM product_sizes ps WHERE ps.product_id = p.product_id) AS sizes,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('label', psp.spec_label, 'value', psp.spec_value))
                    FROM product_specs psp WHERE psp.product_id = p.product_id) AS specs
            FROM shop_listings sl
            JOIN products p ON p.product_id = sl.product_id
            LEFT JOIN categories cat ON cat.category_id = p.category_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY sl.listed_at DESC
        `, params);

        res.json({ success: true, listings: rows });
    } catch (err) {
        console.error('Public shop listings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
