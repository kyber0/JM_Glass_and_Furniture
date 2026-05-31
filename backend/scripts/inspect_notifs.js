const db = require('../config/db');
(async () => {
  try {
    const [rows] = await db.query(
      'SELECT notification_id, user_id, type, title, message, created_at FROM notifications ORDER BY created_at DESC LIMIT 30'
    );
    console.table(rows);
  } catch(e) {
    console.error(e.message);
  }
  process.exit();
})();
