// CardManager — Card CRUD, drag-drop reordering, and inline editing

class CardManager {
  constructor({ api, getSelectedDeck, showLoading, hideLoading }) {
    this.api = api;
    this.getSelectedDeck = getSelectedDeck;
    this.showLoading = showLoading;
    this.hideLoading = hideLoading;
    this.draggedCard = null;
  }

  // Whether a card drag is in progress (checked by refreshWorkspace to avoid mid-drag refresh)
  isDragging() {
    return this.draggedCard !== null;
  }

  setupEventHandlers() {
    const cardList = document.getElementById('card-list');
    cardList.addEventListener('click', (e) => this.handleCardClick(e));
    cardList.addEventListener('dragstart', (e) => this.handleCardDragStart(e));
    cardList.addEventListener('dragover', (e) => this.handleCardDragOver(e));
    cardList.addEventListener('drop', (e) => this.handleCardDrop(e));
    cardList.addEventListener('dragend', (e) => this.handleCardDragEnd(e));
    cardList.addEventListener('dragleave', (e) => this.handleCardDragLeave(e));
  }

  async addNewCard() {
    const deck = this.getSelectedDeck();
    if (!deck) return;

    const cardInput = document.getElementById('card-input');
    const text = cardInput.value.trim();
    if (text) {
      this.showLoading('Adding card...');
      try {
        const position = document.getElementById('card-position').value;
        await this.api.createCard(deck.id, { text, position });
        cardInput.value = '';
      } catch (error) {
        console.error('Failed to create card:', error);
        alert('Failed to add card. Please try again.');
      } finally {
        this.hideLoading();
      }
    }
  }

  async completeTopTask(deckId) {
    this.showLoading('Completing task...');
    try {
      const deckData = await this.api.getDeck(deckId);
      const topCard = DeckQueries.getTopIncompleteCard(deckData.cards, deckData.currentCycle);
      if (!topCard) {
        this.hideLoading();
        return;
      }

      await this.api.updateCard(deckId, topCard.id, { completed: true });

      // Auto-cycle for recurrent decks is handled server-side in workspace-service
    } catch (error) {
      console.error('Failed to complete task:', error);
      alert('Failed to complete task. Please try again.');
    } finally {
      this.hideLoading();
    }
  }

  async deleteTopTask(deckId) {
    this.showLoading('Loading...');
    try {
      const deckData = await this.api.getDeck(deckId);
      const topCard = DeckQueries.getTopIncompleteCard(deckData.cards, deckData.currentCycle);
      this.hideLoading();
      if (!topCard) return;

      if (confirm(`Delete task: "${topCard.text}"?`)) {
        this.showLoading('Deleting task...');
        await this.api.deleteCard(deckId, topCard.id);
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task. Please try again.');
    } finally {
      this.hideLoading();
    }
  }

  // --- Click delegation ---

  async handleCardClick(e) {
    const deck = this.getSelectedDeck();
    if (!deck) return;

    if (e.target.classList.contains('btn-complete')) {
      const cardId = e.target.dataset.cardId;
      const card = deck.getCard(cardId);
      if (card) {
        this.showLoading(card.completed ? 'Marking as incomplete...' : 'Completing task...');
        try {
          await this.api.updateCard(deck.id, card.id, {
            completed: !card.completed,
          });
          // Auto-cycle for recurrent decks is handled server-side
        } catch (error) {
          console.error('Failed to toggle card:', error);
          alert('Failed to update card. Please try again.');
        } finally {
          this.hideLoading();
        }
      }
    }

    if (e.target.classList.contains('btn-delete')) {
      const cardId = e.target.dataset.cardId;
      const card = deck.getCard(cardId);
      if (card && confirm(`Delete card: "${card.text}"?`)) {
        this.showLoading('Deleting task...');
        try {
          await this.api.deleteCard(deck.id, cardId);
        } catch (error) {
          console.error('Failed to delete card:', error);
          alert('Failed to delete card. Please try again.');
        } finally {
          this.hideLoading();
        }
      }
    }

    if (e.target.classList.contains('btn-edit')) {
      const cardId = e.target.dataset.cardId;
      const card = deck.getCard(cardId);
      if (card) {
        this._showInlineEdit(deck, card, cardId, e.target);
      }
    }
  }

  _showInlineEdit(deck, card, cardId, targetBtn) {
    const cardItem = targetBtn.closest('.card-item');
    const cardContent = cardItem.querySelector('.card-content');

    const editForm = document.createElement('form');
    editForm.className = 'card-edit-form';
    editForm.innerHTML = `
      <input type="text" class="card-edit-input" value="${card.text.replace(/"/g, '&quot;')}" />
      <div class="card-edit-actions">
        <button type="submit" class="btn-small">Save</button>
        <button type="button" class="btn-small btn-cancel">Cancel</button>
      </div>
    `;

    cardContent.style.display = 'none';
    cardItem.appendChild(editForm);

    const input = editForm.querySelector('.card-edit-input');
    input.focus();
    input.select();

    const cancel = () => {
      cardItem.removeChild(editForm);
      cardContent.style.display = '';
    };

    editForm.addEventListener('submit', async (submitEvent) => {
      submitEvent.preventDefault();
      const newText = input.value.trim();

      if (newText && newText !== card.text) {
        this.showLoading('Updating task...');
        try {
          await this.api.updateCard(deck.id, cardId, { text: newText });
        } catch (error) {
          console.error('Failed to update card:', error);
          alert('Failed to update card. Please try again.');
        } finally {
          this.hideLoading();
        }
      } else {
        cancel();
      }
    });

    editForm.querySelector('.btn-cancel').addEventListener('click', cancel);

    input.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Escape') {
        cancel();
      }
    });
  }

  // --- Card drag-and-drop ---

  handleCardDragStart(e) {
    if (e.target.closest('button')) {
      e.preventDefault();
      return;
    }

    const cardItem = e.target.closest('.card-item');
    if (!cardItem) return;

    this.draggedCard = {
      element: cardItem,
      cardId: cardItem.dataset.cardId,
      startIndex: parseInt(cardItem.dataset.cardIndex),
    };

    cardItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', cardItem.innerHTML);
  }

  handleCardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!this.draggedCard) return;

    const cardList = e.target.closest('#card-list');
    if (!cardList) return;

    const cardItem = e.target.closest('.card-item');

    document.querySelectorAll('.card-item').forEach((item) => {
      item.classList.remove('drag-over');
    });
    document.querySelector('#card-list')?.classList.remove('drag-over-end');

    if (!cardItem) {
      const cards = cardList.querySelectorAll('.card-item');
      if (cards.length > 0) {
        const lastCard = cards[cards.length - 1];
        const lastCardRect = lastCard.getBoundingClientRect();
        if (e.clientY > lastCardRect.bottom) {
          cardList.classList.add('drag-over-end');
        }
      }
      return;
    }

    if (cardItem === this.draggedCard.element) return;

    const rect = cardItem.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    if (e.clientY < midpoint) {
      cardItem.classList.add('drag-over');
    } else {
      const nextCard = cardItem.nextElementSibling;
      if (nextCard && nextCard.classList.contains('card-item')) {
        nextCard.classList.add('drag-over');
      } else {
        cardList.classList.add('drag-over-end');
      }
    }
  }

  handleCardDragLeave(e) {
    const cardItem = e.target.closest('.card-item');
    if (cardItem) {
      cardItem.classList.remove('drag-over');
    }
  }

  async handleCardDrop(e) {
    e.preventDefault();
    if (!this.draggedCard) return;

    const deck = this.getSelectedDeck();
    if (!deck) return;

    const cardList = e.target.closest('#card-list');
    if (!cardList) return;

    let newIndex;
    const dropTarget = e.target.closest('.card-item');

    if (!dropTarget) {
      if (cardList.classList.contains('drag-over-end')) {
        newIndex = deck.cards.length - 1;
        if (this.draggedCard.startIndex < newIndex) {
          newIndex = deck.cards.length - 1;
        } else {
          newIndex = deck.cards.length;
        }
      } else {
        this.handleCardDragEnd(e);
        return;
      }
    } else {
      const rect = dropTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const dropIndex = parseInt(dropTarget.dataset.cardIndex);

      if (e.clientY < midpoint) {
        newIndex = dropIndex;
      } else {
        newIndex = dropIndex + 1;
      }

      if (this.draggedCard.startIndex < newIndex) {
        newIndex--;
      }
    }

    if (newIndex === this.draggedCard.startIndex) {
      this.handleCardDragEnd(e);
      return;
    }

    try {
      await this.api.reorderCards(deck.id, this.draggedCard.cardId, newIndex);
    } catch (error) {
      console.error('Failed to reorder cards:', error);
      alert('Failed to reorder cards. Please try again.');
    }

    this.handleCardDragEnd(e);
  }

  handleCardDragEnd(e) {
    if (this.draggedCard && this.draggedCard.element) {
      this.draggedCard.element.classList.remove('dragging');
    }

    document.querySelectorAll('.card-item').forEach((item) => {
      item.classList.remove('drag-over');
    });
    document.querySelector('#card-list')?.classList.remove('drag-over-end');

    this.draggedCard = null;
  }
}
