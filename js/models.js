// Data Models for MinFlow

class Card {
  constructor(id, text, completed = false, cycle = 0, type = 'task') {
    this.id = id;
    this.text = text;
    this.completed = completed;
    this.cycle = cycle;
    this.type = type; // task, question, note, milestone
    this.priority = null; // Optional: overrides deck priority when this is the top card
    this.created = new Date().toISOString();
    this.updated = new Date().toISOString();
  }

  toJSON() {
    const json = {
      id: this.id,
      text: this.text,
      completed: this.completed,
      cycle: this.cycle,
      type: this.type,
      created: this.created,
      updated: this.updated,
    };
    if (this.priority !== null) json.priority = this.priority;
    return json;
  }

  static fromJSON(data) {
    const card = new Card(data.id, data.text, data.completed, data.cycle || 0, data.type || 'task');
    card.priority = data.priority ?? null;
    card.created = data.created;
    card.updated = data.updated;
    return card;
  }
}

class Deck {
  constructor(
    id,
    title,
    shape = 'rectangle',
    color = '#667eea',
    x = 100,
    y = 100,
    priority = 120
  ) {
    this.id = id;
    this.title = title;
    this.shape = shape; // rectangle, circle, hexagon, pentagon, octagon
    this.color = color;
    this.position = { x, y };
    this.priority = priority;
    this.stalingRate = 0; // px per hour of staleness growth
    this.maxStaleness = 60; // px cap for staleness
    this.lastCompletedAt = null; // ISO timestamp of last card completion
    this.cards = [];
    this.created = new Date().toISOString();
    this.updated = new Date().toISOString();
    this.visible = true; // For filtering
    this.recurrent = false; // When true, completed tasks are cloned to bottom
    this.currentCycle = 0; // Current cycle for recurrent decks
    this.description = ''; // One-liner project overview
    this.status = ''; // Lifecycle status (idea, planning, active, prototype, stable, paused, blocked, done)
    this.done = ''; // Completed milestones narrative (markdown)
    this.notes = ''; // Open questions, references, misc context (markdown)

    // Convenience getters for backward compatibility
    Object.defineProperty(this, 'x', {
      get() {
        return this.position.x;
      },
      set(value) {
        this.position.x = value;
      },
    });
    Object.defineProperty(this, 'y', {
      get() {
        return this.position.y;
      },
      set(value) {
        this.position.y = value;
      },
    });
    // Backward compat: width/height/size computed from display size
    Object.defineProperty(this, 'width', {
      get() {
        return this.getDisplaySize();
      },
      set(value) {
        this.priority = value;
      },
    });
    Object.defineProperty(this, 'height', {
      get() {
        return this.getDisplaySize();
      },
      set(value) {
        this.priority = value;
      },
    });
    Object.defineProperty(this, 'size', {
      get() {
        const ds = this.getDisplaySize();
        return { width: ds, height: ds };
      },
      set(value) {
        if (typeof value === 'object' && value.width !== undefined) {
          this.priority = value.width;
        }
      },
    });
  }

  getCard(cardId) {
    return DeckQueries.findCard(this.cards, cardId);
  }

  getTopIncompleteCard() {
    return DeckQueries.getTopIncompleteCard(this.cards, this.currentCycle);
  }

  getIncompleteCount() {
    return DeckQueries.getIncompleteCount(this.cards, this.currentCycle);
  }

  getCompletedCount() {
    return DeckQueries.getCompletedCount(this.cards, this.currentCycle);
  }

  updatePosition(x, y) {
    this.x = x;
    this.y = y;
    this.updated = new Date().toISOString();
  }

  updateSize(width, height) {
    this.width = width;
    this.height = height;
    this.updated = new Date().toISOString();
  }

  calculateStaleness() {
    if (!this.lastCompletedAt || this.stalingRate <= 0) return 0;
    const hoursSince = (Date.now() - new Date(this.lastCompletedAt).getTime()) / (1000 * 60 * 60);
    return Math.min(this.stalingRate * Math.max(0, hoursSince), this.maxStaleness);
  }

  getDisplaySize() {
    const topCard = this.getTopIncompleteCard();
    const basePriority = topCard?.priority ?? this.priority;
    return basePriority + this.calculateStaleness();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      shape: this.shape,
      color: this.color,
      position: this.position,
      priority: this.priority,
      stalingRate: this.stalingRate,
      maxStaleness: this.maxStaleness,
      lastCompletedAt: this.lastCompletedAt,
      cards: this.cards.map((c) => c.toJSON()),
      created: this.created,
      updated: this.updated,
      visible: this.visible,
      recurrent: this.recurrent,
      currentCycle: this.currentCycle,
      description: this.description,
      status: this.status,
      done: this.done,
      notes: this.notes,
    };
  }

  static fromJSON(data) {
    const x = data.position?.x ?? data.x ?? 100;
    const y = data.position?.y ?? data.y ?? 100;
    // Backward compat: read priority from old size.width if priority field missing
    const priority = data.priority ?? data.size?.width ?? 120;

    const deck = new Deck(data.id, data.title, data.shape, data.color, x, y, priority);
    deck.stalingRate = data.stalingRate || 0;
    deck.maxStaleness = data.maxStaleness ?? 60;
    deck.lastCompletedAt = data.lastCompletedAt || null;
    deck.cards = (data.cards || []).map((c) => Card.fromJSON(c));
    deck.created = data.created;
    deck.updated = data.updated;
    deck.recurrent = data.recurrent || false;
    deck.currentCycle = data.currentCycle || 0;
    deck.description = data.description || '';
    deck.status = data.status || '';
    deck.done = data.done || '';
    deck.notes = data.notes || '';
    return deck;
  }
}

class AppData {
  constructor() {
    this.version = '1.0.0';
    this.workspace = {
      id: Date.now().toString(),
      name: 'My Workspace',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      settings: {
        autosave: true,
        autosaveInterval: 30000,
      },
    };
    this.decks = [];
    this.history = [];
    this.metadata = {
      lastSaved: new Date().toISOString(),
      selectedDeckId: null,
    };
  }

  getDeck(deckId) {
    return this.decks.find((d) => d.id === deckId);
  }

  selectDeck(deckId) {
    if (this.decks.some((d) => d.id === deckId)) {
      this.metadata.selectedDeckId = deckId;
      return true;
    }
    return false;
  }

  deselectDeck() {
    this.metadata.selectedDeckId = null;
  }

  getSelectedDeck() {
    return this.metadata.selectedDeckId ? this.getDeck(this.metadata.selectedDeckId) : null;
  }

  toJSON() {
    return {
      version: this.version,
      workspace: this.workspace,
      decks: this.decks.map((d) => d.toJSON()),
      history: this.history,
      metadata: this.metadata,
    };
  }

  static fromJSON(data) {
    const appData = new AppData();
    appData.version = data.version || '1.0.0';
    appData.workspace = data.workspace || appData.workspace;
    appData.decks = (data.decks || []).map((d) => Deck.fromJSON(d));
    appData.history = data.history || [];
    appData.metadata = data.metadata || {
      lastSaved: new Date().toISOString(),
      selectedDeckId: null,
    };
    return appData;
  }
}
