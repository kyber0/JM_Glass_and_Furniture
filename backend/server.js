const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

// Guard: crash immediately if JWT_SECRET is not configured
if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET is not set in .env — server will not start.');
    process.exit(1);
}

// ── App setup ────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

const http = require('http');
const socketUtil = require('./utils/socket');

// Create HTTP server and wrap with Socket.IO
const server = http.createServer(app);
const io = socketUtil.init(server);

// Attach io to every request so routes can easily emit events
app.use((req, res, next) => { req.io = io; next(); });

// Handle client connections and room joining
io.on('connection', (socket) => {
    // Join personal room for notifications & specific user updates
    socket.on('join:user',  ({ userId }) => socket.join(`user:${userId}`));
    // Join shop room for seller-specific updates
    socket.on('join:shop',  ({ shopId }) => socket.join(`shop:${shopId}`));
    // Join chat room for instant messaging
    socket.on('join:chat',  ({ roomId }) => socket.join(`chat:${roomId}`));
    socket.on('leave:chat', ({ roomId }) => socket.leave(`chat:${roomId}`));
    // Join order room for live GPS tracking
    socket.on('join:order', ({ orderId }) => socket.join(`order:${orderId}`));
    socket.on('leave:order',({ orderId }) => socket.leave(`order:${orderId}`));
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dynamic URL rewriter — converts relative "uploads/..." paths to full URLs
const urlRewriter = require('./middleware/urlRewriter');
app.use(urlRewriter);

// Serve static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Middleware ────────────────────────────────────────────────────────────────
const { requireRole, requireAny } = require('./middleware/rbac');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const shopRoutes     = require('./routes/shop');
const productsRoutes = require('./routes/products');
const ordersRoutes   = require('./routes/orders');

// ── Public routes (no auth required) ─────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/public',   require('./routes/public'));
app.use('/api/faqs',     require('./routes/faqs'));
app.use('/api/shipping', require('./routes/shipping'));
app.use('/api/fees',     require('./routes/fees'));

// ── Authenticated routes (any valid JWT) ──────────────────────────────────────
app.use('/api/cart',            requireAny(), require('./routes/cart'));
app.use('/api/reviews',         requireAny(), require('./routes/reviews'));
app.use('/api/favorites',       requireAny(), require('./routes/favorites'));
app.use('/api/messages',        requireAny(), require('./routes/messages'));
app.use('/api/notifications',   requireAny(), require('./routes/notifications'));
app.use('/api/vouchers',        requireAny(), require('./routes/vouchers'));
app.use('/api/stock-alerts',    requireAny(), require('./routes/stock_alerts'));
app.use('/api/custom-requests', requireAny(), require('./routes/custom_requests'));
app.use('/api/orders',                requireAny(), ordersRoutes);
app.use('/api/payment-verifications', requireAny(), require('./routes/payment_verifications'));
app.use('/api/addresses',       requireAny(), require('./routes/addresses'));
app.use('/api/geocode',         require('./routes/geocode')); // public — used before login (signup screen)
app.use('/api/points',          requireAny(), require('./routes/points'));
app.use('/api/payment-methods', requireAny(), require('./routes/payment_methods'));
app.use('/api/reports',         requireAny(), require('./routes/reports'));
app.use('/api/disputes',        requireAny(), require('./routes/disputes'));


// ── Seller-related routes ─────────────────────────────────────────────────────
// /api/shop is open to any authenticated user so buyers can apply as sellers
app.use('/api/shop',      requireAny(), shopRoutes);
// These routes are genuinely seller-only
app.use('/api/handymen',  requireAny(),  require('./routes/handymen'));
app.use('/api/workers',   requireAny(),  require('./routes/workers'));
app.use('/api/analytics', requireRole('seller', 'admin'), require('./routes/analytics'));


// ── Admin-only routes ─────────────────────────────────────────────────────────
app.use('/api/admin',         requireRole('admin'), require('./routes/admin'));
app.use('/api/admin/catalog', requireRole('admin'), require('./routes/catalog'));

// ── Catalog & Listings ────────────────────────────────────────────────────────
// Public-facing catalog browse (sellers avail products, buyers discover them)
app.use('/api/catalog',   requireAny(), require('./routes/catalog'));
app.use('/api/listings',  requireAny(), require('./routes/listings'));


// ── Root endpoint ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        message:  'JM Glass & Furniture API',
        status:   'Running',
        version:  '2.0',
        security: 'RBAC enabled (verifyToken + role checks)',
    });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
});

// ── Start server + tunnel ─────────────────────────────────────────────────────
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Database: ${process.env.DB_NAME || 'jm_glass_db'}`);
    console.log(`Security: RBAC middleware active`);
    console.log(`Encryption: ${process.env.ENCRYPTION_KEY ? 'AES-256-GCM active' : '⚠️  No ENCRYPTION_KEY — PII stored as plain text'}`);

    // ── Ensure DB views are up-to-date with catalog model ────────────────────
    const db = require('./config/db');
    try {
        // FIX D2: COALESCE all subquery arrays to '[]' — prevents [null] JSON when no rows exist
        await db.query(`
            CREATE OR REPLACE VIEW vw_product_details AS
            SELECT p.product_id, p.title, p.price, p.base_price, p.image_url,
                   p.description, p.theme, p.service_type, p.is_active,
                   p.is_catalog_active, p.sold_count, p.created_at,
                   c.name AS category_name, c.category_id,
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
            JOIN categories c ON p.category_id = c.category_id
            LEFT JOIN reviews r ON p.product_id = r.product_id
            GROUP BY p.product_id, c.name, c.category_id, p.service_type
        `);
        await db.query(`
            CREATE OR REPLACE VIEW vw_seller_dashboard_stats AS
            SELECT s.shop_id, s.user_id AS seller_id,
                   COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                   COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.order_id END) AS pending_orders,
                   COUNT(DISTINCT sl.listing_id) AS total_products
            FROM shops s
            LEFT JOIN shop_listings sl ON sl.shop_id    = s.shop_id
            LEFT JOIN order_items   oi ON oi.listing_id = sl.listing_id
            LEFT JOIN orders        o  ON o.order_id    = oi.order_id AND o.status NOT IN ('cancelled')
            GROUP BY s.shop_id, s.user_id
        `);
        console.log('✅ DB views verified/updated');
    } catch (e) {
        console.warn('⚠️  View update failed:', e.message);
    }

    // ── Startup: auto-restore workers with no active order to 'available' ─────
    try {
        // Delivery men stuck as 'on_delivery' but with no active shipped/processing order
        const [dmFixed] = await db.query(`
            UPDATE delivery_men dm
            SET dm.status = 'available'
            WHERE dm.status = 'on_delivery'
              AND NOT EXISTS (
                  SELECT 1 FROM orders o
                  WHERE o.delivery_man_id = dm.delivery_man_id
                    AND o.status IN ('processing','shipped')
              )
        `);
        // Handymen stuck as 'busy' but with no active processing order
        const [hmFixed] = await db.query(`
            UPDATE handymen h
            SET h.status = 'available'
            WHERE h.status = 'busy'
              AND NOT EXISTS (
                  SELECT 1 FROM order_handymen oh
                  JOIN orders o ON o.order_id = oh.order_id
                  WHERE oh.handyman_id = h.handyman_id
                    AND o.status IN ('processing','shipped')
              )
        `);
        const dmCount = dmFixed.affectedRows;
        const hmCount = hmFixed.affectedRows;
        if (dmCount > 0 || hmCount > 0) {
            console.log(`✅ Worker status cleanup: ${dmCount} delivery man(s), ${hmCount} handyman(s) reset to available`);
        }
    } catch (e) {
        console.warn('⚠️  Worker status cleanup failed:', e.message);
    }

    // ── ngrok tunnel ─────────────────────────────────────────────────────────
    const NGROK_TOKEN = process.env.NGROK_AUTHTOKEN;
    if (NGROK_TOKEN && NGROK_TOKEN !== 'your_ngrok_authtoken_here') {
        const startNgrokTunnel = async () => {
            try {
                const ngrok    = require('@ngrok/ngrok');
                const listener = await ngrok.forward({ addr: PORT, authtoken: NGROK_TOKEN });
                const url      = listener.url();
                console.log('\n' + '═'.repeat(56));
                console.log('🌐  Public tunnel active! (via ngrok)');
                console.log(`    URL: ${url}`);
                console.log('    ⚡ This URL is stable for this session');
                console.log('═'.repeat(56) + '\n');
            } catch (err) {
                console.warn('[ngrok] ⚠️  Could not start ngrok tunnel:', err.message);
                console.warn('[ngrok] Falling back to localtunnel...');
                startLocaltunnel();
            }
        };
        startNgrokTunnel();
    } else {
        startLocaltunnel();
    }

    // ── localtunnel fallback ──────────────────────────────────────────────────
    function startLocaltunnel() {
        const localtunnel = require('localtunnel');
        let tunnelInstance = null;

        const connect = async () => {
            try {
                tunnelInstance = await localtunnel({ port: PORT, subdomain: 'jm-glass-furniture' });
                console.log('\n' + '═'.repeat(56));
                console.log('🌐  Public tunnel active! (via localtunnel)');
                console.log(`    URL: ${tunnelInstance.url}`);
                console.log('    ⚠️  URL may change on reconnect — set NGROK_AUTHTOKEN for stability');
                console.log('═'.repeat(56) + '\n');

                tunnelInstance.on('close', () => {
                    console.log('[tunnel] ⚠️  Tunnel closed — reconnecting in 5s...');
                    setTimeout(connect, 5000);
                });
                tunnelInstance.on('error', (err) => {
                    console.error('[tunnel] ❌ Tunnel error:', err.message, '— reconnecting in 5s...');
                    try { tunnelInstance.close(); } catch (_) {}
                    setTimeout(connect, 5000);
                });
            } catch (err) {
                console.error('[tunnel] ❌ Failed:', err.message, '— retrying in 5s...');
                setTimeout(connect, 5000);
            }
        };
        connect();
    }
});
