const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification } = require('../utils/notifications.helper');

// ── Send a message ────────────────────────────────────────────────────────────
// shop_id identifies the "channel":
//   customer → seller : shop_id = seller's shop_id
//   seller   → customer (reply) : shop_id = seller's own shop_id (same channel)
router.post('/', async (req, res) => {
    const { sender_id, receiver_id, message, request_id, image_url, shop_id } = req.body;
    try {
        await db.query(
            'INSERT INTO messages (sender_id, receiver_id, message, request_id, image_url, shop_id) VALUES (?, ?, ?, ?, ?, ?)',
            [sender_id, receiver_id, message, request_id || null, image_url || null, shop_id || null]
        );

        // 🔔 Notify receiver: new message
        const [senderRows] = await db.query('SELECT full_name FROM users WHERE user_id = ?', [sender_id]);
        const senderName = senderRows[0]?.full_name || 'Someone';
        const preview = message
            ? (message.length > 60 ? message.substring(0, 60) + '...' : message)
            : '📷 Sent an image';
        await createNotification(
            db, receiver_id, 'message',
            `New message from ${senderName}`,
            preview,
            sender_id
        );

        // 🟢 Real-Time Socket Events
        if (req.io) {
            const roomId = [sender_id, receiver_id].sort().join('_') + '_' + (shop_id || 'null');
            // Notify chat room instantly
            req.io.to(`chat:${roomId}`).emit('message:new');
            // Tell both users' personal rooms to refresh their conversation lists & unread badges
            req.io.to(`user:${sender_id}`).emit('conversations:update');
            req.io.to(`user:${receiver_id}`).emit('conversations:update');
        }

        res.status(201).json({ success: true, message: 'Message sent' });
    } catch (error) {
        console.error('Send Message Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Get conversations for a user ──────────────────────────────────────────────
// perspective=shop     → caller is a seller; filter by their own shop_id
//                        returns customer personal name + avatar
// perspective=customer → caller is a customer; filter by shop_ids they contacted
//                        (excluding their own shop if they are also a seller)
//                        returns shop name + logo
router.get('/conversations/:userId', async (req, res) => {
    const userId = req.params.userId;
    const perspective = req.query.perspective || 'customer';
    try {
        if (perspective === 'shop') {
            // ── Seller's inbox ────────────────────────────────────────────
            // Only show threads that came into MY shop (shop_id = my shop).
            // Look up the current user's shop_id first.
            const [shopRows] = await db.query(
                'SELECT shop_id FROM shops WHERE user_id = ?', [userId]
            );
            if (!shopRows.length) {
                return res.json({ success: true, conversations: [] });
            }
            const myShopId = shopRows[0].shop_id;

            const [rows] = await db.query(`
                SELECT
                    u.user_id        AS other_user_id,
                    u.full_name,
                    u.role,
                    u.profile_image,
                    NULL             AS shop_name,
                    NULL             AS shop_logo,
                    ?                AS shop_id,
                    (SELECT message    FROM messages
                     WHERE shop_id = ? AND ((sender_id = u.user_id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.user_id))
                     ORDER BY created_at DESC LIMIT 1) AS last_message,
                    (SELECT created_at FROM messages
                     WHERE shop_id = ? AND ((sender_id = u.user_id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.user_id))
                     ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                    (SELECT COUNT(*) FROM messages
                     WHERE shop_id = ? AND sender_id = u.user_id AND receiver_id = ? AND is_read = 0) AS unread_count
                FROM users u
                WHERE u.user_id IN (
                    SELECT DISTINCT sender_id   FROM messages WHERE shop_id = ? AND receiver_id = ?
                    UNION
                    SELECT DISTINCT receiver_id FROM messages WHERE shop_id = ? AND sender_id   = ?
                )
                AND u.user_id <> ?
                ORDER BY last_message_time DESC
            `, [
                myShopId,
                myShopId, userId, userId,   // last_message
                myShopId, userId, userId,   // last_message_time
                myShopId, userId,           // unread_count
                myShopId, userId,           // pool sender
                myShopId, userId,           // pool receiver
                userId,                     // exclude self
            ]);
            return res.json({ success: true, conversations: rows });

        } else {
            // ── Customer's inbox ──────────────────────────────────────────
            // Show threads where the current user participated AND
            // shop_id belongs to a shop they do NOT own (or NULL for legacy).
            // Each conversation is keyed by (other_user_id, shop_id) pair.
            const [rows] = await db.query(`
                SELECT
                    u.user_id       AS other_user_id,
                    u.full_name,
                    u.role,
                    u.profile_image,
                    s.shop_name,
                    s.logo_url      AS shop_logo,
                    m_channel.shop_id,
                    (SELECT message    FROM messages
                     WHERE shop_id <=> m_channel.shop_id
                       AND ((sender_id = u.user_id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.user_id))
                     ORDER BY created_at DESC LIMIT 1) AS last_message,
                    (SELECT created_at FROM messages
                     WHERE shop_id <=> m_channel.shop_id
                       AND ((sender_id = u.user_id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.user_id))
                     ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                    (SELECT COUNT(*) FROM messages
                     WHERE shop_id <=> m_channel.shop_id
                       AND sender_id = u.user_id AND receiver_id = ? AND is_read = 0) AS unread_count
                FROM (
                    -- Distinct (other_user_id, shop_id) channel pairs for this user
                    SELECT DISTINCT
                        IF(sender_id = ?, receiver_id, sender_id) AS other_uid,
                        shop_id
                    FROM messages
                    WHERE (sender_id = ? OR receiver_id = ?)
                      -- Exclude channels that belong to the current user's own shop
                      AND (shop_id IS NULL OR shop_id NOT IN (
                              SELECT shop_id FROM shops WHERE user_id = ?
                          ))
                ) AS m_channel
                JOIN users u ON u.user_id = m_channel.other_uid
                LEFT JOIN shops s ON s.shop_id = m_channel.shop_id
                ORDER BY last_message_time DESC
            `, [
                userId, userId,   // last_message
                userId, userId,   // last_message_time
                userId,           // unread_count
                userId,           // other_uid IF
                userId, userId,   // messages WHERE sender/receiver
                userId,           // exclude own shop
            ]);
            return res.json({ success: true, conversations: rows });
        }

    } catch (error) {
        console.error('Get Conversations Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── Get specific conversation messages ────────────────────────────────────────
// Optional ?shop_id= filters to a specific channel.
// When omitted, returns all messages between the pair (backward-compat).
router.get('/:userId/:otherUserId', async (req, res) => {
    const { userId, otherUserId } = req.params;
    const shopId = req.query.shop_id ? parseInt(req.query.shop_id) : null;
    try {
        let query, params;
        if (shopId !== null) {
            query = `
                SELECT * FROM messages
                WHERE shop_id = ?
                  AND ((sender_id = ? AND receiver_id = ?)
                    OR (sender_id = ? AND receiver_id = ?))
                ORDER BY created_at ASC
            `;
            params = [shopId, userId, otherUserId, otherUserId, userId];
        } else {
            query = `
                SELECT * FROM messages
                WHERE (sender_id = ? AND receiver_id = ?)
                   OR (sender_id = ? AND receiver_id = ?)
                ORDER BY created_at ASC
            `;
            params = [userId, otherUserId, otherUserId, userId];
        }

        const [rows] = await db.query(query, params);

        // Mark as read (only messages FROM the other user TO me)
        if (shopId !== null) {
            await db.query(
                'UPDATE messages SET is_read = 1 WHERE shop_id = ? AND sender_id = ? AND receiver_id = ?',
                [shopId, otherUserId, userId]
            );
        } else {
            await db.query(
                'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?',
                [otherUserId, userId]
            );
        }

        // 🟢 Real-Time Socket Event: Tell the user's room to update unread badges
        if (req.io) {
            req.io.to(`user:${userId}`).emit('message:read', { otherUserId, shopId });
        }

        res.json({ success: true, messages: rows });
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
