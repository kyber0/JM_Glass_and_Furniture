/**
 * routes/catalog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-managed product catalog.
 *
 * Mounted at:
 *   /api/admin/catalog   (requireRole('admin'))  — CRUD for master products
 *   /api/catalog         (requireAny())          — Public read + seller browse
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');

// ── Multer setup ──────────────────────────────────────────────────────────────
const productDir = path.join(__dirname, '../uploads/products');
if (!fs.existsSync(productDir)) fs.mkdirSync(productDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, productDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES  (protected by requireRole('admin') in server.js)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/catalog  — list all catalog products with shop listing count
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.*,
                   cat.name AS category_name,
                   COUNT(DISTINCT sl.listing_id) AS shop_count,
                   (SELECT image_url FROM product_images pi WHERE pi.product_id = p.product_id LIMIT 1) AS first_image,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('color', pc.color))
                    FROM product_colors pc WHERE pc.product_id = p.product_id) AS colors,
                   (SELECT JSON_ARRAYAGG(ps.size)
                    FROM product_sizes ps WHERE ps.product_id = p.product_id) AS sizes
            FROM products p
            LEFT JOIN categories cat ON cat.category_id = p.category_id
            LEFT JOIN shop_listings sl ON sl.product_id = p.product_id
            GROUP BY p.product_id
            ORDER BY p.created_at DESC
        `);
        res.json({ success: true, products: rows });
    } catch (err) {
        console.error('Admin catalog list error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC / SELLER BROWSE  (requireAny() in server.js)
// GET /api/catalog/browse  — sellers browse available products (with "listed" flag per shop)
// ⚠️  Must be declared BEFORE /:productId or Express will capture "browse" as an ID.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/browse', async (req, res) => {
    const { shop_id, category_id, search } = req.query;
    try {
        const conditions = ['p.is_catalog_active = 1', 'p.is_active = 1'];
        const params = [];

        if (category_id) { conditions.push('p.category_id = ?'); params.push(category_id); }
        if (search) { conditions.push('p.title LIKE ?'); params.push(`%${search}%`); }

        const [rows] = await db.query(`
            SELECT p.*,
                   cat.name AS category_name,
                   (SELECT image_url FROM product_images pi WHERE pi.product_id = p.product_id LIMIT 1) AS first_image,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('color', pc.color))
                    FROM product_colors pc WHERE pc.product_id = p.product_id) AS colors,
                   (SELECT JSON_ARRAYAGG(ps.size)
                    FROM product_sizes ps WHERE ps.product_id = p.product_id) AS sizes,
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('label', psp.spec_label, 'value', psp.spec_value))
                    FROM product_specs psp WHERE psp.product_id = p.product_id) AS specs,
                   ${shop_id ? 'sl.listing_id, sl.custom_price, sl.stock_quantity AS listing_stock, sl.is_active AS listing_active,' : ''}
                   ${shop_id ? '(sl.listing_id IS NOT NULL) AS already_listed' : '0 AS already_listed'}
            FROM products p
            LEFT JOIN categories cat ON cat.category_id = p.category_id
            ${shop_id ? 'LEFT JOIN shop_listings sl ON sl.product_id = p.product_id AND sl.shop_id = ?' : ''}
            WHERE ${conditions.join(' AND ')}
            ORDER BY p.created_at DESC
        `, shop_id ? [Number(shop_id), ...params] : params);

        res.json({ success: true, products: rows });
    } catch (err) {
        console.error('Catalog browse error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/catalog/:productId  — full product detail for edit form
router.get('/:productId', async (req, res) => {
    try {
        const [[product]] = await db.query(`
            SELECT p.*,
                   cat.name AS category_name
            FROM products p
            LEFT JOIN categories cat ON cat.category_id = p.category_id
            WHERE p.product_id = ?
        `, [req.params.productId]);

        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // All images
        const [images] = await db.query(
            'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY image_id ASC',
            [req.params.productId]
        );
        // All specs
        const [specs] = await db.query(
            'SELECT spec_label AS label, spec_value AS value FROM product_specs WHERE product_id = ?',
            [req.params.productId]
        );
        // Colors
        const [colors] = await db.query(
            'SELECT color FROM product_colors WHERE product_id = ?',
            [req.params.productId]
        );
        // Sizes
        const [sizes] = await db.query(
            'SELECT size FROM product_sizes WHERE product_id = ?',
            [req.params.productId]
        );

        res.json({
            success: true,
            product: {
                ...product,
                images: images.map(i => i.image_url),
                specs,
                colors: colors.map(c => ({ color: c.color, stock: 0 })),
                sizes: sizes.map(s => s.size),
            }
        });
    } catch (err) {
        console.error('Admin catalog get single error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});



// POST /api/admin/catalog  — create new catalog product
router.post('/', upload.array('images', 8), async (req, res) => {
    const {
        user_id, category_id, title, description, price,
        sizes, colors, specs, theme, service_type, installation_complexity,
        fragility_level,
    } = req.body;

    if (!title || !price) {
        return res.status(400).json({ success: false, message: 'title and price are required' });
    }

    const basePrice = parseFloat(price);
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Insert master product
        const [result] = await conn.query(
            `INSERT INTO products
             (category_id, title, description, price, base_price,
              stock_quantity, image_url, theme, service_type, installation_complexity,
              is_active, is_catalog_active, created_by)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, 1, ?)`,
            [
                category_id || null,
                title, description || null,
                basePrice, basePrice,
                req.files?.length ? `uploads/products/${req.files[0].filename}` : null,
                theme || null,
                service_type || 'delivery',
                installation_complexity || 'standard',
                user_id || null,
            ]
        );
        // Set fragility_level separately (not in initial INSERT to avoid schema migration issues)
        if (fragility_level && ['none','low','medium','high'].includes(fragility_level)) {
            await conn.query('UPDATE products SET fragility_level = ? WHERE product_id = ?', [fragility_level, result.insertId]);
        }
        const productId = result.insertId;

        // Insert images
        if (req.files?.length) {
            const imgVals = req.files.map(f => [productId, `uploads/products/${f.filename}`]);
            await conn.query('INSERT INTO product_images (product_id, image_url) VALUES ?', [imgVals]);
        }

        // Insert colors (no stock — stock is per-listing now)
        if (colors) {
            const colorsArr = typeof colors === 'string' ? JSON.parse(colors) : colors;
            if (Array.isArray(colorsArr) && colorsArr.length) {
                const colorVals = colorsArr.map(c => [productId, typeof c === 'string' ? c : c.color]);
                await conn.query('INSERT IGNORE INTO product_colors (product_id, color) VALUES ?', [colorVals]);
            }
        }

        // Insert sizes
        if (sizes) {
            const sizesArr = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
            if (Array.isArray(sizesArr) && sizesArr.length) {
                await conn.query(
                    'INSERT IGNORE INTO product_sizes (product_id, size) VALUES ?',
                    [sizesArr.map(s => [productId, s])]
                );
            }
        }

        // Insert specs
        if (specs) {
            const specsArr = typeof specs === 'string' ? JSON.parse(specs) : specs;
            if (Array.isArray(specsArr)) {
                for (const sp of specsArr) {
                    if (sp.label) await conn.query(
                        'INSERT IGNORE INTO product_specs (product_id, spec_label, spec_value) VALUES (?,?,?)',
                        [productId, sp.label, sp.value || '']
                    );
                }
            }
        }

        await conn.commit();
        res.status(201).json({ success: true, message: 'Product added to catalog', product_id: productId });
    } catch (err) {
        await conn.rollback();
        console.error('Admin create product error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        conn.release();
    }
});

// PUT /api/admin/catalog/:productId  — edit catalog product
router.put('/:productId', upload.array('images', 8), async (req, res) => {
    const { productId } = req.params;
    const {
        category_id, title, description, price,
        sizes, colors, specs, theme, service_type,
        installation_complexity,
        is_catalog_active, keepImages,
    } = req.body;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const fields = [];
        const vals = [];

        if (title) { fields.push('title = ?'); vals.push(title); }
        if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
        if (price) {
            fields.push('price = ?, base_price = ?');
            vals.push(parseFloat(price), parseFloat(price));
        }
        if (category_id) { fields.push('category_id = ?'); vals.push(category_id); }
        if (theme) { fields.push('theme = ?'); vals.push(theme); }
        if (service_type) { fields.push('service_type = ?'); vals.push(service_type); }
        if (installation_complexity) { fields.push('installation_complexity = ?'); vals.push(installation_complexity); }
        if (fragility_level && ['none','low','medium','high'].includes(fragility_level)) {
            fields.push('fragility_level = ?'); vals.push(fragility_level);
            // Keep is_fragile in sync for backward compat
            fields.push('is_fragile = ?'); vals.push(fragility_level !== 'none' ? 1 : 0);
        }
        if (is_catalog_active !== undefined) {
            fields.push('is_catalog_active = ?');
            vals.push(Number(is_catalog_active));
        }
        if (req.files?.length) {
            fields.push('image_url = ?');
            vals.push(`uploads/products/${req.files[0].filename}`);
        }

        if (fields.length) {
            vals.push(productId);
            await conn.query(`UPDATE products SET ${fields.join(', ')} WHERE product_id = ?`, vals);
        }

        // Replace colors
        if (colors !== undefined) {
            await conn.query('DELETE FROM product_colors WHERE product_id = ?', [productId]);
            const colorsArr = typeof colors === 'string' ? JSON.parse(colors) : colors;
            if (Array.isArray(colorsArr) && colorsArr.length) {
                const colorVals = colorsArr.map(c => [productId, typeof c === 'string' ? c : c.color]);
                await conn.query('INSERT IGNORE INTO product_colors (product_id, color) VALUES ?', [colorVals]);
            }
        }

        // Replace sizes
        if (sizes !== undefined) {
            await conn.query('DELETE FROM product_sizes WHERE product_id = ?', [productId]);
            const sizesArr = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
            if (Array.isArray(sizesArr) && sizesArr.length) {
                await conn.query(
                    'INSERT IGNORE INTO product_sizes (product_id, size) VALUES ?',
                    [sizesArr.map(s => [productId, s])]
                );
            }
        }

        // Replace specs
        if (specs !== undefined) {
            await conn.query('DELETE FROM product_specs WHERE product_id = ?', [productId]);
            const specsArr = typeof specs === 'string' ? JSON.parse(specs) : specs;
            if (Array.isArray(specsArr)) {
                for (const sp of specsArr) {
                    if (sp.label) await conn.query(
                        'INSERT IGNORE INTO product_specs (product_id, spec_label, spec_value) VALUES (?,?,?)',
                        [productId, sp.label, sp.value || '']
                    );
                }
            }
        }

        // Sync images — delete orphaned disk files that were removed
        if (keepImages !== undefined || req.files?.length) {
            // Fetch current image paths before replacing
            const [existingImgs] = await conn.query(
                'SELECT image_url FROM product_images WHERE product_id = ?', [productId]
            );
            const existingPaths = existingImgs.map(r => r.image_url);

            const keepRelative = keepImages
                ? JSON.parse(keepImages).map(u => { const m = u.match(/(uploads\/.+)/); return m ? m[1] : null; }).filter(Boolean)
                : [];
            const newRows = (req.files || []).map(f => [productId, `uploads/products/${f.filename}`]);
            const keepRows = keepRelative.map(p => [productId, p]);
            const allRows = [...keepRows, ...newRows];

            await conn.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
            if (allRows.length) {
                await conn.query('INSERT INTO product_images (product_id, image_url) VALUES ?', [allRows]);
            }

            // Delete disk files that are no longer kept
            const keptSet = new Set(keepRelative);
            for (const oldPath of existingPaths) {
                if (!keptSet.has(oldPath)) {
                    const abs = path.join(__dirname, '..', oldPath);
                    try { fs.unlinkSync(abs); } catch (_) { /* already gone */ }
                }
            }
        }

        await conn.commit();
        res.json({ success: true, message: 'Catalog product updated' });
    } catch (err) {
        await conn.rollback();
        console.error('Admin update product error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        conn.release();
    }
});

// DELETE /api/admin/catalog/:productId  — soft-delete (hide from catalog)
router.delete('/:productId', async (req, res) => {
    try {
        await db.query(
            'UPDATE products SET is_catalog_active = 0 WHERE product_id = ?',
            [req.params.productId]
        );
        res.json({ success: true, message: 'Product hidden from catalog' });
    } catch (err) {
        console.error('Admin delete product error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
