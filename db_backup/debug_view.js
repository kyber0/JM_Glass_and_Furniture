const db = require('./config/db');

async function checkView() {
    try {
        const [rows] = await db.query('DESCRIBE vw_product_details');
        console.log('Columns in vw_product_details:');
        rows.forEach(r => console.log(r.Field));
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkView();
