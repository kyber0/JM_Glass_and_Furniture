const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    const [tables] = await c.query(
        `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? ORDER BY TABLE_TYPE, TABLE_NAME`,
        [process.env.DB_NAME]
    );
    const output = [
        'BASE TABLES:',
        ...tables.filter(t => t.TABLE_TYPE === 'BASE TABLE').map(t => ' - ' + t.TABLE_NAME),
        '',
        'VIEWS:',
        ...tables.filter(t => t.TABLE_TYPE === 'VIEW').map(t => ' - ' + t.TABLE_NAME),
    ].join('\n');
    fs.writeFileSync(path.join(__dirname, '../tables_list.txt'), output);
    console.log('Written to tables_list.txt');
    await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
