/**
 * utils/autoAssign.js
 * Shared helper to auto-assign the best available worker to an order.
 *
 * role: 'handyman' | 'delivery_man'
 *
 * Strategy:
 *  1. Find workers in the same shop that are 'available'.
 *  2. Pick the one with the fewest active orders (load-balanced).
 *  3. If nobody is available, fall back to the least-busy worker regardless of status.
 *  4. Assign and notify the worker.
 */

const { createNotification } = require('../utils/notifications.helper');

/**
 * @param {object} db     - mysql2 pool
 * @param {number} orderId
 * @param {number} shopId
 * @param {'handyman'|'delivery_man'} role
 * @returns {object|null}  the assigned worker row, or null if no workers at all
 */
async function autoAssignWorker(db, orderId, shopId, role) {
    if (role === 'handyman') {
        return _assignHandyman(db, orderId, shopId);
    } else if (role === 'delivery_man') {
        return _assignDeliveryMan(db, orderId, shopId);
    }
    return null;
}

// ── Handyman Assignment ───────────────────────────────────────────────────────
async function _assignHandyman(db, orderId, shopId) {
    // Pick available handyman with fewest active tasks, fallback to least-busy
    const [candidates] = await db.query(`
        SELECT h.handyman_id, h.name, h.status, h.user_id,
               COUNT(oh.order_id) AS active_count
        FROM handymen h
        LEFT JOIN order_handymen oh ON oh.handyman_id = h.handyman_id
        LEFT JOIN orders o ON o.order_id = oh.order_id
            AND o.status NOT IN ('cancelled', 'delivered', 'completed')
        WHERE h.shop_id = ?
        GROUP BY h.handyman_id
        ORDER BY
            CASE h.status WHEN 'available' THEN 0 WHEN 'busy' THEN 1 ELSE 2 END ASC,
            active_count ASC
        LIMIT 1
    `, [shopId]);

    if (!candidates.length) return null;
    const worker = candidates[0];

    // Remove any previous assignment for this order
    await db.query('DELETE FROM order_handymen WHERE order_id = ?', [orderId]);

    // Assign via stored procedure (writes to order_handymen)
    await db.query('CALL sp_assign_handyman(?, ?)', [orderId, worker.handyman_id]);
    await db.query("UPDATE handymen SET status = 'busy' WHERE handyman_id = ?", [worker.handyman_id]);

    // Notify the handyman if they have an account
    if (worker.user_id) {
        await createNotification(db, worker.user_id, 'order',
            '📋 New Job Assigned',
            `You have been assigned to Order #JM-${orderId}. Please check your dashboard.`,
            orderId
        );
    }

    console.log(`[AutoAssign] Handyman #${worker.handyman_id} (${worker.name}) assigned to Order #${orderId}`);
    return worker;
}

// ── Delivery Man Assignment ────────────────────────────────────────────────────
async function _assignDeliveryMan(db, orderId, shopId) {
    // Pick available delivery man with fewest active deliveries, fallback to least-busy
    const [candidates] = await db.query(`
        SELECT d.delivery_man_id, d.user_id, d.status, u.full_name as name,
               COUNT(o.order_id) AS active_count
        FROM delivery_men d
        JOIN users u ON d.user_id = u.user_id
        LEFT JOIN orders o ON o.delivery_man_id = d.delivery_man_id
            AND o.status IN ('processing', 'shipped')
        WHERE d.shop_id = ?
        GROUP BY d.delivery_man_id
        ORDER BY
            CASE d.status WHEN 'available' THEN 0 WHEN 'on_delivery' THEN 1 ELSE 2 END ASC,
            active_count ASC
        LIMIT 1
    `, [shopId]);

    if (!candidates.length) return null;
    const worker = candidates[0];

    // Assign delivery man and set status to processing/shipped
    await db.query(
        'UPDATE orders SET delivery_man_id = ? WHERE order_id = ?',
        [worker.delivery_man_id, orderId]
    );
    await db.query(
        "UPDATE delivery_men SET status = 'on_delivery' WHERE delivery_man_id = ?",
        [worker.delivery_man_id]
    );

    // Notify the delivery man
    if (worker.user_id) {
        await createNotification(db, worker.user_id, 'order',
            '🚚 New Delivery Assigned',
            `Order #JM-${orderId} has been assigned to you for delivery. Check your dashboard.`,
            orderId
        );
    }

    console.log(`[AutoAssign] Delivery Man #${worker.delivery_man_id} (${worker.name}) assigned to Order #${orderId}`);
    return worker;
}

module.exports = { autoAssignWorker };
