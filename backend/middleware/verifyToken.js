const jwt = require('jsonwebtoken');

/**
 * verifyToken — ensures the request carries a valid JWT.
 * Sets req.user = { id, role } on success.
 * Call with verifyToken or verifyToken.optional (allows unauthenticated through).
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role, iat, exp }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
};

/** Optional — sets req.user if token present, otherwise continues as guest */
verifyToken.optional = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (_) { /* ignore invalid token in optional mode */ }
    }
    next();
};

module.exports = verifyToken;
