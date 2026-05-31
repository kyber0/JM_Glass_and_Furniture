/**
 * routes/payment_verifications.js
 *
 * Handles all payment proof upload and verification flows for:
 *  - Regular orders (COD / digital payment after delivery)
 *  - Installment / milestone payments (custom requests)
 *
 * Mounted at /api/payment-verifications (requireAny() in server.js)
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');

// ── Multer: store proof images in uploads/payment_proofs/ ─────────────────────
const proofDir = path.join(__dirname, '../uploads/payment_proofs');
if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, proofDir),
    filename:    (_req, file, cb) => {
        const ext  = path.extname(file.originalname);
        const name = `proof_${Date.now()}${ext}`;
        cb(null, name);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('Only image or PDF files are allowed for payment proof'));
        }
    },
});

// ── Auto-migrate: ensure payment_installments + orders columns exist ──────────
(async () => {
    try {
        const [cols] = await db.query(`SHOW COLUMNS FROM orders LIKE 'payment_status'`);
        if (cols.length === 0) {
            await db.query(`
                ALTER TABLE orders
                ADD COLUMN payment_status      ENUM('unpaid','partial','submitted','paid','verified')
                                               NOT NULL DEFAULT 'unpaid' AFTER status,
                ADD COLUMN payment_verified_at TIMESTAMP NULL,
                ADD COLUMN payment_proof_url   VARCHAR(255) NULL
            `);
            console.log('[payment_verifications] ✅ orders payment columns added');
        }

        await db.query(`
            CREATE TABLE IF NOT EXISTS payment_installments (
                installment_id   INT AUTO_INCREMENT PRIMARY KEY,
                order_id         INT NOT NULL,
                request_id       INT NULL,
                phase            VARCHAR(50) NOT NULL,
                amount           DECIMAL(10,2) NOT NULL,
                due_date         DATE NULL,
                payment_status   ENUM('pending','submitted','verified','rejected') NOT NULL DEFAULT 'pending',
                proof_url        VARCHAR(255) NULL,
                submitted_at     TIMESTAMP NULL,
                verified_at      TIMESTAMP NULL,
                verified_by      INT NULL,
                rejection_reason TEXT NULL,
                notes            TEXT NULL,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_order_id (order_id),
                FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('[payment_verifications] ✅ payment_installments table ready');
    } catch (err) {
        console.error('[payment_verifications] Migration error:', err.message);
    }
})();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payment-verifications/submit-proof
// Buyer: upload a payment proof image for a given order or installment
// Body (multipart): order_id, [installment_id], [notes]
// File field: proof
// ─────────────────────────────────────────────────────────────────────────────
router.post('/submit-proof', upload.single('proof'), async (req, res) => {
    const { order_id, installment_id, notes } = req.body;
    const proofFile = req.file;

    if (!order_id) return res.status(400).json({ success: false, message: 'order_id is required' });
    if (!proofFile) return res.status(400).json({ success: false, message: 'No proof file uploaded' });

    const proofUrl = `uploads/payment_proofs/${proofFile.filename}`;

    try {
        // ── Update the specific installment if provided ───────────────────────
        if (installment_id) {
            await db.query(
                `UPDATE payment_installments
                 SET payment_status = 'submitted',
                     proof_url      = ?,
                     submitted_at   = NOW(),
                     notes          = ?
                 WHERE installment_id = ? AND order_id = ?`,
                [proofUrl, notes || null, installment_id, order_id]
            );
        }

        // ── Update the parent order payment_status ────────────────────────────
        await db.query(
            `UPDATE orders
             SET payment_status    = 'submitted',
                 payment_proof_url = ?
             WHERE order_id = ?`,
            [proofUrl, order_id]
        );

        // ── Notify seller ─────────────────────────────────────────────────────
        const [[order]] = await db.query(
            `SELECT o.user_id AS buyer_id,
                    (SELECT s.user_id FROM order_items oi
                     JOIN products p ON p.product_id = oi.product_id
                     JOIN shops s ON s.shop_id = p.shop_id
                     WHERE oi.order_id = o.order_id LIMIT 1) AS seller_id
             FROM orders o WHERE o.order_id = ?`,
            [order_id]
        );

        if (order?.seller_id) {
            await createNotification(
                db, order.seller_id, 'order',
                '💳 Payment Proof Submitted',
                `A buyer submitted payment proof for Order #JM-${order_id}. Please review and verify.`,
                Number(order_id)
            );
        }

        res.json({ success: true, message: 'Payment proof submitted successfully', proof_url: proofUrl });
    } catch (err) {
        console.error('Submit proof error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/payment-verifications/:orderId/verify
// Seller / Admin: mark order payment as verified
// Body: { verified_by_user_id, [installment_id] }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:orderId/verify', async (req, res) => {
    const { orderId } = req.params;
    const { verified_by_user_id, installment_id } = req.body;

    try {
        // Verify specific installment if provided
        if (installment_id) {
            await db.query(
                `UPDATE payment_installments
                 SET payment_status = 'verified',
                     verified_at    = NOW(),
                     verified_by    = ?
                 WHERE installment_id = ? AND order_id = ?`,
                [verified_by_user_id || null, installment_id, orderId]
            );
        }

        // Check if all installments are verified (or none exist)
        const [pending] = await db.query(
            `SELECT COUNT(*) AS cnt FROM payment_installments
             WHERE order_id = ? AND payment_status NOT IN ('verified')`,
            [orderId]
        );

        const allDone = !pending[0] || pending[0].cnt === 0;

        await db.query(
            `UPDATE orders
             SET payment_status      = ?,
                 payment_verified_at = NOW()
             WHERE order_id = ?`,
            [allDone ? 'verified' : 'partial', orderId]
        );

        // Notify buyer
        const [[order]] = await db.query(
            `SELECT user_id FROM orders WHERE order_id = ?`, [orderId]
        );
        if (order?.user_id) {
            await createNotification(
                db, order.user_id, 'order',
                '✅ Payment Confirmed!',
                `Your payment for Order #JM-${orderId} has been verified by the seller.`,
                Number(orderId)
            );
        }

        res.json({ success: true, message: 'Payment verified successfully', all_verified: allDone });
    } catch (err) {
        console.error('Verify payment error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/payment-verifications/:orderId/reject
// Seller / Admin: reject payment proof with a reason
// Body: { reason, [installment_id] }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:orderId/reject', async (req, res) => {
    const { orderId } = req.params;
    const { reason, installment_id } = req.body;

    try {
        if (installment_id) {
            await db.query(
                `UPDATE payment_installments
                 SET payment_status    = 'rejected',
                     rejection_reason  = ?
                 WHERE installment_id = ? AND order_id = ?`,
                [reason || 'No reason provided', installment_id, orderId]
            );
        }

        // Reset order to unpaid so buyer resubmits
        await db.query(
            `UPDATE orders SET payment_status = 'unpaid', payment_proof_url = NULL WHERE order_id = ?`,
            [orderId]
        );

        // Notify buyer
        const [[order]] = await db.query(
            `SELECT user_id FROM orders WHERE order_id = ?`, [orderId]
        );
        if (order?.user_id) {
            await createNotification(
                db, order.user_id, 'order',
                '❌ Payment Proof Rejected',
                `Your payment proof for Order #JM-${orderId} was rejected. Reason: ${reason || 'Does not meet requirements'}. Please resubmit.`,
                Number(orderId)
            );
        }

        res.json({ success: true, message: 'Payment proof rejected' });
    } catch (err) {
        console.error('Reject payment error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/payment-verifications/:orderId/confirm-cash
// Seller: confirm cash was physically received (COD orders)
// Body: { seller_user_id }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:orderId/confirm-cash', async (req, res) => {
    const { orderId } = req.params;
    const { seller_user_id } = req.body;

    try {
        await db.query(
            `UPDATE orders
             SET payment_status = 'verified', payment_verified_at = NOW()
             WHERE order_id = ?`,
            [orderId]
        );

        // Notify buyer
        const [[order]] = await db.query(
            `SELECT user_id FROM orders WHERE order_id = ?`, [orderId]
        );
        if (order?.user_id) {
            await createNotification(
                db, order.user_id, 'order',
                '✅ Cash Payment Confirmed!',
                `Your cash payment for Order #JM-${orderId} has been confirmed by the seller.`,
                Number(orderId)
            );
        }

        res.json({ success: true, message: 'Cash payment confirmed' });
    } catch (err) {
        console.error('Confirm cash error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payment-verifications/order/:orderId
// Both: get order payment status + all installments
// ─────────────────────────────────────────────────────────────────────────────
router.get('/order/:orderId', async (req, res) => {
    try {
        const [[order]] = await db.query(
            `SELECT order_id, payment_status, payment_verified_at, payment_proof_url,
                    payment_method, total_amount, status
             FROM orders WHERE order_id = ?`,
            [req.params.orderId]
        );
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const [installments] = await db.query(
            `SELECT installment_id, phase, amount, due_date, payment_status,
                    proof_url, submitted_at, verified_at, rejection_reason, notes
             FROM payment_installments
             WHERE order_id = ?
             ORDER BY created_at ASC`,
            [req.params.orderId]
        );

        res.json({ success: true, data: { ...order, installments } });
    } catch (err) {
        console.error('Get payment info error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payment-verifications/pending/:userId
// Seller: get all orders pending payment verification for their shop
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT DISTINCT o.order_id, o.total_amount, o.payment_status,
                    o.payment_proof_url, o.created_at, o.status AS order_status,
                    u.full_name AS buyer_name
             FROM orders o
             JOIN users u ON u.user_id = o.user_id
             JOIN order_items oi ON oi.order_id = o.order_id
             JOIN products p ON p.product_id = oi.product_id
             JOIN shops s ON s.shop_id = p.shop_id
             WHERE s.user_id = ?
               AND o.payment_status IN ('unpaid','submitted')
               AND o.status IN ('delivered','completed')
             ORDER BY o.created_at DESC`,
            [req.params.userId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Get pending verifications error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
