const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Helper: load fee_config values as a map
async function getFeeConfig() {
    const [rows] = await db.query('SELECT key_name, value FROM fee_config');
    const map = {};
    for (const row of rows) map[row.key_name] = parseFloat(row.value);
    return map;
}

/**
 * GET /api/shipping/vehicles
 * Returns all active vehicle tiers for the checkout screen vehicle picker
 */
router.get('/vehicles', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vehicle_tiers WHERE is_active = 1 ORDER BY base_fee ASC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Get Vehicles Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

/**
 * POST /api/shipping/calculate
 * Body:
 *   address       {string}  - delivery address text
 *   distance_km   {number}  - distance in km (optional, defaults to zone estimate)
 *   vehicle_id    {number}  - ID from vehicle_tiers table
 *   has_fragile   {boolean} - whether order contains glass/fragile items
 *   items_total   {number}  - subtotal of products (for free-shipping check)
 *
 * Returns:
 *   { success, fee, label, breakdown: { base, distance_fee, fragile, total } }
 */
router.post('/calculate', async (req, res) => {
    try {
        const { address, distance_km, vehicle_id, has_fragile, fragility_level, items_total } = req.body;

        const fees = await getFeeConfig();
        const freeThreshold = fees['free_shipping_threshold'] || 150000;
        const defaultBase = fees['default_shipping_base'] || 500;
        const fragileSurchargeMin    = fees['fragile_surcharge_min']    || 100;
        const fragileSurchargeMedium = fees['fragile_surcharge_medium'] || 300;
        const fragileSurchargeMax    = fees['fragile_surcharge_max']    || 500;

        // Resolve fragility_level from either new tier string OR legacy has_fragile boolean
        const resolvedLevel = fragility_level || (has_fragile ? 'high' : 'none');
        const fragileAmt = {
            none:   0,
            low:    fragileSurchargeMin,
            medium: fragileSurchargeMedium,
            high:   fragileSurchargeMax,
        }[resolvedLevel] ?? 0;
        const fragileLabel = {
            none:   '',
            low:    'Low Fragility (+₱' + fragileSurchargeMin + ')',
            medium: 'Medium Fragility (+₱' + fragileSurchargeMedium + ')',
            high:   'High Fragility/Glass (+₱' + fragileSurchargeMax + ')',
        }[resolvedLevel] || '';

        // ── Free Shipping check ───────────────────────────────────────────────
        if (items_total && items_total >= freeThreshold) {
            return res.json({
                success: true,
                fee: 0,
                label: 'Free Shipping (Order Qualifies!)',
                breakdown: { base: 0, distance_fee: 0, fragile: 0, total: 0 }
            });
        }

        // ── Resolve vehicle tier ──────────────────────────────────────────────
        let vehicle = null;
        if (vehicle_id) {
            const [[row]] = await db.query('SELECT * FROM vehicle_tiers WHERE id = ? AND is_active = 1', [vehicle_id]);
            vehicle = row || null;
        }
        // Fallback: use cheapest active vehicle if none selected
        if (!vehicle) {
            const [[fallback]] = await db.query('SELECT * FROM vehicle_tiers WHERE is_active = 1 ORDER BY base_fee ASC LIMIT 1');
            vehicle = fallback || null;
        }

        // ── Check address against shipping zones ──────────────────────────────
        const [zones] = await db.query('SELECT * FROM shipping_zones WHERE is_active = 1');
        let matchedZone = null;
        if (address) {
            const addrLower = address.toLowerCase();
            for (const zone of zones) {
                const keywords = zone.keywords.split(',').map(k => k.trim().toLowerCase());
                if (keywords.some(kw => addrLower.includes(kw))) {
                    matchedZone = zone;
                    break;
                }
            }
        }

        // ── Zone override (flat fee, ignores vehicle formula) ─────────────────
        if (matchedZone && matchedZone.override_fee !== null) {
            const total = parseFloat(matchedZone.override_fee) + fragileAmt;
            return res.json({
                success: true,
                fee: total,
                label: matchedZone.label,
                fragility_level: resolvedLevel,
                fragile_label: fragileLabel,
                breakdown: { base: parseFloat(matchedZone.override_fee), distance_fee: 0, fragile: fragileAmt, total }
            });
        }

        // ── Vehicle formula: Base + (distance × rate) + fragile ───────────────
        const baseFee = vehicle ? parseFloat(vehicle.base_fee) : defaultBase;
        const ratePerKm = vehicle ? parseFloat(vehicle.rate_per_km) : 25;
        const km = parseFloat(distance_km) || 0;
        const distanceFee = km > 0 ? km * ratePerKm : 0;

        // Fragile surcharge from tier
        const fragile = fragileAmt;

        const total = baseFee + distanceFee + fragile;

        const vehicleName = vehicle ? vehicle.name : 'Standard Delivery';
        const label = matchedZone
            ? `${matchedZone.label} — ${vehicleName}`
            : `${vehicleName}${km > 0 ? ` (${km} km)` : ''}`;

        return res.json({
            success: true,
            fee: total,
            label,
            fragility_level: resolvedLevel,
            fragile_label: fragileLabel,
            breakdown: {
                base: baseFee,
                distance_fee: distanceFee,
                fragile,
                total
            }
        });

    } catch (error) {
        console.error('Shipping Calculate Error:', error);
        // Safe fallback so checkout is never blocked
        res.json({ success: true, fee: 500, label: 'Standard Delivery', breakdown: { base: 500, distance_fee: 0, fragile: 0, total: 500 } });
    }
});

module.exports = router;
