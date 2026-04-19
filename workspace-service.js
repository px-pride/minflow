// WorkspaceService — Main-process data layer for MinFlow
// Replaces LocalAPI (which used renderer-side localStorage)
// Backed by a JSON file in the user's app data directory

const fs = require('fs');
const path = require('path');
const DeckQueries = require('./shared/deck-queries');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

class WorkspaceService {
  constructor(dataDir, onNotify) {
    this.filePath = path.join(dataDir, 'minflow-workspace.json');
    this.dataDir = dataDir;
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoDepth = 50;
    this._selfWriting = false;
    this._watchDebounce = null;
    this._onNotify = onNotify || (() => {});
    this._backupSlot = 0;
    this._maxBackupSlots = 5;
    this._lastDailyBackup = null;
    this._maxDailyBackups = 7;
  }

  watchForExternalChanges() {
    // Ensure the file exists (creates default if missing) before watching
    this._load();
    fs.watch(this.filePath, (eventType) => {
      if (eventType !== 'change' || this._selfWriting) return;
      // Debounce — fs.watch can fire multiple times per write
      clearTimeout(this._watchDebounce);
      this._watchDebounce = setTimeout(() => this._notify(), 100);
    });
  }

  // --- Internal helpers ---

  _migrate(data) {
    for (const deck of (data.decks || [])) {
      // Migrate from size object to priority scalar
      if (deck.size !== undefined && deck.priority === undefined) {
        deck.priority = deck.size.width || 120;
        delete deck.size;
      }
      if (deck.stalingRate === undefined) deck.stalingRate = 0;
      if (deck.maxStaleness === undefined) deck.maxStaleness = 60;
      if (deck.lastCompletedAt === undefined) deck.lastCompletedAt = null;
    }
    return data;
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return this._migrate(JSON.parse(raw));
    } catch (e) {
      if (e.code === 'ENOENT') {
        return this._createDefault();
      }
      console.error('Corrupt workspace file, trying backups:', e);
      return this._loadFromBackup() || this._createDefault();
    }
  }

  _loadFromBackup() {
    // Try rotating backups (newest slot first)
    for (let i = this._maxBackupSlots - 1; i >= 0; i--) {
      const backupPath = path.join(this.dataDir, `minflow-workspace.backup-${i}.json`);
      try {
        const raw = fs.readFileSync(backupPath, 'utf-8');
        const data = this._migrate(JSON.parse(raw));
        console.log(`Recovered from backup slot ${i}: ${backupPath}`);
        this._save(data);
        return data;
      } catch (_) { /* try next */ }
    }
    // Try daily backups (newest first by filename sort)
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => /^minflow-workspace\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse();
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.dataDir, file), 'utf-8');
          const data = this._migrate(JSON.parse(raw));
          console.log(`Recovered from daily backup: ${file}`);
          this._save(data);
          return data;
        } catch (_) { /* try next */ }
      }
    } catch (_) { /* no daily backups */ }
    return null;
  }

  _save(data) {
    data.metadata.lastSaved = new Date().toISOString();
    this._atomicWrite(JSON.stringify(data, null, 2));
    this._dailySnapshot();
  }

  _saveRaw(jsonString) {
    this._atomicWrite(jsonString);
  }

  _atomicWrite(content) {
    const tmpPath = this.filePath + '.tmp';
    // Rotating backup: save current file before overwriting
    this._rotatingBackup();
    this._selfWriting = true;
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (e) {
      // Clean up temp file on failure
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      throw e;
    } finally {
      this._selfWriting = false;
    }
  }

  _rotatingBackup() {
    try {
      const backupPath = path.join(this.dataDir, `minflow-workspace.backup-${this._backupSlot}.json`);
      fs.copyFileSync(this.filePath, backupPath);
      this._backupSlot = (this._backupSlot + 1) % this._maxBackupSlots;
    } catch (_) { /* file may not exist yet */ }
  }

  _dailySnapshot() {
    const today = new Date().toISOString().slice(0, 10);
    if (this._lastDailyBackup === today) return;
    try {
      const snapshotPath = path.join(this.dataDir, `minflow-workspace.${today}.json`);
      fs.copyFileSync(this.filePath, snapshotPath);
      this._lastDailyBackup = today;
      this._pruneOldSnapshots();
    } catch (e) {
      console.error('Daily snapshot failed:', e);
    }
  }

  _pruneOldSnapshots() {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => /^minflow-workspace\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse();
      for (const file of files.slice(this._maxDailyBackups)) {
        fs.unlinkSync(path.join(this.dataDir, file));
      }
    } catch (_) { /* best effort */ }
  }

  _notify() {
    this._onNotify();
  }

  _mutate(fn) {
    const data = this._load();
    const snapshot = JSON.stringify(data);
    const result = fn(data);
    this._save(data);

    // Push snapshot for undo (after successful save)
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxUndoDepth) this.undoStack.shift();
    this.redoStack = [];

    this._notify();
    return result;
  }

  _createDefault() {
    const now = new Date().toISOString();
    const data = {
      version: '1.0.0',
      workspace: {
        id: generateId(),
        name: 'My Workspace',
        created: now,
        updated: now,
        settings: { autosave: true, autosaveInterval: 30000 },
      },
      decks: [],
      history: [],
      metadata: {
        lastSaved: now,
        selectedDeckId: null,
      },
    };
    this._save(data);
    return data;
  }

  _addHistory(data, action, type = 'general') {
    data.history.push({
      action,
      type,
      timestamp: new Date().toISOString(),
    });
    if (data.history.length > 100) {
      data.history.shift();
    }
  }

  _findDeck(data, deckId) {
    const deck = data.decks.find((d) => d.id === deckId);
    if (!deck) throw new Error(`Deck not found: ${deckId}`);
    return deck;
  }

  // Find a non-overlapping position for a new deck among existing decks
  _findOpenPosition(decks, newPriority, canvasWidth = 1400) {
    const padding = 30;
    const margin = 20;
    const w = newPriority || 120;
    const h = w;

    const overlaps = (x, y) => {
      for (const d of decks) {
        const dp = d.priority || 120;
        if (
          x < d.position.x + dp + padding &&
          x + w + padding > d.position.x &&
          y < d.position.y + dp + padding &&
          y + h + padding > d.position.y
        ) return true;
      }
      return false;
    };

    // Scan grid positions left-to-right, top-to-bottom
    const step = 40;
    for (let y = margin; y < 4000; y += step) {
      for (let x = margin; x < canvasWidth - w - margin; x += step) {
        if (!overlaps(x, y)) return { x, y };
      }
    }
    return { x: margin, y: margin };
  }

  _findCard(deck, cardId) {
    const card = DeckQueries.findCard(deck.cards, cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);
    return card;
  }

  // --- Undo/Redo ---

  undo() {
    if (this.undoStack.length === 0) return null;
    const current = JSON.stringify(this._load());
    this.redoStack.push(current);
    const previous = this.undoStack.pop();
    this._saveRaw(previous);
    this._notify();
    return JSON.parse(previous);
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const current = JSON.stringify(this._load());
    this.undoStack.push(current);
    const next = this.redoStack.pop();
    this._saveRaw(next);
    this._notify();
    return JSON.parse(next);
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  // --- Workspace operations ---

  getWorkspace() {
    return this._load();
  }

  updateWorkspace(workspace) {
    return this._mutate((data) => {
      Object.assign(data.workspace, workspace.workspace || {});
      if (workspace.metadata) {
        Object.assign(data.metadata, workspace.metadata);
      }
      data.workspace.updated = new Date().toISOString();
      return data;
    });
  }

  updateSettings(settings) {
    return this._mutate((data) => {
      Object.assign(data.workspace.settings, settings);
      data.workspace.updated = new Date().toISOString();
      return data;
    });
  }

  updateNotes(notes) {
    return this._mutate((data) => {
      data.metadata.notes = notes;
      return data;
    });
  }

  // --- Deck operations ---

  getDecks() {
    return this._load().decks;
  }

  getDeck(deckId) {
    return this._findDeck(this._load(), deckId);
  }

  createDeck(deckData) {
    return this._mutate((data) => {
      const now = new Date().toISOString();
      const priority = deckData.priority ?? 120;
      const position = deckData.position || this._findOpenPosition(data.decks, priority);
      const deck = {
        id: generateId(),
        title: deckData.title || 'New Deck',
        shape: deckData.shape || 'rectangle',
        color: deckData.color || '#667eea',
        position: position,
        priority: priority,
        stalingRate: deckData.stalingRate || 0,
        maxStaleness: deckData.maxStaleness ?? 60,
        lastCompletedAt: null,
        cards: [],
        created: now,
        updated: now,
        visible: true,
        recurrent: deckData.recurrent || false,
        currentCycle: 0,
        description: deckData.description || '',
        status: deckData.status || '',
        done: deckData.done || '',
        notes: deckData.notes || '',
      };
      data.decks.push(deck);
      this._addHistory(data, `Created deck: ${deck.title}`, 'deck.created');
      return deck;
    });
  }

  updateDeck(deckId, updates) {
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      const allowedFields = ['title', 'shape', 'color', 'recurrent', 'description', 'status', 'done', 'notes', 'priority', 'stalingRate', 'maxStaleness'];
      for (const key of allowedFields) {
        if (updates[key] !== undefined) {
          deck[key] = updates[key];
        }
      }
      deck.updated = new Date().toISOString();
      this._addHistory(data, `Updated deck: ${deck.title}`, 'deck.updated');
      return deck;
    });
  }

  deleteDeck(deckId) {
    return this._mutate((data) => {
      const index = data.decks.findIndex((d) => d.id === deckId);
      if (index === -1) throw new Error(`Deck not found: ${deckId}`);
      const title = data.decks[index].title;
      data.decks.splice(index, 1);
      if (data.metadata.selectedDeckId === deckId) {
        data.metadata.selectedDeckId = null;
      }
      this._addHistory(data, `Deleted deck: ${title}`, 'deck.deleted');
      return { success: true };
    });
  }

  moveDeck(deckId, x, y) {
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      deck.position = { x, y };
      deck.updated = new Date().toISOString();
      return deck;
    });
  }

  setPriority(deckId, priority) {
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      deck.priority = priority;
      // Clear card priority overrides
      for (const card of deck.cards) {
        delete card.priority;
      }
      deck.updated = new Date().toISOString();
      return deck;
    });
  }

  resizeDeck(deckId, width) {
    // Backward compat: delegate to setPriority
    return this.setPriority(deckId, width);
  }

  // --- Card operations ---

  getCards(deckId) {
    const deck = this._findDeck(this._load(), deckId);
    return deck.cards;
  }

  createCard(deckId, cardData) {
    const validPositions = ['top', 'bottom'];
    if (!cardData.position || !validPositions.includes(cardData.position)) {
      throw new Error(`position is required and must be one of: ${validPositions.join(', ')}`);
    }
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      const now = new Date().toISOString();
      const card = {
        id: generateId(),
        text: cardData.text,
        completed: false,
        cycle: deck.currentCycle,
        type: cardData.type || 'task',
        created: now,
        updated: now,
      };
      if (cardData.priority != null) card.priority = cardData.priority;
      if (cardData.position === 'top') {
        deck.cards.unshift(card);
      } else {
        deck.cards.push(card);
      }
      deck.updated = now;
      this._addHistory(data, `Added card "${card.text}" to ${deck.title}`, 'card.created');
      return card;
    });
  }

  updateCard(deckId, cardId, updates) {
    const result = this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      const card = this._findCard(deck, cardId);
      const allowedFields = ['text', 'completed', 'type', 'priority'];
      for (const key of allowedFields) {
        if (updates[key] !== undefined) {
          card[key] = updates[key];
        }
      }
      card.updated = new Date().toISOString();
      deck.updated = card.updated;

      if (updates.completed !== undefined) {
        if (updates.completed) {
          deck.lastCompletedAt = new Date().toISOString();
        }
        const action = updates.completed
          ? `Completed card "${card.text}" in ${deck.title}`
          : `Uncompleted card "${card.text}" in ${deck.title}`;
        this._addHistory(data, action, updates.completed ? 'card.completed' : 'card.uncompleted');
      } else {
        this._addHistory(data, `Updated card "${card.text}" in ${deck.title}`, 'card.updated');
      }
      return card;
    });

    // Auto-cycle: if a recurrent deck has no incomplete cards in the current cycle, start a new one
    if (updates.completed === true) {
      const data = this._load();
      const deck = data.decks.find((d) => d.id === deckId);
      if (deck && deck.recurrent) {
        const hasIncomplete = DeckQueries.hasIncompleteCards(deck.cards, deck.currentCycle);
        if (!hasIncomplete) {
          this.startNewCycle(deckId);
        }
      }
    }

    return result;
  }

  deleteCard(deckId, cardId) {
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      const index = deck.cards.findIndex((c) => c.id === cardId);
      if (index === -1) throw new Error(`Card not found: ${cardId}`);
      const text = deck.cards[index].text;
      deck.cards.splice(index, 1);
      deck.updated = new Date().toISOString();
      this._addHistory(data, `Deleted card "${text}" from ${deck.title}`, 'card.deleted');
      return { success: true };
    });
  }

  reorderCards(deckId, cardId, newIndex) {
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      const currentIndex = deck.cards.findIndex((c) => c.id === cardId);
      if (currentIndex === -1) throw new Error(`Card not found: ${cardId}`);
      const [card] = deck.cards.splice(currentIndex, 1);
      deck.cards.splice(newIndex, 0, card);
      deck.updated = new Date().toISOString();
      return deck.cards;
    });
  }

  // --- History operations ---

  getHistory() {
    return this._load().history;
  }

  clearHistory() {
    return this._mutate((data) => {
      data.history = [];
      this._addHistory(data, 'History cleared', 'history.cleared');
      return { success: true };
    });
  }

  // --- Export / Import ---

  exportWorkspace() {
    return this._load();
  }

  importWorkspace(workspaceData) {
    if (!workspaceData || !Array.isArray(workspaceData.decks)) {
      throw new Error('Invalid workspace data: missing decks array');
    }
    const data = {
      version: workspaceData.version || '1.0.0',
      workspace: workspaceData.workspace || this._createDefault().workspace,
      decks: workspaceData.decks,
      history: workspaceData.history || [],
      metadata: workspaceData.metadata || {
        lastSaved: new Date().toISOString(),
        selectedDeckId: null,
      },
    };
    this._save(data);
    this._notify();
    return data;
  }

  // --- Recurrent deck operations ---

  startNewCycle(deckId) {
    return this._mutate((data) => {
      const deck = this._findDeck(data, deckId);
      const currentCycleCards = DeckQueries.getCurrentCycleCards(deck.cards, deck.currentCycle);
      const newCycle = deck.currentCycle + 1;

      // Remove old cycle cards and create fresh uncompleted copies
      deck.cards = deck.cards.filter((c) => c.cycle !== deck.currentCycle);
      deck.currentCycle = newCycle;

      const now = new Date().toISOString();
      for (const card of currentCycleCards) {
        deck.cards.push({
          id: generateId(),
          text: card.text,
          completed: false,
          cycle: newCycle,
          type: card.type || 'task',
          created: now,
          updated: now,
        });
      }

      deck.updated = now;
      this._addHistory(
        data,
        `Started new cycle ${newCycle} for deck "${deck.title}"`,
        'deck.cycle.started'
      );
      return { deck, newCards: currentCycleCards.length };
    });
  }

  resetCycle(deckId) {
    // resetCycle is now identical to startNewCycle — both do a clean slate
    return this.startNewCycle(deckId);
  }

  // --- Layout ---

  layoutDecks(options = {}) {
    const groupBy = options.groupBy || 'color';
    const sortBy = options.sortBy || 'size';
    const padding = options.padding || 30;
    const margin = options.margin || 20;

    return this._mutate((data) => {
      const decks = data.decks;
      if (decks.length === 0) return data;

      // Group decks
      const groups = new Map();
      for (const deck of decks) {
        const key = groupBy === 'none' ? '_all' : (deck[groupBy] || '_other');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(deck);
      }

      // Sort within each group
      const sortFn = sortBy === 'title'
        ? (a, b) => a.title.localeCompare(b.title)
        : sortBy === 'created'
          ? (a, b) => (a.created || '').localeCompare(b.created || '')
          : (a, b) => {
              const areaA = (a.priority || 120) ** 2;
              const areaB = (b.priority || 120) ** 2;
              return areaB - areaA; // Descending — biggest first
            };
      for (const group of groups.values()) {
        group.sort(sortFn);
      }

      // Sort groups by total area descending (biggest groups first)
      const sortedGroups = [...groups.entries()].sort((a, b) => {
        const totalA = a[1].reduce((s, d) => s + (d.priority || 120) ** 2, 0);
        const totalB = b[1].reduce((s, d) => s + (d.priority || 120) ** 2, 0);
        return totalB - totalA;
      });

      // Place groups as columns, left to right
      let curX = margin;
      const now = new Date().toISOString();

      for (const [, group] of sortedGroups) {
        let curY = margin;
        let colWidth = 0;

        for (const deck of group) {
          const dp = deck.priority || 120;
          // Center deck horizontally in column (will adjust after computing colWidth)
          deck.position = { x: curX, y: curY };
          deck.updated = now;
          if (dp > colWidth) colWidth = dp;
          curY += dp + padding;
        }

        // Center-align decks within column width
        for (const deck of group) {
          const dp = deck.priority || 120;
          deck.position.x = curX + (colWidth - dp) / 2;
        }

        curX += colWidth + padding;
      }

      this._addHistory(data, `Auto-layout: ${decks.length} decks`, 'workspace.layout');
      return data;
    });
  }
}

module.exports = WorkspaceService;
