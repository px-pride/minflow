'use strict';

const { launchApp, closeApp, runTests, assert, assertEqual } = require('./helpers');

let app;

async function main() {
  app = await launchApp();
  const { page } = app;

  // Create a recurrent deck with cards via API
  await page.evaluate(async () => {
    const deck = await window.minflowAPI.createDeck({ title: 'Recurrent Test', recurrent: true });
    await window.minflowAPI.createCard(deck.id, { text: 'Task A', position: 'bottom' });
    await window.minflowAPI.createCard(deck.id, { text: 'Task B', position: 'bottom' });
  });
  await page.waitForTimeout(500);

  const failures = await runTests('Recurrent Cycle', {
    'deck starts at cycle 0': async () => {
      const cycle = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].currentCycle;
      });
      assertEqual(cycle, 0, 'Initial cycle');
    },

    'has 2 incomplete cards': async () => {
      const count = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards.filter((c) => !c.completed).length;
      });
      assertEqual(count, 2, 'Incomplete card count');
    },

    'complete first card': async () => {
      await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deck = data.decks[0];
        const card = deck.cards.find((c) => !c.completed);
        await window.minflowAPI.updateCard(deck.id, card.id, { completed: true });
      });

      const incomplete = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards.filter((c) => !c.completed).length;
      });
      assertEqual(incomplete, 1, 'One card remaining after completing first');
    },

    'complete last card triggers auto-cycle': async () => {
      await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deck = data.decks[0];
        const card = deck.cards.find((c) => !c.completed);
        await window.minflowAPI.updateCard(deck.id, card.id, { completed: true });
      });
      await page.waitForTimeout(500);

      const result = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deck = data.decks[0];
        return {
          cycle: deck.currentCycle,
          cardCount: deck.cards.length,
          incompleteCount: deck.cards.filter((c) => !c.completed).length,
        };
      });

      assertEqual(result.cycle, 1, 'Cycle should advance to 1');
      assertEqual(result.cardCount, 2, 'Should have 2 fresh cards');
      assertEqual(result.incompleteCount, 2, 'All cards should be incomplete in new cycle');
    },

    'new cycle cards have correct cycle number': async () => {
      const cycles = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards.map((c) => c.cycle);
      });
      assert(cycles.every((c) => c === 1), `All cards should be cycle 1, got ${JSON.stringify(cycles)}`);
    },

    'card text preserved across cycles': async () => {
      const texts = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards.map((c) => c.text).sort();
      });
      assertEqual(texts[0], 'Task A', 'First card text');
      assertEqual(texts[1], 'Task B', 'Second card text');
    },
  });

  await closeApp(app);
  process.exit(failures);
}

main();
