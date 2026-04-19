'use strict';

const { launchApp, closeApp, runTests, assert } = require('./helpers');

let app;

async function main() {
  const failures = await runTests('App Launch', {
    'window opens with correct title': async () => {
      app = await launchApp();
      const title = await app.page.title();
      assert(title.includes('MinFlow'), `Title should contain "MinFlow", got "${title}"`);
    },

    'canvas element is visible': async () => {
      const canvas = app.page.locator('#main-canvas');
      await canvas.waitFor({ state: 'visible' });
      const box = await canvas.boundingBox();
      assert(box && box.width > 0, 'Canvas should have width');
      assert(box && box.height > 0, 'Canvas should have height');
    },

    'side panel is visible': async () => {
      const panel = app.page.locator('.side-panel');
      await panel.waitFor({ state: 'visible' });
    },

    'add deck button exists': async () => {
      const btn = app.page.locator('#add-deck-btn');
      await btn.waitFor({ state: 'visible' });
    },
  });

  if (app) await closeApp(app);
  process.exit(failures);
}

main();
