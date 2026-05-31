/**
 * services/api.js — JM Glass & Furniture
 * ─────────────────────────────────────────────────────────────────
 * BASE_URL auto-detects the Expo dev-server host so no manual IP
 * editing is needed when running `npx expo start --lan`.
 *
 * If the auto-detect fails (production APK, etc.) set FALLBACK_IP
 * to your machine's local IPv4 address:
 *   Windows → open CMD → ipconfig → "IPv4 Address"
 * ─────────────────────────────────────────────────────────────────
 */

import Constants from 'expo-constants';

// ─────────────────────────────────────────────────────────────────
// BACKEND CONNECTION CONFIG  — update when your network changes
// ─────────────────────────────────────────────────────────────────
//
// MODE A — "--tunnel" (Expo tunnel + ngrok):
//   Set USE_TUNNEL = true and paste your ngrok URL from `npm start` output.
//   The ngrok URL is shown as "URL: https://xxxx.ngrok-free.dev" each session.
//
// MODE B — LAN / same WiFi (no tunnel):
//   Set USE_TUNNEL = false  and make sure FALLBACK_IP matches your
//   machine's IPv4 (run `ipconfig` in CMD → "IPv4 Address").
// ─────────────────────────────────────────────────────────────────

const USE_TUNNEL = true;   // ← true = use ngrok URL;  false = use LAN IP

/** Static ngrok domain — never changes between sessions */
const TUNNEL_URL = 'https://feline-flashing-paper.ngrok-free.dev';


/** Your machine's LAN IPv4 (from ipconfig) — used when USE_TUNNEL = false */
const FALLBACK_IP = '192.168.1.70';
const BACKEND_PORT = 3000;

const getBaseUrl = () => {
    // Tunnel mode: phone reaches backend via ngrok over the internet
    if (USE_TUNNEL && TUNNEL_URL) return TUNNEL_URL;

    // LAN mode: try to auto-detect the dev-server host (LAN IP only)
    try {
        const host =
            Constants.expoConfig?.hostUri ||
            Constants.manifest?.debuggerHost ||
            null;
        if (host) {
            const ip = host.split(':')[0];
            // Only accept real IPv4 — skip tunnel domains like xyz.exp.direct
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                return `http://${ip}:${BACKEND_PORT}`;
            }
        }
    } catch (_) { }

    return `http://${FALLBACK_IP}:${BACKEND_PORT}`;
};

export const BASE_URL = getBaseUrl();

// ─── HTTP core ───────────────────────────────────────────────────────────────
let _token = null;
export const setAuthToken = (t) => { _token = t; };
export const clearAuthToken = () => { _token = null; };

const req = async (method, path, body = null, isForm = false) => {
    const headers = {
        // Bypass ngrok's browser-warning interstitial so JSON is always returned
        'ngrok-skip-browser-warning': 'true',
        'Accept': 'application/json',
    };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    if (!isForm) headers['Content-Type'] = 'application/json';

    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            ...(body !== null && { body: isForm ? body : JSON.stringify(body) }),
        });
        // Guard: try JSON first, fall back to text so the app never crashes
        // when a tunnel (ngrok / localtunnel) returns an HTML interstitial
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                return await res.json();
            } catch (parseErr) {
                // Empty body during server restart / transient error
                console.warn(`[API] ${method} ${path} — JSON parse failed (empty body?):`, parseErr.message);
                return { success: false, message: 'Server is restarting. Please try again in a moment.' };
            }
        }
        // Non-JSON body (e.g. tunnel HTML page, plain-text error)
        const text = await res.text();
        if (!text.trim()) {
            console.warn(`[API] ${method} ${path} — empty response (HTTP ${res.status})`);
            return { success: false, message: 'Server returned an empty response. It may be restarting.' };
        }
        console.warn(`[API] ${method} ${path} returned non-JSON (${res.status}):`, text.slice(0, 200));
        return { success: false, message: `Server returned an unexpected response (HTTP ${res.status}). Check tunnel/server.` };
    } catch (e) {
        console.error(`[API] ${method} ${path}:`, e.message);
        return { success: false, message: 'Network error — check your connection.' };
    }
};

const api = {
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    put: (p, b) => req('PUT', p, b),
    delete: (p) => req('DELETE', p),
    postForm: (p, fd) => req('POST', p, fd, true),
    putForm: (p, fd) => req('PUT', p, fd, true),
};

export default api;

// ─── Auth  /api/auth ─────────────────────────────────────────────────────────
export const authAPI = {
    login: (email, password) => api.post('/api/auth/login', { email, password }),
    loginAsGuest: () => api.post('/api/auth/guest', {}),
    register: (data) => api.post('/api/auth/register', data),
    /** payload is FormData when isMultipart=true, plain object otherwise */
    updateProfile: (payload, isMultipart) =>
        isMultipart
            ? api.putForm('/api/auth/profile', payload)
            : api.put('/api/auth/profile', payload),
    changePassword: (data) => api.put('/api/auth/change-password', data),
    logout: () => Promise.resolve({ success: true }),
};

// ─── Public (no auth)  /api/public ──────────────────────────────────────────
export const publicAPI = {
    getMaintenanceStatus: () => api.get('/api/public/maintenance'),
    getResetTimestamp: () => api.get('/api/public/reset-check'),
};

// ─── Products  /api/products ─────────────────────────────────────────────────
export const productsAPI = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return api.get(`/api/products${qs ? '?' + qs : ''}`);
    },
    getProduct: (id, coords = {}) => {
        const qs = [];
        if (coords.lat != null) qs.push(`lat=${coords.lat}`);
        if (coords.lng != null) qs.push(`lng=${coords.lng}`);
        // FIX D1: forward listing_id so backend prefers the correct shop listing
        if (coords.listing_id != null) qs.push(`listing_id=${coords.listing_id}`);
        return api.get(`/api/products/${id}${qs.length ? '?' + qs.join('&') : ''}`);
    },
    getThemes: () => api.get('/api/products/themes'),
};

// ─── Shop (seller)  /api/shop ────────────────────────────────────────────────
export const shopAPI = {
    // Shop entity
    getMyShop: (userId) => api.get(`/api/shop/by-owner/${userId}`),
    getShopByOwner: (userId) => api.get(`/api/shop/by-owner/${userId}`),
    getPublicShop: (shopId) => api.get(`/api/shop/public/${shopId}`),
    getPublicShopProducts: (shopId) => api.get(`/api/shop/public/${shopId}/products`),
    createShop: (fd) => api.postForm('/api/shop/create', fd),
    updateShopSettings: (fd) => api.putForm('/api/shop/update', fd),
    deleteShop: (userId) => api.delete(`/api/shop/delete?user_id=${userId}`),

    // Products
    getProducts: (userId) => api.get(`/api/shop/products${userId ? '?user_id=' + userId : ''}`),
    addProduct: (fd) => api.postForm('/api/shop/products', fd),
    updateProduct: (productId, fd) => api.putForm(`/api/shop/products/${productId}`, fd),
    deleteProduct: (productId, userId) => req('DELETE', `/api/shop/products/${productId}?user_id=${userId}`),

    // Orders
    getOrders: (userId) => api.get(`/api/shop/orders${userId ? '?user_id=' + userId : ''}`),
    updateOrderStatus: (orderId, newStatus) => api.put(`/api/shop/orders/${orderId}/status`, { status: newStatus }),

    // Stats / earnings
    getShopStats: (userId) => api.get(`/api/shop/dashboard-stats${userId ? '?user_id=' + userId : ''}`),
    getStats: (userId) => api.get(`/api/shop/stats${userId ? '?user_id=' + userId : ''}`),

    // Payout
    requestPayout: (data) => api.post('/api/shop/request-payout', data),
};

// ─── Orders  /api/orders ─────────────────────────────────────────────────────
export const ordersAPI = {
    placeOrder:           (data)                     => api.post('/api/orders', data),
    getUserOrders:        (userId)                   => api.get(`/api/orders/user/${userId}`),
    cancelOrder:          (orderId)                  => api.put(`/api/orders/${orderId}/cancel`),
    updateLocation:       (orderId, lat, lng)        => api.put(`/api/orders/${orderId}/location`, { lat, lng }),
    getLocation:          (orderId)                  => api.get(`/api/orders/${orderId}/location`),
    /** Preview EDD before placing order — no side effects */
    getEDDPreview:        (shopId, hasInstallation)  => api.get(`/api/orders/edd-preview?shop_id=${shopId}&has_installation=${hasInstallation ? 1 : 0}`),
    // ── Delivery man endpoints ─────────────────────────────────────────────
    /** Delivery man: get assigned active orders */
    getForDelivery:       (deliveryManId)            => api.get(`/api/orders/delivery-man/${deliveryManId}`),
    /** Seller: assign a delivery man to an order */
    assignDelivery:       (orderId, deliveryManId)   => api.put(`/api/orders/${orderId}/assign-delivery`, { delivery_man_id: deliveryManId }),
    /** Delivery man: update order status (shipped / delivered) */
    updateDeliveryStatus: (orderId, dmId, status)    => api.put(`/api/orders/${orderId}/delivery-status`, { delivery_man_id: dmId, status }),
};

// ─── Cart  /api/cart ─────────────────────────────────────────────────────────
export const cartAPI = {
    getCart: (userId) => api.get(`/api/cart/${userId}`),
    addToCart: (data) => api.post('/api/cart/add', data),
    updateCartItem: (itemId, quantity, userId) => api.put(`/api/cart/${itemId}`, { quantity, user_id: userId }),
    removeCartItem: (itemId, userId) => req('DELETE', `/api/cart/${itemId}?user_id=${userId}`),
    clearCart: (userId) => api.delete(`/api/cart/user/${userId}`),
};

// ─── Reviews  /api/reviews ───────────────────────────────────────────────────
export const reviewsAPI = {
    getProductReviews: (productId) => api.get(`/api/reviews/product/${productId}`),
    addReview: (fd) => api.postForm('/api/reviews', fd),
    reply: (id, data) => api.post(`/api/reviews/${id}/reply`, data),
};

// ─── Favorites  /api/favorites ───────────────────────────────────────────────
export const favoritesAPI = {
    getFavorites: (userId) => api.get(`/api/favorites/${userId}`),
    addFavorite: (userId, productId) => api.post('/api/favorites', { user_id: userId, product_id: productId }),
    removeFavorite: (userId, productId) => api.delete(`/api/favorites/${userId}/${productId}`),
};

// ─── Notifications  /api/notifications ──────────────────────────────────────
export const notificationsAPI = {
    getUserNotifications: (userId) => api.get(`/api/notifications/${userId}`),
    getUnreadCount: (userId) => api.get(`/api/notifications/user/${userId}/unread-count`),
    markAsRead: (id) => api.put(`/api/notifications/${id}/read`),
    markAllAsRead: (userId) => api.put(`/api/notifications/user/${userId}/read-all`),
};

// ─── Handymen  /api/handymen ─────────────────────────────────────────────────
export const handymenAPI = {
    getByShop: (shopId) => api.get(`/api/handymen/shop/${shopId}`),
    getTasks: (shopId) => api.get(`/api/handymen/tasks/${shopId}`),
    getHandymanOrders: (handymanId) => api.get(`/api/handymen/${handymanId}/orders`),
    assignToOrder: (orderId, handymanId) => api.put(`/api/shop/orders/${orderId}/handyman`, { handyman_id: handymanId }),
    add: (shopId, name, phone, spec) => api.post('/api/handymen', { shop_id: shopId, name, phone, specialty: spec }),
    update: (id, data) => api.put(`/api/handymen/${id}`, data),
    remove: (id) => api.delete(`/api/handymen/${id}`),
};

// ─── Vouchers  /api/vouchers ─────────────────────────────────────────────────
export const vouchersAPI = {
    validate: (code, subtotal) => api.post('/api/vouchers/validate', { code, cart_total: subtotal }),
    getActive: () => api.get('/api/vouchers/active'),
    getMyVouchers: (userId) => api.get(`/api/vouchers/my-vouchers/${userId}`),
    claimVoucher: (userId, code) => api.post('/api/vouchers/claim', { user_id: userId, code }),
};

// ─── Custom Requests  /api/custom-requests ───────────────────────────────────
export const customRequestsAPI = {
    createRequest: (fd) => api.postForm('/api/custom-requests', fd),
    getUserRequests: (userId) => api.get(`/api/custom-requests/user/${userId}`),
    getShopRequests: (shopId) => api.get(`/api/custom-requests/shop/${shopId}`),
    getRequest: (requestId) => api.get(`/api/custom-requests/${requestId}`),
    updateStatus: (requestId, status) => api.put(`/api/custom-requests/${requestId}/status`, { status }),
    /** Seller sends a counter-quote (sets status → negotiating) */
    quote: (requestId, quoteData) => api.put(`/api/custom-requests/${requestId}/quote`, quoteData),
    /** Update status and optionally attach quote fields in one call */
    updateStatusWithQuote: (requestId, data) => api.put(`/api/custom-requests/${requestId}/status`, data),
};

// ─── Addresses  /api/addresses ───────────────────────────────────────────────
export const addressesAPI = {
    getAddresses: (userId) => api.get(`/api/addresses/user/${userId}`),
    addAddress: (data) => api.post('/api/addresses', data),
    updateAddress: (id, data) => api.put(`/api/addresses/${id}`, data),
    deleteAddress: (id) => api.delete(`/api/addresses/${id}`),
    setAsDefault: (id, userId) => api.put(`/api/addresses/${id}/default`, { user_id: userId }),
};

// ─── Payment Methods  /api/payment-methods ───────────────────────────────────
export const paymentMethodsAPI = {
    getPaymentMethods: (userId) => api.get(`/api/payment-methods/user/${userId}`),
    addPaymentMethod: (data) => api.post('/api/payment-methods', data),
    updatePaymentMethod: (id, data) => api.put(`/api/payment-methods/${id}`, data),
    deletePaymentMethod: (id) => api.delete(`/api/payment-methods/${id}`),
    setAsDefault: (id, userId) => api.put(`/api/payment-methods/${id}/default`, { user_id: userId }),
};

// ─── Points  /api/points ─────────────────────────────────────────────────────
export const pointsAPI = {
    getBalance: (userId) => api.get(`/api/points/${userId}`),
    preview: (userId, points, subtotal) => api.post(`/api/points/${userId}/preview`, { points, subtotal }),
};

// ─── Messages  /api/messages ─────────────────────────────────────────────────
export const messagesAPI = {
    // perspective: 'customer' → shows shops the user contacted (personal inbox)
    //              'shop'     → shows customers who contacted the user's shop (shop inbox)
    // Each conversation item includes shop_id for channel-accurate Chat navigation.
    getConversations: (userId, perspective = 'customer') =>
        api.get(`/api/messages/conversations/${userId}?perspective=${perspective}`),

    // shopId filters to a specific channel (personal vs shop inbox isolation).
    // When null/omitted, returns all messages between the pair (backward-compat).
    getMessages: (userId, otherUserId, shopId = null) =>
        api.get(`/api/messages/${userId}/${otherUserId}${shopId != null ? '?shop_id=' + shopId : ''}`),

    // data must include shop_id to stamp the correct channel:
    //   { sender_id, receiver_id, message, shop_id, request_id?, image_url? }
    sendMessage: (data) => api.post('/api/messages', data),
};

// ─── Shipping  /api/shipping ─────────────────────────────────────────────────
export const shippingAPI = {
    /** Get available vehicle tiers for the vehicle picker */
    getVehicles: () => api.get('/api/shipping/vehicles'),

    /**
     * Calculate shipping fee
     * @param {string}  address         - full delivery address text
     * @param {number}  vehicle_id      - id from vehicle_tiers
     * @param {number}  distance_km     - distance in km (0 = zone-based only)
     * @param {boolean} has_fragile     - true if order contains glass/fragile items (legacy)
     * @param {number}  items_total     - subtotal for free-shipping threshold check
     * @param {string}  fragility_level - tier: 'none'|'low'|'medium'|'high'
     */
    calculate: (address, vehicle_id, distance_km, has_fragile, items_total, fragility_level) =>
        api.post('/api/shipping/calculate', { address, vehicle_id, distance_km, has_fragile, items_total, fragility_level }),

    // Legacy alias used in CheckoutScreen — redirects to calculate with defaults
    calculateOptions: (address, items_total) =>
        api.post('/api/shipping/calculate', { address, items_total, distance_km: 0, has_fragile: false, fragility_level: 'none' }),
};

// ─── Fees  /api/fees ─────────────────────────────────────────────────────────
export const feesAPI = {
    /** Returns all fee_config values as a flat key→value map */
    getAll: () => api.get('/api/fees'),
    /** Returns all active vehicle tiers */
    getVehicles: () => api.get('/api/fees/vehicles'),
    /** Returns all active shipping zones */
    getShippingZones: () => api.get('/api/fees/shipping-zones'),
    /** Admin: update a specific fee by key */
    updateFee: (key, value) => api.put(`/api/fees/${key}`, { value }),
    /** Admin: update a vehicle tier */
    updateVehicle: (id, data) => api.put(`/api/fees/vehicles/${id}`, data),
    /** Admin: add a shipping zone */
    addShippingZone: (data) => api.post('/api/fees/shipping-zones', data),
    /** Admin: update a shipping zone */
    updateShippingZone: (id, data) => api.put(`/api/fees/shipping-zones/${id}`, data),
};

// ─── Stock Alerts  /api/stock-alerts ─────────────────────────────────────────
export const stockAlertsAPI = {
    check: (userId, productId) => api.get(`/api/stock-alerts/check?user_id=${userId}&product_id=${productId}`),
    subscribe: (userId, productId) => api.post('/api/stock-alerts', { user_id: userId, product_id: productId }),
    unsubscribe: (userId, productId) => req('DELETE', '/api/stock-alerts', { user_id: userId, product_id: productId }),
};

// ─── Admin  /api/admin ───────────────────────────────────────────────────────
export const adminAPI = {
    // Users
    getUsers: () => api.get('/api/admin/users'),
    updateUserStatus: (id, status) => api.put(`/api/admin/users/${id}/status`, { is_active: status }),

    // Stats
    getDashboardStats: () => api.get('/api/admin/stats'),
    getStats: () => api.get('/api/admin/stats'),             // alias

    // Shops
    getShops: () => api.get('/api/admin/shops'),
    getPendingShops: () => api.get('/api/admin/shops/pending'),
    approveShop: (id) => api.put(`/api/admin/shops/${id}/approve`),
    rejectShop: (id, data) => api.put(`/api/admin/shops/${id}/reject`, data),
    updateShopStatus: (id, data) => api.put(`/api/admin/shops/${id}/status`, data),

    // Products
    getProducts: (s) => api.get(`/api/admin/products${s ? '?status=' + s : ''}`),
    toggleProduct: (id) => api.put(`/api/admin/products/${id}/toggle`),

    // Orders
    getOrders: (s) => api.get(`/api/admin/orders${s ? '?status=' + s : ''}`),
    getOrderDetail: (id) => api.get(`/api/admin/orders/${id}`),

    // Handymen & Delivery Men
    getHandymen: () => api.get('/api/admin/handymen'),
    getDeliveryMen: () => api.get('/api/admin/delivery-men'),

    // Analytics & Profit
    getMonthlyAnalytics: () => api.get('/api/admin/analytics/monthly'),
    getAnalytics: () => api.get('/api/admin/analytics/monthly'),  // alias
    getProfit: () => api.get('/api/admin/profit'),
    getProfitReport: () => api.get('/api/admin/profit'),              // alias
    getGatewayFees: () => api.get('/api/admin/gateway-fees'),

    // Announcements
    getAnnouncement: () => api.get('/api/admin/announcement'),
    setAnnouncement: (data) => api.post('/api/admin/announcement', data),
    deleteAnnouncement: () => api.delete('/api/admin/announcement'),

    // Vouchers
    getVouchers: () => api.get('/api/admin/vouchers'),
    createVoucher: (data) => api.post('/api/admin/vouchers', data),
    addVoucher: (data) => api.post('/api/admin/vouchers', data),    // alias
    toggleVoucher: (id) => api.put(`/api/admin/vouchers/${id}/toggle`),
    deleteVoucher: (id) => api.delete(`/api/admin/vouchers/${id}`),

    // Logs & Reports
    getLogs: (n) => api.get(`/api/admin/logs?limit=${n || 50}`),
    getReports: (s) => api.get(`/api/admin/reports${s ? '?status=' + s : ''}`),
    resolveReport: (id) => api.put(`/api/admin/reports/${id}/resolve`),

    // Disputes
    getDisputes: (s) => api.get(`/api/admin/disputes${s ? '?status=' + s : ''}`),
    resolveDispute: (id, data) => api.put(`/api/admin/disputes/${id}/resolve`, data),

    // CMS – Carousel / Banners
    getCarousel: () => api.get('/api/admin/cms/carousel'),
    getCMSBanners: () => api.get('/api/admin/cms/carousel'),        // alias
    addCarouselBanner: (data) => api.post('/api/admin/cms/carousel', data),
    addCMSBanner: (data) => api.post('/api/admin/cms/carousel', data), // alias
    deleteCarouselBanner: (id) => api.delete(`/api/admin/cms/carousel/${id}`),
    deleteCMSBanner: (id) => api.delete(`/api/admin/cms/carousel/${id}`),// alias

    // CMS – Categories
    getCategories: () => api.get('/api/admin/cms/categories'),
    getCMSCategories: () => api.get('/api/admin/cms/categories'),      // alias
    addCategory: (data) => api.post('/api/admin/cms/categories', data),
    addCMSCategory: (data) => api.post('/api/admin/cms/categories', data),// alias
    deleteCategory: (id) => api.delete(`/api/admin/cms/categories/${id}`),
    deleteCMSCategory: (id) => api.delete(`/api/admin/cms/categories/${id}`),// alias

    // Platform Settings
    getPlatformSettings: () => api.get('/api/admin/platform-settings'),
    updatePlatformSettings: (data) => api.put('/api/admin/platform-settings', { settings: data }),

    // Payouts
    getPayouts: () => api.get('/api/admin/payouts'),
    approvePayout: (id, data) => api.put(`/api/admin/payouts/${id}/approve`, data),

    // Disputes
    getDisputes: () => api.get('/api/admin/disputes'),
    resolveDispute: (id, data) => api.put(`/api/admin/disputes/${id}/resolve`, data),

    // Misc
    broadcast: (data) => api.post('/api/admin/broadcast', data),
    getCustomRequests: () => api.get('/api/admin/custom-requests'),
    getMaintenanceStats: () => api.get('/api/admin/maintenance-stats'),
    resetData: (data) => api.post('/api/admin/reset-data', data),
};

// ─── Payment Verifications  /api/payment-verifications ───────────────────────
export const paymentVerificationsAPI = {
    /**
     * Buyer: upload proof image for a delivered order.
     * formData must include: order_id (string), proof (file), optional notes
     */
    submitProof: (formData) =>
        api.postForm('/api/payment-verifications/submit-proof', formData),

    /** Seller/Admin: mark an order's payment as verified */
    verify: (orderId, verifiedByUserId, installmentId = null) =>
        api.put(`/api/payment-verifications/${orderId}/verify`, {
            verified_by_user_id: verifiedByUserId,
            ...(installmentId ? { installment_id: installmentId } : {}),
        }),

    /** Seller/Admin: reject a payment proof with a reason */
    reject: (orderId, reason, installmentId = null) =>
        api.put(`/api/payment-verifications/${orderId}/reject`, {
            reason,
            ...(installmentId ? { installment_id: installmentId } : {}),
        }),

    /** Seller: confirm cash was physically received (COD orders) */
    confirmCash: (orderId, sellerUserId) =>
        api.put(`/api/payment-verifications/${orderId}/confirm-cash`, {
            seller_user_id: sellerUserId,
        }),

    /** Both: get full payment status + installments for an order */
    getOrderPaymentInfo: (orderId) =>
        api.get(`/api/payment-verifications/order/${orderId}`),

    /** Seller: get all delivered orders pending payment verification for their shop */
    getPendingVerifications: (userId) =>
        api.get(`/api/payment-verifications/pending/${userId}`),
};

// ─── Admin Catalog  /api/admin/catalog ───────────────────────────────────────
export const catalogAPI = {
    /** Admin: list all catalog products */
    getAll: () => api.get('/api/admin/catalog'),

    /** Admin: get full details of a single product (images, specs, colors, sizes) */
    getById: (id) => api.get(`/api/admin/catalog/${id}`),

    /** Admin: create a new catalog product (FormData with images) */
    create: (formData) => api.postForm('/api/admin/catalog', formData),

    /** Admin: edit an existing catalog product */
    update: (id, formData) => api.putForm(`/api/admin/catalog/${id}`, formData),

    /** Admin: soft-delete (hide) a catalog product */
    remove: (id) => api.delete(`/api/admin/catalog/${id}`),

    /** Seller / Anyone: browse catalog (pass shopId to get already_listed flag) */
    browse: (shopId = null, categoryId = null, search = '') => {
        const params = new URLSearchParams();
        if (shopId) params.append('shop_id', shopId);
        if (categoryId) params.append('category_id', categoryId);
        if (search) params.append('search', search);
        return api.get(`/api/catalog/browse?${params.toString()}`);
    },
};

// ─── Shop Listings  /api/listings ────────────────────────────────────────────
export const listingsAPI = {
    /** Seller: avail a product (create listing) */
    avail: (data) => api.post('/api/listings', data),
    // data = { shop_id, product_id, custom_price, stock_quantity, color_stocks? }

    /** Seller: update price / stock / is_active */
    update: (listingId, data) => api.put(`/api/listings/${listingId}`, data),

    /** Seller: delist (soft-delete) */
    delist: (listingId) => api.delete(`/api/listings/${listingId}`),

    /** Seller: get all listings for their shop */
    getByShop: (shopId) => api.get(`/api/listings/shop/${shopId}`),

    /** Buyer / Public: get active listings for a shop */
    getPublic: (shopId, categoryId = null, search = '') => {
        const params = new URLSearchParams();
        if (categoryId) params.append('category_id', categoryId);
        if (search) params.append('search', search);
        return api.get(`/api/listings/public/${shopId}?${params.toString()}`);
    },
};

// ─── Geocoding  /api/geocode ──────────────────────────────────────────────────
export const geocodeAPI = {
    /** Convert GPS coordinates → clean Philippine address string */
    reverse: (lat, lng) => api.get(`/api/geocode/reverse?lat=${lat}&lng=${lng}`),

    /** Convert address text → GPS coordinates */
    forward: (query) => api.get(`/api/geocode/forward?q=${encodeURIComponent(query)}`),

    /**
     * Calculate exact Haversine distance (km) between a shop and customer,
     * and return an estimated delivery fee from fee_config.
     *
     * Mode 1 (full DB):   { shopId, addressId }
     * Mode 2 (shop DB):   { shopId, custLat, custLng }   ← most common from mobile
     * Mode 3 (raw coords): { shopLat, shopLng, custLat, custLng }
     */
    distance: ({ shopId, addressId, shopLat, shopLng, custLat, custLng } = {}) => {
        if (shopId && addressId) {
            return api.get(`/api/geocode/distance?shop_id=${shopId}&address_id=${addressId}`);
        }
        if (shopId && custLat != null && custLng != null) {
            return api.get(`/api/geocode/distance?shop_id=${shopId}&cust_lat=${custLat}&cust_lng=${custLng}`);
        }
        return api.get(`/api/geocode/distance?shop_lat=${shopLat}&shop_lng=${shopLng}&cust_lat=${custLat}&cust_lng=${custLng}`);
    },

    /** Typeahead address suggestions (min 3 chars, Philippines only) */
    autocomplete: (q) => api.get(`/api/geocode/autocomplete?q=${encodeURIComponent(q)}`),
};


// ─── Workers API  /api/workers ────────────────────────────────────────────────

export const workersAPI = {
    /** Seller: create a delivery man account (auto-generates credentials) */
    createDeliveryMan: (shopId, data) =>
        api.post('/api/workers/delivery-man', { shop_id: shopId, ...data }),

    /** Seller: issue a login account to an existing handyman record */
    createHandymanAccount: (handymanId) =>
        api.post(`/api/workers/handyman/${handymanId}/account`, {}),

    /** Seller: list all delivery men + handymen for a shop */
    getByShop: (shopId) => api.get(`/api/workers/shop/${shopId}`),

    /** Seller: update delivery man profile/status */
    updateDeliveryMan: (deliveryManId, data) =>
        api.put(`/api/workers/delivery-man/${deliveryManId}`, data),

    /** Seller: deactivate a worker account */
    deactivate: (userId) => api.delete(`/api/workers/${userId}`),

    /** Handyman: get my assigned tasks */
    getMyTasks: (userId) => api.get(`/api/handymen/my-tasks?userId=${userId}`),

    /** Handyman: update my availability status */
    updateMyStatus: (userId, status) =>
        api.put('/api/handymen/my-status', { userId, status }),

    /** Delivery man: get own profile (delivery_man_id, status) */
    getDeliveryManProfile: (userId) =>
        api.get(`/api/workers/delivery-man/profile?userId=${userId}`),

    /** Worker: mark an order as completed */
    completeOrder: (orderId, userId) =>
        api.put(`/api/workers/order/${orderId}/complete`, { userId }),

    /** Delivery man: get completed order history */
    getDeliveryHistory: (deliveryManId) =>
        api.get(`/api/workers/delivery-man/${deliveryManId}/history`),

    /** Handyman: get completed task history */
    getHandymanHistory: (userId) =>
        api.get(`/api/workers/handyman/${userId}/history`),

    /** Buyer: fetch signed QR token to display to field worker */
    getOrderQRToken: (orderId) =>
        api.get(`/api/workers/order/${orderId}/qr-token`),

    /** Worker: submit scanned QR token to confirm delivery or completion */
    scanQR: (token, workerUserId, action) =>
        api.post('/api/workers/scan-qr', { token, worker_user_id: workerUserId, action }),
};

// ─── Reports  /api/reports ────────────────────────────────────────────────────
export const reportsAPI = {
    submitReport: (data) => api.post('/api/reports', data),
};

// ─── Disputes  /api/disputes ──────────────────────────────────────────────────
export const disputesAPI = {
    fileDispute: (data) => api.post('/api/disputes', data),
    getMyDisputes: (userId) => api.get(`/api/disputes?user_id=${userId}`),
};
