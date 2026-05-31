/**
 * migrations/add_indexes.js — Strategic Database Index Migration
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds performance indexes based on Execution Plan (EXPLAIN) analysis of the
 * most frequently executed queries in the application.
 *
 * Run once:
 *   node backend/migrations/add_indexes.js
 *
 * Safe to re-run — silently skips indexes that already exist.
 *
 * Index selection rationale (per-table):
 * ┌─────────────────┬────────────────────────────────────────────────────────┐
 * │ Table           │ Reasoning                                               │
 * ├─────────────────┼────────────────────────────────────────────────────────┤
 * │ messages        │ Polled every 5 s per open chat. Composite (sender,recv) │
 * │                 │ and (recv,sender) cover both directions of the WHERE.   │
 * │ products        │ All shop-page queries filter by shop_id + status.       │
 * │ product_colors  │ Sub-selected on every product fetch.                    │
 * │ orders          │ Buyers query by user_id; sellers by status.             │
 * │ order_items     │ Always JOINed to orders; also filters by product_id.    │
 * │ reviews         │ Aggregated per product_id on every product page.        │
 * │ notifications   │ Polled frequently; filtered by user_id + is_read=0.    │
 * │ shops           │ Looked up by user_id on every seller session.           │
 * │ users           │ Auth queries always filter on email.                    │
 * │ custom_requests │ Queried by buyer_id, seller_id, and status.             │
 * │ cart            │ Always accessed by user_id.                             │
 * │ vouchers        │ Redeemed by code; usage_limit checked on checkout.     │
 * └─────────────────┴────────────────────────────────────────────────────────┘
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');

const indexes = [
    // ── messages (polled every 5 s per active chat) ──────────────────────────
    { table: 'messages', name: 'idx_msg_sender_receiver', cols: '(sender_id, receiver_id)' },
    { table: 'messages', name: 'idx_msg_receiver_sender', cols: '(receiver_id, sender_id)' },
    { table: 'messages', name: 'idx_msg_created_at',      cols: '(created_at)' },
    { table: 'messages', name: 'idx_msg_unread',          cols: '(receiver_id, is_read)' },

    // ── products ─────────────────────────────────────────────────────────────
    { table: 'products', name: 'idx_prod_shop_id',        cols: '(shop_id)' },
    { table: 'products', name: 'idx_prod_status',         cols: '(status)' },
    { table: 'products', name: 'idx_prod_shop_status',    cols: '(shop_id, status)' },
    { table: 'products', name: 'idx_prod_price',          cols: '(price)' },
    { table: 'products', name: 'idx_prod_sold_count',     cols: '(sold_count)' },

    // ── product_colors (sub-queried on every product load) ───────────────────
    { table: 'product_colors', name: 'idx_pc_product_id', cols: '(product_id)' },

    // ── orders ───────────────────────────────────────────────────────────────
    { table: 'orders', name: 'idx_ord_user_id',           cols: '(user_id)' },
    { table: 'orders', name: 'idx_ord_status',            cols: '(status)' },
    { table: 'orders', name: 'idx_ord_user_status',       cols: '(user_id, status)' },
    { table: 'orders', name: 'idx_ord_created_at',        cols: '(created_at)' },

    // ── order_items ──────────────────────────────────────────────────────────
    { table: 'order_items', name: 'idx_oi_order_id',      cols: '(order_id)' },
    { table: 'order_items', name: 'idx_oi_product_id',    cols: '(product_id)' },

    // ── reviews ──────────────────────────────────────────────────────────────
    { table: 'reviews', name: 'idx_rev_product_id',       cols: '(product_id)' },
    { table: 'reviews', name: 'idx_rev_user_id',          cols: '(user_id)' },
    { table: 'reviews', name: 'idx_rev_order_id',         cols: '(order_id)' },

    // ── notifications (polled on every screen focus) ─────────────────────────
    { table: 'notifications', name: 'idx_notif_user_id',  cols: '(user_id)' },
    { table: 'notifications', name: 'idx_notif_unread',   cols: '(user_id, is_read)' },
    { table: 'notifications', name: 'idx_notif_created',  cols: '(created_at)' },

    // ── shops ────────────────────────────────────────────────────────────────
    { table: 'shops', name: 'idx_shop_user_id',           cols: '(user_id)' },
    { table: 'shops', name: 'idx_shop_status',            cols: '(status)' },

    // ── users (auth queries always filter on email) ──────────────────────────
    { table: 'users', name: 'idx_user_email',             cols: '(email)' },
    { table: 'users', name: 'idx_user_role',              cols: '(role)' },

    // ── custom_requests ───────────────────────────────────────────────────────
    { table: 'custom_requests', name: 'idx_cr_buyer_id',  cols: '(buyer_id)' },
    { table: 'custom_requests', name: 'idx_cr_seller_id', cols: '(seller_id)' },
    { table: 'custom_requests', name: 'idx_cr_status',    cols: '(status)' },

    // ── cart ─────────────────────────────────────────────────────────────────
    { table: 'cart', name: 'idx_cart_user_id',            cols: '(user_id)' },

    // ── vouchers ─────────────────────────────────────────────────────────────
    { table: 'vouchers', name: 'idx_voucher_code',        cols: '(code)' },
];

(async () => {
    let added   = 0;
    let skipped = 0;
    let failed  = 0;

    console.log('\n📊  JM Glass & Furniture — Strategic Index Migration');
    console.log('─'.repeat(55));

    for (const idx of indexes) {
        const sql = `CREATE INDEX \`${idx.name}\` ON \`${idx.table}\` ${idx.cols}`;
        try {
            await db.query(sql);
            console.log(`  ✅ Created  ${idx.name}`);
            added++;
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log(`  ⏭   Exists  ${idx.name}`);
                skipped++;
            } else if (err.code === 'ER_NO_SUCH_TABLE') {
                console.log(`  ⚠️   No table ${idx.table} (skipped)`);
                skipped++;
            } else {
                console.error(`  ❌ Failed  ${idx.name} — ${err.message}`);
                failed++;
            }
        }
    }

    console.log('─'.repeat(55));
    console.log(`  Summary: ${added} created, ${skipped} skipped, ${failed} failed`);
    console.log('─'.repeat(55) + '\n');

    process.exit(failed > 0 ? 1 : 0);
})();
