const express = require('express');
const router = express.Router();
const db = require('../config/db');

// @route   POST /api/reports
// @desc    Submit a problem report
// @access  Public (or protected depending on auth middleware, going public for ease-of-use)
router.post('/', async (req, res) => {
    try {
        const { user_id, issue_type, description } = req.body;

        if (!issue_type || !description) {
            return res.status(400).json({ success: false, message: 'Issue type and description are required' });
        }

        const [result] = await db.query(
            'INSERT INTO reported_problems (user_id, issue_type, description) VALUES (?, ?, ?)',
            [user_id || null, issue_type, description]
        );

        res.status(201).json({
            success: true,
            message: 'Report submitted successfully',
            reportId: result.insertId
        });

    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error saving report',
            error: error.message
        });
    }
});

module.exports = router;
