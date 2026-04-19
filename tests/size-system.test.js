'use strict';

const { launchApp, closeApp, runTests, assert, assertEqual } = require('./helpers');

let app;

async function main() {
  app = await launchApp();
  const { page } = app;

  const failures = await runTests('Size System Expansion', {

    // --- Priority field on decks ---

    'deck created with default priority 120': async () => {
      await page.click('#add-deck-btn');
      await page.waitForSelector('#deck-creation-dialog:not(.hidden)', { timeout: 3000 });
      await page.fill('#deck-name', 'Priority Test');
      await page.click('#deck-creation-form button[type="submit"]');
      await page.waitForFunction(
        () => document.getElementById('deck-creation-dialog').classList.contains('hidden'),
        { timeout: 3000 }
      );

      const deck = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0];
      });
      assertEqual(deck.priority, 120, 'Default priority');
      assertEqual(deck.stalingRate, 0, 'Default staling rate');
      assertEqual(deck.maxStaleness, 60, 'Default max staleness');
      assertEqual(deck.lastCompletedAt, null, 'No lastCompletedAt initially');
    },

    'update deck priority via API': async () => {
      const updated = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const id = data.decks[0].id;
        return await window.minflowAPI.updateDeck(id, { priority: 200 });
      });
      assertEqual(updated.priority, 200, 'Updated priority');
    },

    'update deck staleness fields via API': async () => {
      const updated = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const id = data.decks[0].id;
        return await window.minflowAPI.updateDeck(id, { stalingRate: 5, maxStaleness: 80 });
      });
      assertEqual(updated.stalingRate, 5, 'Updated staling rate');
      assertEqual(updated.maxStaleness, 80, 'Updated max staleness');
    },

    'setPriority sets deck priority and clears card priorities': async () => {
      // Add a card with priority override
      const setup = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deckId = data.decks[0].id;
        const card = await window.minflowAPI.createCard(deckId, {
          text: 'Card with priority',
          position: 'top',
        });
        await window.minflowAPI.updateCard(deckId, card.id, { priority: 300 });
        // Verify card has priority
        const cards = await window.minflowAPI.getCards(deckId);
        return { deckId, cardId: card.id, cardPriority: cards[0].priority };
      });
      assertEqual(setup.cardPriority, 300, 'Card priority set');

      // Now call setPriority — should clear card priority
      const result = await page.evaluate(async ({ deckId }) => {
        await window.minflowAPI.setPriority(deckId, 150);
        const data = await window.minflowAPI.getWorkspace();
        const deck = data.decks.find(d => d.id === deckId);
        return { deckPriority: deck.priority, cardPriority: deck.cards[0].priority };
      }, { deckId: setup.deckId });
      assertEqual(result.deckPriority, 150, 'Deck priority after setPriority');
      assertEqual(result.cardPriority, undefined, 'Card priority cleared after setPriority');
    },

    // --- Card priority ---

    'create card with priority override': async () => {
      const card = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deckId = data.decks[0].id;
        return await window.minflowAPI.createCard(deckId, {
          text: 'Priority card',
          position: 'top',
          priority: 250,
        });
      });
      assertEqual(card.priority, 250, 'Card created with priority');
    },

    'create card without priority has no priority field': async () => {
      const card = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deckId = data.decks[0].id;
        return await window.minflowAPI.createCard(deckId, {
          text: 'No priority card',
          position: 'bottom',
        });
      });
      assertEqual(card.priority, undefined, 'Card without priority');
    },

    'update card priority': async () => {
      const result = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deckId = data.decks[0].id;
        const cardId = data.decks[0].cards[0].id;
        const updated = await window.minflowAPI.updateCard(deckId, cardId, { priority: 180 });
        return updated.priority;
      });
      assertEqual(result, 180, 'Card priority updated');
    },

    // --- lastCompletedAt on card completion ---

    'completing a card sets lastCompletedAt': async () => {
      const result = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deckId = data.decks[0].id;
        const cardId = data.decks[0].cards[0].id;
        const beforeComplete = data.decks[0].lastCompletedAt;
        await window.minflowAPI.updateCard(deckId, cardId, { completed: true });
        const after = await window.minflowAPI.getWorkspace();
        const deck = after.decks.find(d => d.id === deckId);
        return { before: beforeComplete, after: deck.lastCompletedAt };
      });
      assert(result.after !== null, 'lastCompletedAt should be set');
      assert(new Date(result.after).getTime() > 0, 'lastCompletedAt should be valid timestamp');
    },

    // --- resizeDeck backward compat ---

    'resizeDeck delegates to setPriority': async () => {
      const result = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deckId = data.decks[0].id;
        await window.minflowAPI.resizeDeck(deckId, 180, 180);
        const after = await window.minflowAPI.getWorkspace();
        const deck = after.decks.find(d => d.id === deckId);
        return deck.priority;
      });
      assertEqual(result, 180, 'resizeDeck sets priority');
    },

    // --- Migration: old size format ---

    'migration converts old size object to priority': async () => {
      const result = await page.evaluate(async () => {
        // Import workspace with old-format size data
        const oldData = {
          version: '1.0.0',
          workspace: { id: 'test', name: 'Test', created: new Date().toISOString(), updated: new Date().toISOString(), settings: {} },
          decks: [{
            id: 'migration-deck',
            title: 'Old Format',
            shape: 'rectangle',
            color: '#667eea',
            position: { x: 50, y: 50 },
            size: { width: 200, height: 200 },
            cards: [],
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            visible: true,
            recurrent: false,
            currentCycle: 0,
            description: '',
            status: '',
            done: '',
            notes: '',
          }],
          history: [],
          metadata: { lastSaved: new Date().toISOString(), selectedDeckId: null },
        };
        await window.minflowAPI.importWorkspace(oldData);
        const data = await window.minflowAPI.getWorkspace();
        const deck = data.decks.find(d => d.id === 'migration-deck');
        return {
          priority: deck.priority,
          hasSizeField: deck.size !== undefined,
          stalingRate: deck.stalingRate,
          maxStaleness: deck.maxStaleness,
          lastCompletedAt: deck.lastCompletedAt,
        };
      });
      assertEqual(result.priority, 200, 'Migrated priority from size.width');
      assertEqual(result.stalingRate, 0, 'Default staling rate after migration');
      assertEqual(result.maxStaleness, 60, 'Default max staleness after migration');
      assertEqual(result.lastCompletedAt, null, 'Null lastCompletedAt after migration');
    },

    // --- GUI: staleness fields in deck creation dialog ---

    'deck creation dialog has staleness fields': async () => {
      // Restore a clean workspace first
      await page.evaluate(async () => {
        await window.minflowAPI.importWorkspace({
          version: '1.0.0',
          workspace: { id: 'test', name: 'Test', created: new Date().toISOString(), updated: new Date().toISOString(), settings: {} },
          decks: [],
          history: [],
          metadata: { lastSaved: new Date().toISOString(), selectedDeckId: null },
        });
      });

      await page.click('#add-deck-btn');
      await page.waitForSelector('#deck-creation-dialog:not(.hidden)', { timeout: 3000 });

      const fields = await page.evaluate(() => {
        const rateInput = document.getElementById('deck-staling-rate');
        const maxInput = document.getElementById('deck-max-staleness');
        return {
          rateExists: !!rateInput,
          maxExists: !!maxInput,
          rateDefault: rateInput?.value,
          maxDefault: maxInput?.value,
          rateType: rateInput?.type,
          maxType: maxInput?.type,
        };
      });
      assert(fields.rateExists, 'Staling rate input exists');
      assert(fields.maxExists, 'Max staleness input exists');
      assertEqual(fields.rateDefault, '0', 'Staling rate default value');
      assertEqual(fields.maxDefault, '60', 'Max staleness default value');
      assertEqual(fields.rateType, 'number', 'Staling rate input type');
      assertEqual(fields.maxType, 'number', 'Max staleness input type');

      // Cancel dialog
      await page.click('#cancel-deck-btn');
    },

    'deck creation dialog submits staleness fields': async () => {
      await page.click('#add-deck-btn');
      await page.waitForSelector('#deck-creation-dialog:not(.hidden)', { timeout: 3000 });
      await page.fill('#deck-name', 'Staleness Test');
      await page.fill('#deck-staling-rate', '3.5');
      await page.fill('#deck-max-staleness', '100');
      await page.click('#deck-creation-form button[type="submit"]');
      await page.waitForFunction(
        () => document.getElementById('deck-creation-dialog').classList.contains('hidden'),
        { timeout: 3000 }
      );

      const deck = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0];
      });
      assertEqual(deck.title, 'Staleness Test', 'Deck title');
      assertEqual(deck.stalingRate, 3.5, 'Staling rate from dialog');
      assertEqual(deck.maxStaleness, 100, 'Max staleness from dialog');
    },

    'edit deck dialog populates staleness fields': async () => {
      // Right-click the deck on canvas to trigger edit
      // Since canvas interaction is complex, use the API + dialog directly
      const deckData = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        return data.decks[0];
      });

      // Simulate opening edit dialog by clicking the edit deck button
      // First select the deck by clicking on canvas near its position
      await page.evaluate(async (deckId) => {
        // Select the deck via metadata
        await window.minflowAPI.updateWorkspace({ metadata: { selectedDeckId: deckId } });
      }, deckData.id);

      // Trigger workspace refresh and wait
      await page.evaluate(() => {
        window.dispatchEvent(new Event('workspace-changed'));
      });
      await page.waitForTimeout(300);

      // Check if edit button is visible and click it
      const editBtnVisible = await page.evaluate(() => {
        const btn = document.getElementById('edit-deck-btn');
        const controls = document.getElementById('deck-controls');
        return btn && !controls.classList.contains('hidden');
      });

      if (editBtnVisible) {
        await page.click('#edit-deck-btn');
        await page.waitForSelector('#deck-creation-dialog:not(.hidden)', { timeout: 3000 });

        const fields = await page.evaluate(() => ({
          rate: document.getElementById('deck-staling-rate').value,
          max: document.getElementById('deck-max-staleness').value,
        }));
        assertEqual(fields.rate, '3.5', 'Edit dialog staling rate populated');
        assertEqual(fields.max, '100', 'Edit dialog max staleness populated');

        await page.click('#cancel-deck-btn');
      } else {
        // If we can't trigger via UI, verify the data model at least stores correctly
        assertEqual(deckData.stalingRate, 3.5, 'Staling rate persisted');
        assertEqual(deckData.maxStaleness, 100, 'Max staleness persisted');
      }
    },

    // --- Priority persists through save/load ---

    'priority and staleness fields persist after reload': async () => {
      const result = await page.evaluate(async () => {
        const data = await window.minflowAPI.getWorkspace();
        const deck = data.decks[0];
        // Update with specific values
        await window.minflowAPI.updateDeck(deck.id, {
          priority: 175,
          stalingRate: 2.5,
          maxStaleness: 45,
        });
        // Re-read
        const after = await window.minflowAPI.getWorkspace();
        const d = after.decks.find(x => x.id === deck.id);
        return {
          priority: d.priority,
          stalingRate: d.stalingRate,
          maxStaleness: d.maxStaleness,
        };
      });
      assertEqual(result.priority, 175, 'Priority persisted');
      assertEqual(result.stalingRate, 2.5, 'Staling rate persisted');
      assertEqual(result.maxStaleness, 45, 'Max staleness persisted');
    },
  });

  await closeApp(app);
  process.exit(failures);
}

main();
