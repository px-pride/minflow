'use strict';

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_DIR = path.resolve(__dirname, '..');

async function launchApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minflow-test-'));

  const electronApp = await electron.launch({
    args: [APP_DIR],
    env: {
      ...process.env,
      MINFLOW_DATA_DIR: tmpDir,
    },
  });

  const page = await electronApp.firstWindow();
  // Wait for the app to fully initialize
  await page.waitForSelector('#main-canvas', { timeout: 10000 });

  return { electronApp, page, tmpDir };
}

async function closeApp({ electronApp, tmpDir }) {
  await electronApp.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Simple test runner
async function runTests(name, tests) {
  let passed = 0;
  let failed = 0;
  console.log(`\n=== ${name} ===\n`);

  for (const [testName, testFn] of Object.entries(tests)) {
    try {
      await testFn();
      console.log(`  PASS: ${testName}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${testName}`);
      console.log(`        ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return failed;
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

module.exports = { launchApp, closeApp, runTests, assert, assertEqual };
