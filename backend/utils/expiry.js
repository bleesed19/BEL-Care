// backend/utils/expiry.js
const pool = require('../db/pool');

async function checkExpiredHospitals() {
    try {
        const result = await pool.query(`
            UPDATE hospitals 
            SET status = 'SUSPENDED' 
            WHERE status = 'ACTIVE' 
              AND subscription_expiry < NOW()
            RETURNING id, name
        `);
        if (result.rows.length > 0) {
            console.log(`Suspended ${result.rows.length} expired hospitals`);
        }
    } catch (err) {
        console.error('Expiry checker error:', err);
    }
}

module.exports = { checkExpiredHospitals };