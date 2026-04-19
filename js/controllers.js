// AppController — Slim coordinator that delegates to sub-managers

class AppController {
  constructor() {
    this.appData = null;
    this.views = {};
    this.api = window.minflowAPI;
    this.isLoading = false;
  }

  async init() {
    try {
      window.minflowAPI.onWorkspaceChanged(() => this.refreshWorkspace());

      await this.loadAppData();
      this.initViews();
      this.initManagers();
      this.setupEventHandlers();

      this.notes.loadContent();
      this.preferences.loadDarkModePreference();

      this.render();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      alert('Failed to initialize app: ' + error.message);
    }
  }

  async loadAppData() {
    try {
      this.isLoading = true;
      const data = await this.api.getWorkspace();
      this.appData = AppData.fromJSON(data);
    } catch (error) {
      console.error('Failed to load workspace:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  async refreshWorkspace() {
    if (this.isLoading) return;
    if (this.canvas.isBusy() || this.cards.isDragging()) return;

    try {
      const currentSelectedId = this.appData.metadata.selectedDeckId;
      await this.loadAppData();

      this.preferences.applyFilters();

      if (currentSelectedId && this.appData.getDeck(currentSelectedId)) {
        this.appData.selectDeck(currentSelectedId);
      }

      this.render();
      this.hideLoading();
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
      this.hideLoading();
    }
  }

  initViews() {
    const canvasEl = document.getElementById('main-canvas');
    this.views.canvas = new CanvasView(canvasEl);
    this.views.canvas.setupCanvas(() => this.render());

    const historyList = document.getElementById('history-list');
    this.views.history = new HistoryView(historyList);

    this.views.sidePanel = new SidePanelView();

    const helpDialog = document.getElementById('help-dialog');
    const closeHelpBtn = document.getElementById('close-help-btn');
    this.views.helpDialog = new DialogView(helpDialog, closeHelpBtn);

    const deckMenu = document.getElementById('deck-menu');
    this.views.contextMenu = new ContextMenuView(deckMenu);

    this.views.deckCreationDialog = new DeckCreationDialogView();
  }

  initManagers() {
    this.canvas = new CanvasInteractionManager({
      getAppData: () => this.appData,
      api: this.api,
      views: this.views,
      onSelectionChanged: () => {}, // render() handles side panel updates
      onRender: () => this.render(),
      onEditDeck: (deckId) => this.editDeck(deckId),
    });

    this.cards = new CardManager({
      api: this.api,
      getSelectedDeck: () => this.appData.getSelectedDeck(),
      showLoading: (msg) => this.showLoading(msg),
      hideLoading: () => this.hideLoading(),
    });

    this.notes = new NotesEditor({
      api: this.api,
      getAppData: () => this.appData,
    });

    // Wire up info panel save (done/notes textareas)
    this.views.sidePanel.onInfoSave = async (deckId, updates) => {
      try {
        await this.api.updateDeck(deckId, updates);
      } catch (error) {
        console.error('Failed to save deck info:', error);
      }
    };

    this.keyboard = new KeyboardManager();

    this.preferences = new PreferencesManager({
      api: this.api,
      getAppData: () => this.appData,
      onRender: () => this.render(),
    });

    this.panelResizer = new PanelResizer();
  }

  setupEventHandlers() {
    this.canvas.setupEventHandlers();
    this.cards.setupEventHandlers();
    this.notes.setup();
    this.preferences.setupFilterControls();
    this.panelResizer.setup();

    // Keyboard shortcuts
    this.keyboard.register('Delete', [], () => this.canvas.deleteSelected());
    this.keyboard.register('Escape', [], () => this.canvas.deselectAll());
    this.keyboard.register('z', ['ctrl'], () => this.undo());
    this.keyboard.register('z', ['ctrl', 'shift'], () => this.redo());
    this.keyboard.register('y', ['ctrl'], () => this.redo());

    // Toolbar buttons
    document.getElementById('add-deck-btn').addEventListener('click', () => this.addNewDeck());
    document.getElementById('save-btn').addEventListener('click', () => this.saveWorkspace());
    document.getElementById('load-btn').addEventListener('click', () => this.loadWorkspace());
    document
      .getElementById('help-btn')
      .addEventListener('click', () => this.views.helpDialog.show());
    document
      .getElementById('dark-mode-toggle')
      .addEventListener('click', () => this.preferences.toggleDarkMode(this.notes));

    // Side panel events
    document.getElementById('card-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.cards.addNewCard();
    });

    document.getElementById('edit-deck-btn').addEventListener('click', () => {
      const deck = this.appData.getSelectedDeck();
      if (deck) this.editDeck(deck.id);
    });

    // Recurrent toggle
    document.getElementById('deck-recurrent-toggle').addEventListener('change', async (e) => {
      const deck = this.appData.getSelectedDeck();
      if (deck) {
        this.showLoading('Updating deck...');
        try {
          await this.api.updateDeck(deck.id, { recurrent: e.target.checked });
        } catch (error) {
          console.error('Failed to update deck:', error);
          alert('Failed to update deck. Please try again.');
        } finally {
          this.hideLoading();
        }
      }
    });

    // Reset button
    document.getElementById('reset-deck-btn').addEventListener('click', () => {
      const deck = this.appData.getSelectedDeck();
      if (deck && deck.recurrent) this.resetRecurrentDeck(deck.id);
    });

    // Context menu actions
    this.views.contextMenu.onAction((action, deckId) =>
      this.handleContextMenuAction(action, deckId)
    );

    // Window focus/visibility — re-render to fix canvas disappearing
    window.addEventListener('focus', () => this.render());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(() => this.render(), 100);
    });

    // Tab controls (History / Notes)
    this.setupTabControls();
  }

  setupTabControls() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        const targetTab = e.target.dataset.tab;
        tabButtons.forEach((btn) => btn.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
        document.getElementById(`${targetTab}-tab`).classList.add('active');
      });
    });
  }

  async handleContextMenuAction(action, deckId) {
    const deck = this.appData.getDeck(deckId);
    if (!deck) return;

    switch (action) {
      case 'complete-task':
        await this.cards.completeTopTask(deckId);
        break;
      case 'delete-task':
        await this.cards.deleteTopTask(deckId);
        break;
      case 'edit':
        await this.editDeck(deckId);
        break;
      case 'delete':
        if (this.canvas.selectedDeckIds.size > 1 && this.canvas.selectedDeckIds.has(deckId)) {
          const count = this.canvas.selectedDeckIds.size;
          if (confirm(`Delete ${count} selected decks?`)) {
            this.canvas.selectedDeckIds.forEach((id) => {
              this.api.deleteDeck(id).catch((error) => {
                console.error('Failed to delete deck:', error);
              });
            });
            this.canvas.selectedDeckIds.clear();
          }
        } else {
          if (confirm(`Delete deck "${deck.title}"?`)) {
            this.api.deleteDeck(deckId).catch((error) => {
              console.error('Failed to delete deck:', error);
            });
          }
        }
        break;
    }
  }

  // --- UI Utilities ---

  showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    if (overlay) {
      messageEl.textContent = message;
      overlay.classList.remove('hidden');
    }
  }

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // --- Deck CRUD ---

  async addNewDeck() {
    const existingColors = this.appData.decks.map((deck) => deck.color);

    this.views.deckCreationDialog.show(async (deckData) => {
      const position = this.findOptimalDeckPosition();
      this.showLoading('Creating deck...');
      try {
        await this.api.createDeck({
          title: deckData.title,
          shape: deckData.shape,
          color: deckData.color,
          recurrent: deckData.recurrent,
          description: deckData.description,
          status: deckData.status,
          stalingRate: deckData.stalingRate,
          maxStaleness: deckData.maxStaleness,
          position: position,
        });
      } catch (error) {
        console.error('Failed to create deck:', error);
        alert(`Failed to create deck: ${error.message}`);
      } finally {
        this.hideLoading();
      }
    }, existingColors);
  }

  findOptimalDeckPosition() {
    const decks = this.appData.decks;
    const deckSize = { width: 120, height: 120 };
    const padding = 20;
    const container = document.querySelector('.canvas-container');
    const searchWidth = container ? container.clientWidth : 800;
    const searchHeight = container ? container.clientHeight : 600;

    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.random() * (searchWidth - deckSize.width - padding * 2) + padding;
      const y = Math.random() * (searchHeight - deckSize.height - padding * 2) + padding;

      let overlaps = false;
      for (const deck of decks) {
        if (
          x < deck.x + deck.width + padding &&
          x + deckSize.width + padding > deck.x &&
          y < deck.y + deck.height + padding &&
          y + deckSize.height + padding > deck.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) return { x, y };
    }

    const gridCols = Math.floor((searchWidth - padding) / (deckSize.width + padding));
    const index = decks.length;
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);

    return {
      x: padding + col * (deckSize.width + padding),
      y: padding + row * (deckSize.height + padding),
    };
  }

  async editDeck(deckId) {
    const deck = this.appData.getDeck(deckId);
    if (!deck) return;

    const existingColors = this.appData.decks.map((d) => d.color);
    this.views.deckCreationDialog.show(
      async (deckData) => {
        this.showLoading('Updating deck...');
        try {
          await this.api.updateDeck(deckId, {
            title: deckData.title,
            shape: deckData.shape,
            color: deckData.color,
            recurrent: deckData.recurrent,
            description: deckData.description,
            status: deckData.status,
            stalingRate: deckData.stalingRate,
            maxStaleness: deckData.maxStaleness,
          });
        } catch (error) {
          console.error('Failed to update deck:', error);
          alert('Failed to update deck. Please try again.');
        } finally {
          this.hideLoading();
        }
      },
      existingColors,
      deck
    );
  }

  // --- Undo / Redo ---

  async undo() {
    try {
      const result = await this.api.undo();
      if (result) {
        this.appData = AppData.fromJSON(result);
        this.preferences.applyFilters();
        this.render();
      }
    } catch (error) {
      console.error('Undo failed:', error);
    }
  }

  async redo() {
    try {
      const result = await this.api.redo();
      if (result) {
        this.appData = AppData.fromJSON(result);
        this.preferences.applyFilters();
        this.render();
      }
    } catch (error) {
      console.error('Redo failed:', error);
    }
  }

  // --- Export / Import ---

  async saveWorkspace() {
    try {
      const data = await this.api.exportWorkspace();
      Utils.downloadJSON(data, `minflow-${Date.now()}.json`);
      alert('Workspace exported successfully!');
    } catch (error) {
      console.error('Failed to export workspace:', error);
      alert('Failed to export workspace.');
    }
  }

  async loadWorkspace() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const data = await Utils.loadJSONFile(file);
          await this.api.importWorkspace(data);
          alert('Workspace imported successfully!');
        } catch (error) {
          alert('Failed to import workspace: ' + error.message);
        }
      }
    });
    input.click();
  }

  // --- Rendering ---

  render() {
    this.preferences.updateColorFilterOptions();

    this.views.canvas.render(this.appData, this.canvas.selectedDeckIds);
    this.views.history.render(this.appData.history);

    if (this.canvas.selectedDeckIds.size > 1) {
      this.views.sidePanel.renderMultipleSelection(this.canvas.selectedDeckIds.size);
    } else if (this.canvas.selectedDeckIds.size === 1) {
      const deckId = this.canvas.selectedDeckIds.values().next().value;
      this.views.sidePanel.render(this.appData.getDeck(deckId));
    } else {
      this.views.sidePanel.render(this.appData.getSelectedDeck());
    }
  }

  // --- Recurrent Deck Handling ---

  async resetRecurrentDeck(deckId) {
    const deck = this.appData.getDeck(deckId);
    if (!deck || !deck.recurrent) return;

    if (confirm('This will reset all cards to incomplete and start a new cycle. Continue?')) {
      this.showLoading('Resetting deck...');
      try {
        await this.api.resetCycle(deckId);
      } catch (error) {
        console.error('Failed to reset deck:', error);
        alert('Failed to reset deck. Please try again.');
      } finally {
        this.hideLoading();
      }
    }
  }
}
