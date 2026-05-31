/**
 * notifications.helper.js
 * 
 * Shared utility to create notifications from any backend route.
 * Usage: 
 *   const { createNotification } = require('../utils/notifications.helper');
 *   await createNotification(db, userId, 'order', 'Title', 'Message', orderId);
 */

const NOTIFICATION_ICONS = {
    order:          { icon: 'checkmark-circle',    iconColor: '#4CAF50' },
    shop_order:     { icon: 'storefront',          iconColor: '#FF9800' },
    promo:          { icon: 'pricetag',            iconColor: '#E91E63' },
    message:        { icon: 'chatbubble-ellipses', iconColor: '#00BCD4' },
    delivery:       { icon: 'car',                 iconColor: '#2196F3' },
    system:         { icon: 'sparkles',            iconColor: '#8D6E63' },
    cancelled:      { icon: 'close-circle',        iconColor: '#F44336' },
    review:         { icon: 'star',                iconColor: '#FFC107' },
    custom_request: { icon: 'color-wand',          iconColor: '#8D6E63' },
};

/**
 * Create a notification record in the database.
 * @param {object} db - The database pool/connection (must support .query())
 * @param {number} userId - The user to notify
 * @param {string} type - One of: 'order', 'promo', 'message', 'delivery', 'system'
 * @param {string} title - Short notification title
 * @param {string} message - Notification body text
 * @param {number|null} referenceId - Optional ID to navigate to (orderId, requestId, senderId, etc.)
 */
async function createNotification(db, userId, type, title, message, referenceId = null) {
    if (!userId) return;
    try {
        const cfg = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.system;
        await db.query(
            `INSERT INTO notifications (user_id, type, title, message, icon, icon_color, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, type, title, message, cfg.icon, cfg.iconColor, referenceId]
        );

        // 🟢 Real-Time Socket Event
        const { getIO } = require('./socket');
        const io = getIO();
        if (io) {
            io.to(`user:${userId}`).emit('notification:new');
        }
    } catch (err) {
        // Notifications are non-critical — log but don't throw
        console.error('Failed to create notification:', err.message);
    }
}

module.exports = { createNotification };
