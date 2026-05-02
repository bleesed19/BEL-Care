const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },  // required for Neon
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,      // increased from default
    keepAlive: true,
});

pool.on('connect', () => console.log('✅ Connected to Neon PostgreSQL'));
pool.on('error', (err) => console.error('❌ DB error:', err.message));

module.exports = pool;