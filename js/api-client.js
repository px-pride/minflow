// MinflowHttpClient — drop-in replacement for window.minflowAPI
// Uses HTTP REST + WebSocket instead of Electron IPC

class MinflowHttpClient {
  constructor(baseUrl) {
    this._base = baseUrl || window.location.origin;
    this._ws = null;
    this._wsChangeCallback = null;
    this._connectWebSocket();
  }

  _connectWebSocket() {
    const wsUrl = this._base.replace(/^http/, 'ws') + '/ws';
    this._ws = new WebSocket(wsUrl);
    this._ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'workspace-changed' && this._wsChangeCallback) {
        this._wsChangeCallback();
      }
    };
    this._ws.onclose = () => {
      // Reconnect after 2 seconds
      setTimeout(() => this._connectWebSocket(), 2000);
    };
  }

  async _get(path) {
    const res = await fetch(this._base + path);
    return res.json();
  }

  async _post(path, body) {
    const res = await fetch(this._base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async _put(path, body) {
    const res = await fetch(this._base + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async _delete(path) {
    const res = await fetch(this._base + path, { method: 'DELETE' });
    return res.json();
  }

  // --- Workspace ---
  getWorkspace() { return this._get('/api/workspace'); }
  updateWorkspace(data) { return this._put('/api/workspace', data); }
  updateSettings(settings) { return this._put('/api/workspace/settings', settings); }
  updateNotes(notes) { return this._put('/api/workspace/notes', { notes }); }

  // --- Decks ---
  getDecks() { return this._get('/api/decks'); }
  getDeck(deckId) { return this._get(`/api/decks/${deckId}`); }
  createDeck(data) { return this._post('/api/decks', data); }
  updateDeck(deckId, updates) { return this._put(`/api/decks/${deckId}`, updates); }
  deleteDeck(deckId) { return this._delete(`/api/decks/${deckId}`); }
  moveDeck(deckId, x, y) { return this._put(`/api/decks/${deckId}/position`, { x, y }); }
  resizeDeck(deckId, width, height) { return this._put(`/api/decks/${deckId}/size`, { width, height }); }
  setPriority(deckId, priority) { return this._put(`/api/decks/${deckId}/priority`, { priority }); }

  // --- Cards ---
  getCards(deckId) { return this._get(`/api/decks/${deckId}/cards`); }
  createCard(deckId, data) { return this._post(`/api/decks/${deckId}/cards`, data); }
  updateCard(deckId, cardId, updates) { return this._put(`/api/decks/${deckId}/cards/${cardId}`, updates); }
  deleteCard(deckId, cardId) { return this._delete(`/api/decks/${deckId}/cards/${cardId}`); }
  reorderCards(deckId, cardId, newIndex) { return this._put(`/api/decks/${deckId}/cards/${cardId}/reorder`, { newIndex }); }

  // --- History ---
  getHistory() { return this._get('/api/history'); }
  clearHistory() { return this._delete('/api/history'); }

  // --- Export / Import ---
  exportWorkspace() { return this._get('/api/export'); }
  importWorkspace(data) { return this._post('/api/import', data); }

  // --- Recurrent deck operations ---
  startNewCycle(deckId) { return this._post(`/api/decks/${deckId}/cycle`); }
  resetCycle(deckId) { return this._post(`/api/decks/${deckId}/reset-cycle`); }

  // --- Undo / Redo ---
  undo() { return this._post('/api/undo'); }
  redo() { return this._post('/api/redo'); }
  canUndo() { return this._get('/api/can-undo'); }
  canRedo() { return this._get('/api/can-redo'); }

  // --- Notifications (WebSocket) ---
  onWorkspaceChanged(callback) { this._wsChangeCallback = callback; }
  removeWorkspaceChangedListener() { this._wsChangeCallback = null; }

  // Migration — no-op for HTTP client
  onMigrateRequest() {}
}
