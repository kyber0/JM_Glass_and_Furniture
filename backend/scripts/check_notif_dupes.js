const db = require('../config/db');
(async () => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, type, title, COUNT(*) as cnt FROM notifications GROUP BY user_id, type, title HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20'
    );
    if (rows.length === 0) {
      console.log('No duplicate notification rows found in DB.');
    } else {
      rows.forEach(r => console.log(`user:${r.user_id} | type:${r.type} | title:"${r.title}" | count:${r.cnt}`));
    }
  } catch(e) {
    console.error(e.message);
  }
  process.exit();
})();
