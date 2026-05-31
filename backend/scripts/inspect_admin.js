const db = require('../config/db');

async function check() {
    const [tables] = await db.query('SHOW TABLES');
    const key = Object.keys(tables[0])[0];
    console.log('TABLES:', tables.map(t => t[key]).join('\n  '));

    const [admins] = await db.query(
        "SELECT user_id, full_name, email, role FROM users WHERE role IN ('admin','superadmin') LIMIT 5"
    );
    console.log('\nADMINS:', JSON.stringify(admins, null, 2));

    if (admins.length > 0) {
        const adminId = admins[0].user_id;
        const [products] = await db.query(
            'SELECT product_id, title FROM products WHERE seller_id = ? LIMIT 20', [adminId]
        );
        console.log('\nADMIN PRODUCTS (seller_id=' + adminId + '):', JSON.stringify(products, null, 2));

        // also check via shops
        const [shops] = await db.query('SELECT shop_id, name FROM shops WHERE user_id = ?', [adminId]);
        console.log('\nADMIN SHOPS:', JSON.stringify(shops, null, 2));

        if (shops.length > 0) {
            const shopId = shops[0].shop_id;
            const [listings] = await db.query(
                'SELECT sl.listing_id, p.title FROM shop_listings sl JOIN products p ON p.product_id = sl.product_id WHERE sl.shop_id = ? LIMIT 20',
                [shopId]
            );
            console.log('\nLISTINGS in admin shop:', JSON.stringify(listings, null, 2));
        }
    }
    process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
