const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const https   = require('https');

// ── OSRM driving distance with 24-hour DB cache ────────────────────────────
const CACHE_TTL_HOURS = 24;

// Straight-line fallback when ORS is unavailable
const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── OpenRouteService driving distance ────────────────────────────────────────
// Free tier: 2,000 req/day. Philippines OSM coverage. Guaranteed JSON responses.
const getDrivingDistanceORS = (shopLat, shopLng, custLat, custLng) =>
    new Promise((resolve, reject) => {
        const apiKey = process.env.ORS_API_KEY;
        if (!apiKey || apiKey === 'your_ors_api_key_here') {
            return reject(new Error('ORS_API_KEY not configured'));
        }
        const path = `/v2/directions/driving-car?api_key=${apiKey}&start=${shopLng},${shopLat}&end=${custLng},${custLat}`;
        https.get({
            hostname: 'api.openrouteservice.org',
            path,
            headers: {
                'User-Agent': 'JM-Glass-And-Furniture-App/1.0',
                'Accept': 'application/json, application/geo+json',
            }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`ORS HTTP ${res.statusCode}`));
                }
                try {
                    const j = JSON.parse(data);
                    const distanceMeters = j?.features?.[0]?.properties?.segments?.[0]?.distance;
                    if (distanceMeters != null) {
                        resolve(distanceMeters / 1000);
                    } else {
                        reject(new Error('Unexpected ORS response'));
                    }
                } catch { reject(new Error('Invalid JSON from ORS')); }
            });
        }).on('error', reject);
    });

const buildHash = (lat1, lng1, lat2, lng2) => {
    // Round to 4 decimal places (~11m) to maximise cache hits for nearby addresses
    const r = (n) => Math.round(parseFloat(n) * 10000) / 10000;
    return `${r(lat1)},${r(lng1)},${r(lat2)},${r(lng2)}`;
};

const getDrivingDistanceCached = async (buyerLat, buyerLng, shopLat, shopLng) => {
    const hash = buildHash(buyerLat, buyerLng, shopLat, shopLng);

    // 1. Check cache — avoids hitting OSRM on every product page load
    const [cached] = await db.query(
        'SELECT distance_km, calculated_at FROM distance_cache WHERE coord_hash = ?',
        [hash]
    );
    if (cached.length > 0) {
        const ageHours = (Date.now() - new Date(cached[0].calculated_at).getTime()) / 36e5;
        if (ageHours < CACHE_TTL_HOURS) {
            return parseFloat(cached[0].distance_km); // cache hit ✓
        }
    }

    // 2. Try ORS driving distance, fall back to Haversine — ALWAYS cache result either way
    let distanceKm;
    try {
        distanceKm = await getDrivingDistanceORS(buyerLat, buyerLng, shopLat, shopLng);
    } catch {
        // ORS unavailable (no key, rate limit, network) — use Haversine and cache it
        distanceKm = haversine(buyerLat, buyerLng, shopLat, shopLng);
    }

    // 3. Store / update cache (OSRM driving distance or Haversine fallback)
    await db.query(
        'INSERT INTO distance_cache (coord_hash, distance_km) VALUES (?, ?) ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), calculated_at = NOW()',
        [hash, Math.round(distanceKm * 100) / 100]
    );

    return distanceKm;
};


// ── GET /api/products  — list catalog products (buyer-facing) ─────────────────
// One row per admin-catalog product. Sellers avail products via shop_listings;
// the "Available Locations" section on ProductDetailScreen shows per-shop detail.
// Price = lowest seller price, stock = total across all shops.
router.get('/', async (req, res) => {
    try {
        const { category, search, theme } = req.query;

        let conditions = [
            'p.is_active = 1',
            'p.is_catalog_active = 1',
            'sl.is_active = 1',
        ];
        let params = [];

        if (category && category !== 'All') {
            conditions.push('c.name = ?');
            params.push(category);
        }
        if (theme) {
            conditions.push('p.theme = ?');
            params.push(theme);
        }
        if (search) {
            conditions.push('(p.title LIKE ? OR p.description LIKE ? OR c.name LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const [rows] = await db.query(`
            SELECT
                p.product_id, p.title, p.description, p.image_url,
                p.theme, p.service_type, p.is_active, p.sold_count,
                p.created_at, p.base_price,
                c.name          AS category_name,
                c.category_id,
                p.base_price                          AS price,
                SUM(sl.stock_quantity)                AS stock_quantity,
                COUNT(DISTINCT sl.shop_id)            AS shop_count,
                COALESCE(AVG(r.rating), 0)    AS avg_rating,
                COUNT(DISTINCT r.review_id)   AS review_count,
                COALESCE(
                    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('"', ps.size, '"') SEPARATOR ','), ']')
                     FROM product_sizes ps WHERE ps.product_id = p.product_id),
                    '[]'
                ) AS sizes,
                COALESCE(
                    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"color":"', pc.color, '"}') SEPARATOR ','), ']')
                     FROM product_colors pc WHERE pc.product_id = p.product_id),
                    '[]'
                ) AS colors,
                COALESCE(
                    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"label":"', psp.spec_label, '","value":"', psp.spec_value, '"}') SEPARATOR ','), ']')
                     FROM product_specs psp WHERE psp.product_id = p.product_id),
                    '[]'
                ) AS specs
            FROM products p
            JOIN categories c          ON c.category_id  = p.category_id
            JOIN shop_listings sl      ON sl.product_id  = p.product_id
            LEFT JOIN reviews r        ON r.product_id   = p.product_id
            WHERE ${conditions.join(' AND ')}
            GROUP BY
                p.product_id, p.title, p.description, p.image_url,
                p.theme, p.service_type, p.is_active, p.sold_count,
                p.created_at, p.base_price,
                c.name, c.category_id
            ORDER BY p.sold_count DESC
        `, params);

        res.json({ success: true, count: rows.length, data: rows });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── GET /api/products/themes ─────────────────────────────────────────────────
router.get('/themes', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                p.theme         AS title,
                MIN(p.image_url) AS image,
                COUNT(DISTINCT p.product_id) AS product_count
            FROM products p
            JOIN shop_listings sl ON sl.product_id = p.product_id AND sl.is_active = 1
            WHERE p.theme IS NOT NULL AND p.theme != ''
              AND p.is_active = 1 AND p.is_catalog_active = 1
            GROUP BY p.theme
            ORDER BY product_count DESC
        `);

        const themes = rows.map((r, i) => ({
            id:       'theme_' + i,
            title:    r.title,
            subtitle: `${r.product_count} Products`,
            image:    r.image || null,
        }));

        res.json({ success: true, count: themes.length, data: themes });
    } catch (error) {
        console.error('Error fetching themes:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ── GET /api/products/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const buyerLat = req.query.lat ? parseFloat(req.query.lat) : null;
        const buyerLng = req.query.lng ? parseFloat(req.query.lng) : null;
        // FIX D1: prefer the specific listing the buyer tapped (multi-seller products)
        const preferListingId = req.query.listing_id ? parseInt(req.query.listing_id) : null;

        // Main product + preferred listing details
        const [rows] = await db.query(`
            SELECT
                p.product_id, p.title, p.description, p.image_url,
                p.theme, p.service_type, p.is_active, p.sold_count,
                p.created_at, p.base_price,
                c.name  AS category_name,
                c.category_id,
                sl.listing_id,
                sl.shop_id,
                sl.custom_price AS price,
                sl.stock_quantity,
                s.user_id       AS owner_id,
                s.shop_name,
                COALESCE(AVG(r.rating), 0)   AS avg_rating,
                COUNT(DISTINCT r.review_id)  AS review_count,
                COALESCE(
                    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('"', ps.size, '"') SEPARATOR ','), ']')
                     FROM product_sizes ps WHERE ps.product_id = p.product_id),
                    '[]'
                ) AS sizes,
                COALESCE(
                    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"color":"', pc.color, '"}') SEPARATOR ','), ']')
                     FROM product_colors pc WHERE pc.product_id = p.product_id),
                    '[]'
                ) AS colors,
                COALESCE(
                    (SELECT CONCAT('[', GROUP_CONCAT(CONCAT('{"label":"', psp.spec_label, '","value":"', psp.spec_value, '"}') SEPARATOR ','), ']')
                     FROM product_specs psp WHERE psp.product_id = p.product_id),
                    '[]'
                ) AS specs
            FROM products p
            JOIN categories c     ON c.category_id = p.category_id
            JOIN shop_listings sl  ON sl.product_id = p.product_id AND sl.is_active = 1
            JOIN shops s           ON s.shop_id     = sl.shop_id
            LEFT JOIN reviews r    ON r.product_id  = p.product_id
            WHERE p.product_id = ? AND p.is_active = 1
              AND sl.listing_id = COALESCE(?, sl.listing_id)
            GROUP BY p.product_id, sl.listing_id
            LIMIT 1
        `, [req.params.id, preferListingId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const product = rows[0];

        // Product images
        const [imageRows] = await db.query(
            'SELECT image_url FROM product_images WHERE product_id = ?',
            [product.product_id]
        );
        product.images = imageRows.map(r => r.image_url);
        if (product.images.length === 0 && product.image_url) {
            product.images = [product.image_url];
        }

        // Per-listing color stocks
        const [colorStockRows] = await db.query(
            'SELECT color, stock FROM listing_colors WHERE listing_id = ?',
            [product.listing_id]
        );
        product.color_stocks = colorStockRows;

        // Shop info
        const [[shopInfo]] = await db.query(`
            SELECT s.user_id, s.shop_name, s.shop_id, s.description, s.logo_url,
                   u.full_name AS owner_name, s.created_at
            FROM shops s JOIN users u ON s.user_id = u.user_id
            WHERE s.shop_id = ?
        `, [product.shop_id]);

        // ── Available Locations: all shops that list this product ────────────
        // Haversine formula filters ≤ 50 km when buyer coords provided.
        // HAVING clause cannot reference alias in WHERE, so we wrap in subquery.
        const hasCoords = buyerLat !== null && buyerLng !== null;
        const locationParams = hasCoords
            // 4 params matching the 4 ? in the query:
            //   ? 1 → COS(RADIANS(?))          = buyerLat
            //   ? 2 → RADIANS(s.longitude) - RADIANS(?) = buyerLng
            //   ? 3 → SIN(RADIANS(?))           = buyerLat
            //   ? 4 → sl.product_id = ?         = product.product_id
            ? [buyerLat, buyerLng, buyerLat, product.product_id]
            : [product.product_id];

        const distanceExpr = hasCoords
            ? `ROUND(6371 * ACOS(
                    GREATEST(-1, LEAST(1,
                        COS(RADIANS(?)) * COS(RADIANS(s.latitude)) *
                        COS(RADIANS(s.longitude) - RADIANS(?)) +
                        SIN(RADIANS(?)) * SIN(RADIANS(s.latitude))
                    ))
               ), 1)`
            : 'NULL';

        const [locationRows] = await db.query(`
            SELECT
                inner_loc.*,
                CEIL(
                    COALESCE((SELECT value FROM fee_config WHERE key_name = 'default_shipping_base' LIMIT 1), 500)
                    + COALESCE(inner_loc.distance_km, 0) * COALESCE((SELECT value FROM fee_config WHERE key_name = 'rate_per_km' LIMIT 1), 30)
                ) AS delivery_fee
            FROM (
                SELECT
                    sl.listing_id,
                    sl.custom_price     AS price,
                    sl.stock_quantity,
                    sl.service_types,
                    EXISTS(
                        SELECT 1 FROM handymen h WHERE h.shop_id = sl.shop_id
                    ) AS has_handymen,
                    s.shop_id,
                    s.shop_name,
                    s.address,
                    s.logo_url,
                    s.is_verified,
                    s.latitude,
                    s.longitude,
                    s.user_id,
                    CASE
                        WHEN s.latitude IS NOT NULL AND ${hasCoords ? 'TRUE' : 'FALSE'}
                        THEN ${distanceExpr}
                        ELSE NULL
                    END AS distance_km
                FROM shop_listings sl
                JOIN shops s ON s.shop_id = sl.shop_id
                WHERE sl.product_id = ? AND sl.is_active = 1
            ) AS inner_loc
            ${hasCoords ? 'WHERE inner_loc.distance_km IS NULL OR inner_loc.distance_km <= 50' : ''}
            ORDER BY inner_loc.distance_km ASC, inner_loc.price ASC
        `, locationParams);

        // ── Enrich locationRows with OSRM driving distances (Tier 2) ─────────
        // Run all shops in parallel; fallback to Haversine on any OSRM error.
        const [feeConfig] = await db.query(
            "SELECT key_name, value FROM fee_config WHERE key_name IN ('default_shipping_base', 'rate_per_km')"
        );
        const feeCfg = {};
        feeConfig.forEach(r => { feeCfg[r.key_name] = parseFloat(r.value); });
        const baseFee   = feeCfg['default_shipping_base'] ?? 500;
        const ratePerKm = feeCfg['rate_per_km'] ?? 30;

        const enrichedLocations = await Promise.all(
            locationRows.map(async (loc) => {
                if (!hasCoords || !loc.latitude || !loc.longitude) return loc;
                try {
                    const drivingKm = await getDrivingDistanceCached(
                        buyerLat, buyerLng,
                        parseFloat(loc.latitude), parseFloat(loc.longitude)
                    );
                    const drivingKmRounded = Math.round(drivingKm * 10) / 10;
                    return {
                        ...loc,
                        distance_km:  drivingKmRounded,
                        delivery_fee: Math.ceil(baseFee + drivingKmRounded * ratePerKm),
                    };
                } catch {
                    return loc; // keep Haversine values on OSRM failure
                }
            })
        );
        // Re-sort by driving distance after enrichment
        enrichedLocations.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));

        // ── Attach per-listing color stocks to each location ──────────────────
        // Batch-fetch all color_stocks for all listing IDs in one query
        const listingIds = enrichedLocations.map(l => l.listing_id).filter(Boolean);
        if (listingIds.length > 0) {
            const [colorStockRows] = await db.query(
                `SELECT listing_id, color, stock FROM listing_colors WHERE listing_id IN (${listingIds.map(() => '?').join(',')})`,
                listingIds
            );
            // Group by listing_id for O(1) lookup
            const colorsByListing = {};
            for (const row of colorStockRows) {
                if (!colorsByListing[row.listing_id]) colorsByListing[row.listing_id] = [];
                colorsByListing[row.listing_id].push({ color: row.color, stock: row.stock });
            }
            for (const loc of enrichedLocations) {
                loc.color_stocks = colorsByListing[loc.listing_id] || [];
            }
        }

        // Related products — same shop via shop_listings
        const [relatedRows] = await db.query(`
            SELECT p2.product_id, p2.title, sl2.custom_price AS price,
                   p2.image_url, p2.sold_count,
                   sl2.listing_id,
                   CAST(COALESCE(AVG(r2.rating), 0) AS DECIMAL(2,1)) AS avg_rating
            FROM shop_listings sl2
            JOIN products p2    ON p2.product_id = sl2.product_id AND p2.is_active = 1
            LEFT JOIN reviews r2 ON r2.product_id = p2.product_id
            WHERE sl2.shop_id = ? AND sl2.product_id != ? AND sl2.is_active = 1
            GROUP BY p2.product_id, sl2.listing_id
            ORDER BY p2.sold_count DESC
            LIMIT 5
        `, [product.shop_id, product.product_id]);

        res.json({
            success: true,
            data: {
                ...product,
                shop:                shopInfo,
                available_locations: enrichedLocations,
                related_products:    relatedRows,
            },
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;
