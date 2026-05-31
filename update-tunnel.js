/**
 * update-tunnel.js
 * ─────────────────────────────────────────────────────────────
 * Reads the active tunnel URL from .tunnelurl (written by server
 * on each startup) and patches it into services/api.js so the
 * React Native app always connects to the right backend.
 *
 * Usage:  node update-tunnel.js
 * ─────────────────────────────────────────────────────────────
 */
const fs   = require('fs');
const path = require('path');

const TUNNEL_FILE = path.join(__dirname, '.tunnelurl');
const API_FILE    = path.join(__dirname, 'services', 'api.js');

if (!fs.existsSync(TUNNEL_FILE)) {
    console.error('❌  .tunnelurl not found. Start the backend first (npm run dev in /backend).');
    process.exit(1);
}

const url = fs.readFileSync(TUNNEL_FILE, 'utf8').trim();
if (!url.startsWith('http')) {
    console.error('❌  .tunnelurl contains an invalid URL:', url);
    process.exit(1);
}

let api = fs.readFileSync(API_FILE, 'utf8');
const updated = api.replace(
    /const TUNNEL_URL\s+=\s+'[^']*';/,
    `const TUNNEL_URL  = '${url}';`
);

if (api === updated) {
    console.log('⚠️  TUNNEL_URL line not found in api.js — check the file manually.');
    process.exit(1);
}

fs.writeFileSync(API_FILE, updated, 'utf8');
console.log(`✅  api.js TUNNEL_URL updated to:\n    ${url}`);
