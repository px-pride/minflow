'use strict';

const { launchApp, closeApp, runTests, assert, assertEqual } = require('./helpers');

let app;

async function main() {
  app = await launchApp();
  const { page } = app;

  const failures = await runTests('Deck CRUD', {
    'create a new deck via dialog': async () => {
      await page.click('#add-deck-btn');
      await page.waitForSelector('#deck-creation-dialog:not(.hidden)', { timeout: 3000 });
      await page.fill('#deck-name', 'Test Deck');
      await page.click('#deck-creation-form button[type="submit"]');
      // Wait for dialog to close (hidden class re-added)
      await page.waitForFunction(
        () => document.getElementById('deck-creation-dialog').classList.contains('hidden'),
        { timeout: 3000 }
      );
    },

    'deck appears in workspace': async () => {
      const deckCount = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks.length;
      });
      assertEqual(deckCount, 1, 'Should have 1 deck');
    },

    'deck has correct title': async () => {
      const title = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].title;
      });
      assertEqual(title, 'Test Deck', 'Deck title');
    },

    'update deck title via API': async () => {
      await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        await window.minflowAPI.updateDeck(data.decks[0].id, { title: 'Renamed Deck' });
      });

      const newTitle = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0].title;
      });
      assertEqual(newTitle, 'Renamed Deck', 'Updated deck title');
    },

    'delete deck': async () => {
      await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        await window.minflowAPI.deleteDeck(data.decks[0].id);
      });

      const remaining = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks.length;
      });
      assertEqual(remaining, 0, 'Deck count after delete');
    },
  });

  await closeApp(app);
  process.exit(failures);
}

main();
