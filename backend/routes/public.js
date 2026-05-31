const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ── GET /api/public/maintenance ──────────────────────────────────────────────
router.get('/maintenance', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT \`key\`, value FROM platform_settings WHERE \`key\` IN ('maintenance_mode', 'maintenance_message')`);

        // Prepare the response
        let maintenance_mode = 'false';
        let maintenance_message = '';

        rows.forEach(row => {
            if (row.key === 'maintenance_mode') {
                maintenance_mode = row.value;
            } else if (row.key === 'maintenance_message') {
                maintenance_message = row.value;
            }
        });

        res.json({ success: true, data: { maintenance_mode, maintenance_message } });
    } catch (err) {
        console.error('Get maintenance error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /api/public/reset-check ──────────────────────────────────────────────
router.get('/reset-check', async (req, res) => {
    try {
        const [[row]] = await db.query(
            `SELECT value FROM platform_settings WHERE \`key\` = 'last_reset_at'`
        );
        res.json({ success: true, last_reset_at: row ? row.value : null });
    } catch (err) {
        res.json({ success: true, last_reset_at: null });
    }
});

module.exports = router;

