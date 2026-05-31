/**
 * Middleware that intercepts JSON responses and dynamically
 * prepends the server's current base URL to any relative
 * upload paths (e.g., "uploads/xxx.jpg" → "http://<host>/uploads/xxx.jpg").
 *
 * This means the database only stores relative paths,
 * so changing Wi-Fi / IP never breaks images.
 */

function getBaseUrl(req) {
    const protocol = req.protocol || 'http';
    const host = req.get('host'); // e.g. "192.168.100.235:3000"
    return `${protocol}://${host}`;
}

// Regex: matches strings that start with "uploads/" but NOT already a full URL
const UPLOAD_PATH_REGEX = /^uploads\//;

function resolveUrls(data, baseUrl) {
    if (data === null || data === undefined) return data;

    if (typeof data === 'string') {
        // If it's a relative upload path, prepend base URL
        if (UPLOAD_PATH_REGEX.test(data)) {
            return `${baseUrl}/${data}`;
        }
        // Also try to fix JSON strings that contain upload paths
        // (e.g., custom_requests.images is stored as a JSON array string)
        if (data.startsWith('[') || data.startsWith('{')) {
            try {
                const parsed = JSON.parse(data);
                const resolved = resolveUrls(parsed, baseUrl);
                return JSON.stringify(resolved);
            } catch (e) {
                // Not valid JSON, return as-is
            }
        }
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => resolveUrls(item, baseUrl));
    }

    if (data instanceof Date) {
        return data;
    }

    if (typeof data === 'object') {
        const result = {};
        for (const key of Object.keys(data)) {
            result[key] = resolveUrls(data[key], baseUrl);
        }
        return result;
    }

    return data;
}

function urlRewriterMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
        const baseUrl = getBaseUrl(req);
        const rewritten = resolveUrls(body, baseUrl);
        return originalJson(rewritten);
    };

    next();
}

module.exports = urlRewriterMiddleware;
