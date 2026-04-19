// View components for MinFlow

class CanvasView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Don't call setupCanvas here - let the controller do it

    this._rafId = null;
    this._pendingRenderArgs = null;
    this._textCache = new Map();
    this._stalenessTimer = null;
    this._lastSelectedDeckIds = new Set();

    this.SHAPE_SCALE_FACTORS = DeckQueries.SHAPE_SCALE_FACTORS;

    // Safe text areas as percentage of bounding box
    this.SHAPE_TEXT_AREAS = {
      rectangle: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      circle: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
      hexagon: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
      pentagon: { x: 0.125, y: 0.15, width: 0.75, height: 0.7 },
      octagon: { x: 0.075, y: 0.075, width: 0.85, height: 0.85 },
    };
  }

  setupCanvas(onResize = null) {
    // Store the resize callback
    this.onResizeCallback = onResize;

    // Initial canvas size setup (skip callback to prevent recursion)
    this.updateCanvasSize([], true);

    // Listen for window resize to update container
    window.addEventListener('resize', () => {
      this.updateScrollPosition();
    });

    // Periodically re-render for staleness visual growth
    this.startStalenessTimer();
  }

  updateCanvasSize(decks = [], skipCallback = false) {
    // Find the bounds of all decks
    let maxX = 800; // Minimum width
    let maxY = 600; // Minimum height

    decks.forEach((deck) => {
      if (deck.visible !== false) {
        // Only consider visible decks
        const rightEdge = deck.x + deck.width + 100; // Add padding
        const bottomEdge = deck.y + deck.height + 100; // Add padding
        maxX = Math.max(maxX, rightEdge);
        maxY = Math.max(maxY, bottomEdge);
      }
    });

    // Get container size
    const container = this.canvas.parentElement;
    const containerRect = container.getBoundingClientRect();

    // Use the larger of container size or content size
    const width = Math.max(containerRect.width, maxX);
    const height = Math.max(containerRect.height, maxY);

    // Update canvas size if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      const oldWidth = this.canvas.width;
      const oldHeight = this.canvas.height;

      this.canvas.width = width;
      this.canvas.height = height;

      // Notify about resize (unless we're told to skip)
      if (this.onResizeCallback && !skipCallback) {
        this.onResizeCallback(oldWidth, oldHeight, width, height);
      }
    }
  }

  scrollDeckIntoView(deck) {
    const container = this.canvas.parentElement;
    if (!container) return;

    // Calculate deck bounds
    const deckLeft = deck.x;
    const deckTop = deck.y;
    const deckRight = deck.x + deck.width;
    const deckBottom = deck.y + deck.height;

    // Get current scroll position and container size
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate visible area
    const visibleLeft = scrollLeft;
    const visibleTop = scrollTop;
    const visibleRight = scrollLeft + containerWidth;
    const visibleBottom = scrollTop + containerHeight;

    // Determine if we need to scroll
    let newScrollLeft = scrollLeft;
    let newScrollTop = scrollTop;

    // Horizontal scrolling
    if (deckRight > visibleRight) {
      newScrollLeft = deckRight - containerWidth + 20; // Add some padding
    } else if (deckLeft < visibleLeft) {
      newScrollLeft = deckLeft - 20;
    }

    // Vertical scrolling
    if (deckBottom > visibleBottom) {
      newScrollTop = deckBottom - containerHeight + 20;
    } else if (deckTop < visibleTop) {
      newScrollTop = deckTop - 20;
    }

    // Apply scroll if needed
    if (newScrollLeft !== scrollLeft || newScrollTop !== scrollTop) {
      container.scrollTo({
        left: newScrollLeft,
        top: newScrollTop,
        behavior: 'smooth',
      });
    }
  }

  updateScrollPosition() {
    // Ensure canvas is at least as large as its container
    const container = this.canvas.parentElement;
    const containerRect = container.getBoundingClientRect();

    if (this.canvas.width < containerRect.width || this.canvas.height < containerRect.height) {
      this.updateCanvasSize();
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawDeck(deck, isSelected = false) {
    const ctx = this.ctx;
    ctx.save();

    const scaleFactor = this.SHAPE_SCALE_FACTORS[deck.shape] || 1.0;
    const displaySize = deck.width;
    const staleness = deck.calculateStaleness();
    const innerSize = displaySize - staleness;

    // Outer ring (staleness halo) — only if staleness > 0
    if (staleness > 0) {
      const outerScaled = displaySize * scaleFactor;
      const outerX = deck.x - (outerScaled - displaySize) / 2;
      const outerY = deck.y - (outerScaled - displaySize) / 2;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      Utils.drawShape(ctx, deck.shape, outerX, outerY, outerScaled, outerScaled);
      ctx.fillStyle = Utils.hexToRgba(deck.color, 0.3);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = Utils.darkenColor(deck.color, 5);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Inner ring (priority) — solid fill
    const innerScaled = innerSize * scaleFactor;
    const innerBBX = deck.x + staleness / 2;
    const innerBBY = deck.y + staleness / 2;
    const innerX = innerBBX - (innerScaled - innerSize) / 2;
    const innerY = innerBBY - (innerScaled - innerSize) / 2;

    if (staleness === 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    Utils.drawShape(ctx, deck.shape, innerX, innerY, innerScaled, innerScaled);
    ctx.fillStyle = deck.color;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    if (isSelected) {
      ctx.strokeStyle = Utils.darkenColor(deck.color, 20);
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = Utils.darkenColor(deck.color, 10);
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    // Resize handle on inner shape
    this.drawResizeHandle(deck);

    ctx.restore();
    this.drawDeckContent(deck);
  }

  drawDeckContent(deck) {
    const ctx = this.ctx;

    // Get safe text area for this shape
    const textArea = this.SHAPE_TEXT_AREAS[deck.shape] || this.SHAPE_TEXT_AREAS.rectangle;
    const scaleFactor = this.SHAPE_SCALE_FACTORS[deck.shape] || 1.0;

    // Calculate actual text bounds
    const textX = deck.x + deck.width * textArea.x;
    const textY = deck.y + deck.height * textArea.y;
    const textWidth = deck.width * textArea.width;
    const textHeight = deck.height * textArea.height;

    const centerX = textX + textWidth / 2;
    const centerY = textY + textHeight / 2;

    // Calculate font sizes based on safe text area
    const baseFontSize = (Math.min(textWidth, textHeight) / 8) * 1.1;
    const titleFontSize = Math.max(9, baseFontSize * 0.95);
    const countFontSize = Math.max(8, baseFontSize * 0.8);

    // Set text color based on deck color brightness
    ctx.fillStyle = Utils.isLightColor(deck.color) ? '#333' : '#fff';

    // Draw title (with multi-line support)
    ctx.font = `${titleFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleMaxWidth = textWidth * 0.95;
    const titleLines = this.wrapText(ctx, deck.title.toUpperCase(), titleMaxWidth, 2);
    const titleLineHeight = titleFontSize * 1.15;
    const titleBlockHeight = titleLines.length * titleLineHeight;

    // Pack elements top-down with minimal gaps
    const gap = textHeight * 0.02;
    const titleStartY = textY + titleBlockHeight / 2 + gap * 0.5;

    titleLines.forEach((line, index) => {
      ctx.fillText(line, centerX, titleStartY + index * titleLineHeight);
    });

    // Draw recurrent indicator if applicable
    if (deck.recurrent) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const symbolSize = titleFontSize * 2 * 0.75;
      ctx.font = `${symbolSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const recurrentSymbol = '↻';

      const metrics = ctx.measureText(recurrentSymbol);
      const symbolWidth = metrics.width;
      const circleRadius = (Math.max(symbolWidth, symbolSize) / 2 + 3) * 0.75;

      const symbolX = deck.x + deck.width - circleRadius - 5;
      const symbolY = deck.y + circleRadius + 5;

      ctx.beginPath();
      ctx.arc(symbolX, symbolY, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#39ff14';
      ctx.fill();

      ctx.strokeStyle = '#1c7f0a';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = Utils.isLightColor(deck.color) ? '#333' : '#fff';
      ctx.fillText(recurrentSymbol, symbolX, symbolY);
      ctx.restore();
    }

    // Draw card count + card text preview
    const incompleteCount = deck.getIncompleteCount();
    const completedCount = deck.getCompletedCount();
    const totalCount = deck.cards.length;

    if (totalCount > 0) {
      const countY = titleStartY + (titleLines.length - 1) * titleLineHeight + titleLineHeight * 0.8 + gap;
      ctx.font = `${countFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText(`${completedCount}/${totalCount}`, centerX, countY);

      // Draw top incomplete card preview — fill remaining space
      const minDeckSizeForCardPreview = 45;
      if (deck.width >= minDeckSizeForCardPreview && deck.height >= minDeckSizeForCardPreview) {
        const topCard = deck.getTopIncompleteCard();
        if (topCard) {
          // Dynamic card font: scale down for longer text
          const len = topCard.text.length;
          let cardFontSize;
          if (len < 60) {
            cardFontSize = Math.max(8, baseFontSize * 0.8);
          } else if (len < 150) {
            cardFontSize = Math.max(7, baseFontSize * 0.7);
          } else {
            cardFontSize = Math.max(6.5, baseFontSize * 0.6);
          }

          ctx.font = `bold ${cardFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.globalAlpha = 0.8;

          const cardMaxWidth = textWidth * 0.95;
          const cardLineHeight = cardFontSize * 1.15;
          // Calculate available space below the count
          const cardZoneTop = countY + countFontSize * 0.8;
          const cardZoneBottom = textY + textHeight;
          const availableHeight = cardZoneBottom - cardZoneTop;
          if (availableHeight < cardLineHeight) {
            ctx.globalAlpha = 1;
            return;
          }
          const maxCardLines = Math.max(2, Math.floor(availableHeight / cardLineHeight));

          const cardLines = this.wrapText(ctx, topCard.text.toUpperCase(), cardMaxWidth, maxCardLines);

          // Center the card text block vertically in the available space
          const cardBlockHeight = cardLines.length * cardLineHeight;
          const cardStartY = cardZoneTop + (availableHeight - cardBlockHeight) / 2 + cardLineHeight / 2;

          cardLines.forEach((line, index) => {
            ctx.fillText(line, centerX, cardStartY + index * cardLineHeight);
          });

          ctx.globalAlpha = 1;
        }
      }
    }
  }

  wrapText(ctx, text, maxWidth, maxLines = 2) {
    const key = `${ctx.font}|${text}|${Math.round(maxWidth)}|${maxLines}`;
    const cached = this._textCache.get(key);
    if (cached) return cached;
    const result = this._wrapTextUncached(ctx, text, maxWidth, maxLines);
    this._textCache.set(key, result);
    return result;
  }

  _wrapTextUncached(ctx, text, maxWidth, maxLines = 2) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      let word = words[i];

      // Break long words that exceed maxWidth on their own
      while (ctx.measureText(word).width > maxWidth && word.length > 1) {
        // Find how many chars fit
        let fit = 1;
        while (fit < word.length && ctx.measureText(word.slice(0, fit + 1)).width <= maxWidth) {
          fit++;
        }
        const chunk = word.slice(0, fit);
        word = word.slice(fit);

        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
          if (lines.length >= maxLines) break;
        }
        lines.push(chunk);
        if (lines.length >= maxLines) break;
      }
      if (lines.length >= maxLines) break;

      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;

        // If we've reached max lines, add ellipsis to last line
        if (lines.length >= maxLines - 1 && i < words.length - 1) {
          let remainingText = words.slice(i).join(' ');
          while (
            ctx.measureText(remainingText + '...').width > maxWidth &&
            remainingText.length > 0
          ) {
            remainingText = remainingText.slice(0, -1);
          }
          lines.push(remainingText + '...');
          break;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }

    // Add ellipsis to last line if text was truncated
    const hasMore = lines.length >= maxLines && (currentLine || words.length > 0);
    if (hasMore && lines.length > 0 && !lines[lines.length - 1].endsWith('...')) {
      const lastLine = lines[lines.length - 1];
      let truncated = lastLine;
      while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      lines[lines.length - 1] = truncated + '...';
    }

    return lines;
  }

  drawResizeHandle(deck) {
    const ctx = this.ctx;

    // Position handle on inner shape (priority), not outer (display size)
    const staleness = deck.calculateStaleness();
    const displaySize = deck.width;
    const innerSize = displaySize - staleness;

    // Dynamic handle size based on inner size
    let handleSize;
    if (innerSize < 50) {
      handleSize = 6;
    } else if (innerSize < 100) {
      handleSize = 8;
    } else {
      handleSize = 12;
    }

    // Account for shape scaling on inner ring
    const scaleFactor = this.SHAPE_SCALE_FACTORS[deck.shape] || 1.0;
    const innerScaled = innerSize * scaleFactor;

    // Inner ring bounding box
    const innerBBX = deck.x + staleness / 2;
    const innerBBY = deck.y + staleness / 2;

    // Position handle at bottom-right of scaled inner shape
    const x = innerBBX + innerSize + (innerScaled - innerSize) / 2;
    const y = innerBBY + innerSize + (innerScaled - innerSize) / 2;

    // Draw handle as a corner triangle
    ctx.beginPath();
    ctx.moveTo(x, y - handleSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x - handleSize, y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(102, 126, 234, 0.5)';
    ctx.fill();

    // Draw grip lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - handleSize + 3);
    ctx.lineTo(x - handleSize + 3, y - 3);
    ctx.moveTo(x - 3, y - handleSize / 2);
    ctx.lineTo(x - handleSize / 2, y - 3);
    ctx.stroke();
  }

  startStalenessTimer() {
    this._stalenessTimer = setInterval(() => {
      if (this.appData) {
        this._textCache.clear();
        this.scheduleRender(this.appData, this._lastSelectedDeckIds || new Set());
      }
    }, 5 * 60 * 1000);
  }

  stopStalenessTimer() {
    if (this._stalenessTimer) {
      clearInterval(this._stalenessTimer);
      this._stalenessTimer = null;
    }
  }

  scheduleRender(appData, selectedDeckIds = new Set(), selectionRect = null) {
    this._pendingRenderArgs = [appData, selectedDeckIds, selectionRect];
    if (!this._rafId) {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        if (this._pendingRenderArgs) {
          this.render(...this._pendingRenderArgs);
          this._pendingRenderArgs = null;
        }
      });
    }
  }

  render(appData, selectedDeckIds = new Set(), selectionRect = null) {
    // Invalidate text cache when data changes (new appData reference)
    if (appData !== this.appData) {
      this._textCache.clear();
    }
    this.appData = appData;
    this._lastSelectedDeckIds = selectedDeckIds;

    // Update canvas size based on deck positions
    // Skip callback to prevent recursion
    this.updateCanvasSize(appData.decks, true);

    this.clear();

    // Draw only visible decks
    appData.decks.forEach((deck) => {
      if (deck.visible !== false) {
        // Default to visible if property doesn't exist
        const isSelected =
          selectedDeckIds.has(deck.id) || deck.id === appData.metadata.selectedDeckId;
        this.drawDeck(deck, isSelected);
      }
    });

    // Draw selection rectangle if active
    if (selectionRect) {
      this.drawSelectionRectangle(selectionRect);
    }
  }

  drawSelectionRectangle(rect) {
    const ctx = this.ctx;
    ctx.save();

    // Draw semi-transparent fill
    ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Draw border
    ctx.strokeStyle = 'rgba(102, 126, 234, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    ctx.restore();
  }
}

class HistoryView {
  constructor(container) {
    this.container = container;
    this.verboseCheckbox = document.getElementById('history-verbose-checkbox');
    this.isVerbose = true;

    // Setup event listener for verbose checkbox
    if (this.verboseCheckbox) {
      this.verboseCheckbox.addEventListener('change', (e) => {
        this.isVerbose = e.target.checked;
        // Re-render with current history
        if (this.currentHistory) {
          this.render(this.currentHistory);
        }
      });
    }
  }

  render(history) {
    this.currentHistory = history; // Store for re-rendering
    this.container.innerHTML = '';

    // Filter history based on verbose setting
    const filteredHistory = this.isVerbose
      ? history
      : history.filter((item) => {
          // Only show completed tasks when not verbose
          return item.type === 'card.completed';
        });

    filteredHistory.forEach((item) => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';

      const action = document.createElement('div');
      action.textContent = item.action;

      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      timestamp.textContent = Utils.formatTimestamp(item.timestamp);

      historyItem.appendChild(action);
      historyItem.appendChild(timestamp);
      this.container.appendChild(historyItem);
    });

    // Show empty state if no items
    if (filteredHistory.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.textAlign = 'center';
      emptyState.style.color = '#999';
      emptyState.style.padding = '2rem';
      emptyState.textContent = this.isVerbose ? 'No history yet' : 'No completed tasks yet';
      this.container.appendChild(emptyState);
    }
  }
}

class SidePanelView {
  constructor() {
    this.deckTitle = document.getElementById('deck-title');
    this.cardList = document.getElementById('card-list');
    this.cardInput = document.getElementById('card-input');
    this.addCardBtn = document.getElementById('add-card-btn');
    this.cardPosition = document.getElementById('card-position');
    this.editDeckBtn = document.getElementById('edit-deck-btn');
    this.resetDeckBtn = document.getElementById('reset-deck-btn');
    this.cardInputSection = document.getElementById('card-input-section');
    this.cardCount = document.getElementById('card-count');
    this.deckControls = document.getElementById('deck-controls');
    this.recurrentToggle = document.getElementById('deck-recurrent-toggle');
    this.incompleteCount = document.getElementById('incomplete-count');
    this.completedCount = document.getElementById('completed-count');
    this.deckMeta = document.getElementById('deck-meta');
    this.deckStatusBadge = document.getElementById('deck-status-badge');
    this.deckDescription = document.getElementById('deck-description');
    this.deckInfoPanel = document.getElementById('deck-info-panel');
    this.deckDoneTextarea = document.getElementById('deck-done-textarea');
    this.deckNotesTextarea = document.getElementById('deck-notes-textarea');
    this.currentTab = 'incomplete';
    this.onInfoSave = null; // callback: (deckId, {done, notes}) => void

    // Setup tab handlers
    this.setupTabHandlers();
    this.setupInfoHandlers();
  }

  setupTabHandlers() {
    const tabs = document.querySelectorAll('.card-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        // Get the tab value from the clicked element or its parent
        const tabBtn = e.target.closest('.card-tab');
        if (!tabBtn) return;
        this.currentTab = tabBtn.dataset.tab;
        tabs.forEach((t) => t.classList.remove('active'));
        tabBtn.classList.add('active');

        // Re-render the current deck with the new tab
        const currentDeck = this.currentDeck;
        if (currentDeck) {
          this.render(currentDeck);
        }
      });
    });
  }

  setupInfoHandlers() {
    // Save done/notes on blur
    const saveField = (field) => {
      if (!this.currentDeck || !this.onInfoSave) return;
      const updates = {};
      updates[field] = field === 'done'
        ? this.deckDoneTextarea.value
        : this.deckNotesTextarea.value;
      this.onInfoSave(this.currentDeck.id, updates);
    };
    this.deckDoneTextarea.addEventListener('blur', () => saveField('done'));
    this.deckNotesTextarea.addEventListener('blur', () => saveField('notes'));
  }

  render(deck) {
    this.currentDeck = deck; // Store for tab switching

    if (!deck) {
      this.deckTitle.textContent = 'Select a deck';
      this.cardList.innerHTML = '';
      this.cardInput.disabled = true;
      this.cardPosition.disabled = true;
      this.addCardBtn.disabled = true;
      this.deckControls.classList.add('hidden');
      this.cardInputSection.classList.add('hidden');
      this.deckMeta.classList.add('hidden');
      this.incompleteCount.textContent = '';
      this.completedCount.textContent = '';
      this._showCardList();
      return;
    }

    this.deckTitle.textContent = deck.title;
    this.deckTitle.title = deck.title; // Full text on hover
    this.cardInput.disabled = false;
    this.cardPosition.disabled = false;
    this.addCardBtn.disabled = false;
    this.deckControls.classList.remove('hidden');
    this.cardInputSection.classList.remove('hidden');
    this.recurrentToggle.checked = deck.recurrent || false;

    // Deck metadata (status + description)
    const hasStatus = deck.status && deck.status.trim();
    const hasDesc = deck.description && deck.description.trim();
    if (hasStatus || hasDesc) {
      this.deckMeta.classList.remove('hidden');
      if (hasStatus) {
        this.deckStatusBadge.textContent = deck.status;
        this.deckStatusBadge.classList.remove('hidden');
      } else {
        this.deckStatusBadge.classList.add('hidden');
      }
      if (hasDesc) {
        this.deckDescription.textContent = deck.description;
        this.deckDescription.classList.remove('hidden');
      } else {
        this.deckDescription.classList.add('hidden');
      }
    } else {
      this.deckMeta.classList.add('hidden');
    }

    // Toggle between card list and info panel based on tab
    if (this.currentTab === 'info') {
      this._showInfoPanel(deck);
      return;
    }
    this._showCardList();

    // Show/hide Reset button based on whether deck is recurrent
    this.resetDeckBtn.classList.toggle('hidden', !deck.recurrent);

    // Update counts
    const incompleteCount = deck.getIncompleteCount();
    const completedCount = deck.getCompletedCount();
    this.incompleteCount.textContent = incompleteCount > 0 ? incompleteCount : '';
    this.completedCount.textContent = completedCount > 0 ? completedCount : '';

    // Filter cards based on current tab (only show current cycle)
    const isCurrent = (card) => card.cycle === deck.currentCycle || card.cycle === undefined;
    const filteredCards = deck.cards.filter((card) => {
      if (this.currentTab === 'incomplete') {
        return !card.completed && isCurrent(card);
      } else {
        return card.completed && isCurrent(card);
      }
    });

    // Render card list
    this.cardList.innerHTML = '';
    filteredCards.forEach((card, index) => {
      const cardItem = document.createElement('div');
      cardItem.className = 'card-item' + (card.completed ? ' completed' : '');
      cardItem.dataset.cardId = card.id;
      cardItem.dataset.cardIndex = deck.cards.indexOf(card); // Use original index
      cardItem.draggable = true;

      cardItem.innerHTML = `
                <div class="card-content">
                    <div class="card-text" title="${card.text.replace(/"/g, '&quot;')}">${card.text}</div>
                    <div class="card-actions">
                        <button class="btn-small btn-complete" data-card-id="${card.id}">
                            ${card.completed ? 'Undo' : 'Complete'}
                        </button>
                        <button class="btn-small btn-edit" data-card-id="${card.id}">Edit</button>
                        <button class="btn-small btn-delete" data-card-id="${card.id}">Delete</button>
                    </div>
                </div>
            `;

      this.cardList.appendChild(cardItem);
    });

    // Show empty state if no cards in current tab
    if (filteredCards.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.textAlign = 'center';
      emptyState.style.color = '#999';
      emptyState.style.padding = '2rem';
      emptyState.textContent =
        this.currentTab === 'incomplete' ? 'No active tasks' : 'No completed tasks';
      this.cardList.appendChild(emptyState);
    }
  }

  _showCardList() {
    this.cardList.classList.remove('hidden');
    this.deckInfoPanel.classList.add('hidden');
  }

  _showInfoPanel(deck) {
    this.cardList.classList.add('hidden');
    this.deckInfoPanel.classList.remove('hidden');
    this.cardInputSection.classList.add('hidden');
    // Populate textareas (only if not currently focused to avoid clobbering user input)
    if (document.activeElement !== this.deckDoneTextarea) {
      this.deckDoneTextarea.value = deck.done || '';
    }
    if (document.activeElement !== this.deckNotesTextarea) {
      this.deckNotesTextarea.value = deck.notes || '';
    }
  }

  renderMultipleSelection(count) {
    this.currentDeck = null;
    this.deckTitle.textContent = `${count} decks selected`;
    this.deckTitle.title = '';
    this.cardList.innerHTML =
      '<div style="text-align: center; color: #666; padding: 2rem;">Multiple decks selected</div>';
    this.cardInput.disabled = true;
    this.cardPosition.disabled = true;
    this.addCardBtn.disabled = true;
    this.deckControls.classList.add('hidden');
    this.cardInputSection.classList.add('hidden');
    this.deckMeta.classList.add('hidden');
    this._showCardList();
    this.incompleteCount.textContent = '';
    this.completedCount.textContent = '';
  }
}

class DialogView {
  constructor(dialog, closeBtn) {
    this.dialog = dialog;
    this.closeBtn = closeBtn;

    this.closeBtn.addEventListener('click', () => this.hide());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.hide();
      }
    });
  }

  show() {
    this.dialog.classList.remove('hidden');
  }

  hide() {
    this.dialog.classList.add('hidden');
  }
}

class ContextMenuView {
  constructor(menu) {
    this.menu = menu;
    this.currentDeckId = null;

    // Hide menu when clicking outside
    document.addEventListener('click', () => this.hide());
  }

  show(x, y, deckId, hasActiveTasks = false) {
    this.currentDeckId = deckId;

    // Show/hide task-related menu items based on whether deck has active tasks
    const taskItems = this.menu.querySelectorAll('.menu-task-section');
    taskItems.forEach((item) => {
      if (hasActiveTasks) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });

    // Show menu first to get its dimensions
    this.menu.classList.remove('hidden');

    // Get menu dimensions
    const menuRect = this.menu.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate position, adjusting if menu would go off-screen
    let left = x;
    let top = y;

    // Adjust horizontal position if menu would go off right edge
    if (left + menuWidth > viewportWidth) {
      left = x - menuWidth;
    }

    // Adjust vertical position if menu would go off bottom edge
    if (top + menuHeight > viewportHeight) {
      top = y - menuHeight;
    }

    // Ensure menu doesn't go off left or top edges
    left = Math.max(0, left);
    top = Math.max(0, top);

    // Apply calculated position
    this.menu.style.left = left + 'px';
    this.menu.style.top = top + 'px';
  }

  hide() {
    this.menu.classList.add('hidden');
    this.currentDeckId = null;
  }

  onAction(callback) {
    this.menu.querySelectorAll('.menu-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        if (this.currentDeckId && action) {
          callback(action, this.currentDeckId);
        }
        this.hide();
      });
    });
  }
}

// Deck Creation Dialog View
class DeckCreationDialogView {
  constructor() {
    this.dialog = document.getElementById('deck-creation-dialog');
    this.form = document.getElementById('deck-creation-form');
    this.nameInput = document.getElementById('deck-name');
    this.descriptionInput = document.getElementById('deck-description-input');
    this.statusInput = document.getElementById('deck-status-input');
    this.colorInput = document.getElementById('deck-color');
    this.colorPreview = document.getElementById('color-preview');
    this.colorPalette = document.getElementById('color-palette');
    this.stalingRateInput = document.getElementById('deck-staling-rate');
    this.maxStalenessInput = document.getElementById('deck-max-staleness');
    this.recurrentCheckbox = document.getElementById('deck-recurrent');
    this.cancelBtn = document.getElementById('cancel-deck-btn');
    this.dialogTitle = this.dialog.querySelector('h2');
    this.submitBtn = this.form.querySelector('button[type="submit"]');
    this.callback = null;
    this.editingDeckId = null;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Form submission
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Cancel button
    this.cancelBtn.addEventListener('click', () => {
      this.hide();
    });

    // Color change
    this.colorInput.addEventListener('input', (e) => {
      this.colorPreview.textContent = e.target.value;
    });

    // Close on backdrop click
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.hide();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.dialog.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  show(callback, existingColors = [], editingDeck = null) {
    this.callback = callback;
    this.editingDeckId = editingDeck ? editingDeck.id : null;

    // Update dialog for create or edit mode
    if (editingDeck) {
      this.dialogTitle.textContent = 'Edit Deck';
      this.submitBtn.textContent = 'Save Changes';
      this.nameInput.value = editingDeck.title;
      this.descriptionInput.value = editingDeck.description || '';
      this.statusInput.value = editingDeck.status || '';
      this.colorInput.value = editingDeck.color;
      this.colorPreview.textContent = editingDeck.color;
      this.stalingRateInput.value = editingDeck.stalingRate || 0;
      this.maxStalenessInput.value = editingDeck.maxStaleness ?? 60;
      this.recurrentCheckbox.checked = editingDeck.recurrent || false;
      // Set the shape radio button
      const shapeRadio = this.form.querySelector(
        `input[name="deck-shape"][value="${editingDeck.shape}"]`
      );
      if (shapeRadio) shapeRadio.checked = true;
    } else {
      this.dialogTitle.textContent = 'Create New Deck';
      this.submitBtn.textContent = 'Create Deck';
      this.form.reset();
      this.colorPreview.textContent = '#4a5568';
      this.stalingRateInput.value = 0;
      this.maxStalenessInput.value = 60;
      this.recurrentCheckbox.checked = false;
    }

    this.dialog.classList.remove('hidden');
    this.populateColorPalette(existingColors);
    this.nameInput.focus();
  }

  populateColorPalette(colors) {
    this.colorPalette.innerHTML = '';

    // Get unique colors
    const uniqueColors = [...new Set(colors)];

    if (uniqueColors.length === 0) return;

    // Add label
    const label = document.createElement('div');
    label.textContent = 'Recent colors:';
    label.style.fontSize = '0.85rem';
    label.style.color = '#666';
    label.style.marginBottom = '8px';
    label.style.width = '100%';
    this.colorPalette.appendChild(label);

    // Create color swatches
    uniqueColors.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      swatch.title = color;

      swatch.addEventListener('click', () => {
        this.colorInput.value = color;
        this.colorPreview.textContent = color;

        // Update selected state
        this.colorPalette.querySelectorAll('.color-swatch').forEach((s) => {
          s.classList.remove('selected');
        });
        swatch.classList.add('selected');
      });

      this.colorPalette.appendChild(swatch);
    });
  }

  hide() {
    this.dialog.classList.add('hidden');
    this.callback = null;
  }

  handleSubmit() {
    const name = this.nameInput.value.trim();
    const shape = document.querySelector('input[name="deck-shape"]:checked').value;
    const color = this.colorInput.value;
    const recurrent = this.recurrentCheckbox.checked;
    const description = this.descriptionInput.value.trim();
    const status = this.statusInput.value.trim();
    const stalingRate = parseFloat(this.stalingRateInput.value) || 0;
    const maxStaleness = parseFloat(this.maxStalenessInput.value) || 60;

    if (name && this.callback) {
      const deckData = {
        title: name,
        shape: shape,
        color: color,
        recurrent: recurrent,
        description: description,
        status: status,
        stalingRate: stalingRate,
        maxStaleness: maxStaleness,
      };

      // Include deck ID if editing
      if (this.editingDeckId) {
        deckData.id = this.editingDeckId;
      }

      this.callback(deckData);
      this.hide();
    }
  }
}
