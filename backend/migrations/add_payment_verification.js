/**
 * Migration: add_payment_verification.js
 * Adds payment_status / payment_proof columns to `orders`
 * and creates the new `payment_installments` table.
 *
 * Run once:  node backend/migrations/add_payment_verification.js
 */
const db = require('../config/db');

async function run() {
    console.log('[migration] Starting payment verification migration...');

    // ── 1. orders: add payment_status, payment_verified_at, payment_proof_url ─
    try {
        const [cols] = await db.query(`SHOW COLUMNS FROM orders LIKE 'payment_status'`);
        if (cols.length === 0) {
            await db.query(`
                ALTER TABLE orders
                ADD COLUMN payment_status      ENUM('unpaid','partial','submitted','paid','verified')
                                               NOT NULL DEFAULT 'unpaid'
                                               AFTER status,
                ADD COLUMN payment_verified_at TIMESTAMP NULL,
                ADD COLUMN payment_proof_url   VARCHAR(255) NULL
            `);
            console.log('[migration] ✅ orders.payment_status, payment_verified_at, payment_proof_url added');
        } else {
            console.log('[migration] ℹ️  orders.payment_status already exists — skipped');
        }
    } catch (err) {
        console.error('[migration] ❌ Error altering orders table:', err.message);
    }

    // ── 2. Create payment_installments table ──────────────────────────────────
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS payment_installments (
                installment_id  INT AUTO_INCREMENT PRIMARY KEY,
                order_id        INT          NOT NULL,
                request_id      INT          NULL,
                phase           VARCHAR(50)  NOT NULL COMMENT 'e.g. downpayment, final_balance',
                amount          DECIMAL(10,2) NOT NULL,
                due_date        DATE         NULL,
                payment_status  ENUM('pending','submitted','verified','rejected')
                                NOT NULL DEFAULT 'pending',
                proof_url       VARCHAR(255) NULL COMMENT 'buyer-uploaded proof image',
                submitted_at    TIMESTAMP    NULL,
                verified_at     TIMESTAMP    NULL,
                verified_by     INT          NULL COMMENT 'user_id of seller/admin who verified',
                rejection_reason TEXT        NULL,
                notes           TEXT         NULL,
                created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_order_id   (order_id),
                INDEX idx_request_id (request_id),
                FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('[migration] ✅ payment_installments table ready');
    } catch (err) {
        console.error('[migration] ❌ Error creating payment_installments:', err.message);
    }

    console.log('[migration] Done.');
    process.exit(0);
}

run().catch((err) => {
    console.error('[migration] Fatal:', err.message);
    process.exit(1);
});
