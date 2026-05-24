// db/workspace-pg.js — Postgres-backed workspace adapter.
//
// Phase 1 foundation: load/save a user's workspace as a jsonb blob in the
// workspaces table, plus the per-field LWW timestamps as a parallel jsonb.
// The actual sync engine (Phase 3) builds on top of this — push/pull
// endpoints will call these functions.
const { getPool } = require('./pool');

async function loadWorkspace(userId) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT id, data, field_timestamps, last_synced, updated_at
       FROM workspaces
      WHERE user_id = $1
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function saveWorkspace(userId, data, fieldTimestamps) {
  const pool = getPool();
  const ts = fieldTimestamps || {};
  const existing = await pool.query(
    'SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (existing.rows.length > 0) {
    const r = await pool.query(
      `UPDATE workspaces
          SET data = $1::jsonb,
              field_timestamps = $2::jsonb,
              last_synced = now(),
              updated_at = now()
        WHERE user_id = $3
        RETURNING id, last_synced`,
      [JSON.stringify(data), JSON.stringify(ts), userId]
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO workspaces (user_id, data, field_timestamps)
     VALUES ($1, $2::jsonb, $3::jsonb)
     RETURNING id, last_synced`,
    [userId, JSON.stringify(data), JSON.stringify(ts)]
  );
  return r.rows[0];
}

module.exports = { loadWorkspace, saveWorkspace };
