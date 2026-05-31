const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createNotification } = require('../utils/notifications.helper');
const { ensurePointsRow, EARN_RATE } = require('./points');
const { encrypt, decrypt } = require('../utils/encrypt');
const { autoAssignWorker } = require('../utils/autoAssign');

// ── Nominatim geocoding helper (shop address → lat/lng) ────────────────────
// Uses a progressive fallback: tries the full address, then strips the leading
// component (barangay → municipality → province) until a result is found.
// This handles Philippine addresses where Nominatim lacks barangay-level data.
const nominatimSearch = (q) =>
    new Promise((resolve) => {
        const encoded = encodeURIComponent(q);
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path: `/search?format=json&q=${encoded}&countrycodes=ph&limit=1`,
            headers: {
                'User-Agent': 'JM-Glass-And-Furniture-App/1.0 (contact@jmglass.com)',
                'Referer': 'https://jmglassandfurniture.com'
            }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const result = parsed?.[0];
                    resolve(result ? { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) } : null);
                } catch { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const geocodeShopAddress = async (addressText) => {
    if (!addressText) return { latitude: null, longitude: null };

    // Build a list of progressively shorter queries to try
    // e.g. ["San Miguel, Nabua, Camarines Sur, Bicol, Philippines",
    //        "Nabua, Camarines Sur, Bicol, Philippines",
    //        "Camarines Sur, Bicol, Philippines"]
    const parts = addressText.split(',').map(p => p.trim()).filter(Boolean);

    // Remove trailing "Philippines" for the loop — we'll always append it
    const withoutCountry = parts[parts.length - 1]?.toLowerCase() === 'philippines'
        ? parts.slice(0, -1)
        : parts;

    for (let i = 0; i < withoutCountry.length; i++) {
        const query = withoutCountry.slice(i).join(', ') + ', Philippines';
        await sleep(300); // small pause between attempts to be polite to Nominatim
        const result = await nominatimSearch(query);
        if (result) {
            if (i > 0) {
                console.log(`[geocode] Partial match at level ${i} for "${addressText}" → "${query}" (${result.latitude}, ${result.longitude})`);
            }
            return result;
        }
    }

    return { latitude: null, longitude: null };
};



// Silently delete a file from disk if it exists
const unlinkFile = (filePath) => {
    if (!filePath) return;
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore — file may already be gone */ }
};

// Configure Multer for Product Image Uploads
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/products/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Configure Multer for Shop Logo Uploads
const shopStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/shops/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: productStorage });
const uploadShop = multer({ storage: shopStorage });

// Configure Multer for Seller Verification Uploads (ID + Permit)
const sellerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/shop-ids/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const uploadSeller = multer({ storage: sellerStorage });

// DEBUG: Check Schema
router.get('/debug-schema', async (req, res) => {
    try {
        const [columns] = await db.query('SHOW COLUMNS FROM products');
        res.json({ success: true, columns });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Shop (Become a Seller) - accepts multipart/form-data
router.post('/create', uploadSeller.fields([
    { name: 'id_image', maxCount: 1 },
    { name: 'permit_image', maxCount: 1 }
]), async (req, res) => {
    const { user_id, shop_name, description, address, tin_number, full_name, phone } = req.body;

    try {
        // Check if shop already exists
        const [existing] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have a shop.' });
        }

        // Get uploaded file paths
        const id_image = req.files?.id_image?.[0]
            ? `uploads/shop-ids/${req.files.id_image[0].filename}`
            : null;
        const permit_image = req.files?.permit_image?.[0]
            ? `uploads/shop-ids/${req.files.permit_image[0].filename}`
            : null;

        // Encrypt sensitive PII before storage
        const encryptedTin = tin_number ? encrypt(tin_number) : null;

        // Create Shop with status = pending (admin must approve)
        await db.query(
            'INSERT INTO shops (user_id, shop_name, description, address, tin_number, status, id_image, permit_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id, shop_name, description, address, encryptedTin, 'pending', id_image, permit_image]
        );

        // Update personal info only (do NOT promote to seller yet — admin approves first)
        const userFields = [];
        const userValues = [];
        if (full_name) { userFields.push('full_name = ?'); userValues.push(full_name); }
        if (phone) { userFields.push('phone = ?'); userValues.push(phone); }
        if (userFields.length > 0) {
            userValues.push(user_id);
            await db.query(`UPDATE users SET ${userFields.join(', ')} WHERE user_id = ?`, userValues);
        }

        // Notify applicant that their application is under review
        await createNotification(
            db,
            Number(user_id),
            'system',
            '📋 Application Received!',
            `Hi ${full_name || 'there'}! Your seller application for "${shop_name}" has been submitted and is now under review. We will notify you once it has been processed.`,
            null
        );

        res.json({ success: true, message: 'Application submitted! Awaiting admin approval.' });
    } catch (error) {
        console.error('Create Shop Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get Current User's Shop
router.get('/me', async (req, res) => {
    const { user_id } = req.query;

    try {
        const [rows] = await db.query(`
            SELECT s.*,
                   (SELECT ROUND(AVG(r.rating), 1)
                    FROM reviews r
                    JOIN shop_listings sl ON sl.product_id = r.product_id
                    WHERE sl.shop_id = s.shop_id) AS avg_rating,
                   (SELECT COUNT(r.review_id)
                    FROM reviews r
                    JOIN shop_listings sl ON sl.product_id = r.product_id
                    WHERE sl.shop_id = s.shop_id) AS review_count
            FROM shops s
            WHERE user_id = ?
        `, [user_id]);
        if (rows.length === 0) {
            return res.json({ success: false, message: 'No shop found' });
        }
        res.json({ success: true, shop: rows[0] });
    } catch (error) {
        console.error('Get Shop Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get Shop by Owner ID
router.get('/by-owner/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT shop_id, shop_name, description, address, logo_url,
                    status, rejection_reason, created_at
             FROM shops WHERE user_id = ?`,
            [req.params.userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }
        res.json({ success: true, shop: rows[0] });
    } catch (error) {
        console.error('Get Shop By Owner Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get Seller Dashboard Stats
router.get('/dashboard-stats', async (req, res) => {
    const { user_id } = req.query;

    try {
        const [rows] = await db.query('SELECT total_revenue, pending_orders, total_products FROM vw_seller_dashboard_stats WHERE seller_id = ?', [user_id]);
        if (rows.length === 0) {
            // Return defaults if no stats exist yet
            return res.json({ success: true, stats: { total_revenue: 0, pending_orders: 0, total_products: 0 } });
        }
        res.json({ success: true, stats: rows[0] });
    } catch (error) {
        console.error('Get Dashboard Stats Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get Shop Products (via listings)
router.get('/products', async (req, res) => {
    const { user_id } = req.query;

    try {
        // Get shop_id first
        const [shopRows] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }
        const shop_id = shopRows[0].shop_id;

        // Return listings (not raw products — stock & price are now per listing)
        const [products] = await db.query(`
            SELECT
                sl.listing_id,
                sl.custom_price      AS price,
                sl.stock_quantity,
                sl.is_active,
                p.product_id, p.title, p.description, p.image_url,
                p.theme, p.service_type, p.installation_complexity,
                p.base_price, p.sold_count,
                c.name               AS category_name,
                (SELECT image_url FROM product_images pi WHERE pi.product_id = p.product_id LIMIT 1) AS first_image,
                (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('"', ps.size, '"')), ']')
                 FROM product_sizes ps WHERE ps.product_id = p.product_id) AS sizes,
                (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"color":"', pc.color, '"}') SEPARATOR ','), ']')
                 FROM product_colors pc WHERE pc.product_id = p.product_id) AS colors,
                (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"color":"', lc.color, '","stock":', lc.stock, '}') SEPARATOR ','), ']')
                 FROM listing_colors lc WHERE lc.listing_id = sl.listing_id) AS color_stocks,
                (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"label":"', psp.spec_label, '","value":"', psp.spec_value, '"}')), ']')
                 FROM product_specs psp WHERE psp.product_id = p.product_id) AS specs
            FROM shop_listings sl
            JOIN products p     ON p.product_id   = sl.product_id
            LEFT JOIN categories c ON c.category_id = p.category_id
            WHERE sl.shop_id = ? AND p.is_active = 1
            ORDER BY sl.listed_at DESC
        `, [shop_id]);

        res.json({ success: true, products });
    } catch (error) {
        console.error('Get Shop Products Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Add Product
router.post('/products', upload.array('images', 5), async (req, res) => {
    const { user_id, category_id, title, description, price, stock_quantity, sizes, colors, specs, theme, service_type, installation_complexity } = req.body;

    // Use first image as main thumbnail, or null
    let image_url = null;
    if (req.files && req.files.length > 0) {
        image_url = `uploads/products/${req.files[0].filename}`;
    }

    try {
        // Get shop_id
        const [shopRows] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }
        const shop_id = shopRows[0].shop_id;

        // Insert into products
        const [result] = await db.query(
            'INSERT INTO products (shop_id, category_id, title, description, price, stock_quantity, image_url, theme, service_type, installation_complexity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [shop_id, category_id, title, description, price, stock_quantity, image_url, theme, service_type || 'delivery', installation_complexity || 'standard']
        );

        const product_id = result.insertId;

        // Write sizes → product_sizes
        if (sizes) {
            const sizesArr = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
            if (Array.isArray(sizesArr) && sizesArr.length > 0) {
                await db.query('INSERT IGNORE INTO product_sizes (product_id, size) VALUES ?',
                    [sizesArr.map(s => [product_id, s])]);
            }
        }
        // Write colors → product_colors (each color has its own stock)
        if (colors) {
            const colorsArr = typeof colors === 'string' ? JSON.parse(colors) : colors;
            if (Array.isArray(colorsArr) && colorsArr.length > 0) {
                await db.query('INSERT IGNORE INTO product_colors (product_id, color, stock) VALUES ?',
                    [colorsArr.map(c => typeof c === 'string'
                        ? [product_id, c, 0]
                        : [product_id, c.color, c.stock || 0])]);
            }
        }
        // Write specs → product_specs
        if (specs) {
            const specsArr = typeof specs === 'string' ? JSON.parse(specs) : specs;
            if (Array.isArray(specsArr) && specsArr.length > 0) {
                for (const sp of specsArr) {
                    if (sp.label) await db.query(
                        'INSERT IGNORE INTO product_specs (product_id, spec_label, spec_value) VALUES (?, ?, ?)',
                        [product_id, sp.label, sp.value || '']);
                }
            }
        }

        // Insert additional images to product_images table
        if (req.files && req.files.length > 0) {
            const imageValues = req.files.map(file => [
                product_id,
                `uploads/products/${file.filename}`
            ]);
            await db.query('INSERT INTO product_images (product_id, image_url) VALUES ?', [imageValues]);
        }

        res.json({ success: true, message: 'Product added successfully!' });
    } catch (error) {
        console.error('Add Product Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Delete Product
router.delete('/products/:productId', async (req, res) => {
    const { productId } = req.params;
    const { user_id } = req.query;

    try {
        // 1. Verify ownership
        const [productRows] = await db.query(`
            SELECT sl.listing_id\r\n            FROM shop_listings sl\r\n            JOIN shops s ON s.shop_id = sl.shop_id\r\n            WHERE sl.product_id = ? AND s.user_id = ?
        `, [productId, user_id]);

        if (productRows.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized or product not found' });
        }

        // 2. Delete product (or soft delete)
        // Using soft delete as per schema default, but let's do hard delete for now or update is_active
        // Schema has is_active, let's use that for soft delete or just DELETE if we want to remove it completely.
        // User asked "delete", often implies removal. But let's check FKs.
        // order_items references products. If we delete, it might fail or cascade?
        // Schema says: FOREIGN KEY (product_id) REFERENCES products(product_id) (No ON DELETE CASCADE?)
        // Wait, setup_database.js line 131: FOREIGN KEY (product_id) REFERENCES products(product_id) -- defaults to RESTRICT?
        // Ah, reviews has ON DELETE CASCADE.
        // Let's check order_items again.
        // If order_items exist, we probably shouldn't hard delete.
        // Let's use soft delete: update is_active = 0

        await db.query('UPDATE products SET is_active = 0 WHERE product_id = ?', [productId]);
        // OR if we want to hide it from queries, we need to ensure queries filter by is_active.
        // Current queries in shop.js don't seem to filter by is_active?
        // setup_database line 80: SELECT * FROM products ... no is_active check.
        // vw_product_details ... no is_active check.

        // If I want to support "delete", maybe I should actually DELETE and handle errors?
        // Or implement is_active filtering everywhere.
        // Given complexity, maybe DELETE is better if no orders?
        // But if orders exist, it will fail.
        // Let's try DELETE, if fail, then suggests it's in use.
        // But better user experience:
        // "owner can also delete its product"

        // Let's stick to Soft Delete AND filter in queries? 
        // Or maybe just DELETE and let DB handle it?
        // If I modify schema to ON DELETE SET NULL for order_items?
        // setup_database.js:
        // FOREIGN KEY (product_id) REFERENCES products(product_id)

        // I'll try DELETE. If it fails due to FK, I'll return an error.
        // Actually, for a MVP, let's try DELETE.

        try {
            // Collect image paths BEFORE deleting DB rows
            const [imgRows] = await db.query('SELECT image_url FROM product_images WHERE product_id = ?', [productId]);
            const [[mainRow]] = await db.query('SELECT image_url FROM products WHERE product_id = ?', [productId]);
            const allImages = [...imgRows.map(r => r.image_url), mainRow?.image_url].filter(Boolean);

            // Delete dependent data
            await db.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
            await db.query('DELETE FROM cart_items WHERE product_id = ?', [productId]);
            await db.query('DELETE FROM reviews WHERE product_id = ?', [productId]);
            await db.query('DELETE FROM products WHERE product_id = ?', [productId]);

            // Clean up image files from disk
            allImages.forEach(unlinkFile);

            res.json({ success: true, message: 'Product deleted successfully' });
        } catch (delError) {
            // If constraint violation (e.g. ordered items), fallback to soft delete
            if (delError.code === 'ER_ROW_IS_REFERENCED_2') {
                try {
                    await db.query("ALTER TABLE products ADD COLUMN is_active TINYINT DEFAULT 1");
                } catch (e) { /* ignore if column exists */ }
                await db.query('UPDATE products SET is_active = 0 WHERE product_id = ?', [productId]);
                res.json({ success: true, message: 'Product Deactivated (Archived due to existing orders)' });
            } else {
                throw delError;
            }
        }

    } catch (error) {
        console.error('Delete Product Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Update Product
router.put('/products/:productId', upload.array('images', 5), async (req, res) => {
    const { productId } = req.params;
    const { user_id, category_id, title, description, price, stock_quantity, sizes, colors, specs, theme, service_type, installation_complexity } = req.body;
    let image_url = null;

    // Frontend sends field name 'images' (same as POST route)
    if (req.files && req.files.length > 0) {
        image_url = `uploads/products/${req.files[0].filename}`;
    }

    try {
        // 1. Verify ownership
        const [productRows] = await db.query(`
            SELECT sl.listing_id\r\n            FROM shop_listings sl\r\n            JOIN shops s ON s.shop_id = sl.shop_id\r\n            WHERE sl.product_id = ? AND s.user_id = ?
        `, [productId, user_id]);

        if (productRows.length === 0) {
            return res.status(403).json({ success: false, message: 'Not authorized or product not found' });
        }

        // 2. Update product
        let query = 'UPDATE products SET category_id = ?, title = ?, description = ?, price = ?, stock_quantity = ?, theme = ?, service_type = ?, installation_complexity = ?';
        let params = [category_id, title, description, price, stock_quantity, theme, service_type || 'delivery', installation_complexity || 'standard'];

        if (image_url) {
            query += ', image_url = ?';
            params.push(image_url);
        }

        query += ' WHERE product_id = ?';
        params.push(productId);

        await db.query(query, params);

        // Replace normalized attribute rows (delete + re-insert)
        await db.query('DELETE FROM product_sizes WHERE product_id = ?', [productId]);
        await db.query('DELETE FROM product_colors WHERE product_id = ?', [productId]);
        await db.query('DELETE FROM product_specs WHERE product_id = ?', [productId]);

        if (sizes) {
            const sizesArr = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
            if (Array.isArray(sizesArr) && sizesArr.length > 0)
                await db.query('INSERT IGNORE INTO product_sizes (product_id, size) VALUES ?',
                    [sizesArr.map(s => [productId, s])]);
        }
        if (colors) {
            const colorsArr = typeof colors === 'string' ? JSON.parse(colors) : colors;
            if (Array.isArray(colorsArr) && colorsArr.length > 0)
                await db.query('INSERT IGNORE INTO product_colors (product_id, color, stock) VALUES ?',
                    [colorsArr.map(c => typeof c === 'string'
                        ? [productId, c, 0]
                        : [productId, c.color, c.stock || 0])]);
        }
        if (specs) {
            const specsArr = typeof specs === 'string' ? JSON.parse(specs) : specs;
            if (Array.isArray(specsArr) && specsArr.length > 0) {
                for (const sp of specsArr) {
                    if (sp.label) await db.query(
                        'INSERT IGNORE INTO product_specs (product_id, spec_label, spec_value) VALUES (?, ?, ?)',
                        [productId, sp.label, sp.value || '']);
                }
            }
        }

        // Sync product_images:
        // - keepImages: existing image URLs the user didn't remove (sent by frontend as JSON)
        // - req.files:  newly uploaded images
        // Strategy: delete all, then re-insert (kept + new) so removals are respected too.
        {
            const keepRaw = req.body.keepImages ? JSON.parse(req.body.keepImages) : null;

            // Only sync if the frontend explicitly sent keepImages (edit mode)
            if (keepRaw !== null) {
                // Strip any base URL to get the relative path stored in DB
                // e.g. "https://xxx.ngrok.app/uploads/products/foo.jpg" → "uploads/products/foo.jpg"
                const keepRelative = keepRaw.map(url => {
                    const m = url.match(/(uploads\/.+)/);
                    return m ? m[1] : null;
                }).filter(Boolean);

                const newFileRows = (req.files || []).map(file => [
                    productId,
                    `uploads/products/${file.filename}`
                ]);
                const keepRows = keepRelative.map(p => [productId, p]);
                const allRows = [...keepRows, ...newFileRows];

                // Replace all image rows for this product
                await db.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
                if (allRows.length > 0) {
                    await db.query('INSERT INTO product_images (product_id, image_url) VALUES ?', [allRows]);
                }

                // Also update the main image_url if a new image was uploaded
                if (newFileRows.length > 0 && !image_url) {
                    // image_url was already set above from req.files[0]; nothing more needed
                }
            } else if (req.files && req.files.length > 0) {
                // Fallback for add-product (no keepImages key): just append
                const imageValues = req.files.map(file => [productId, `uploads/products/${file.filename}`]);
                await db.query('INSERT INTO product_images (product_id, image_url) VALUES ?', [imageValues]);
            }
        }


        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        console.error('Update Product Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }

});

// Get Seller Orders (Orders containing items from this seller)
router.get('/orders', async (req, res) => {
    const { user_id } = req.query;

    try {
        // Get shop_id
        const [shopRows] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }
        const shop_id = shopRows[0].shop_id;

        // Get orders — shop identified via shop_listings
        const [rows] = await db.query(`
            SELECT
                o.order_id, o.created_at, o.status, o.total_amount, o.shipping_address, o.payment_method,
                o.payment_status, o.payment_proof_url, o.delivery_fee,
                oh.handyman_id,
                u.full_name as buyer_name, u.profile_image as buyer_profile_image,
                oi.item_id, oi.quantity, oi.price_at_purchase as item_price,
                oi.base_price, oi.installation_fee,
                oi.selected_variant, oi.request_id,
                p.title as product_title, p.image_url,
                h.name as handyman_name, h.phone as handyman_phone, h.status as handyman_status
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN products p ON oi.product_id = p.product_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            LEFT JOIN order_handymen oh ON o.order_id = oh.order_id
            LEFT JOIN handymen h ON oh.handyman_id = h.handyman_id
            WHERE sl.shop_id = ?
            ORDER BY o.created_at DESC
        `, [shop_id]);

        // Group by order_id
        const ordersMap = {};
        rows.forEach(row => {
            if (!ordersMap[row.order_id]) {
                ordersMap[row.order_id] = {
                    order_id: row.order_id,
                    created_at: row.created_at,
                    status: row.status,
                    total_amount: row.total_amount,
                    delivery_fee: row.delivery_fee || 0,
                    buyer_name: row.buyer_name,
                    buyer_profile_image: row.buyer_profile_image,
                    shipping_address: row.shipping_address,
                    payment_method: row.payment_method,
                    handyman_id: row.handyman_id || null,
                    handyman_name: row.handyman_name || null,
                    handyman_phone: row.handyman_phone || null,
                    handyman_status: row.handyman_status || null,
                    items: []
                };
            }
            ordersMap[row.order_id].items.push({
                order_item_id: row.order_item_id,
                title: row.product_title,
                quantity: row.quantity,
                price: row.item_price,
                price_at_purchase: row.item_price,
                base_price: parseFloat(row.base_price || 0),
                installation_fee: parseFloat(row.installation_fee || 0),
                image: row.image_url,
                selected_variant: row.selected_variant || '',
                request_id: row.request_id
            });
        });

        // Convert map to array
        const orders = Object.values(ordersMap);

        // Sort explicitly just in case
        orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({ success: true, orders });
    } catch (error) {
        console.error('Get Shop Orders Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Assign Handyman to Order
router.put('/orders/:orderId/handyman', async (req, res) => {
    const { orderId } = req.params;
    const { handyman_id } = req.body;
    try {
        // Get current assignment (from junction table)
        const [[prevAssignment]] = await db.query(
            'SELECT handyman_id FROM order_handymen WHERE order_id = ? LIMIT 1', [orderId]
        );
        // Free previous handyman if there was one
        if (prevAssignment?.handyman_id) {
            await db.query("UPDATE handymen SET status = 'available' WHERE handyman_id = ?", [prevAssignment.handyman_id]);
        }

        if (handyman_id) {
            // Assign via updated SP (writes to order_handymen)
            await db.query('CALL sp_assign_handyman(?, ?)', [orderId, handyman_id]);
            await db.query("UPDATE handymen SET status = 'busy' WHERE handyman_id = ?", [handyman_id]);
            const [[h]] = await db.query('SELECT name, phone, status FROM handymen WHERE handyman_id = ?', [handyman_id]);
            res.json({ success: true, message: 'Handyman assigned', handyman: { handyman_id, ...h } });
        } else {
            // Unassign — delete from junction table
            await db.query('DELETE FROM order_handymen WHERE order_id = ?', [orderId]);
            res.json({ success: true, message: 'Handyman unassigned', handyman: null });
        }
    } catch (error) {
        console.error('Assign Handyman Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


// Update Order Status
router.put('/orders/:orderId/status', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    // Valid statuses
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    // Delivered and completed are exclusively handled by the field worker via QR scan
    if (['delivered', 'completed'].includes(status)) {
        return res.status(403).json({
            success: false,
            message: 'This action is handled by the assigned field worker via QR scan.',
        });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check if order exists and get current status
        const [currentOrder] = await connection.query('SELECT status FROM orders WHERE order_id = ? FOR UPDATE', [orderId]);

        if (currentOrder.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const oldStatus = currentOrder[0].status;

        // ── Auto-assign Handyman when order moves to processing ──────────────
        if (status === 'processing' && oldStatus === 'pending') {
            const [[shopRow]] = await connection.query(
                `SELECT DISTINCT sl.shop_id FROM order_items oi
                 JOIN shop_listings sl ON sl.listing_id = oi.listing_id
                 WHERE oi.order_id = ? LIMIT 1`, [orderId]
            );
            if (shopRow?.shop_id) {
                const [[{ has_installation }]] = await connection.query(
                    `SELECT MAX(installation_fee) > 0 AS has_installation FROM order_items WHERE order_id = ?`, [orderId]
                );
                if (has_installation) {
                    setImmediate(() => autoAssignWorker(db, orderId, shopRow.shop_id, 'handyman').catch(e =>
                        console.error('[AutoAssign] Handyman error:', e.message)
                    ));
                }
            }
        }

        // ── Ship: auto-assign delivery man if available, block if none ─────────
        if (status === 'shipped' && oldStatus === 'processing') {
            // Resolve shop for this order
            const [[shopRow]] = await connection.query(
                `SELECT DISTINCT sl.shop_id FROM order_items oi
                 JOIN shop_listings sl ON sl.listing_id = oi.listing_id
                 WHERE oi.order_id = ? LIMIT 1`, [orderId]
            );
            const shopId = shopRow?.shop_id;

            // Check if a delivery man is already manually assigned
            const [[orderDM]] = await connection.query(
                `SELECT o.delivery_man_id, dm.status AS dm_status, u.full_name AS dm_name
                 FROM orders o
                 LEFT JOIN delivery_men dm ON dm.delivery_man_id = o.delivery_man_id
                 LEFT JOIN users u ON u.user_id = dm.user_id
                 WHERE o.order_id = ?`,
                [orderId]
            );

            let assignedDmId   = orderDM?.delivery_man_id || null;
            let assignedDmName = orderDM?.dm_name || null;

            if (!assignedDmId) {
                // No delivery man yet — try to auto-assign the best available one
                if (shopId) {
                    const [[bestDM]] = await connection.query(
                        `SELECT d.delivery_man_id, u.full_name AS name
                         FROM delivery_men d
                         JOIN users u ON d.user_id = u.user_id
                         LEFT JOIN orders o2 ON o2.delivery_man_id = d.delivery_man_id
                             AND o2.status IN ('processing', 'shipped')
                         WHERE d.shop_id = ? AND d.status = 'available'
                         GROUP BY d.delivery_man_id
                         ORDER BY COUNT(o2.order_id) ASC
                         LIMIT 1`,
                        [shopId]
                    );
                    if (bestDM) {
                        assignedDmId   = bestDM.delivery_man_id;
                        assignedDmName = bestDM.name;
                        await connection.query(
                            'UPDATE orders SET delivery_man_id = ? WHERE order_id = ?',
                            [assignedDmId, orderId]
                        );
                        console.log(`[AutoAssign] Delivery Man #${assignedDmId} (${assignedDmName}) auto-assigned to Order #${orderId} at ship time`);
                    }
                }

                if (!assignedDmId) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'No available delivery man to assign. Please add or free up a delivery man first.',
                    });
                }
            } else if (['off', 'busy', 'on_delivery'].includes(orderDM.dm_status)) {
                // Manually assigned but currently unavailable
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Cannot ship — ${assignedDmName} is currently "${orderDM.dm_status}". Please reassign or wait until they are available.`,
                });
            }

            // Delivery man confirmed — mark them as on_delivery
            await connection.query(
                "UPDATE delivery_men SET status = 'on_delivery' WHERE delivery_man_id = ?",
                [assignedDmId]
            );

            // Notify delivery man after commit (non-blocking)
            const [[dmUser]] = await connection.query(
                'SELECT user_id FROM delivery_men WHERE delivery_man_id = ?', [assignedDmId]
            );
            if (dmUser?.user_id) {
                const dmUserId = dmUser.user_id;
                setImmediate(() => createNotification(
                    db, dmUserId, 'order',
                    '🚚 New Delivery Assigned',
                    `Order #JM-${orderId} has been assigned to you for delivery. Check your dashboard.`,
                    Number(orderId)
                ).catch(() => {}));
            }
        }

        // If cancelling, restore stock — only if not already cancelled
        if (status === 'cancelled' && oldStatus !== 'cancelled') {
            const [items] = await connection.query(
                'SELECT product_id, quantity, selected_variant, listing_id FROM order_items WHERE order_id = ?',
                [orderId]
            );
            for (const item of items) {
                // Restore sold_count
                await connection.query(
                    'UPDATE products SET sold_count = GREATEST(sold_count - ?, 0) WHERE product_id = ?',
                    [item.quantity, item.product_id]
                );
                // Restore listing stock
                if (item.listing_id) {
                    await connection.query(
                        'UPDATE shop_listings SET stock_quantity = stock_quantity + ? WHERE listing_id = ?',
                        [item.quantity, item.listing_id]
                    );
                    // Restore color stock
                    if (item.selected_variant) {
                        const [[colorRow]] = await connection.query(
                            `SELECT color FROM product_colors
                             WHERE product_id = ? AND ? LIKE CONCAT('%', color, '%')
                             LIMIT 1`,
                            [item.product_id, item.selected_variant]
                        );
                        if (colorRow?.color) {
                            await connection.query(
                                'UPDATE listing_colors SET stock = stock + ? WHERE listing_id = ? AND color = ?',
                                [item.quantity, item.listing_id, colorRow.color]
                            );
                        }
                    }
                }
            }

            // ── Auto-restore worker status to 'available' on cancellation ──
            const [[cancelledOrder]] = await connection.query(
                `SELECT delivery_man_id,
                        (SELECT handyman_id FROM order_handymen WHERE order_id = ? LIMIT 1) AS handyman_id
                 FROM orders WHERE order_id = ?`,
                [orderId, orderId]
            );
            if (cancelledOrder?.delivery_man_id) {
                await connection.query(
                    `UPDATE delivery_men SET status = 'available' WHERE delivery_man_id = ?`,
                    [cancelledOrder.delivery_man_id]
                );
            }
            if (cancelledOrder?.handyman_id) {
                await connection.query(
                    `UPDATE handymen SET status = 'available' WHERE handyman_id = ?`,
                    [cancelledOrder.handyman_id]
                );
            }
        }

        if (status.toLowerCase() === 'delivered') {
            const [items] = await connection.query('SELECT request_id FROM order_items WHERE order_id = ? AND request_id IS NOT NULL', [orderId]);
            for (const item of items) {
                await connection.query('UPDATE custom_requests SET status = "completed" WHERE request_id = ?', [item.request_id]);
            }
        }

        // --- Phase 7.1: Escrow Wallet Release ---
        // When buyer confirms receipt (completed), release funds to seller's payout wallet
        // COD orders are excluded — the seller already collected cash directly from the buyer.
        if (status === 'completed' && oldStatus !== 'completed') {
            const [[orderInfo]] = await connection.query(
                'SELECT payment_method FROM orders WHERE order_id = ?', [orderId]
            );
            const isCOD = orderInfo?.payment_method?.toLowerCase() === 'cod';

            if (!isCOD) {
                const [shopTotals] = await connection.query(`
                    SELECT sl.shop_id, SUM(oi.price_at_purchase * oi.quantity) as earnings
                    FROM order_items oi
                    JOIN shop_listings sl ON sl.listing_id = oi.listing_id
                    WHERE oi.order_id = ?
                    GROUP BY sl.shop_id
                `, [orderId]);

                // Fetch dynamic commission settings
                const [settings] = await connection.query(
                    `SELECT \`key\`, value FROM platform_settings WHERE \`key\` IN ('commission_rate', 'transaction_fee_pct', 'transaction_fee_fixed')`
                );
                let commRate = 3.00, txPct = 2.00, txFixed = 15.00;
                settings.forEach(s => {
                    if (s.key === 'commission_rate') commRate = parseFloat(s.value) || 0;
                    if (s.key === 'transaction_fee_pct') txPct = parseFloat(s.value) || 0;
                    if (s.key === 'transaction_fee_fixed') txFixed = parseFloat(s.value) || 0;
                });

                let totalCommissionAmount = 0;
                let totalTransactionFeeAmount = 0;
                let totalSellerNet = 0;

                for (const st of shopTotals) {
                    const earnings = st.earnings;
                    const c_amt = (earnings * commRate) / 100;
                    const tx_amt = (earnings * txPct) / 100 + txFixed;
                    const s_net = earnings - c_amt - tx_amt;

                    totalCommissionAmount += c_amt;
                    totalTransactionFeeAmount += tx_amt;
                    totalSellerNet += s_net;

                    await connection.query(`
                        INSERT INTO payouts (shop_id, amount, status, created_at)
                        VALUES (?, ?, 'pending', NOW())
                    `, [st.shop_id, s_net]);
                }

                // Record deductions in the order
                await connection.query(`
                    UPDATE orders 
                    SET commission_rate = ?, commission_amount = ?,
                        transaction_fee_pct = ?, transaction_fee_fixed = ?, transaction_fee_amount = ?,
                        seller_net = ?
                    WHERE order_id = ?
                `, [commRate, totalCommissionAmount, txPct, txFixed, totalTransactionFeeAmount, totalSellerNet, orderId]);

                console.log(`[Escrow] Funds released to payout wallets for Order #${orderId}`);
            } else {
                console.log(`[Escrow] Skipped payout for COD Order #${orderId} — cash paid directly to seller.`);
            }
        }

        // --- Points: Award on completed (earned on subtotal before any discount) ---
        if (status === 'completed' && oldStatus !== 'completed') {
            try {
                const [[orderData]] = await connection.query(
                    'SELECT user_id, total_amount, IFNULL(points_redeemed, 0) as points_redeemed FROM orders WHERE order_id = ?',
                    [orderId]
                );
                if (orderData) {
                    // Calculate on subtotal: undo the points discount that was already baked into total_amount
                    const pointsDiscountValue = (orderData.points_redeemed / REDEEM_RATE) * 10;
                    const subtotal = orderData.total_amount + pointsDiscountValue;
                    const pointsEarned = Math.floor(subtotal / EARN_RATE);
                    if (pointsEarned > 0) {
                        await ensurePointsRow(connection, orderData.user_id);
                        await connection.query(
                            'UPDATE user_points SET balance = balance + ?, lifetime = lifetime + ? WHERE user_id = ?',
                            [pointsEarned, pointsEarned, orderData.user_id]
                        );
                        await connection.query(
                            'INSERT INTO points_transactions (user_id, order_id, type, points, note) VALUES (?, ?, "earn", ?, ?)',
                            [orderData.user_id, orderId, pointsEarned, `Order #JM-${orderId} completed`]
                        );
                        await connection.query(
                            'UPDATE orders SET points_earned = ? WHERE order_id = ?',
                            [pointsEarned, orderId]
                        );
                    }
                }
            } catch (pErr) {
                console.error('[Points] Failed to award points:', pErr.message);
            }
        }

        const tsColumnMap = {
            processing: 'processed_at',
            shipped:    'shipped_at',
            delivered:  'delivered_at',
            completed:  'completed_at',
        };
        const tsCol = tsColumnMap[status];
        if (tsCol) {
            await connection.query(
                `UPDATE orders SET status = ?, ${tsCol} = NOW() WHERE order_id = ?`,
                [status, orderId]
            );
        } else {
            await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);
        }

        await connection.commit();

        // 🔔 Notify the buyer about the status change (use db pool, not released connection)
        const [[orderRow]] = await db.query(
            'SELECT user_id, payment_method FROM orders WHERE order_id = ?', [orderId]
        );

        if (orderRow) {
            const buyerId = orderRow.user_id;
            const statusNotifs = {
                processing: { title: 'Order Being Processed 🏭', msg: `Your order #JM-${orderId} is now being processed by the seller.` },
                shipped: { title: 'Order Out for Delivery 🚚', msg: `Great news! Your order #JM-${orderId} is on its way to you.` },
                delivered: { title: 'Order Delivered! 🎉', msg: `Your order #JM-${orderId} has been delivered. Please confirm receipt.` },
                completed: { title: 'Order Completed ✅', msg: `Your order #JM-${orderId} is complete. You earned loyalty points! Thank you!` },
                cancelled: { title: 'Order Cancelled', msg: `Your order #JM-${orderId} has been cancelled by the seller.` },
            };
            const notif = statusNotifs[status];
            if (notif) {
                await createNotification(db, buyerId, status === 'delivered' ? 'order' : status === 'cancelled' ? 'system' : 'delivery', notif.title, notif.msg, Number(orderId));
            }

            // 🔔 When delivered: notify seller to confirm payment (COD) or check uploaded proof (digital)
            if (status === 'delivered') {
                const isCOD = (orderRow.payment_method || '').toLowerCase().includes('cash') ||
                    (orderRow.payment_method || '').toLowerCase() === 'cod';
                const [[sellerRow]] = await db.query(
                    `SELECT DISTINCT s.user_id AS seller_id FROM order_items oi
                     JOIN shop_listings sl ON sl.listing_id = oi.listing_id
                     JOIN shops s ON s.shop_id = sl.shop_id
                     WHERE oi.order_id = ? LIMIT 1`,
                    [orderId]
                );
                if (sellerRow?.seller_id) {
                    const sellerMsg = isCOD
                        ? `Order #JM-${orderId} was delivered. Please confirm you received the cash payment from the buyer.`
                        : `Order #JM-${orderId} was delivered. Please remind the buyer to upload their payment proof.`;
                    await createNotification(
                        db, sellerRow.seller_id, 'order',
                        '💵 Confirm Payment Collection',
                        sellerMsg,
                        Number(orderId)
                    );
                }
            }
        }

        res.json({ success: true, message: 'Order status updated' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Update Order Status Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    } finally {
        if (connection) connection.release();
    }
});

// Get Shop Statistics
router.get('/stats', async (req, res) => {
    const { user_id } = req.query;

    try {
        // Get shop_id
        const [shopRows] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }
        const shop_id = shopRows[0].shop_id;

        // 1. Total Revenue
        const [revenueRows] = await db.query(`
            SELECT SUM(oi.price_at_purchase * oi.quantity) as total_revenue
            FROM order_items oi
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            JOIN orders o ON oi.order_id = o.order_id
            WHERE sl.shop_id = ? AND o.status != 'cancelled'
        `, [shop_id]);
        const total_revenue = revenueRows[0].total_revenue || 0;

        // 2. Total Orders
        const [ordersRows] = await db.query(`
            SELECT COUNT(DISTINCT o.order_id) as total_orders
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            WHERE sl.shop_id = ? AND o.status != 'cancelled'
        `, [shop_id]);
        const total_orders = ordersRows[0].total_orders || 0;

        // 3. Total Products (active listings)
        const [productsRows] = await db.query(
            'SELECT COUNT(*) as total_products FROM shop_listings WHERE shop_id = ? AND is_active = 1',
            [shop_id]
        );
        const total_products = productsRows[0].total_products || 0;

        // 4. Top Selling Products
        const [topProducts] = await db.query(`
            SELECT p.title, SUM(oi.quantity) as sold_count, SUM(oi.price_at_purchase * oi.quantity) as revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            JOIN orders o ON oi.order_id = o.order_id
            WHERE sl.shop_id = ? AND o.status != 'cancelled'
            GROUP BY p.product_id
            ORDER BY sold_count DESC
            LIMIT 5
        `, [shop_id]);

        // 5. Recent Items Sold
        const [recentSales] = await db.query(`
            SELECT p.title, oi.price_at_purchase as price, oi.quantity, o.created_at, u.full_name as buyer
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            JOIN orders o ON oi.order_id = o.order_id
            JOIN users u ON o.user_id = u.user_id
            WHERE sl.shop_id = ? AND o.status != 'cancelled'
            ORDER BY o.created_at DESC
            LIMIT 5
        `, [shop_id]);

        // 6. Review Tags Distribution
        const [tagRows] = await db.query(`
            SELECT rt.tag, COUNT(*) AS count
            FROM review_tags rt
            JOIN reviews r  ON rt.review_id  = r.review_id
            JOIN shop_listings sl ON sl.product_id = r.product_id
            WHERE sl.shop_id = ?
            GROUP BY rt.tag
            ORDER BY count DESC
        `, [shop_id]);

        const tagCounts = {};
        tagRows.forEach(row => { tagCounts[row.tag] = row.count; });

        // Convert to array
        const tagStats = Object.keys(tagCounts).map(tag => ({
            tag,
            count: tagCounts[tag]
        })).sort((a, b) => b.count - a.count);

        // 7. Overall Rating
        const [ratingRows] = await db.query(`
            SELECT ROUND(AVG(r.rating), 1) as avg_rating, COUNT(r.review_id) as review_count
            FROM reviews r
            JOIN shop_listings sl ON sl.product_id = r.product_id
            WHERE sl.shop_id = ?
        `, [shop_id]);

        const avg_rating = Number(ratingRows[0].avg_rating || 0).toFixed(1);
        const review_count = ratingRows[0].review_count || 0;


        // 8. Sales History (Last 7 Days)
        const [salesData] = await db.query(`
            SELECT DATE(o.created_at) as date, SUM(oi.price_at_purchase * oi.quantity) as total
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            WHERE sl.shop_id = ? AND o.status != 'cancelled'
              AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(o.created_at)
        `, [shop_id]);

        // Fill in missing days
        const salesHistory = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const found = salesData.find(item => {
                // Handle different timezone/date formats returned by MySQL driver
                const itemDate = new Date(item.date).toISOString().split('T')[0];
                return itemDate === dateStr;
            });
            salesHistory.push({
                date: dateStr,
                total: found ? Number(found.total) : 0
            });
        }

        // 9. Order Status Distribution
        const [statusRows] = await db.query(`
            SELECT o.status, COUNT(DISTINCT o.order_id) as count
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            WHERE sl.shop_id = ?
            GROUP BY o.status
        `, [shop_id]);

        // 10. Low Stock Alert (listing stock <= 25% of initial estimate)
        const [lowStockProducts] = await db.query(`
            SELECT p.title, sl.stock_quantity, p.image_url, p.sold_count
            FROM shop_listings sl
            JOIN products p ON p.product_id = sl.product_id
            WHERE sl.shop_id = ?
              AND sl.stock_quantity <= (sl.stock_quantity + p.sold_count) * 0.25
              AND sl.is_active = 1
            ORDER BY sl.stock_quantity ASC
            LIMIT 5
        `, [shop_id]);

        // 11. Wallet/Payout Balances
        const [payoutRows] = await db.query(`
            SELECT status, SUM(amount) as total
            FROM payouts
            WHERE shop_id = ?
            GROUP BY status
        `, [shop_id]);

        let wallet_pending = 0;
        let wallet_available = 0;
        let wallet_withdrawn = 0;

        payoutRows.forEach(row => {
            if (row.status === 'pending') wallet_available += parseFloat(row.total);
            if (row.status === 'requested') wallet_pending += parseFloat(row.total);
            if (row.status === 'approved') wallet_withdrawn += parseFloat(row.total);
        });

        // 12. Monthly Revenue (Last 12 months)
        const [monthlyRevData] = await db.query(`
            SELECT DATE_FORMAT(o.created_at, '%Y-%m') as month,
                   SUM(oi.price_at_purchase * oi.quantity) as revenue,
                   COUNT(DISTINCT o.order_id) as orders
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN shop_listings sl ON sl.listing_id = oi.listing_id
            WHERE sl.shop_id = ? AND o.status != 'cancelled'
              AND o.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
            ORDER BY month ASC
        `, [shop_id]);

        res.json({
            success: true,
            stats: {
                total_revenue,
                total_orders,
                total_products,
                top_products: topProducts,
                recent_sales: recentSales,
                tag_stats: tagStats,
                avg_rating,
                review_count,
                sales_history: salesHistory,
                monthly_revenue: monthlyRevData,
                status_distribution: statusRows,
                low_stock_products: lowStockProducts,
                wallet_pending,
                wallet_available,
                wallet_withdrawn
            }
        });
    } catch (error) {
        console.error('Get Shop Stats Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Update Shop Settings
router.put('/update', uploadShop.single('logo'), async (req, res) => {
    const { user_id, shop_name, description, address, address_details } = req.body;
    const logo_url = req.file ? `uploads/shops/${req.file.filename}` : undefined;

    try {
        let oldLogo = null;
        // Fetch old address + logo before overwriting
        const [shopRows] = await db.query('SELECT shop_id, logo_url, address FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) return res.status(404).json({ success: false, message: 'Shop not found' });
        const shopId   = shopRows[0].shop_id;
        const oldAddr  = shopRows[0].address;
        if (logo_url) oldLogo = shopRows[0].logo_url;

        let query = 'UPDATE shops SET shop_name = ?, description = ?, address = ?, address_details = ?';
        let params = [shop_name, description, address, address_details || null];

        // ── Coordinate update strategy ─────────────────────────────────────────
        // Priority 1: Frontend passed exact coords (from autocomplete selection) — instant, 100% accurate
        // Priority 2: Address text changed — re-geocode via Nominatim (with progressive fallback)
        const frontendLat = req.body.latitude  ? parseFloat(req.body.latitude)  : null;
        const frontendLng = req.body.longitude ? parseFloat(req.body.longitude) : null;

        if (frontendLat && frontendLng) {
            console.log(`[geocode] Shop "${shop_name}" using frontend coords → (${frontendLat}, ${frontendLng})`);
            query += ', latitude = ?, longitude = ?';
            params.push(frontendLat, frontendLng);
            await db.query('DELETE FROM distance_cache');
            console.log(`[cache] distance_cache cleared after address change for shop ${shopId}`);
        } else if (address && address !== oldAddr) {
            const { latitude, longitude } = await geocodeShopAddress(address);
            if (latitude) {
                console.log(`[geocode] Shop "${shop_name}" re-geocoded → (${latitude}, ${longitude})`);
                query += ', latitude = ?, longitude = ?';
                params.push(latitude, longitude);
                await db.query('DELETE FROM distance_cache');
                console.log(`[cache] distance_cache cleared after address change for shop ${shopId}`);
            } else {
                console.warn(`[geocode] Could not geocode new address for shop ${shopId}: "${address}"`);
            }
        }

        if (logo_url) {
            query += ', logo_url = ?';
            params.push(logo_url);
        }

        query += ' WHERE user_id = ?';
        params.push(user_id);

        await db.query(query, params);

        // Delete old logo from disk if a new one was uploaded
        if (oldLogo) unlinkFile(oldLogo);

        res.json({ success: true, message: 'Shop updated successfully', logo_url });
    } catch (error) {
        console.error('Update Shop Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Delete Shop
router.delete('/delete', async (req, res) => {
    const { user_id } = req.query;

    try {
        const [shopRows] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }
        const shop_id = shopRows[0].shop_id;

        // 1. Deactivate products
        await db.query('UPDATE products SET is_active = 0 WHERE shop_id = ?', [shop_id]);

        // 2. Delete shop (Products shop_id becomes NULL due to ON DELETE SET NULL)
        await db.query('DELETE FROM shops WHERE shop_id = ?', [shop_id]);

        // 3. Downgrade user role
        await db.query('UPDATE users SET role = "customer" WHERE user_id = ?', [user_id]);

        res.json({ success: true, message: 'Shop deleted successfully' });
    } catch (error) {
        console.error('Delete Shop Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Public Shop Profile
router.get('/public/:shopId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT s.*, u.full_name as owner_name, u.email,
                   (SELECT COUNT(*) FROM shop_listings sl WHERE sl.shop_id = s.shop_id AND sl.is_active = 1) as total_products,
                   (SELECT COUNT(DISTINCT o.order_id) 
                    FROM orders o 
                    JOIN order_items oi ON o.order_id = oi.order_id 
                    JOIN shop_listings sl ON sl.listing_id = oi.listing_id 
                    WHERE sl.shop_id = s.shop_id AND o.status != 'cancelled') as total_sales,
                    (SELECT ROUND(AVG(r.rating), 1) 
                     FROM reviews r 
                     JOIN shop_listings sl ON sl.product_id = r.product_id 
                     WHERE sl.shop_id = s.shop_id) as avg_rating,
                    (SELECT COUNT(r.review_id) 
                     FROM reviews r 
                     JOIN shop_listings sl ON sl.product_id = r.product_id 
                     WHERE sl.shop_id = s.shop_id) as review_count
            FROM shops s
            JOIN users u ON s.user_id = u.user_id
            WHERE s.shop_id = ?
        `, [req.params.shopId]);

        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Shop not found' });

        res.json({ success: true, shop: rows[0] });
    } catch (error) {
        console.error('Get Public Shop Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

router.get('/public/:shopId/products', async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT v.*, 
                   sl.listing_id, 
                   sl.price, 
                   sl.stock_quantity, 
                   sl.shop_id,
                   c.name AS category
            FROM vw_product_details v
            JOIN products p ON v.product_id = p.product_id
            JOIN shop_listings sl ON sl.product_id = v.product_id
            LEFT JOIN categories c ON p.category_id = c.category_id
            WHERE sl.shop_id = ? AND p.is_active = 1 AND sl.is_active = 1
            ORDER BY v.created_at DESC
        `, [req.params.shopId]);

        res.json({ success: true, products });
    } catch (error) {
        console.error('Get Public Shop Products Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Request Payout
router.post('/request-payout', async (req, res) => {
    const { user_id, amount, bank_name, account_name, account_number } = req.body;

    try {
        const [shopRows] = await db.query('SELECT shop_id FROM shops WHERE user_id = ?', [user_id]);
        if (shopRows.length === 0) return res.status(404).json({ success: false, message: 'Shop not found' });
        const shop_id = shopRows[0].shop_id;

        // Verify available balance (all 'pending' payouts)
        const [availableRows] = await db.query(`SELECT SUM(amount) as total_avail FROM payouts WHERE shop_id = ? AND status = 'pending'`, [shop_id]);
        const availableAmount = parseFloat(availableRows[0].total_avail || 0);

        if (parseFloat(amount) > availableAmount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid or insufficient amount to withdraw' });
        }

        // Technically, a robust system would debit the 'pending' rows and create a 'withdrawal' row. 
        // For simplicity, we create a negative 'requested' row to offset the balance, or update the pending rows.
        // Let's just create a new requested payout to track the withdrawal action.

        await db.query(`
            INSERT INTO payouts (shop_id, amount, bank_name, account_name, account_number, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'requested', NOW())
        `, [shop_id, amount, bank_name, account_name, account_number]);

        // Also deduct from available by inserting a negative pending amount to balance the ledger
        await db.query(`
            INSERT INTO payouts (shop_id, amount, status, created_at)
            VALUES (?, ?, 'pending', NOW())
        `, [shop_id, -Math.abs(amount)]);

        res.json({ success: true, message: 'Withdrawal request submitted successfully' });

    } catch (error) {
        console.error('Request Payout Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
