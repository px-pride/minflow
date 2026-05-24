// db/redis.js — singleton ioredis client for pub/sub + rate limiting.
require('dotenv').config({ quiet: true });
const Redis = require('ioredis');

let client = null;

function getRedis() {
  if (client) return client;
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL not set — cannot create Redis client');
  }
  client = new Redis(process.env.REDIS_URL, {
    connectTimeout: 5_000,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on('error', (err) => {
    console.error('[redis client error]', err.message);
  });
  return client;
}

async function closeRedis() {
  if (client) {
    client.disconnect();
    client = null;
  }
}

module.exports = { getRedis, closeRedis };
