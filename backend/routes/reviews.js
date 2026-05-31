const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createNotification } = require('../utils/notifications.helper');

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/reviews/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, 'review-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Add Review
router.post('/', upload.single('image'), async (req, res) => {
    const { user_id, product_id, order_id, rating, tags, comment } = req.body;
    const image_url = req.file ? `uploads/reviews/${req.file.filename}` : null;

    // Validate rating
    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    try {
        // 1. Verify Order is Delivered and belongs to user
        const [orderRows] = await db.query(
            'SELECT status, user_id FROM orders WHERE order_id = ?',
            [order_id]
        );

        if (orderRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (orderRows[0].user_id != user_id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        if (orderRows[0].status !== 'delivered' && orderRows[0].status !== 'completed') {
            return res.status(400).json({ success: false, message: 'Order must be delivered or completed to leave a review' });
        }

        // 2. Verify Product is in Order
        const [itemRows] = await db.query(
            'SELECT item_id FROM order_items WHERE order_id = ? AND product_id = ?',
            [order_id, product_id]
        );

        if (itemRows.length === 0) {
            return res.status(400).json({ success: false, message: 'Product not found in this order' });
        }

        // 3. Check if already reviewed (Optional: allow one review per order-item)
        const [existing] = await db.query(
            'SELECT review_id FROM reviews WHERE order_id = ? AND product_id = ?',
            [order_id, product_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this product for this order' });
        }

        // 4. Insert Review (tags column removed — now stored in review_tags)
        const [insertResult] = await db.query(
            'INSERT INTO reviews (user_id, product_id, order_id, rating, comment, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [user_id, product_id, order_id, rating, comment, image_url]
        );
        const newReviewId = insertResult.insertId;

        // 4b. Write tags to normalized review_tags table
        if (tags) {
            const tagsArr = typeof tags === 'string' ? JSON.parse(tags) : tags;
            if (Array.isArray(tagsArr) && tagsArr.length > 0) {
                await db.query('INSERT IGNORE INTO review_tags (review_id, tag) VALUES ?',
                    [tagsArr.map(t => [newReviewId, t])]);
            }
        }

        // 🔔 Notify shop owner: new review
        const [productRows] = await db.query(`
            SELECT p.title, s.user_id as shop_owner_id, u.full_name as reviewer_name
            FROM products p
            JOIN shop_listings sl ON sl.product_id = p.product_id
            JOIN shops s ON sl.shop_id = s.shop_id
            JOIN users u ON u.user_id = ?
            WHERE p.product_id = ?
            LIMIT 1
        `, [user_id, product_id]);

        if (productRows.length > 0) {
            const { shop_owner_id, reviewer_name, title } = productRows[0];
            await createNotification(
                db, shop_owner_id, 'system',
                `New ${rating}⭐ Review on "${title}"`,
                `${reviewer_name} left a ${rating}-star review on your product.`
            );
        }

        // 🔔 Notify buyer: review submitted successfully
        await createNotification(
            db, user_id, 'system',
            'Review Submitted ✅',
            'Thank you for your feedback! Your review has been submitted successfully.'
        );

        res.json({ success: true, message: 'Review submitted successfully' });
    } catch (error) {
        console.error('Submit Review Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get Product Reviews (tags from normalized review_tags table)
router.get('/product/:productId', async (req, res) => {
    try {
        const [reviews] = await db.query(`
            SELECT r.*,
                   u.full_name as user_name,
                   u.profile_image as user_profile_image,
                   p.title as product_title,
                   p.image_url as product_image_url,
                   oi.selected_variant,
                   (SELECT GROUP_CONCAT(rt.tag ORDER BY rt.tag SEPARATOR '||')
                    FROM review_tags rt WHERE rt.review_id = r.review_id) AS tags_raw
            FROM reviews r
            JOIN users u ON r.user_id = u.user_id
            JOIN products p ON r.product_id = p.product_id
            LEFT JOIN order_items oi ON oi.order_id = r.order_id AND oi.product_id = r.product_id
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
        `, [req.params.productId]);

        // Reconstruct tags from the '||'-delimited string
        const parsedReviews = reviews.map(r => ({
            ...r,
            tags: r.tags_raw ? r.tags_raw.split('||') : [],
            tags_raw: undefined  // strip internal field
        }));

        res.json({ success: true, reviews: parsedReviews });
    } catch (error) {
        console.error('Get Reviews Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Seller Reply to Review
router.post('/:reviewId/reply', async (req, res) => {
    const { shop_id, reply } = req.body;
    const { reviewId } = req.params;
    if (!shop_id || !reply?.trim()) {
        return res.status(400).json({ success: false, message: 'shop_id and reply are required' });
    }
    try {
        // Verify review belongs to a product owned by this shop
        const [[review]] = await db.query(`
            SELECT r.review_id, r.user_id, p.title as product_title
            FROM reviews r
            JOIN products p ON r.product_id = p.product_id
            JOIN shop_listings sl ON sl.product_id = p.product_id
            JOIN shops s ON sl.shop_id = s.shop_id
            WHERE r.review_id = ? AND s.shop_id = ?
            LIMIT 1
        `, [reviewId, shop_id]);

        if (!review) {
            return res.status(403).json({ success: false, message: 'Not authorized to reply to this review' });
        }

        await db.query(
            'UPDATE reviews SET seller_reply = ?, replied_at = NOW() WHERE review_id = ?',
            [reply.trim(), reviewId]
        );

        // Notify the reviewer
        await createNotification(
            db, review.user_id, 'order',
            'Seller replied to your review 💬',
            `The seller replied to your review on "${review.product_title}".`
        );

        res.json({ success: true, message: 'Reply posted successfully' });
    } catch (error) {
        console.error('Seller Reply Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
