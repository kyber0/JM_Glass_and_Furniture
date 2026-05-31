const verifyToken = require('./verifyToken');

/**
 * RBAC — Role-Based Access Control
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage (in server.js or individual route files):
 *
 *   const { requireRole, requireSelf } = require('./middleware/rbac');
 *
 *   // Only admins:
 *   app.use('/api/admin', requireRole('admin'));
 *
 *   // Sellers or admins:
 *   app.use('/api/shop', requireRole('seller', 'admin'));
 *
 *   // Must be the same user as :userId param:
 *   router.get('/profile/:userId', requireSelf(), handler);
 *
 * All helpers automatically run verifyToken first so the route receives
 * req.user = { id, role } if it proceeds.
 */

// ─── requireRole(...roles) ────────────────────────────────────────────────────
// Checks that the authenticated user's role is one of the listed allowedRoles.
const requireRole = (...allowedRoles) => [
    verifyToken,
    (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success:  false,
                message: `Access denied. Requires role: ${allowedRoles.join(' or ')}.`,
                assigned_role: req.user.role,
            });
        }
        next();
    },
];

// ─── requireSelf(paramName) ───────────────────────────────────────────────────
// Ensures the authenticated user can only access their own resource.
// By default checks req.params.userId; pass a different param name if needed.
// Admins bypass this check.
const requireSelf = (paramName = 'userId') => [
    verifyToken,
    (req, res, next) => {
        if (req.user.role === 'admin') return next(); // admin can access any
        const resourceOwnerId = parseInt(req.params[paramName] || req.body?.[paramName]);
        if (req.user.id !== resourceOwnerId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only access your own resources.',
            });
        }
        next();
    },
];

// ─── requireAny() ─────────────────────────────────────────────────────────────
// Just ensures a valid token exists (any authenticated user; no specific role).
const requireAny = () => [verifyToken];

module.exports = { requireRole, requireSelf, requireAny };
