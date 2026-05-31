const express = require('express');
const router = express.Router();
const db = require('../config/db');

// @route   GET /api/faqs
// @desc    Get all active FAQs
// @access  Public
router.get('/', async (req, res) => {
    try {
        const [faqs] = await db.query(
            'SELECT * FROM faqs WHERE is_active = 1 ORDER BY display_order ASC, created_at DESC'
        );
        res.json({
            success: true,
            count: faqs.length,
            faqs: faqs
        });
    } catch (error) {
        console.error('Error fetching FAQs:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error fetching FAQs',
            error: error.message
        });
    }
});

module.exports = router;
