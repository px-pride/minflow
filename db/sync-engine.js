// db/sync-engine.js — core LWW merge logic for the Phase 3 sync engine.
//
// Public API:
//   validatePath(path)              -> boolean
//   setAtPath(data, parts, value)   -> mutates data
//   applyDelta(workspace, delta)    -> { accepted, reason?, server_timestamp? }
//
// The workspace passed to applyDelta is the in-memory object form of the
// workspaces row: { data: {...}, field_timestamps: {...} }. The function
// MUTATES the workspace object — caller is expected to persist it after
// processing a batch of deltas.

const FUTURE_SKEW_MS = 60_000;            // reject timestamps > now + this
const MAX_PATH_LEN = 200;
const PATH_REGEX = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

// Keys in the workspace data that are arrays-of-entities (objects keyed
// by their `id` field). When a path segment matches one of these names,
// the engine treats the missing-value-at-that-key as `[]` instead of `{}`.
const ARRAY_CONTAINERS = new Set(['decks', 'cards', 'history']);

function validatePath(path) {
  if (typeof path !== 'string') return false;
  if (path.length === 0 || path.length > MAX_PATH_LEN) return false;
  if (!PATH_REGEX.test(path)) return false;
  for (const seg of path.split('.')) {
    if (FORBIDDEN_SEGMENTS.has(seg)) return false;
  }
  return true;
}

function setAtPath(data, pathParts, value) {
  if (!Array.isArray(pathParts) || pathParts.length === 0) {
    throw new Error('empty path');
  }
  let cursor = data;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const seg = pathParts[i];
    if (Array.isArray(cursor)) {
      let entry = cursor.find((item) => item && item.id === seg);
      if (!entry) {
        entry = { id: seg };
        const nextSeg = pathParts[i + 1];
        if (ARRAY_CONTAINERS.has(nextSeg)) entry[nextSeg] = [];
        cursor.push(entry);
      }
      cursor = entry;
    } else {
      if (cursor[seg] === undefined || cursor[seg] === null) {
        cursor[seg] = ARRAY_CONTAINERS.has(seg) ? [] : {};
      }
      cursor = cursor[seg];
    }
  }
  const lastSeg = pathParts[pathParts.length - 1];
  if (Array.isArray(cursor)) {
    throw new Error('terminal path segment cannot point at an array slot');
  }
  cursor[lastSeg] = value;
}

function applyDelta(workspace, delta, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const { field, value, timestamp } = delta;

  if (!validatePath(field)) {
    return { accepted: false, reason: 'invalid_path' };
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return { accepted: false, reason: 'invalid_timestamp' };
  }
  if (timestamp > now + FUTURE_SKEW_MS) {
    return { accepted: false, reason: 'future_timestamp' };
  }

  workspace.data = workspace.data || {};
  workspace.field_timestamps = workspace.field_timestamps || {};

  const existing = workspace.field_timestamps[field] || 0;
  if (timestamp <= existing) {
    return { accepted: false, reason: 'stale', server_timestamp: existing };
  }

  setAtPath(workspace.data, field.split('.'), value);
  workspace.field_timestamps[field] = timestamp;
  return { accepted: true };
}

function emptyWorkspace() {
  return {
    data: { decks: [], history: [] },
    field_timestamps: {},
  };
}

module.exports = {
  validatePath,
  setAtPath,
  applyDelta,
  emptyWorkspace,
  FUTURE_SKEW_MS,
};
