/**
 * geocode_missing_addresses.js
 * One-time backfill: geocodes any user_addresses rows where latitude IS NULL.
 * Respects Nominatim rate limit (1 request/second).
 */

const db = require('../config/db');
const https = require('https');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const geocodeAddress = (addressText) =>
    new Promise((resolve) => {
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
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const result = parsed?.[0];
                    if (result) {
                        resolve({ latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) });
                    } else {
                        resolve({ latitude: null, longitude: null });
                    }
                } catch {
                    resolve({ latitude: null, longitude: null });
                }
            });
        }).on('error', () => resolve({ latitude: null, longitude: null }));
    });

async function run() {
    const [rows] = await db.query(
        'SELECT address_id, address FROM user_addresses WHERE latitude IS NULL AND address IS NOT NULL'
    );

    console.log(`\n🌍  Geocoding ${rows.length} address(es) with missing coordinates...\n`);

    if (rows.length === 0) {
        console.log('✅  All addresses already have coordinates. Nothing to do.');
        process.exit(0);
    }

    let success = 0, failed = 0;
    for (const row of rows) {
        await sleep(1100); // Nominatim rate limit: 1 req/sec
        const { latitude, longitude } = await geocodeAddress(row.address);
        if (latitude) {
            await db.query(
                'UPDATE user_addresses SET latitude = ?, longitude = ? WHERE address_id = ?',
                [latitude, longitude, row.address_id]
            );
            console.log(`  ✓  [${row.address_id}] "${row.address.substring(0, 50)}" → (${latitude}, ${longitude})`);
            success++;
        } else {
            console.log(`  ✗  [${row.address_id}] "${row.address.substring(0, 50)}" — not found`);
            failed++;
        }
    }

    console.log(`\n─────────────────────────────────────────`);
    console.log(`✅  Geocoded: ${success}  |  ❌ Failed: ${failed}`);
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
