'use strict';

const { launchApp, closeApp, runTests, assert, assertEqual } = require('./helpers');

let app;

async function main() {
  app = await launchApp();
  const { page } = app;

  // Create a deck and select it first
  await page.evaluate(async () => {
    await window.minflowAPI.createDeck({ title: 'Card Test Deck' });
  });
  // Refresh workspace to pick up the new deck
  await page.waitForTimeout(500);

  // Click on the deck to select it
  const deckPos = await page.evaluate(async () => {
    const data = await window.minflowAPI.getWorkspace();
    const d = data.decks[0];
    return { x: d.position.x + 60, y: d.position.y + 60 };
  });
  await page.click('#main-canvas', { position: deckPos });
  await page.waitForSelector('#deck-controls:not(.hidden)', { timeout: 3000 });

  const failures = await runTests('Card CRUD', {
    'add a card to the deck': async () => {
      await page.fill('#card-input', 'Test Card 1');
      await page.click('#card-form button[type="submit"]');
      await page.waitForTimeout(500);

      const cards = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards;
      });
      assertEqual(cards.length, 1, 'Card count');
      assertEqual(cards[0].text, 'Test Card 1', 'Card text');
      assert(!cards[0].completed, 'Card should be incomplete');
    },

    'card appears in the card list': async () => {
      const cardItems = page.locator('.card-item');
      const count = await cardItems.count();
      assert(count >= 1, `Should have at least 1 card item, got ${count}`);
    },

    'add a second card': async () => {
      await page.fill('#card-input', 'Test Card 2');
      await page.click('#card-form button[type="submit"]');
      await page.waitForTimeout(500);

      const cards = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards;
      });
      assertEqual(cards.length, 2, 'Card count after second add');
    },

    'complete a card via checkbox': async () => {
      // Click the first complete button
      const completeBtn = page.locator('.btn-complete').first();
      await completeBtn.click();
      await page.waitForTimeout(500);

      const cards = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards;
      });
      const completedCount = cards.filter((c) => c.completed).length;
      assertEqual(completedCount, 1, 'One card should be completed');
    },

    'incomplete count updates': async () => {
      const countText = await page.locator('#incomplete-count').textContent();
      assert(countText.includes('1'), `Incomplete count should show 1, got "${countText}"`);
    },

    'delete a card': async () => {
      page.on('dialog', (dialog) => dialog.accept());

      const deleteBtn = page.locator('.btn-delete').first();
      await deleteBtn.click();
      await page.waitForTimeout(500);

      const cards = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].cards;
      });
      assertEqual(cards.length, 1, 'Card count after delete');
    },
  });

  await closeApp(app);
  process.exit(failures);
}

main();
