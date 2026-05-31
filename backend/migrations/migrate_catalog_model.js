/**
 * migrate_catalog_model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies schema changes for the admin-managed product catalog model:
 *
 *   1. Adds `base_price` + `created_by` + `is_catalog_active` to products
 *   2. Removes `shop_id` from products (products are now admin-owned)
 *   3. Creates `shop_listings` table (shop ↔ product bridge)
 *   4. Creates `listing_colors` table (per-listing color stock)
 *   5. Adds `listing_id` to `order_items`
 *   6. Adds `price_deviation_pct` to `platform_settings`
 *
 * Run AFTER wipe_and_reset.js:
 *   node backend/migrations/migrate_catalog_model.js
 */

const db = require('../config/db');

async function run() {
    console.log('\n[catalog-migration] Starting schema migration...\n');

    // ── 1. Add admin-tracking columns to products ──────────────────────────────
    try {
        await db.query(`ALTER TABLE products
            ADD COLUMN base_price          DECIMAL(10,2) NOT NULL DEFAULT 0
                COMMENT 'Admin-set reference price used for seller deviation check',
            ADD COLUMN created_by          INT NULL
                COMMENT 'admin user_id who added this to the catalog',
            ADD COLUMN is_catalog_active   TINYINT(1) NOT NULL DEFAULT 1
                COMMENT '0 = hidden from seller catalog by admin'
        `);
        console.log('[catalog-migration] ✅ products: base_price, created_by, is_catalog_active added');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('[catalog-migration] ℹ️  products extra columns already exist — skipped');
        } else throw err;
    }

    // ── 2. Drop shop_id from products ─────────────────────────────────────────
    try {
        // Drop FK first (ignore if already gone)
        const [fkRows] = await db.query(`
            SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'products'
              AND COLUMN_NAME = 'shop_id'
              AND REFERENCED_TABLE_NAME IS NOT NULL
        `);
        for (const fk of fkRows) {
            await db.query(`ALTER TABLE products DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
            console.log(`[catalog-migration] ✅ Dropped FK ${fk.CONSTRAINT_NAME} from products`);
        }

        const [cols] = await db.query(`SHOW COLUMNS FROM products LIKE 'shop_id'`);
        if (cols.length > 0) {
            await db.query(`ALTER TABLE products DROP COLUMN shop_id`);
            console.log('[catalog-migration] ✅ products.shop_id removed');
        } else {
            console.log('[catalog-migration] ℹ️  products.shop_id already absent — skipped');
        }
    } catch (err) {
        console.error('[catalog-migration] ❌ Failed removing shop_id from products:', err.message);
    }

    // ── 3. Create shop_listings ───────────────────────────────────────────────
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS shop_listings (
                listing_id      INT AUTO_INCREMENT PRIMARY KEY,
                shop_id         INT NOT NULL,
                product_id      INT NOT NULL,
                custom_price    DECIMAL(10,2) NOT NULL
                    COMMENT 'Seller-set price (must be within platform deviation % of base_price)',
                stock_quantity  INT NOT NULL DEFAULT 0
                    COMMENT 'Per-shop stock managed by seller',
                is_active       TINYINT(1) NOT NULL DEFAULT 1,
                listed_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_shop_product (shop_id, product_id),
                INDEX idx_product_id (product_id),
                FOREIGN KEY (shop_id)    REFERENCES shops(shop_id)    ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('[catalog-migration] ✅ shop_listings table ready');
    } catch (err) {
        console.error('[catalog-migration] ❌ shop_listings:', err.message);
    }

    // ── 4. Create listing_colors ──────────────────────────────────────────────
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS listing_colors (
                listing_id  INT NOT NULL,
                color       VARCHAR(50) NOT NULL,
                stock       INT NOT NULL DEFAULT 0,
                PRIMARY KEY (listing_id, color),
                FOREIGN KEY (listing_id) REFERENCES shop_listings(listing_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('[catalog-migration] ✅ listing_colors table ready');
    } catch (err) {
        console.error('[catalog-migration] ❌ listing_colors:', err.message);
    }

    // ── 5. Add listing_id to order_items ──────────────────────────────────────
    try {
        const [cols] = await db.query(`SHOW COLUMNS FROM order_items LIKE 'listing_id'`);
        if (cols.length === 0) {
            await db.query(`ALTER TABLE order_items
                ADD COLUMN listing_id INT NULL
                    COMMENT 'shop_listings.listing_id — which shop sold this item',
                ADD FOREIGN KEY (listing_id) REFERENCES shop_listings(listing_id) ON DELETE SET NULL
            `);
            console.log('[catalog-migration] ✅ order_items.listing_id added');
        } else {
            console.log('[catalog-migration] ℹ️  order_items.listing_id already exists — skipped');
        }
    } catch (err) {
        console.error('[catalog-migration] ❌ order_items listing_id:', err.message);
    }

    // ── 6. Add price_deviation_pct to platform_settings ───────────────────────
    try {
        const [existing] = await db.query(
            `SELECT 1 FROM platform_settings WHERE \`key\` = 'price_deviation_pct' LIMIT 1`
        );
        if (existing.length === 0) {
            await db.query(`
                INSERT INTO platform_settings (\`key\`, value, description)
                VALUES ('price_deviation_pct', '20',
                    'Maximum % a seller can deviate from the admin base price (e.g. 20 = ±20%)')
            `);
            console.log('[catalog-migration] ✅ price_deviation_pct added to platform_settings (default 20%)');
        } else {
            console.log('[catalog-migration] ℹ️  price_deviation_pct already in platform_settings — skipped');
        }
    } catch (err) {
        console.error('[catalog-migration] ❌ platform_settings:', err.message);
    }

    // ── 7. Drop sold_count from product_colors (stock now in listing_colors) ──
    // product_colors keeps color names only; stock is per-listing now.
    try {
        const [stockCol] = await db.query(`SHOW COLUMNS FROM product_colors LIKE 'stock'`);
        if (stockCol.length > 0) {
            await db.query(`ALTER TABLE product_colors DROP COLUMN stock`);
            console.log('[catalog-migration] ✅ product_colors.stock removed (moved to listing_colors)');
        } else {
            console.log('[catalog-migration] ℹ️  product_colors.stock already absent — skipped');
        }
    } catch (err) {
        console.error('[catalog-migration] ❌ dropping product_colors.stock:', err.message);
    }

    console.log('\n[catalog-migration] ✅ Migration complete.\n');
    process.exit(0);
}

run().catch(err => {
    console.error('[catalog-migration] Fatal:', err.message);
    process.exit(1);
});
