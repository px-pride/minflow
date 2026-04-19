// Shared pure query functions for deck/card data.
// Used by both the renderer (models.js) and main process (workspace-service.js).

const DeckQueries = {
  // Does this card belong to the given cycle for display purposes?
  // Includes legacy cards (cycle === undefined) for backward compatibility.
  belongsToCycle(card, currentCycle) {
    return card.cycle === currentCycle || card.cycle === undefined;
  },

  findCard(cards, cardId) {
    return cards.find((c) => c.id === cardId);
  },

  getTopIncompleteCard(cards, currentCycle) {
    return cards.find((c) => !c.completed && DeckQueries.belongsToCycle(c, currentCycle));
  },

  getIncompleteCount(cards, currentCycle) {
    return cards.filter((c) => !c.completed && DeckQueries.belongsToCycle(c, currentCycle)).length;
  },

  getCompletedCount(cards, currentCycle) {
    return cards.filter((c) => c.completed && DeckQueries.belongsToCycle(c, currentCycle)).length;
  },

  hasIncompleteCards(cards, currentCycle) {
    return cards.some((c) => !c.completed && DeckQueries.belongsToCycle(c, currentCycle));
  },

  // Strict match — only cards with cycle === currentCycle (excludes legacy undefined).
  // Used for cycle operations (startNewCycle) where you clone/remove exact-cycle cards.
  getCurrentCycleCards(cards, currentCycle) {
    return cards.filter((c) => c.cycle === currentCycle);
  },

  // Shape area scaling factors — non-square shapes are scaled up so their
  // visible area matches the equivalent rectangle area.
  SHAPE_SCALE_FACTORS: {
    rectangle: 1.0,
    circle: 1.13,    // sqrt(4/pi)
    hexagon: 1.08,   // sqrt(4/3.46)
    pentagon: 1.08,   // sqrt(4/3.44)
    octagon: 1.1,    // sqrt(4/3.31)
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeckQueries;
}
