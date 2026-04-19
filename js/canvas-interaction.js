// CanvasInteractionManager — Canvas mouse handlers, drag/resize/select state machine

class CanvasInteractionManager {
  constructor({ getAppData, api, views, onSelectionChanged, onRender, onEditDeck }) {
    this.getAppData = getAppData;
    this.api = api;
    this.views = views;
    this.onSelectionChanged = onSelectionChanged;
    this.onRender = onRender;
    this.onEditDeck = onEditDeck;

    // Interaction state
    this.dragState = null;
    this.resizeState = null;
    this.selectionState = null;
    this.selectedDeckIds = new Set();
  }

  // Whether a canvas drag/resize is in progress (checked by refreshWorkspace)
  isBusy() {
    return this.dragState !== null || this.resizeState !== null;
  }

  setupEventHandlers() {
    const canvas = document.getElementById('main-canvas');
    canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    canvas.addEventListener('contextmenu', (e) => this.handleRightClick(e));
    canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    // Touch support for mobile
    this._longPressTimer = null;
    this._touchMoved = false;
    this._pinchState = null;
    this._canvasScale = 1;
    canvas.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this._handleTouchEnd(e), { passive: false });
  }

  // --- Touch event handlers (mobile) ---

  _touchToMouseEvent(touch, canvas) {
    return { clientX: touch.clientX, clientY: touch.clientY, target: canvas, button: 0 };
  }

  _touchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  _touchMidpoint(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  _handleTouchStart(e) {
    const canvas = e.currentTarget;
    const container = canvas.parentElement;

    if (e.touches.length === 2) {
      // Enter two-finger mode: pan + pinch-zoom. Cancel any in-progress one-finger interaction.
      clearTimeout(this._longPressTimer);
      this.dragState = null;
      this.resizeState = null;
      this.selectionState = null;
      const mid = this._touchMidpoint(e.touches[0], e.touches[1]);
      this._pinchState = {
        initialDist: this._touchDistance(e.touches[0], e.touches[1]),
        initialScale: this._canvasScale,
        initialMidX: mid.x,
        initialMidY: mid.y,
        initialScrollLeft: container.scrollLeft,
        initialScrollTop: container.scrollTop,
      };
      e.preventDefault();
      return;
    }

    if (e.touches.length !== 1) return;
    if (this._pinchState) return; // Still in multi-touch; ignore

    e.preventDefault();
    const touch = e.touches[0];
    this._touchMoved = false;
    this._lastTouch = { clientX: touch.clientX, clientY: touch.clientY };

    // Start long-press timer for context menu (500ms)
    this._longPressTimer = setTimeout(() => {
      if (!this._touchMoved) {
        const synth = this._touchToMouseEvent(touch, canvas);
        this.handleRightClick({ ...synth, preventDefault: () => {} });
      }
    }, 500);

    this.handleMouseDown(this._touchToMouseEvent(touch, canvas));
  }

  _handleTouchMove(e) {
    const canvas = e.currentTarget;
    const container = canvas.parentElement;

    if (this._pinchState && e.touches.length === 2) {
      e.preventDefault();
      const mid = this._touchMidpoint(e.touches[0], e.touches[1]);
      const newDist = this._touchDistance(e.touches[0], e.touches[1]);
      let scale = this._pinchState.initialScale * (newDist / this._pinchState.initialDist);
      scale = Math.max(0.3, Math.min(3, scale));
      this._canvasScale = scale;
      canvas.style.transform = `scale(${scale})`;

      // Pan: move scroll opposite to midpoint drift
      const dx = mid.x - this._pinchState.initialMidX;
      const dy = mid.y - this._pinchState.initialMidY;
      container.scrollLeft = this._pinchState.initialScrollLeft - dx;
      container.scrollTop = this._pinchState.initialScrollTop - dy;
      return;
    }

    if (e.touches.length !== 1 || this._pinchState) return;

    e.preventDefault();
    this._touchMoved = true;
    clearTimeout(this._longPressTimer);
    const touch = e.touches[0];
    this._lastTouch = { clientX: touch.clientX, clientY: touch.clientY };
    this.handleMouseMove(this._touchToMouseEvent(touch, canvas));
  }

  _handleTouchEnd(e) {
    clearTimeout(this._longPressTimer);

    if (this._pinchState) {
      if (e.touches.length < 2) {
        this._pinchState = null;
      }
      return;
    }

    e.preventDefault();
    const coords = this._lastTouch || { clientX: 0, clientY: 0 };
    const canvas = document.getElementById('main-canvas');
    const wasTap = !this._touchMoved;
    this.handleMouseUp({ clientX: coords.clientX, clientY: coords.clientY, target: canvas, button: 0 });

    // On mobile, a tap on a deck opens the side panel so the user can see deck details
    if (wasTap && this.selectedDeckIds.size === 1 && window.innerWidth <= 768) {
      if (typeof window.minflowOpenSidePanel === 'function') {
        window.minflowOpenSidePanel();
      }
    }
  }

  handleMouseDown(e) {
    const appData = this.getAppData();
    const coords = Utils.getCanvasCoordinates(e.target, e);

    // Check if right-clicking on a selected deck when multiple are selected
    if (e.button === 2 && this.selectedDeckIds.size > 0) {
      const clickedDeck = Utils.getDeckAtScaledPoint(appData.decks, coords.x, coords.y);
      if (clickedDeck && this.selectedDeckIds.has(clickedDeck.id)) {
        return;
      }
    }

    // First check if clicking on any visible deck's resize handle
    let resizeDeck = null;
    for (const deck of appData.decks) {
      if (deck.visible !== false && Utils.getResizeHandle(deck, coords.x, coords.y)) {
        resizeDeck = deck;
        break;
      }
    }

    if (resizeDeck) {
      this.selectedDeckIds.clear();
      this.selectedDeckIds.add(resizeDeck.id);
      appData.selectDeck(resizeDeck.id);
      // Clear card priority override for smooth resize visual
      const topCard = resizeDeck.getTopIncompleteCard();
      if (topCard) topCard.priority = null;
      this.resizeState = {
        deck: resizeDeck,
        handle: 'se',
        startX: coords.x,
        startY: coords.y,
        startWidth: resizeDeck.priority,
        startHeight: resizeDeck.priority,
        startDeckX: resizeDeck.x,
        startDeckY: resizeDeck.y,
      };
    } else {
      const deck = Utils.getDeckAtScaledPoint(appData.decks, coords.x, coords.y);
      if (deck) {
        if (this.selectedDeckIds.has(deck.id) && this.selectedDeckIds.size > 1) {
          this.dragState = {
            isMultiple: true,
            decks: Array.from(this.selectedDeckIds).map((id) => {
              const d = appData.getDeck(id);
              return {
                deck: d,
                offsetX: coords.x - d.x,
                offsetY: coords.y - d.y,
              };
            }),
          };
        } else {
          this.selectedDeckIds.clear();
          this.selectedDeckIds.add(deck.id);
          appData.selectDeck(deck.id);
          this.dragState = {
            deck: deck,
            offsetX: coords.x - deck.x,
            offsetY: coords.y - deck.y,
          };
        }
      } else {
        this.selectedDeckIds.clear();
        appData.deselectDeck();
        this.selectionState = {
          startX: coords.x,
          startY: coords.y,
          currentX: coords.x,
          currentY: coords.y,
        };
      }
    }

    this._emitSelectionChanged();
    this.onRender();
  }

  handleMouseMove(e) {
    const appData = this.getAppData();
    const coords = Utils.getCanvasCoordinates(e.target, e);

    if (this.selectionState) {
      this.selectionState.currentX = coords.x;
      this.selectionState.currentY = coords.y;

      const x = Math.min(this.selectionState.startX, this.selectionState.currentX);
      const y = Math.min(this.selectionState.startY, this.selectionState.currentY);
      const width = Math.abs(this.selectionState.currentX - this.selectionState.startX);
      const height = Math.abs(this.selectionState.currentY - this.selectionState.startY);

      e.target.style.cursor = 'crosshair';

      this.selectedDeckIds.clear();
      appData.decks.forEach((deck) => {
        if (deck.visible !== false && Utils.deckIntersectsRectangle(deck, x, y, width, height)) {
          this.selectedDeckIds.add(deck.id);
        }
      });

      this.views.canvas.scheduleRender(appData, this.selectedDeckIds, {
        x: x,
        y: y,
        width: width,
        height: height,
      });
    } else if (this.dragState) {
      if (this.dragState.isMultiple) {
        const canvas = e.target;
        this.dragState.decks.forEach(({ deck, offsetX, offsetY }) => {
          const newX = coords.x - offsetX;
          const newY = coords.y - offsetY;
          const maxX = canvas.width - deck.width;
          const maxY = canvas.height - deck.height;
          deck.updatePosition(
            Math.max(0, Math.min(newX, maxX)),
            Math.max(0, Math.min(newY, maxY))
          );
        });
      } else {
        const newX = coords.x - this.dragState.offsetX;
        const newY = coords.y - this.dragState.offsetY;
        const canvas = e.target;
        const maxX = canvas.width - this.dragState.deck.width;
        const maxY = canvas.height - this.dragState.deck.height;
        this.dragState.deck.updatePosition(
          Math.max(0, Math.min(newX, maxX)),
          Math.max(0, Math.min(newY, maxY))
        );
      }
      this.views.canvas.scheduleRender(appData, this.selectedDeckIds, this.selectionState);
    } else if (this.resizeState) {
      const dx = coords.x - this.resizeState.startX;
      const dy = coords.y - this.resizeState.startY;
      const delta = Math.max(Math.abs(dx), Math.abs(dy));

      let newSize = this.resizeState.startWidth;
      let newX = this.resizeState.startDeckX;
      let newY = this.resizeState.startDeckY;

      switch (this.resizeState.handle) {
        case 'nw':
          newSize = this.resizeState.startWidth - (dx < 0 || dy < 0 ? delta : -delta);
          if (newSize !== this.resizeState.startWidth) {
            const sizeDiff = this.resizeState.startWidth - newSize;
            newX = this.resizeState.startDeckX + sizeDiff;
            newY = this.resizeState.startDeckY + sizeDiff;
          }
          break;
        case 'ne':
          newSize = this.resizeState.startWidth + (dx > 0 || dy < 0 ? delta : -delta);
          if (newSize !== this.resizeState.startWidth) {
            const sizeDiff = this.resizeState.startWidth - newSize;
            newY = this.resizeState.startDeckY + sizeDiff;
          }
          break;
        case 'sw':
          newSize = this.resizeState.startWidth - (dx < 0 || dy > 0 ? delta : -delta);
          if (newSize !== this.resizeState.startWidth) {
            const sizeDiff = this.resizeState.startWidth - newSize;
            newX = this.resizeState.startDeckX + sizeDiff;
          }
          break;
        case 'se':
          newSize = this.resizeState.startWidth + (dx > 0 || dy > 0 ? delta : -delta);
          break;
      }

      const canvas = e.target;
      const minSize = 10;
      const maxSize = Math.min(canvas.width - newX, canvas.height - newY);
      newSize = Math.max(minSize, Math.min(newSize, maxSize));

      newX = Math.max(0, Math.min(newX, canvas.width - newSize));
      newY = Math.max(0, Math.min(newY, canvas.height - newSize));

      this.resizeState.deck.updateSize(newSize, newSize);
      this.resizeState.deck.updatePosition(newX, newY);
      this.views.canvas.scheduleRender(appData, this.selectedDeckIds, this.selectionState);
    } else {
      // Hover state
      let overResizeHandle = false;
      for (const deck of appData.decks) {
        if (deck.visible !== false && Utils.getResizeHandle(deck, coords.x, coords.y)) {
          e.target.style.cursor = 'nwse-resize';
          overResizeHandle = true;
          break;
        }
      }

      if (!overResizeHandle) {
        const deck = Utils.getDeckAtScaledPoint(appData.decks, coords.x, coords.y);
        if (deck && deck.id === appData.metadata.selectedDeckId) {
          e.target.style.cursor = 'move';
        } else if (deck) {
          e.target.style.cursor = 'pointer';
        } else {
          e.target.style.cursor = 'crosshair';
        }

        if (deck) {
          const topCard = deck.getTopIncompleteCard();
          const tooltip = `${deck.title}${topCard ? '\n\nTop card: ' + topCard.text : '\n\nNo active cards'}`;
          e.target.title = tooltip;
        } else {
          e.target.title = '';
        }
      }
    }
  }

  async handleMouseUp(e) {
    const appData = this.getAppData();
    const wasDragging = this.dragState;
    const wasResizing = this.resizeState;
    const wasSelecting = this.selectionState;

    this.dragState = null;
    this.resizeState = null;
    this.selectionState = null;

    const coords = Utils.getCanvasCoordinates(e.target, e);
    const deck = Utils.getDeckAtScaledPoint(appData.decks, coords.x, coords.y);
    if (deck && (deck.id === appData.metadata.selectedDeckId || this.selectedDeckIds.has(deck.id))) {
      e.target.style.cursor = 'move';
    } else if (deck) {
      e.target.style.cursor = 'pointer';
    } else {
      e.target.style.cursor = 'crosshair';
    }

    if (wasDragging) {
      if (wasDragging.isMultiple) {
        wasDragging.decks.forEach(({ deck }) => {
          this.api.moveDeck(deck.id, deck.x, deck.y).catch((error) => {
            console.error('Failed to save deck position:', error);
          });
        });
      } else {
        const d = wasDragging.deck;
        this.api.moveDeck(d.id, d.x, d.y).catch((error) => {
          console.error('Failed to save deck position:', error);
        });
      }
    } else if (wasResizing) {
      const d = wasResizing.deck;
      this.api.setPriority(d.id, d.priority).catch((error) => {
        console.error('Failed to save deck priority:', error);
      });
    } else if (wasSelecting) {
      if (this.selectedDeckIds.size === 1) {
        const deckId = this.selectedDeckIds.values().next().value;
        appData.selectDeck(deckId);
      } else if (this.selectedDeckIds.size === 0) {
        appData.deselectDeck();
      }
    }

    this._emitSelectionChanged();
    this.onRender();
  }

  handleMouseLeave(e) {
    if (this.dragState || this.resizeState) {
      this.handleMouseUp(e);
    }
  }

  handleRightClick(e) {
    e.preventDefault();
    const appData = this.getAppData();
    const coords = Utils.getCanvasCoordinates(e.target, e);
    const deck = Utils.getDeckAtScaledPoint(appData.decks, coords.x, coords.y);

    if (deck) {
      if (!this.selectedDeckIds.has(deck.id)) {
        this.selectedDeckIds.clear();
        this.selectedDeckIds.add(deck.id);
        appData.selectDeck(deck.id);
        this._emitSelectionChanged();
        this.onRender();
      }

      const hasActiveTasks = deck.getIncompleteCount() > 0;
      this.views.contextMenu.show(e.clientX, e.clientY, deck.id, hasActiveTasks);
    }
  }

  handleDoubleClick(e) {
    const appData = this.getAppData();
    const coords = Utils.getCanvasCoordinates(e.target, e);
    const deck = Utils.getDeckAtScaledPoint(appData.decks, coords.x, coords.y);

    if (deck) {
      this.onEditDeck(deck.id);
    }
  }

  // Clear all selection state
  deselectAll() {
    this.selectedDeckIds.clear();
    this.getAppData().deselectDeck();
    this._emitSelectionChanged();
    this.onRender();
  }

  // Delete all selected decks (called from keyboard shortcut)
  deleteSelected() {
    const appData = this.getAppData();
    if (this.selectedDeckIds.size > 0) {
      const count = this.selectedDeckIds.size;
      if (confirm(`Delete ${count} selected deck${count > 1 ? 's' : ''}?`)) {
        this.selectedDeckIds.forEach((deckId) => {
          this.api.deleteDeck(deckId).catch((error) => {
            console.error('Failed to delete deck:', error);
          });
        });
        this.selectedDeckIds.clear();
        this._emitSelectionChanged();
      }
    } else if (appData.metadata.selectedDeckId) {
      const deck = appData.getSelectedDeck();
      if (deck && confirm(`Delete deck "${deck.title}"?`)) {
        this.api.deleteDeck(deck.id).catch((error) => {
          console.error('Failed to delete deck:', error);
        });
      }
    }
  }

  _emitSelectionChanged() {
    this.onSelectionChanged(this.selectedDeckIds);
  }
}
