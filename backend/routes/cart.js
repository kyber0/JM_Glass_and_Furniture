const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET cart items for a user
router.get('/:userId', async (req, res) => {
    try {
        const query = `
            SELECT c.*,
                   p.title,
                   COALESCE(sl.custom_price, p.price) AS price,
                   p.image_url,
                   COALESCE(sl.stock_quantity, p.stock_quantity) AS stock_quantity,
                   p.is_fragile,
                   p.fragility_level,
                   p.installation_complexity,
                   sl.shop_id,
                   s.shop_name,
                   s.latitude AS shop_lat,
                   s.longitude AS shop_lng
            FROM cart_items c
            JOIN products p ON c.product_id = p.product_id
            LEFT JOIN shop_listings sl ON c.listing_id = sl.listing_id
            LEFT JOIN shops s ON sl.shop_id = s.shop_id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
        `;
        const [rows] = await db.query(query, [req.params.userId]);

        // Map to match frontend structure if needed, but for now raw is okay
        // Frontend expects: id, title, price, image, quantity, etc.
        const cartItems = rows.map(item => ({
            cart_item_id: item.cart_item_id, // backend ID
            id: item.product_id, // product ID
            listing_id: item.listing_id,
            title: item.title,
            price: item.price,
            image: item.image_url,
            quantity: item.quantity,
            stock: item.stock_quantity,
            selectedSize: item.selected_size,
            selectedColor: item.selected_color,
            serviceType: item.service_type,
            is_fragile: item.is_fragile,
            fragility_level: item.fragility_level || 'none',
            installationComplexity: item.installation_complexity || 'basic',
            shop_id: item.shop_id,
            shop_name: item.shop_name,
            shop_lat: item.shop_lat,
            shop_lng: item.shop_lng,
            // Construct a unique ID for frontend key
            cartId: `db_${item.cart_item_id}`
        }));

        res.json({ success: true, data: cartItems });
    } catch (error) {
        console.error('Get Cart Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// POST - Add to cart
router.post('/add', async (req, res) => {
    const { user_id, product_id, listing_id, quantity, selected_size, selected_color, service_type } = req.body;

    // Validate quantity
    const qty = parseInt(quantity);
    if (!qty || qty < 1) {
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    // Validate product_id
    const pid = parseInt(product_id);
    if (!pid || pid < 1) {
        return res.status(400).json({ success: false, message: 'Invalid product_id' });
    }

    const lid = listing_id == null ? null : parseInt(listing_id);
    if (!lid || lid < 1) {
        return res.status(400).json({ success: false, message: 'Invalid listing_id' });
    }
    if (!service_type || !['Delivery', 'Installation'].includes(service_type)) {
        return res.status(400).json({ success: false, message: 'Please choose Delivery or Installation.' });
    }

    try {
        // Ownership + stock is determined by the selected shop listing (not products.stock_quantity)
        const ownerSql = `
            SELECT s.user_id AS owner_id, sl.stock_quantity, sl.service_types
            FROM shop_listings sl
            JOIN shops s ON sl.shop_id = s.shop_id
            WHERE sl.listing_id = ? AND sl.product_id = ? AND sl.is_active = 1
            LIMIT 1
        `;

        const [ownerCheck] = await db.query(ownerSql, [lid, pid]);

        if (!ownerCheck || ownerCheck.length < 1) {
            return res.status(404).json({ success: false, message: 'Listing not found or inactive.' });
        }

        if (ownerCheck.length > 0 && String(ownerCheck[0].owner_id) === String(user_id)) {
            return res.status(403).json({ success: false, message: "You cannot add your own product to the cart" });
        }

        const listingTypes = ownerCheck[0].service_types
            ? String(ownerCheck[0].service_types).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
            : [];
        const hasDelivery = listingTypes.includes('delivery');
        const hasInstall = listingTypes.includes('delivery_installation');
        if (!hasDelivery && !hasInstall) {
            return res.status(409).json({ success: false, message: 'This listing has no valid service option.' });
        }
        if (service_type === 'Delivery' && !hasDelivery) {
            return res.status(409).json({ success: false, message: 'Delivery is not available for this listing.' });
        }
        if (service_type === 'Installation' && !hasInstall) {
            return res.status(409).json({ success: false, message: 'Installation is not available for this listing.' });
        }

        const stockQty = ownerCheck[0]?.stock_quantity || 0;

        // Prevent creating cart rows with quantity 0 when out of stock
        if (stockQty < 1) {
            return res.status(409).json({ success: false, message: 'This item is out of stock.' });
        }

        // Check if item exists (same product + variants)
        const checkQuery = `
            SELECT cart_item_id, quantity FROM cart_items 
            WHERE user_id = ? AND product_id = ? AND (listing_id = ? OR (listing_id IS NULL AND ? IS NULL))
            AND (selected_size = ? OR (selected_size IS NULL AND ? IS NULL))
            AND (selected_color = ? OR (selected_color IS NULL AND ? IS NULL))
            AND (service_type = ? OR (service_type IS NULL AND ? IS NULL))
        `;
        const [existing] = await db.query(checkQuery, [
            user_id, pid, lid, lid,
            selected_size, selected_size,
            selected_color, selected_color,
            service_type, service_type
        ]);

        if (existing.length > 0) {
            const newQuantity = Math.min(existing[0].quantity + qty, stockQty);
            await db.query('UPDATE cart_items SET quantity = ? WHERE cart_item_id = ?', [newQuantity, existing[0].cart_item_id]);
            res.json({ success: true, message: 'Cart updated' });
        } else {
            const safeQty = Math.min(qty, stockQty);
            await db.query(
                `INSERT INTO cart_items (user_id, product_id, listing_id, quantity, selected_size, selected_color, service_type) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [user_id, pid, lid, safeQty, selected_size || null, selected_color || null, service_type || null]
            );
            res.json({ success: true, message: 'Item added to cart' });
        }
    } catch (error) {
        console.error('Add to Cart Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT - Update quantity (with stock cap + ownership check)
router.put('/:itemId', async (req, res) => {
    const { quantity, user_id } = req.body;

    // Validate quantity
    const qty = parseInt(quantity);
    if (qty === undefined || qty === null || isNaN(qty)) {
        return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    try {
        if (qty <= 0) {
            // Ownership check before delete
            await db.query('DELETE FROM cart_items WHERE cart_item_id = ? AND user_id = ?', [req.params.itemId, user_id]);
        } else {
            // Cap at stock
            const [[product]] = await db.query(
                `SELECT p.stock_quantity FROM cart_items ci
                 JOIN products p ON ci.product_id = p.product_id
                 WHERE ci.cart_item_id = ? AND ci.user_id = ?`,
                [req.params.itemId, user_id]
            );
            if (!product) {
                return res.status(404).json({ success: false, message: 'Cart item not found' });
            }
            const safeQty = Math.min(qty, product.stock_quantity);
            await db.query('UPDATE cart_items SET quantity = ? WHERE cart_item_id = ? AND user_id = ?',
                [safeQty, req.params.itemId, user_id]);
        }
        res.json({ success: true, message: 'Cart updated' });
    } catch (error) {
        console.error('Update Cart Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// DELETE - Remove item (ownership check)
router.delete('/:itemId', async (req, res) => {
    const { user_id } = req.query;
    try {
        await db.query('DELETE FROM cart_items WHERE cart_item_id = ? AND user_id = ?', [req.params.itemId, user_id]);
        res.json({ success: true, message: 'Item removed' });
    } catch (error) {
        console.error('Remove from Cart Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// DELETE - Clear cart
router.delete('/user/:userId', async (req, res) => {
    try {
        await db.query('DELETE FROM cart_items WHERE user_id = ?', [req.params.userId]);
        res.json({ success: true, message: 'Cart cleared' });
    } catch (error) {
        console.error('Clear Cart Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
