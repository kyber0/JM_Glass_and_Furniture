const db = require('../config/db');

const migrate = async () => {
    try {
        await db.query(`
            ALTER TABLE messages
            ADD COLUMN image_url TEXT DEFAULT NULL
        `);
        console.log('Migration successful: Added image_url to messages table');
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration skipped: image_url already exists');
        } else {
            console.error('Migration failed:', error);
        }
    }
    process.exit();
};

migrate();
