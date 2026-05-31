const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/fees - Get all global fee configs
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT key_name, value, label, description FROM fee_config');
        const feesMap = {};
        for (const row of rows) {
            feesMap[row.key_name] = parseFloat(row.value);
        }
        res.json({ success: true, fees: feesMap, raw: rows });
    } catch (error) {
        console.error('Get Fees Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT /api/fees/:key - Update a specific fee
router.put('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value, label, description } = req.body;
        
        let updateQuery = 'UPDATE fee_config SET value = ?';
        const params = [value];
        
        if (label !== undefined) {
            updateQuery += ', label = ?';
            params.push(label);
        }
        if (description !== undefined) {
            updateQuery += ', description = ?';
            params.push(description);
        }
        
        updateQuery += ' WHERE key_name = ?';
        params.push(key);
        
        const [result] = await db.query(updateQuery, params);
        if (result.affectedRows === 0) {
            // Key doesn't exist, insert it
            await db.query(
                'INSERT INTO fee_config (key_name, value, label, description) VALUES (?, ?, ?, ?)',
                [key, value, label || key, description || '']
            );
        }
        
        res.json({ success: true, message: 'Fee updated successfully' });
    } catch (error) {
        console.error('Update Fee Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/fees/vehicles - Get vehicle tiers
router.get('/vehicles', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vehicle_tiers WHERE is_active = 1');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Vehicles Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// POST /api/fees/vehicles - Add a vehicle tier
router.post('/vehicles', async (req, res) => {
    try {
        const { name, base_fee, rate_per_km, max_load_desc } = req.body;
        await db.query(
            'INSERT INTO vehicle_tiers (name, base_fee, rate_per_km, max_load_desc) VALUES (?, ?, ?, ?)',
            [name, base_fee, rate_per_km, max_load_desc || '']
        );
        res.json({ success: true, message: 'Vehicle tier added' });
    } catch (error) {
        console.error('Add Vehicle Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT /api/fees/vehicles/:id - Update a vehicle tier
router.put('/vehicles/:id', async (req, res) => {
    try {
        const { name, base_fee, rate_per_km, max_load_desc, is_active } = req.body;
        await db.query(
            'UPDATE vehicle_tiers SET name = ?, base_fee = ?, rate_per_km = ?, max_load_desc = ?, is_active = ? WHERE id = ?',
            [name, base_fee, rate_per_km, max_load_desc, is_active, req.params.id]
        );
        res.json({ success: true, message: 'Vehicle tier updated' });
    } catch (error) {
        console.error('Update Vehicle Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// GET /api/fees/shipping-zones - Get shipping zones
router.get('/shipping-zones', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM shipping_zones WHERE is_active = 1');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Shipping Zones Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// POST /api/fees/shipping-zones - Add shipping zone
router.post('/shipping-zones', async (req, res) => {
    try {
        const { label, keywords, override_fee } = req.body;
        await db.query(
            'INSERT INTO shipping_zones (label, keywords, override_fee) VALUES (?, ?, ?)',
            [label, keywords, override_fee]
        );
        res.json({ success: true, message: 'Shipping zone added' });
    } catch (error) {
        console.error('Add Shipping Zone Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT /api/fees/shipping-zones/:id - Update shipping zone
router.put('/shipping-zones/:id', async (req, res) => {
    try {
        const { label, keywords, override_fee, is_active } = req.body;
        await db.query(
            'UPDATE shipping_zones SET label = ?, keywords = ?, override_fee = ?, is_active = ? WHERE zone_id = ?',
            [label, keywords, override_fee, is_active, req.params.id]
        );
        res.json({ success: true, message: 'Shipping zone updated' });
    } catch (error) {
        console.error('Update Shipping Zone Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
