// db/pool.js — singleton pg Pool with explicit limits.
//
// Per textbook ch-01 "The Day We Learned About Connection Pools": default
// pg-pool config is wrong for production. Explicit max + timeouts prevent
// the most common SaaS outage cause (pool exhaustion).
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set — cannot create Postgres pool');
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  pool.on('error', (err) => {
    console.error('[pg pool error]', err.message);
  });
  return pool;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, closePool };
