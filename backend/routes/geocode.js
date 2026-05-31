/**
 * routes/geocode.js
 * Thin proxy around OpenStreetMap Nominatim Geocoding API.
 * Free, no API key required.
 *
 * GET  /api/geocode/reverse?lat=13.308&lng=123.343   → { address: "...", components: {...} }
 * GET  /api/geocode/forward?q=Buluang,Bato,Camarines+Sur  → { lat, lng, address }
 */

const express = require('express');
const router = express.Router();
const https = require('https');

// Nominatim requires a User-Agent to avoid being blocked.
const headers = {
    'User-Agent': 'JM-Glass-And-Furniture-App/1.0 (contact@jmglass.com)',
    'Referer': 'https://jmglassandfurniture.com'
};

// ── internal helper ────────────────────────────────────────────────────────────
const nominatimFetch = (path) =>
    new Promise((resolve, reject) => {
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path,
            headers
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON from Nominatim')); }
            });
        }).on('error', reject);
    });

// ── Format a Nominatim result into a clean PH administrative address ──────────
const formatPhAddress = (address) => {
    if (!address) return '';

    const {
        neighbourhood, suburb, village, quarter,          // barangay level
        city_district, municipality, town, city, county,  // municipality / city level
        state_district, state,                            // province
        region,                                           // region
        country,
    } = address;

    const parts = [
        neighbourhood || suburb || village || quarter,    // barangay
        city_district || municipality || town || county,  // municipality
        city,                                             // city (if separate from municipality)
        state_district || state,                          // province (e.g. Camarines Sur)
        region,                                           // region (e.g. Bicol Region)
        country,
    ].filter(Boolean);

    // Deduplicate consecutive identical parts
    const deduped = parts.filter((v, i) => v !== parts[i - 1]);
    return deduped.join(', ');
};

// GET /api/geocode/reverse?lat=…&lng=…
router.get('/reverse', async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: 'lat and lng are required' });

    try {
        const path = `/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
        const result = await nominatimFetch(path);

        if (!result || result.error) return res.json({ success: false, message: 'No result found for those coordinates' });

        const addressStr = formatPhAddress(result.address);

        res.json({
            success: true,
            address: addressStr,
            formatted: result.display_name,
            components: result.address,
            coordinates: { lat: result.lat, lng: result.lon },
        });
    } catch (err) {
        console.error('[geocode/reverse] error:', err.message);
        res.status(500).json({ success: false, message: 'Geocoding service error' });
    }
});

// GET /api/geocode/forward?q=…
router.get('/forward', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'q (query) is required' });

    try {
        const encoded = encodeURIComponent(q.trim());
        const path = `/search?format=json&q=${encoded}&addressdetails=1&countrycodes=ph&limit=1`;
        const data = await nominatimFetch(path);
        const result = data?.[0]; // forward returns an array

        if (!result) return res.json({ success: false, message: 'Address not found' });

        res.json({
            success: true,
            lat: result.lat,
            lng: result.lon,
            address: formatPhAddress(result.address),
            formatted: result.display_name,
            components: result.address,
        });
    } catch (err) {
        console.error('[geocode/forward] error:', err.message);
        res.status(500).json({ success: false, message: 'Geocoding service error' });
    }
});

// ── GET /api/geocode/autocomplete?q=… ──────────────────────────────────────
// Typeahead address suggestions powered by Nominatim (Philippines only).
// Returns up to 5 clean { label, lat, lng } objects.
// Server-side 5-second micro-cache per unique query to respect rate limits.
const autoCompleteCache = new Map(); // query → { results, ts }
const AUTOCOMPLETE_CACHE_MS = 5000;

router.get('/autocomplete', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.json({ success: true, results: [] });

    // Check micro-cache
    const cached = autoCompleteCache.get(q);
    if (cached && Date.now() - cached.ts < AUTOCOMPLETE_CACHE_MS) {
        return res.json({ success: true, results: cached.results, cached: true });
    }

    try {
        const encoded = encodeURIComponent(q + ', Philippines');
        const path = `/search?format=json&q=${encoded}&countrycodes=ph&limit=5&addressdetails=1`;
        const data = await nominatimFetch(path);

        const results = (data || []).map(item => {
            // Build a clean, human-readable label from address components
            const a = item.address || {};
            const parts = [
                a.road || a.neighbourhood || a.suburb || a.village || a.hamlet,
                a.city_district || a.municipality || a.town || a.county,
                a.city,
                a.state_district || a.state,
                a.region,
            ].filter(Boolean);
            // Deduplicate consecutive identical parts
            const label = parts
                .filter((v, i) => v !== parts[i - 1])
                .join(', ') || item.display_name;

            return {
                label,
                full: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
            };
        });

        // Store in micro-cache
        autoCompleteCache.set(q, { results, ts: Date.now() });
        // Prevent unbounded growth — cap cache at 200 entries
        if (autoCompleteCache.size > 200) {
            autoCompleteCache.delete(autoCompleteCache.keys().next().value);
        }

        res.json({ success: true, results });
    } catch (err) {
        console.error('[geocode/autocomplete] error:', err.message);
        res.json({ success: true, results: [] }); // fail gracefully — empty suggestions
    }
});

// ── Haversine formula ──────────────────────────────────────────────────────
// Returns distance between two (lat,lng) points in kilometers (straight line).
const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// ── OpenRouteService Driving Distance ────────────────────────────────────────
// ORS uses Philippines OSM data, returns guaranteed JSON, free 2000 req/day.
// Doc: https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/get
const getDrivingDistance = (shopLat, shopLng, custLat, custLng) =>
    new Promise((resolve, reject) => {
        const apiKey = process.env.ORS_API_KEY;
        if (!apiKey || apiKey === 'your_ors_api_key_here') {
            return reject(new Error('ORS_API_KEY not configured'));
        }
        // ORS coordinate format: longitude,latitude
        const path = `/v2/directions/driving-car?api_key=${apiKey}&start=${shopLng},${shopLat}&end=${custLng},${custLat}`;
        const options = {
            hostname: 'api.openrouteservice.org',
            path,
            headers: {
                'User-Agent': 'JM-Glass-And-Furniture-App/1.0 (contact@jmglass.com)',
                'Accept': 'application/json, application/geo+json',
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                // Non-200 means rate limit or auth error — reject so caller falls back to Haversine
                if (res.statusCode !== 200) {
                    return reject(new Error(`ORS returned HTTP ${res.statusCode}`));
                }
                try {
                    const parsed = JSON.parse(data);
                    // ORS GeoJSON response: features[0].properties.segments[0].distance (meters)
                    const distanceMeters = parsed?.features?.[0]?.properties?.segments?.[0]?.distance;
                    if (distanceMeters != null) {
                        resolve(distanceMeters / 1000);
                    } else {
                        reject(new Error('Unexpected ORS response shape'));
                    }
                } catch (e) {
                    reject(new Error('Invalid JSON from ORS'));
                }
            });
        }).on('error', reject);
    });


/**
 * GET /api/geocode/distance
 * 
 * Calculates exact distance (km) between a shop and a customer address,
 * and returns an estimated delivery fee.
 *
 * Query params (use IDs for DB lookup):
 *   ?shop_id=1&address_id=4
 * 
 * OR pass raw coordinates directly:
 *   ?shop_lat=13.30&shop_lng=123.34&cust_lat=13.31&cust_lng=123.35
 */
const db = require('../config/db');

// ── 24-hour DB cache (mirrors the same table used in products.js) ────────────
const buildHash = (lat1, lng1, lat2, lng2) => {
    const r = (n) => Math.round(parseFloat(n) * 10000) / 10000; // ~11m precision
    return `${r(lat1)},${r(lng1)},${r(lat2)},${r(lng2)}`;
};

const getDrivingDistanceCached = async (shopLat, shopLng, custLat, custLng) => {
    const hash = buildHash(shopLat, shopLng, custLat, custLng);

    // 1. Check DB cache first — avoids hitting OSRM on every request
    const [cached] = await db.query(
        'SELECT distance_km, calculated_at FROM distance_cache WHERE coord_hash = ?',
        [hash]
    );
    if (cached.length > 0) {
        const ageHours = (Date.now() - new Date(cached[0].calculated_at).getTime()) / 36e5;
        if (ageHours < 24) return parseFloat(cached[0].distance_km); // cache hit ✓
    }

    // 2. Try OSRM, fall back to Haversine — ALWAYS cache the result either way
    //    so this coordinate pair won't hit OSRM again for another 24 hours.
    let distanceKm;
    try {
        distanceKm = await getDrivingDistance(shopLat, shopLng, custLat, custLng);
    } catch (osrmErr) {
        console.warn('[geocode/distance] OSRM failed, using Haversine (cached for 24h):', osrmErr.message);
        distanceKm = haversine(shopLat, shopLng, custLat, custLng);
    }

    // 3. Cache the result (whether from OSRM or Haversine fallback)
    await db.query(
        'INSERT INTO distance_cache (coord_hash, distance_km) VALUES (?, ?) ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), calculated_at = NOW()',
        [hash, Math.round(distanceKm * 100) / 100]
    );

    return distanceKm;
};

router.get('/distance', async (req, res) => {
    try {
        let shopLat, shopLng, custLat, custLng;

        if (req.query.shop_id && req.query.address_id) {
            // Mode 1: Both IDs — look up everything from DB
            const [[shop]] = await db.query(
                'SELECT latitude, longitude, shop_name FROM shops WHERE shop_id = ?',
                [req.query.shop_id]
            );
            const [[addr]] = await db.query(
                'SELECT latitude, longitude, address FROM user_addresses WHERE address_id = ?',
                [req.query.address_id]
            );

            if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
            if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
            if (!shop.latitude || !shop.longitude) return res.json({ success: false, message: `Shop "${shop.shop_name}" has no coordinates stored.` });
            if (!addr.latitude || !addr.longitude) return res.json({ success: false, message: `Customer address "${addr.address}" has no coordinates.` });

            shopLat = parseFloat(shop.latitude);
            shopLng = parseFloat(shop.longitude);
            custLat = parseFloat(addr.latitude);
            custLng = parseFloat(addr.longitude);

        } else if (req.query.shop_id && req.query.cust_lat && req.query.cust_lng) {
            // Mode 2: shop_id from DB + raw customer GPS (most common from mobile app)
            const [[shop]] = await db.query(
                'SELECT latitude, longitude, shop_name FROM shops WHERE shop_id = ?',
                [req.query.shop_id]
            );
            if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
            if (!shop.latitude || !shop.longitude) return res.json({ success: false, message: `Shop "${shop.shop_name}" has no coordinates stored.` });

            shopLat = parseFloat(shop.latitude);
            shopLng = parseFloat(shop.longitude);
            custLat = parseFloat(req.query.cust_lat);
            custLng = parseFloat(req.query.cust_lng);

        } else if (req.query.shop_lat && req.query.shop_lng && req.query.cust_lat && req.query.cust_lng) {
            // Mode 3: All raw coordinates
            shopLat = parseFloat(req.query.shop_lat);
            shopLng = parseFloat(req.query.shop_lng);
            custLat = parseFloat(req.query.cust_lat);
            custLng = parseFloat(req.query.cust_lng);
        } else {
            return res.status(400).json({ success: false, message: 'Provide shop_id & address_id, or shop_id & cust_lat/cust_lng, or all four raw coords' });
        }

        let distanceKm = 0;
        let usedFallback = false;

        try {
            // Use the cached path — same table as products.js, so results are consistent
            // with the distances already shown in the Available Nearby cards.
            distanceKm = await getDrivingDistanceCached(shopLat, shopLng, custLat, custLng);
        } catch (osrmError) {
            console.warn('[geocode/distance] OSRM failed, falling back to Haversine:', osrmError.message);
            distanceKm = haversine(shopLat, shopLng, custLat, custLng);
            usedFallback = true;
        }

        // Fetch delivery fee config
        const [feeRows] = await db.query(
            'SELECT key_name, value FROM fee_config WHERE key_name IN (?, ?)',
            ['default_shipping_base', 'rate_per_km']
        );
        const feeCfg = {};
        feeRows.forEach(r => { feeCfg[r.key_name] = parseFloat(r.value); });

        const baseFee   = feeCfg['default_shipping_base'] ?? 500;
        const ratePerKm = feeCfg['rate_per_km'] ?? 30;

        const deliveryFee = baseFee + (distanceKm * ratePerKm);

        res.json({
            success: true,
            distance_km: Math.round(distanceKm * 10) / 10,
            distance_display: `${(Math.round(distanceKm * 10) / 10).toFixed(1)} km`,
            delivery_fee: Math.ceil(deliveryFee),
            delivery_fee_display: `₱${Math.ceil(deliveryFee).toLocaleString()}`,
            breakdown: {
                base_fee: baseFee,
                rate_per_km: ratePerKm,
                distance_km: Math.round(distanceKm * 10) / 10,
                used_fallback: usedFallback
            }
        });

    } catch (err) {
        console.error('[geocode/distance] error:', err.message);
        res.status(500).json({ success: false, message: 'Distance calculation failed' });
    }
});


/**
 * POST /api/geocode/geocode-shops
 * Admin utility — bulk-geocodes all shop addresses that are missing lat/lng.
 */
router.post('/geocode-shops', async (req, res) => {
    try {
        const [shops] = await db.query(
            'SELECT shop_id, shop_name, address FROM shops WHERE latitude IS NULL AND address IS NOT NULL'
        );

        if (shops.length === 0) return res.json({ success: true, message: 'All shops already have coordinates.' });

        const results = [];

        for (const shop of shops) {
            await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit: 1 req/sec
            const encoded = encodeURIComponent(shop.address.trim() + ', Philippines');
            const data = await nominatimFetch(`/search?format=json&q=${encoded}&countrycodes=ph&limit=1`);
            const hit = data?.[0];
            if (hit) {
                await db.query(
                    'UPDATE shops SET latitude = ?, longitude = ? WHERE shop_id = ?',
                    [parseFloat(hit.lat), parseFloat(hit.lon), shop.shop_id]
                );
                results.push({ shop_id: shop.shop_id, shop_name: shop.shop_name, lat: hit.lat, lon: hit.lon, status: 'ok' });
            } else {
                results.push({ shop_id: shop.shop_id, shop_name: shop.shop_name, status: 'not found' });
            }
        }

        res.json({ success: true, results });

    } catch (err) {
        console.error('[geocode/geocode-shops] error:', err.message);
        res.status(500).json({ success: false, message: 'Bulk geocoding failed' });
    }
});

module.exports = router;

