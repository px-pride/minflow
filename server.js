#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { homedir } = require('os');

const fastifyFactory = require('fastify');
const fastifyWebSocket = require('@fastify/websocket');
const fastifyStatic = require('@fastify/static');
const WorkspaceService = require('./workspace-service');

async function startServer({ dataDir, port, logger = true } = {}) {
  dataDir = dataDir || process.env.MINFLOW_DATA_DIR || path.join(homedir(), '.config', 'minflow');
  port = port || parseInt(process.env.MINFLOW_PORT || '3777', 10);

  const fastify = fastifyFactory({ logger });

  // Track connected WebSocket clients
  const wsClients = new Set();

  const service = new WorkspaceService(dataDir, () => {
    for (const ws of wsClients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'workspace-changed' }));
      }
    }
  });
  service.watchForExternalChanges();

  // --- Plugins ---

  await fastify.register(fastifyWebSocket);
  await fastify.register(fastifyStatic, {
    root: __dirname,
    prefix: '/',
  });

  // --- WebSocket endpoint ---

  await fastify.register(async function (app) {
    app.get('/ws', { websocket: true }, (socket) => {
      wsClients.add(socket);
      socket.on('close', () => wsClients.delete(socket));
    });
  });

  // --- Helper: wrap service calls with error handling ---

  function handler(fn) {
    return async (req, reply) => {
      try {
        const result = await fn(req);
        return result;
      } catch (err) {
        reply.code(err.message.includes('not found') ? 404 : 400);
        return { error: err.message };
      }
    };
  }

  // --- REST API routes ---

  // Workspace
  fastify.get('/api/workspace', handler(() => service.getWorkspace()));
  fastify.put('/api/workspace', handler((req) => service.updateWorkspace(req.body)));
  fastify.put('/api/workspace/settings', handler((req) => service.updateSettings(req.body)));
  fastify.put('/api/workspace/notes', handler((req) => service.updateNotes(req.body.notes)));

  // Decks
  fastify.get('/api/decks', handler(() => service.getDecks()));
  fastify.get('/api/decks/:id', handler((req) => service.getDeck(req.params.id)));
  fastify.post('/api/decks', handler((req) => service.createDeck(req.body)));
  fastify.put('/api/decks/:id', handler((req) => service.updateDeck(req.params.id, req.body)));
  fastify.delete('/api/decks/:id', handler((req) => service.deleteDeck(req.params.id)));
  fastify.put('/api/decks/:id/position', handler((req) => service.moveDeck(req.params.id, req.body.x, req.body.y)));
  fastify.put('/api/decks/:id/size', handler((req) => service.resizeDeck(req.params.id, req.body.width)));
  fastify.put('/api/decks/:id/priority', handler((req) => service.setPriority(req.params.id, req.body.priority)));

  // Cards
  fastify.get('/api/decks/:id/cards', handler((req) => service.getCards(req.params.id)));
  fastify.post('/api/decks/:id/cards', handler((req) => service.createCard(req.params.id, req.body)));
  fastify.put('/api/decks/:deckId/cards/:cardId', handler((req) => service.updateCard(req.params.deckId, req.params.cardId, req.body)));
  fastify.delete('/api/decks/:deckId/cards/:cardId', handler((req) => service.deleteCard(req.params.deckId, req.params.cardId)));
  fastify.put('/api/decks/:deckId/cards/:cardId/reorder', handler((req) => service.reorderCards(req.params.deckId, req.params.cardId, req.body.newIndex)));

  // History
  fastify.get('/api/history', handler(() => service.getHistory()));
  fastify.delete('/api/history', handler(() => service.clearHistory()));

  // Export / Import
  fastify.get('/api/export', handler(() => service.exportWorkspace()));
  fastify.post('/api/import', handler((req) => service.importWorkspace(req.body)));

  // Recurrent deck operations
  fastify.post('/api/decks/:id/cycle', handler((req) => service.startNewCycle(req.params.id)));
  fastify.post('/api/decks/:id/reset-cycle', handler((req) => service.resetCycle(req.params.id)));

  // Layout
  fastify.post('/api/layout', handler((req) => service.layoutDecks(req.body || {})));

  // Undo / Redo
  fastify.post('/api/undo', handler(() => service.undo()));
  fastify.post('/api/redo', handler(() => service.redo()));
  fastify.get('/api/can-undo', handler(() => service.canUndo()));
  fastify.get('/api/can-redo', handler(() => service.canRedo()));

  // --- Start ---

  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`MinFlow server listening on http://0.0.0.0:${port}`);
  return { fastify, service, port };
}

module.exports = { startServer };

// CLI entry point — run standalone with `node server.js`
if (require.main === module) {
  // Load .env file for standalone mode
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
