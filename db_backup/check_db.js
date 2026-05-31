const db = require('./config/db');

async function checkColumns() {
    try {
        const [reqCols] = await db.query('SHOW COLUMNS FROM custom_requests');
        console.log('custom_requests columns:', reqCols.map(c => c.Field));

        const [userCols] = await db.query('SHOW COLUMNS FROM users');
        console.log('users columns:', userCols.map(c => c.Field));

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkColumns();
