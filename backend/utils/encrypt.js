/**
 * utils/encrypt.js — AES-256-GCM field-level encryption
 * ─────────────────────────────────────────────────────────────────────────────
 * Used for sensitive PII stored in the database:
 *   • TIN numbers (shops)
 *   • Shipping addresses (orders)
 *   • Payment method details
 *
 * Setup (add to .env):
 *   ENCRYPTION_KEY=<64 hex chars — 32 bytes>
 *
 * Generate a key (run once in Node):
 *   require('crypto').randomBytes(32).toString('hex')
 *
 * Encrypted format stored in DB:
 *   "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *
 * Legacy rows that contain plain text are returned AS-IS when decrypt() is
 * called (detects the missing colons and skips decryption gracefully).
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

/** Returns the 32-byte key from ENCRYPTION_KEY env var */
function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        // Soft-fail: if no key is configured we store/return plain text.
        // This allows the app to run without encryption configured while
        // still being importable.
        return null;
    }
    return Buffer.from(hex, 'hex');
}

/**
 * encrypt(text) → "<iv>:<authTag>:<ciphertext>" (all hex)
 * Returns null for null/undefined input.
 * Returns plain text unchanged if ENCRYPTION_KEY is not configured.
 */
function encrypt(text) {
    if (text == null) return null;
    const str = String(text);
    const key = getKey();
    if (!key) return str; // no key → store as plain text

    const iv       = crypto.randomBytes(12); // 96-bit IV (GCM standard)
    const cipher   = crypto.createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const authTag  = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * decrypt(ciphertext) → original string
 * Returns null for null/undefined input.
 * Safely passes through plain-text (legacy) values.
 */
function decrypt(ciphertext) {
    if (ciphertext == null) return null;
    const str = String(ciphertext);

    // Detect encrypted format: must have exactly 2 colons
    const parts = str.split(':');
    if (parts.length !== 3) return str; // plain-text or legacy — return as-is

    const key = getKey();
    if (!key) return str; // no key → can't decrypt, return raw

    try {
        const [ivHex, tagHex, dataHex] = parts;
        const iv      = Buffer.from(ivHex,  'hex');
        const authTag = Buffer.from(tagHex, 'hex');
        const data    = Buffer.from(dataHex,'hex');

        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(authTag);
        return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
    } catch (_) {
        // Decryption failed (wrong key, corrupt data) — return raw safely
        return str;
    }
}

/**
 * isEncrypted(value) → boolean
 * Utility to test whether a stored DB value is in the encrypted format.
 */
function isEncrypted(value) {
    if (!value) return false;
    return String(value).split(':').length === 3;
}

module.exports = { encrypt, decrypt, isEncrypted };
