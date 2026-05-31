const express = require('express');
const router = express.Router();
const db = require('../config/db');
const https = require('https');

// ── Nominatim (OpenStreetMap) geocoding helper ────────────────────────────
/**
 * Converts a plain-text address string into { latitude, longitude }.
 * Returns { latitude: null, longitude: null } if the lookup fails so that
 * the rest of the address save still succeeds.
 */
const geocodeAddress = (addressText) => {
    return new Promise((resolve) => {
        if (!addressText) return resolve({ latitude: null, longitude: null });

        const query = encodeURIComponent(addressText.trim() + ', Philippines');
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path: `/search?format=json&q=${query}&countrycodes=ph&limit=1`,
            headers: {
                'User-Agent': 'JM-Glass-And-Furniture-App/1.0 (contact@jmglass.com)',
                'Referer': 'https://jmglassandfurniture.com'
            }
        };

        require('https').get(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const result = parsed?.[0];
                    if (result) {
                        resolve({
                            latitude:  parseFloat(result.lat),
                            longitude: parseFloat(result.lon),
                        });
                    } else {
                        resolve({ latitude: null, longitude: null });
                    }
                } catch {
                    resolve({ latitude: null, longitude: null });
                }
            });
        }).on('error', () => {
            resolve({ latitude: null, longitude: null });
        });
    });
};

// GET all addresses for a user
router.get('/user/:userId', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [req.params.userId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Addresses Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// POST — add a new address
router.post('/', async (req, res) => {
    const { user_id, full_name, phone, address, additional_details, label, is_default, latitude: frontLat, longitude: frontLng } = req.body;

    try {
        if (is_default) {
            await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [user_id]);
        }

        const [existing] = await db.query('SELECT COUNT(*) as count FROM user_addresses WHERE user_id = ?', [user_id]);
        const makeDefault = is_default || existing[0].count === 0 ? 1 : 0;

        // Use frontend coords if provided (autocomplete selection), else geocode
        let latitude = frontLat ? parseFloat(frontLat) : null;
        let longitude = frontLng ? parseFloat(frontLng) : null;
        if (!latitude) {
            const coords = await geocodeAddress(address);
            latitude  = coords.latitude;
            longitude = coords.longitude;
            if (latitude) console.log(`[geocode] "${address}" → (${latitude}, ${longitude})`);
        } else {
            console.log(`[geocode] address using frontend coords → (${latitude}, ${longitude})`);
        }

        const [result] = await db.query(
            'INSERT INTO user_addresses (user_id, full_name, phone, address, additional_details, label, is_default, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [user_id, full_name, phone, address, additional_details || null, label || 'Home', makeDefault, latitude, longitude]
        );

        res.status(201).json({
            success: true,
            address_id: result.insertId,
            message: 'Address added successfully'
        });
    } catch (error) {
        console.error('Add Address Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT — update an address
router.put('/:id', async (req, res) => {
    const { full_name, phone, address, additional_details, label, is_default, user_id, latitude: frontLat, longitude: frontLng } = req.body;

    try {
        if (is_default) {
            await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [user_id]);
        }

        // Use frontend coords if provided, else re-geocode
        let latitude = frontLat ? parseFloat(frontLat) : null;
        let longitude = frontLng ? parseFloat(frontLng) : null;
        if (!latitude) {
            const coords = await geocodeAddress(address);
            latitude  = coords.latitude;
            longitude = coords.longitude;
            if (latitude) console.log(`[geocode] "${address}" → (${latitude}, ${longitude})`);
        } else {
            console.log(`[geocode] address using frontend coords → (${latitude}, ${longitude})`);
        }

        await db.query(
            'UPDATE user_addresses SET full_name = ?, phone = ?, address = ?, additional_details = ?, label = ?, is_default = ?, latitude = ?, longitude = ? WHERE address_id = ?',
            [full_name, phone, address, additional_details || null, label || 'Home', is_default ? 1 : 0, latitude, longitude, req.params.id]
        );

        res.json({ success: true, message: 'Address updated' });
    } catch (error) {
        console.error('Update Address Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// DELETE an address
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM user_addresses WHERE address_id = ?', [req.params.id]);
        res.json({ success: true, message: 'Address deleted' });
    } catch (error) {
        console.error('Delete Address Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// PUT — set an address as default
router.put('/:id/default', async (req, res) => {
    const { user_id } = req.body;

    try {
        await db.query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [user_id]);
        await db.query('UPDATE user_addresses SET is_default = 1 WHERE address_id = ?', [req.params.id]);
        res.json({ success: true, message: 'Default address updated' });
    } catch (error) {
        console.error('Set Default Address Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
