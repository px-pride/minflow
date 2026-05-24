#!/usr/bin/env node
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const Redis = require('ioredis');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  if (!redisUrl) throw new Error('REDIS_URL not set');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 10_000,
  });
  const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 15_000 });

  let pgOk = false;
  let redisOk = false;

  try {
    const r = await pool.query('SELECT 1 AS ok, version() AS version');
    pgOk = r.rows[0].ok === 1;
    console.log('postgres:', pgOk ? 'OK' : 'FAIL', '—', r.rows[0].version.split(',')[0]);
  } catch (e) {
    console.log('postgres: FAIL —', e.message);
  } finally {
    await pool.end().catch(() => {});
  }

  try {
    await redis.connect();
    const pong = await redis.ping();
    redisOk = pong === 'PONG';
    console.log('redis:', redisOk ? 'OK' : 'FAIL', '— PING returned', pong);
  } catch (e) {
    console.log('redis: FAIL —', e.message);
  } finally {
    redis.disconnect();
  }

  process.exit(pgOk && redisOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
