const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jm_glass_db',
    port: process.env.DB_PORT || 3306
};

// GET /api/notifications/:userId - Get all notifications for a user
router.get('/:userId', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { userId } = req.params;

        // Optionally, check if the limit is passed, but returning all is fine.
        const [notifications] = await connection.query(`
            SELECT 
                notification_id as id, 
                type, 
                title, 
                message, 
                is_read as \`read\`, 
                icon, 
                icon_color as iconColor,
                reference_id as referenceId,
                created_at,
                CASE
                    WHEN TIMESTAMPDIFF(MINUTE, created_at, NOW()) < 60 THEN CONCAT(TIMESTAMPDIFF(MINUTE, created_at, NOW()), ' min ago')
                    WHEN TIMESTAMPDIFF(HOUR, created_at, NOW()) < 24 THEN CONCAT(TIMESTAMPDIFF(HOUR, created_at, NOW()), ' hr(s) ago')
                    WHEN TIMESTAMPDIFF(DAY, created_at, NOW()) = 1 THEN 'Yesterday'
                    ELSE CONCAT(TIMESTAMPDIFF(DAY, created_at, NOW()), ' days ago')
                END as time
            FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `, [userId]);

        res.json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    } finally {
        if (connection) await connection.end();
    }
});

// GET /api/notifications/user/:userId/unread-count - Get unread notification count
router.get('/user/:userId/unread-count', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { userId } = req.params;
        const [[row]] = await connection.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );
        res.json({ success: true, count: row.count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ success: false, count: 0 });
    } finally {
        if (connection) await connection.end();
    }
});

// PUT /api/notifications/:id/read - Mark a notification as read
router.put('/:id/read', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { id } = req.params;

        await connection.query('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [id]);
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: 'Failed to update notification' });
    } finally {
        if (connection) await connection.end();
    }
});

// PUT /api/notifications/user/:userId/read-all - Mark all notifications for a user as read
router.put('/user/:userId/read-all', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { userId } = req.params;

        await connection.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: 'Failed to update notifications' });
    } finally {
        if (connection) await connection.end();
    }
});

// POST test notification for testing
router.post('/', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { user_id, type, title, message, icon, icon_color } = req.body;

        await connection.query(`
            INSERT INTO notifications (user_id, type, title, message, icon, icon_color)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [user_id, type, title, message, icon, icon_color]);

        res.json({ success: true, message: 'Notification created' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to create' });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;
