'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3780;
const BASE = `http://localhost:${PORT}`;
let server;
let tmpDir;

// --- HTTP helpers ---

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port: PORT,
      path: urlPath, method,
      headers: bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {},
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b);
const put = (p, b) => request('PUT', p, b);
const del = (p) => request('DELETE', p);

// --- Test harness ---

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

// --- Setup / teardown ---

function startServer() {
  return new Promise((resolve) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minflow-test-'));
    server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, MINFLOW_PORT: String(PORT), MINFLOW_DATA_DIR: tmpDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const onData = (d) => {
      if (d.toString().includes('listening')) {
        setTimeout(resolve, 100);
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
  });
}

function stopServer() {
  server.kill();
  // Clean up temp dir
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
}

// --- Tests ---

async function main() {
  await startServer();
  console.log('\n=== Server-Client Tests ===\n');

  // --- Workspace ---
  await runTest('GET /api/workspace returns workspace', async () => {
    const r = await get('/api/workspace');
    assertEqual(r.status, 200);
    assert(r.body.workspace, 'has workspace object');
    assert(Array.isArray(r.body.decks), 'has decks array');
    assertEqual(r.body.decks.length, 0, 'starts empty');
  });

  // --- Deck CRUD ---
  let deckId;
  await runTest('POST /api/decks creates a deck', async () => {
    const r = await post('/api/decks', { title: 'Test Deck', shape: 'circle', color: '#ff0000' });
    assertEqual(r.status, 200);
    assertEqual(r.body.title, 'Test Deck');
    assertEqual(r.body.shape, 'circle');
    assert(r.body.id, 'deck has id');
    deckId = r.body.id;
  });

  await runTest('GET /api/decks lists decks', async () => {
    const r = await get('/api/decks');
    assertEqual(r.body.length, 1);
    assertEqual(r.body[0].title, 'Test Deck');
  });

  await runTest('GET /api/decks/:id returns single deck', async () => {
    const r = await get(`/api/decks/${deckId}`);
    assertEqual(r.status, 200);
    assertEqual(r.body.title, 'Test Deck');
  });

  await runTest('PUT /api/decks/:id updates deck', async () => {
    const r = await put(`/api/decks/${deckId}`, { title: 'Updated Deck', color: '#00ff00' });
    assertEqual(r.status, 200);
    assertEqual(r.body.title, 'Updated Deck');
    assertEqual(r.body.color, '#00ff00');
  });

  await runTest('PUT /api/decks/:id/position moves deck', async () => {
    const r = await put(`/api/decks/${deckId}/position`, { x: 100, y: 200 });
    assertEqual(r.status, 200);
    assertEqual(r.body.position.x, 100);
    assertEqual(r.body.position.y, 200);
  });

  await runTest('PUT /api/decks/:id/priority sets priority', async () => {
    const r = await put(`/api/decks/${deckId}/priority`, { priority: 200 });
    assertEqual(r.status, 200);
    assertEqual(r.body.priority, 200);
  });

  // --- Card CRUD ---
  let cardId;
  await runTest('POST /api/decks/:id/cards creates a card', async () => {
    const r = await post(`/api/decks/${deckId}/cards`, { text: 'Test Card', position: 'bottom' });
    assertEqual(r.status, 200);
    assertEqual(r.body.text, 'Test Card');
    assert(r.body.id, 'card has id');
    cardId = r.body.id;
  });

  await runTest('GET /api/decks/:id/cards lists cards', async () => {
    const r = await get(`/api/decks/${deckId}/cards`);
    assertEqual(r.body.length, 1);
    assertEqual(r.body[0].text, 'Test Card');
  });

  await runTest('PUT /api/decks/:deckId/cards/:cardId updates card', async () => {
    const r = await put(`/api/decks/${deckId}/cards/${cardId}`, { text: 'Updated Card' });
    assertEqual(r.status, 200);
    assertEqual(r.body.text, 'Updated Card');
  });

  await runTest('PUT /api/decks/:deckId/cards/:cardId completes card', async () => {
    const r = await put(`/api/decks/${deckId}/cards/${cardId}`, { completed: true });
    assertEqual(r.status, 200);
    assertEqual(r.body.completed, true);
  });

  // Add second card for reorder test
  let card2Id;
  await runTest('reorder cards', async () => {
    const r = await post(`/api/decks/${deckId}/cards`, { text: 'Card 2', position: 'bottom' });
    card2Id = r.body.id;
    const r2 = await put(`/api/decks/${deckId}/cards/${card2Id}/reorder`, { newIndex: 0 });
    assertEqual(r2.status, 200);
    assertEqual(r2.body[0].id, card2Id);
  });

  await runTest('DELETE /api/decks/:deckId/cards/:cardId deletes card', async () => {
    const r = await del(`/api/decks/${deckId}/cards/${cardId}`);
    assertEqual(r.status, 200);
    assert(r.body.success, 'delete returns success');
  });

  // --- Undo / Redo ---
  await runTest('undo reverts last change', async () => {
    const r = await post('/api/undo');
    assertEqual(r.status, 200);
    // Card should be back
    const cards = await get(`/api/decks/${deckId}/cards`);
    assert(cards.body.find(c => c.id === cardId), 'card restored after undo');
  });

  await runTest('redo re-applies change', async () => {
    const r = await post('/api/redo');
    assertEqual(r.status, 200);
    const cards = await get(`/api/decks/${deckId}/cards`);
    assert(!cards.body.find(c => c.id === cardId), 'card gone after redo');
  });

  await runTest('GET /api/can-undo returns boolean', async () => {
    const r = await get('/api/can-undo');
    assertEqual(r.status, 200);
    assertEqual(typeof r.body, 'boolean');
  });

  // --- History ---
  await runTest('GET /api/history returns history array', async () => {
    const r = await get('/api/history');
    assertEqual(r.status, 200);
    assert(Array.isArray(r.body), 'is array');
    assert(r.body.length > 0, 'has entries');
  });

  await runTest('DELETE /api/history clears history', async () => {
    const r = await del('/api/history');
    assertEqual(r.status, 200);
    assert(r.body.success, 'returns success');
  });

  // --- Export / Import ---
  await runTest('GET /api/export returns full workspace', async () => {
    const r = await get('/api/export');
    assertEqual(r.status, 200);
    assert(r.body.workspace, 'has workspace');
    assert(Array.isArray(r.body.decks), 'has decks');
  });

  await runTest('POST /api/import replaces workspace', async () => {
    const exported = (await get('/api/export')).body;
    exported.decks = [];
    const r = await post('/api/import', exported);
    assertEqual(r.status, 200);
    const decks = await get('/api/decks');
    assertEqual(decks.body.length, 0, 'decks cleared after import');
  });

  // --- Recurrent cycle ---
  await runTest('POST /api/decks/:id/cycle starts new cycle', async () => {
    // Re-create a recurrent deck with cards
    const d = await post('/api/decks', { title: 'Recurrent', recurrent: true });
    const rid = d.body.id;
    await post(`/api/decks/${rid}/cards`, { text: 'Daily task', position: 'bottom' });
    const r = await post(`/api/decks/${rid}/cycle`);
    assertEqual(r.status, 200);
    assert(r.body.newCards, 'has newCards count');
  });

  // --- Layout ---
  await runTest('POST /api/layout arranges decks', async () => {
    const r = await post('/api/layout', {});
    assertEqual(r.status, 200);
    assert(r.body.decks, 'returns workspace with decks');
  });

  // --- Error handling ---
  await runTest('GET /api/decks/:id returns 404 for missing deck', async () => {
    const r = await get('/api/decks/nonexistent');
    assertEqual(r.status, 404);
    assert(r.body.error, 'has error message');
  });

  await runTest('POST /api/decks/:id/cards returns 400 for missing position', async () => {
    const decks = (await get('/api/decks')).body;
    const r = await post(`/api/decks/${decks[0].id}/cards`, { text: 'No position' });
    assertEqual(r.status, 400);
    assert(r.body.error, 'has error message');
  });

  // --- Static file serving ---
  await runTest('GET / serves index.html', async () => {
    const r = await get('/');
    assertEqual(r.status, 200);
    assert(r.body.includes('MinFlow'), 'contains MinFlow text');
  });

  await runTest('GET /js/api-client.js serves JS file', async () => {
    const r = await get('/js/api-client.js');
    assertEqual(r.status, 200);
    assert(r.body.includes('MinflowHttpClient'), 'contains class name');
  });

  // --- WebSocket push ---
  await runTest('WebSocket receives push on mutation', async () => {
    const received = await new Promise((resolve) => {
      const msgs = [];
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      ws.on('open', async () => {
        await post('/api/decks', { title: 'WS Test', shape: 'rectangle', color: '#0000ff' });
        setTimeout(() => { ws.close(); resolve(msgs); }, 500);
      });
      ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    });
    assert(received.length >= 1, `expected >= 1 WS messages, got ${received.length}`);
    assertEqual(received[0].type, 'workspace-changed');
  });

  // --- Summary ---
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  stopServer();
  process.exit(failed);
}

main().catch((e) => {
  console.error('Test runner error:', e);
  stopServer();
  process.exit(1);
});
