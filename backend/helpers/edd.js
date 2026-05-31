/**
 * helpers/edd.js — Estimated Delivery Date engine
 *
 * Rules (confirmed):
 *  - Sundays excluded from day count (Saturdays count).
 *  - Handyman capacity: max 1 active installation order simultaneously.
 *  - Delivery man capacity: max 3 active orders; max 1 if any is an installation order.
 *  - EDD only ever extends, never shortens.
 *
 * Windows:
 *  Delivery-only   available: 2–4 days   | no worker: +3 → 5–7
 *  Installation    available: 4–6 days   | no worker: +4 → 8–10
 *  Custom order    available: 6–11 days  | no worker: +5 → 11–16
 */

const WINDOWS = {
    delivery:     { min: 2, max: 4,  delay: 3 },
    installation: { min: 4, max: 6,  delay: 4 },
    custom:       { min: 6, max: 11, delay: 5 },
};

/** Add N calendar days, skipping Sundays. */
function addWorkingDays(date, n) {
    const d = new Date(date);
    let added = 0;
    while (added < n) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) added++; // 0 = Sunday
    }
    return d;
}

/** YYYY-MM-DD string from Date */
const fmt = d => d.toISOString().split('T')[0];

/**
 * Check whether any delivery man for a shop is available AND under capacity.
 * For installation orders (hasInstall=true), DM capacity = 1;
 * for delivery-only, capacity = 3.
 */
async function hasDMAvailable(db, shopId, hasInstall) {
    const capLimit = hasInstall ? 1 : 3;
    const [rows] = await db.query(
        `SELECT dm.delivery_man_id
         FROM delivery_men dm
         WHERE dm.shop_id = ? AND dm.status = 'available'`,
        [shopId]
    );
    if (rows.length === 0) return false;
    for (const dm of rows) {
        const [[{ active }]] = await db.query(
            `SELECT COUNT(*) AS active
             FROM orders
             WHERE delivery_man_id = ?
               AND status NOT IN ('completed','cancelled','delivered')`,
            [dm.delivery_man_id]
        );
        if (active < capLimit) return true;
    }
    return false;
}

/**
 * Check whether any handyman for a shop is available AND under capacity (max 1).
 */
async function hasHMAvailable(db, shopId) {
    const [rows] = await db.query(
        `SELECT h.handyman_id
         FROM handymen h
         WHERE h.shop_id = ? AND h.status = 'available'`,
        [shopId]
    );
    if (rows.length === 0) return false;
    for (const hm of rows) {
        const [[{ active }]] = await db.query(
            `SELECT COUNT(*) AS active
             FROM order_handymen oh
             JOIN orders o ON o.order_id = oh.order_id
             WHERE oh.handyman_id = ?
               AND o.status NOT IN ('completed','cancelled','delivered')`,
            [hm.handyman_id]
        );
        if (active < 1) return true;
    }
    return false;
}

/**
 * Compute EDD for a new order.
 * @param {object} db   - mysql2 pool
 * @param {number} shopId
 * @param {boolean} hasInstallation - true if any item has installation_fee > 0
 * @param {boolean} isCustom        - true for custom requests
 * @returns {{ edd_min, edd_max, delayed, has_available_worker }}
 */
async function computeEDD(db, shopId, hasInstallation, isCustom = false) {
    const win = isCustom
        ? WINDOWS.custom
        : hasInstallation
            ? WINDOWS.installation
            : WINDOWS.delivery;

    const workerOk = (hasInstallation || isCustom)
        ? await hasHMAvailable(db, shopId)
        : await hasDMAvailable(db, shopId, false);

    const minDays = workerOk ? win.min : win.min + win.delay;
    const maxDays = workerOk ? win.max : win.max + win.delay;
    const now = new Date();

    return {
        edd_min:             fmt(addWorkingDays(now, minDays)),
        edd_max:             fmt(addWorkingDays(now, maxDays)),
        delayed:             !workerOk,
        has_available_worker: workerOk,
    };
}

/**
 * Recalculate EDD for all active orders of a shop after a worker goes off/busy.
 * EDD only EXTENDS — never shortens.
 * Returns list of extended order objects for notification.
 */
async function recalcEDDForShop(db, shopId) {
    const [orders] = await db.query(
        `SELECT o.order_id, o.estimated_delivery_date,
                MAX(oi.installation_fee) > 0 AS has_install
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.order_id
         JOIN shop_listings sl ON oi.listing_id = sl.listing_id
         WHERE sl.shop_id = ?
           AND o.status IN ('pending','processing','shipped')
           AND o.estimated_delivery_date IS NOT NULL
         GROUP BY o.order_id`,
        [shopId]
    );

    const extended = [];
    for (const ord of orders) {
        const { edd_min } = await computeEDD(db, shopId, !!ord.has_install, false);
        const newDate = new Date(edd_min);
        const oldDate = new Date(ord.estimated_delivery_date);
        if (newDate > oldDate) {
            await db.query(
                `UPDATE orders SET estimated_delivery_date = ?, edd_extended = 1 WHERE order_id = ?`,
                [edd_min, ord.order_id]
            );
            extended.push({ order_id: ord.order_id, new_edd: edd_min, old_edd: ord.estimated_delivery_date });
        }
    }
    return extended;
}

module.exports = { computeEDD, recalcEDDForShop };
