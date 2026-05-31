const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ── GET /api/vouchers/active (Optional: Show active promos to users) ───────
router.get('/active', async (req, res) => {
    try {
        const [vouchers] = await db.query(`
            SELECT code, discount_type, discount_value, min_spend, max_discount, start_date, end_date
            FROM vouchers
            WHERE is_active = 1
              AND (usage_limit IS NULL OR used_count < usage_limit)
              AND (start_date IS NULL OR start_date <= NOW())
              AND (end_date IS NULL OR end_date >= NOW())
            ORDER BY created_at DESC
        `);
        res.json({ success: true, data: vouchers });
    } catch (err) {
        console.error('Fetch active vouchers error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /api/vouchers/validate ───────────────────────────────────────────
router.post('/validate', async (req, res) => {
    const { code, subtotal, user_id } = req.body;

    if (!code) return res.status(400).json({ success: false, message: 'Voucher code is required' });
    if (!subtotal || isNaN(subtotal)) return res.status(400).json({ success: false, message: 'Invalid subtotal' });

    try {
        const [[voucher]] = await db.query('SELECT * FROM vouchers WHERE code = ?', [code]);

        if (!voucher) {
            return res.status(404).json({ success: false, message: 'Invalid voucher code' });
        }

        if (!voucher.is_active) {
            return res.status(400).json({ success: false, message: 'This voucher is no longer active' });
        }

        if (voucher.usage_limit !== null && voucher.used_count >= voucher.usage_limit) {
            return res.status(400).json({ success: false, message: 'This voucher has reached its usage limit' });
        }

        const now = new Date();
        if (voucher.start_date && new Date(voucher.start_date) > now) {
            return res.status(400).json({ success: false, message: 'This voucher is not yet valid' });
        }
        if (voucher.end_date && new Date(voucher.end_date) < now) {
            return res.status(400).json({ success: false, message: 'This voucher has expired' });
        }

        // Per-user usage check
        if (user_id) {
            const [[userVoucher]] = await db.query(
                'SELECT is_used FROM user_vouchers WHERE user_id = ? AND voucher_code = ?',
                [user_id, code]
            );
            if (userVoucher?.is_used) {
                return res.status(400).json({ success: false, message: 'You have already used this voucher' });
            }
        }

        const minSpend = parseFloat(voucher.min_spend) || 0;
        if (parseFloat(subtotal) < minSpend) {
            return res.status(400).json({ success: false, message: `Minimum spend of PHP ${minSpend.toFixed(2)} is required for this voucher` });
        }

        // Calculate Discount
        let discountAmount = 0;
        const discountValue = parseFloat(voucher.discount_value);

        if (voucher.discount_type === 'fixed') {
            discountAmount = discountValue;
        } else if (voucher.discount_type === 'percentage') {
            discountAmount = (parseFloat(subtotal) * discountValue) / 100;
        }

        // Apply max discount ceiling if applicable
        const maxDiscount = parseFloat(voucher.max_discount);
        if (!isNaN(maxDiscount) && maxDiscount > 0 && discountAmount > maxDiscount) {
            discountAmount = maxDiscount;
        }

        // Discount cannot exceed subtotal
        if (discountAmount > parseFloat(subtotal)) {
            discountAmount = parseFloat(subtotal);
        }

        res.json({
            success: true,
            discount: discountAmount,
            message: 'Voucher applied successfully!',
            voucher: {
                code: voucher.code,
                type: voucher.discount_type,
                value: voucher.discount_value
            }
        });

    } catch (err) {
        console.error('Validate voucher error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ──   ───────────────────────────────────────────
router.post('/claim', async (req, res) => {
    const { user_id, code } = req.body;

    if (!user_id || !code) return res.status(400).json({ success: false, message: 'User ID and Voucher Code are required' });

    try {
        const [[voucher]] = await db.query('SELECT * FROM vouchers WHERE code = ?', [code]);

        if (!voucher) return res.status(404).json({ success: false, message: 'Voucher code does not exist' });
        if (!voucher.is_active) return res.status(400).json({ success: false, message: 'Voucher is no longer active' });

        const now = new Date();
        if (voucher.start_date && new Date(voucher.start_date) > now) {
            return res.status(400).json({ success: false, message: 'This voucher cannot be claimed yet' });
        }
        if (voucher.end_date && new Date(voucher.end_date) < now) {
            return res.status(400).json({ success: false, message: 'This voucher has expired' });
        }

        // Check overall usage limit
        if (voucher.usage_limit !== null && voucher.used_count >= voucher.usage_limit) {
            return res.status(400).json({ success: false, message: 'This voucher is fully claimed' });
        }

        await db.query('INSERT INTO user_vouchers (user_id, voucher_code) VALUES (?, ?)', [user_id, code]);

        // Notify buyer
        const { createNotification } = require('../utils/notifications.helper');
        await createNotification(
            db, user_id, 'promo',
            'Voucher Claimed! 🎟️',
            `You claimed the promo code ${code}. Don't forget to use it during checkout!`,
            null
        );

        res.json({ success: true, message: 'Voucher claimed successfully!' });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'You have already claimed this voucher' });
        }
        console.error('Claim voucher error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/vouchers/my-vouchers/:userId ─────────────────────────────────
router.get('/my-vouchers/:userId', async (req, res) => {
    try {
        const [myVouchers] = await db.query(`
            SELECT uv.id as claim_id, v.code, v.discount_type, v.discount_value, v.min_spend, v.max_discount, v.end_date 
            FROM user_vouchers uv
            JOIN vouchers v ON uv.voucher_code = v.code
            WHERE uv.user_id = ? AND uv.is_used = 0 
                  AND v.is_active = 1
                  AND (v.end_date IS NULL OR v.end_date >= NOW())
            ORDER BY uv.claimed_at DESC
        `, [req.params.userId]);

        res.json({ success: true, data: myVouchers });
    } catch (err) {
        console.error('Fetch my vouchers error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
