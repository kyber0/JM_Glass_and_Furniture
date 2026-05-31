const db = require('../config/db');

async function fix() {
    // 1. Show current ENUM definition
    const [cols] = await db.query(`SHOW COLUMNS FROM notifications`);
    const typeCol = cols.find(c => c.Field === 'type');
    console.log('Current type column:', typeCol?.Type);

    // 2. Alter to add custom_request to the ENUM (preserving ALL existing values)
    await db.query(`
        ALTER TABLE notifications
        MODIFY COLUMN type ENUM(
            'order', 'promo', 'message', 'delivery', 'system',
            'handyman_assigned', 'customization_request',
            'shop_order', 'review', 'cancelled', 'custom_request'
        ) NOT NULL DEFAULT 'system'
    `);

    console.log('✅ notifications.type ENUM updated — custom_request added.');
    process.exit(0);
}

fix().catch(e => { console.error('Error:', e.message); process.exit(1); });
