#!/usr/bin/env node
/**
 * start-remote.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-command remote dev session. Run this AFTER `npm run dev` is running
 * in the /backend folder.
 *
 * What it does:
 *   1. Starts ngrok on port 3000 (tunnels your backend to the internet)
 *   2. Waits for ngrok to get its HTTPS URL
 *   3. Auto-patches TUNNEL_URL in services/api.js
 *   4. Launches `npx expo start --tunnel`
 *
 * Usage:
 *   npm run remote
 *
 * Requirements:
 *   - ngrok must be installed: winget install ngrok
 *   - ngrok authtoken set: ngrok config add-authtoken <your_token>
 *   - Backend already running: cd backend && npm run dev
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { spawn, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');

const API_FILE      = path.join(__dirname, 'services', 'api.js');
const NGROK_PORT    = 3000;   // Must match your backend port
const STATIC_DOMAIN = 'feline-flashing-paper.ngrok-free.dev';
const TUNNEL_URL    = `https://${STATIC_DOMAIN}`;


// ── Helpers ──────────────────────────────────────────────────────────────────

function patchApiJs(tunnelUrl) {
    let src = fs.readFileSync(API_FILE, 'utf8');
    
    // Check if it already has the exact string we want
    const exactMatch = `const TUNNEL_URL = '${tunnelUrl}';`;
    const useTunnelMatch = 'const USE_TUNNEL = true;';
    
    if (src.includes(exactMatch) && src.includes(useTunnelMatch)) {
        console.log(`✅  api.js already points to → '${tunnelUrl}'`);
        return;
    }

    const next = src.replace(
        /const TUNNEL_URL\s*=\s*'[^']*';/,
        exactMatch
    );
    
    if (!next.includes(exactMatch)) {
        console.error('❌  Could not find TUNNEL_URL line in api.js. Check the file.');
        process.exit(1);
    }
    
    // Also ensure USE_TUNNEL is true
    const final = next.replace(
        /const USE_TUNNEL\s*=\s*(true|false);/,
        useTunnelMatch
    );
    
    fs.writeFileSync(API_FILE, final, 'utf8');
    console.log(`✅  api.js patched → TUNNEL_URL = '${tunnelUrl}'`);
}

function getNgrokUrl() {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const poll = () => {
            http.get(NGROK_API, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const https = json.tunnels?.find(t => t.proto === 'https');
                        if (https) return resolve(https.public_url);
                    } catch (_) {}
                    if (Date.now() - start > MAX_WAIT_MS) return reject(new Error('Timed out waiting for ngrok URL'));
                    setTimeout(poll, POLL_MS);
                });
            }).on('error', () => {
                if (Date.now() - start > MAX_WAIT_MS) return reject(new Error('Timed out waiting for ngrok to start'));
                setTimeout(poll, POLL_MS);
            });
        };
        poll();
    });
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n🚀  JM Glass & Furniture — Remote Mode');
    console.log('─'.repeat(48));
    console.log(`    Backend → ${TUNNEL_URL}`);

    // 1. Ensure api.js points to the static domain
    console.log('\n[1/3] Verifying api.js tunnel config ...');
    patchApiJs(TUNNEL_URL);

    // 2. Start ngrok with static domain
    console.log(`[2/3] Starting ngrok → ${STATIC_DOMAIN} ...`);
    const ngrok = spawn('ngrok', ['http', `--domain=${STATIC_DOMAIN}`, String(NGROK_PORT)], {
        stdio: 'ignore',
        detached: false,
        shell: true,
    });

    ngrok.on('error', (err) => {
        if (err.code === 'ENOENT') {
            console.error('\n❌  ngrok not found. Install it first:');
            console.error('       winget install ngrok');
            console.error('       ngrok config add-authtoken <your_token>');
        } else {
            console.error('❌  ngrok error:', err.message);
        }
        process.exit(1);
    });

    // Give ngrok a moment to connect
    await new Promise(r => setTimeout(r, 2000));

    // 3. Start Expo with tunnel
    console.log('[3/3] Starting Expo (tunnel mode) ...');
    console.log('\n─'.repeat(48));
    console.log('📱  Share the QR code below with anyone on any WiFi!\n');

    const expo = spawn('npx', ['expo', 'start', '--tunnel'], {
        stdio: 'inherit',
        shell: true,
    });

    // Forward Ctrl+C to both processes
    process.on('SIGINT', () => {
        expo.kill('SIGINT');
        ngrok.kill();
        process.exit(0);
    });

    expo.on('exit', (code) => {
        ngrok.kill();
        process.exit(code ?? 0);
    });
})();

