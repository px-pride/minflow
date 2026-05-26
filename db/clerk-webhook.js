// db/clerk-webhook.js — handler for Clerk → our backend webhooks.
//
// On user.created we INSERT a row in our users table (idempotent via
// ON CONFLICT). On user.deleted we soft-delete (set deleted_at). The
// Svix signature is verified against CLERK_WEBHOOK_SECRET on every call
// — anything else 400s.
const { Webhook } = require('svix');
const { getPool } = require('./pool');

function getEventFromRequest(rawBody, headers) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new Error('CLERK_WEBHOOK_SECRET not set');
  const wh = new Webhook(secret);
  return wh.verify(rawBody, {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature'],
  });
}

async function handleEvent(event) {
  if (event.type === 'user.created') {
    const clerkId = event.data.id;
    const email = event.data.email_addresses?.[0]?.email_address;
    if (!email) {
      return { ok: false, reason: 'no primary email on user' };
    }
    await getPool().query(
      `INSERT INTO users (clerk_id, email)
       VALUES ($1, $2)
       ON CONFLICT (clerk_id) DO NOTHING`,
      [clerkId, email]
    );
    return { ok: true, action: 'user_created', clerk_id: clerkId };
  }
  if (event.type === 'user.deleted') {
    const clerkId = event.data.id;
    await getPool().query(
      `UPDATE users SET deleted_at = now() WHERE clerk_id = $1`,
      [clerkId]
    );
    return { ok: true, action: 'user_soft_deleted', clerk_id: clerkId };
  }
  return { ok: true, action: 'ignored', type: event.type };
}

async function getUserByClerkId(clerkId) {
  const r = await getPool().query(
    `SELECT id, clerk_id, email, plan, created_at, deleted_at
       FROM users
      WHERE clerk_id = $1`,
    [clerkId]
  );
  return r.rows[0] || null;
}

// JIT-provision a users row if the Clerk webhook hasn't reached us yet.
// Necessary in dev where Clerk can't reach localhost — without this every
// /sync/* call would fail with "user not found". In prod the webhook
// usually arrives <1s after signup, so this is just a safety net.
async function getOrCreateUserByClerkId(clerkId, email) {
  const existing = await getUserByClerkId(clerkId);
  if (existing) return existing;
  const r = await getPool().query(
    `INSERT INTO users (clerk_id, email)
     VALUES ($1, $2)
     ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, clerk_id, email, plan, created_at, deleted_at`,
    [clerkId, email || `${clerkId}@unknown.local`]
  );
  return r.rows[0];
}

module.exports = {
  getEventFromRequest,
  handleEvent,
  getUserByClerkId,
  getOrCreateUserByClerkId,
};
