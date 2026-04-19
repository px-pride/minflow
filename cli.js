#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');

// Load .env file (KEY=VALUE lines, ignoring comments and blanks)
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const WorkspaceService = require('./workspace-service');


// --- Service init ---

const dataDir = process.env.MINFLOW_DATA_DIR || join(homedir(), '.config', 'minflow');
const service = new WorkspaceService(dataDir);

// --- Helpers ---

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function print(data, gf) {
  if (gf.compact) {
    process.stdout.write(JSON.stringify(data) + '\n');
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

function run(fn, gf) {
  try {
    const result = fn();
    print(result, gf);
  } catch (err) {
    die(err.message);
  }
}

// --- Command handlers ---

// Workspace
function workspaceGet(_pos, _flags, gf) {
  run(() => service.getWorkspace(), gf);
}

function workspaceUpdate(_pos, flags, gf) {
  const body = {};
  if (flags.name) body.workspace = { name: flags.name };
  if (flags.meta) body.metadata = JSON.parse(flags.meta);
  run(() => service.updateWorkspace(body), gf);
}

function workspaceSettings(_pos, flags, gf) {
  const settings = {};
  if (flags.autosave !== undefined) settings.autosave = flags.autosave;
  if (flags.interval) settings.autosaveInterval = Number(flags.interval);
  run(() => service.updateSettings(settings), gf);
}

function workspaceNotes(pos, _flags, gf) {
  if (!pos[0]) die('Usage: minflow workspace notes "<html string>"');
  run(() => service.updateNotes(pos[0]), gf);
}

// Decks
function deckList(_pos, _flags, gf) {
  run(() => service.getDecks(), gf);
}

function deckGet(pos, _flags, gf) {
  if (!pos[0]) die('Usage: minflow deck get <id>');
  run(() => service.getDeck(pos[0]), gf);
}

function deckCreate(pos, flags, gf) {
  if (!pos[0]) die('Usage: minflow deck create <title> [--shape ...] [--color ...]');
  const body = { title: pos[0] };
  if (flags.shape) body.shape = flags.shape;
  if (flags.color) body.color = flags.color;
  if (flags.recurrent) body.recurrent = true;
  if (flags.x && flags.y) body.position = { x: Number(flags.x), y: Number(flags.y) };
  if (flags.priority) body.priority = Number(flags.priority);
  else if (flags.width && flags.height)
    body.priority = Number(flags.width); // backward compat
  if (flags['staling-rate'] !== undefined) body.stalingRate = Number(flags['staling-rate']);
  if (flags['max-staleness'] !== undefined) body.maxStaleness = Number(flags['max-staleness']);
  for (const f of ['description', 'status', 'done', 'notes']) {
    if (flags[f]) body[f] = flags[f];
  }
  run(() => service.createDeck(body), gf);
}

function deckUpdate(pos, flags, gf) {
  if (!pos[0]) die('Usage: minflow deck update <id> [--title ...] [--shape ...]');
  const updates = {};
  for (const f of ['title', 'shape', 'color', 'description', 'status', 'done', 'notes']) {
    if (flags[f]) updates[f] = flags[f];
  }
  if (flags.recurrent !== undefined) updates.recurrent = flags.recurrent;
  if (flags.priority) updates.priority = Number(flags.priority);
  if (flags['staling-rate'] !== undefined) updates.stalingRate = Number(flags['staling-rate']);
  if (flags['max-staleness'] !== undefined) updates.maxStaleness = Number(flags['max-staleness']);
  run(() => service.updateDeck(pos[0], updates), gf);
}

function deckDelete(pos, _flags, gf) {
  if (!pos[0]) die('Usage: minflow deck delete <id>');
  run(() => service.deleteDeck(pos[0]), gf);
}

function deckMove(pos, _flags, gf) {
  if (!pos[0] || !pos[1] || !pos[2]) die('Usage: minflow deck move <id> <x> <y>');
  run(() => service.moveDeck(pos[0], Number(pos[1]), Number(pos[2])), gf);
}

function deckResize(pos, _flags, gf) {
  if (!pos[0] || !pos[1] || !pos[2]) die('Usage: minflow deck resize <id> <width> <height>');
  run(() => service.resizeDeck(pos[0], Number(pos[1]), Number(pos[2])), gf);
}

// Cards
function cardList(pos, _flags, gf) {
  if (!pos[0]) die('Usage: minflow card list <deck-id>');
  run(() => service.getCards(pos[0]), gf);
}

function cardAdd(pos, flags, gf) {
  if (!pos[0] || !pos[1]) die('Usage: minflow card add <deck-id> <text> --top|--bottom [--type ...]');
  if (!flags.top && !flags.bottom) die('Position required: --top or --bottom');
  const body = { text: pos[1], position: flags.top ? 'top' : 'bottom' };
  if (flags.type) body.type = flags.type;
  if (flags.priority) body.priority = Number(flags.priority);
  run(() => service.createCard(pos[0], body), gf);
}

function cardUpdate(pos, flags, gf) {
  if (!pos[0] || !pos[1])
    die('Usage: minflow card update <deck-id> <card-id> [--text ...] [--completed] [--type ...]');
  const updates = {};
  if (flags.text) updates.text = flags.text;
  if (flags.type) updates.type = flags.type;
  if (flags.completed) updates.completed = true;
  if (flags.uncompleted) updates.completed = false;
  if (flags.priority) updates.priority = Number(flags.priority);
  if (flags['clear-priority']) updates.priority = null;
  run(() => service.updateCard(pos[0], pos[1], updates), gf);
}

function cardDelete(pos, _flags, gf) {
  if (!pos[0] || !pos[1]) die('Usage: minflow card delete <deck-id> <card-id>');
  run(() => service.deleteCard(pos[0], pos[1]), gf);
}

function cardReorder(pos, _flags, gf) {
  if (!pos[0] || !pos[1] || !pos[2])
    die('Usage: minflow card reorder <deck-id> <card-id> <index>');
  run(() => service.reorderCards(pos[0], pos[1], Number(pos[2])), gf);
}

function cardDone(pos, _flags, gf) {
  if (!pos[0] || !pos[1]) die('Usage: minflow card done <deck-id> <card-id>');
  run(() => service.updateCard(pos[0], pos[1], { completed: true }), gf);
}

function cardUndoDone(pos, _flags, gf) {
  if (!pos[0] || !pos[1]) die('Usage: minflow card undo-done <deck-id> <card-id>');
  run(() => service.updateCard(pos[0], pos[1], { completed: false }), gf);
}

// Cycles
function cycleNew(pos, _flags, gf) {
  if (!pos[0]) die('Usage: minflow cycle new <deck-id>');
  run(() => service.startNewCycle(pos[0]), gf);
}

function cycleReset(pos, _flags, gf) {
  if (!pos[0]) die('Usage: minflow cycle reset <deck-id>');
  run(() => service.resetCycle(pos[0]), gf);
}

// Layout
function layoutCmd(_pos, flags, gf) {
  const opts = {};
  if (flags['group-by']) opts.groupBy = flags['group-by'];
  if (flags['sort-by']) opts.sortBy = flags['sort-by'];
  if (flags.padding) opts.padding = Number(flags.padding);
  if (flags.margin) opts.margin = Number(flags.margin);
  run(() => service.layoutDecks(opts), gf);
}

// History
function historyGet(_pos, _flags, gf) {
  run(() => service.getHistory(), gf);
}

function historyClear(_pos, _flags, gf) {
  run(() => service.clearHistory(), gf);
}

// Undo / Redo
function undoCmd(_pos, _flags, gf) {
  const result = service.undo();
  if (result === null) die('Nothing to undo');
  print(result, gf);
}

function redoCmd(_pos, _flags, gf) {
  const result = service.redo();
  if (result === null) die('Nothing to redo');
  print(result, gf);
}

function undoStatus(_pos, _flags, gf) {
  print({ canUndo: service.canUndo() }, gf);
}

function redoStatus(_pos, _flags, gf) {
  print({ canRedo: service.canRedo() }, gf);
}

// Export / Import
function exportWs(_pos, _flags, gf) {
  run(() => service.exportWorkspace(), gf);
}

function importWs(pos, _flags, gf) {
  let json;
  if (pos[0]) {
    try {
      const raw = readFileSync(pos[0], 'utf-8');
      json = JSON.parse(raw);
    } catch (err) {
      die(`Failed to read import file: ${err.message}`);
    }
  } else {
    die('Usage: minflow import <file>');
  }
  run(() => service.importWorkspace(json), gf);
}

// --- Dispatch table ---

const COMMANDS = {
  'workspace:get': { handler: workspaceGet, opts: {}, readOnly: true },
  'workspace:update': {
    handler: workspaceUpdate,
    opts: { name: { type: 'string' }, meta: { type: 'string' } },
  },
  'workspace:settings': {
    handler: workspaceSettings,
    opts: { autosave: { type: 'boolean' }, interval: { type: 'string' } },
  },
  'workspace:notes': { handler: workspaceNotes, opts: {} },
  'deck:list': { handler: deckList, opts: {}, readOnly: true },
  'deck:get': { handler: deckGet, opts: {}, readOnly: true },
  'deck:create': {
    handler: deckCreate,
    opts: {
      shape: { type: 'string' },
      color: { type: 'string' },
      recurrent: { type: 'boolean' },
      x: { type: 'string' },
      y: { type: 'string' },
      priority: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      'staling-rate': { type: 'string' },
      'max-staleness': { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string' },
      done: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  'deck:update': {
    handler: deckUpdate,
    opts: {
      title: { type: 'string' },
      shape: { type: 'string' },
      color: { type: 'string' },
      recurrent: { type: 'boolean' },
      priority: { type: 'string' },
      'staling-rate': { type: 'string' },
      'max-staleness': { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string' },
      done: { type: 'string' },
      notes: { type: 'string' },
    },
  },
  'deck:delete': { handler: deckDelete, opts: {} },
  'deck:move': { handler: deckMove, opts: {} },
  'deck:resize': { handler: deckResize, opts: {} },
  'card:list': { handler: cardList, opts: {}, readOnly: true },
  'card:add': { handler: cardAdd, opts: { type: { type: 'string' }, top: { type: 'boolean' }, bottom: { type: 'boolean' }, priority: { type: 'string' } } },
  'card:update': {
    handler: cardUpdate,
    opts: {
      text: { type: 'string' },
      completed: { type: 'boolean' },
      uncompleted: { type: 'boolean' },
      type: { type: 'string' },
      priority: { type: 'string' },
      'clear-priority': { type: 'boolean' },
    },
  },
  'card:delete': { handler: cardDelete, opts: {} },
  'card:reorder': { handler: cardReorder, opts: {} },
  'card:done': { handler: cardDone, opts: {} },
  'card:undo-done': { handler: cardUndoDone, opts: {} },
  'cycle:new': { handler: cycleNew, opts: {} },
  'cycle:reset': { handler: cycleReset, opts: {} },
  layout: {
    handler: layoutCmd,
    opts: {
      'group-by': { type: 'string' },
      'sort-by': { type: 'string' },
      padding: { type: 'string' },
      margin: { type: 'string' },
    },
    readOnly: true, // already does layout — don't double-run
  },
  history: { handler: historyGet, opts: {}, readOnly: true },
  'history:clear': { handler: historyClear, opts: {} },
  undo: { handler: undoCmd, opts: {} },
  redo: { handler: redoCmd, opts: {} },
  'undo:status': { handler: undoStatus, opts: {}, readOnly: true },
  'redo:status': { handler: redoStatus, opts: {}, readOnly: true },
  export: { handler: exportWs, opts: {}, readOnly: true },
  import: { handler: importWs, opts: {} },
};

// --- Help ---

function showHelp() {
  process.stdout.write(`MinFlow CLI — direct access to MinFlow workspace data

Usage: minflow <resource> <action> [args] [flags]

Reads/writes the workspace JSON file directly. No server required.

WORKSPACE
  workspace get                                Get full workspace state
  workspace update [--name x] [--meta '{...}'] Update workspace metadata
  workspace settings [--autosave] [--interval]  Update settings
  workspace notes "<html>"                     Update freeform notes

DECKS
  deck list                                    List all decks
  deck get <id>                                Get a single deck
  deck create <title> [options]                Create a deck
    --shape, --color, --recurrent, --x, --y, --priority,
    --staling-rate, --max-staleness,
    --description, --status, --done, --notes
  deck update <id> [options]                   Update a deck
    --title, --shape, --color, --recurrent, --priority,
    --staling-rate, --max-staleness,
    --description, --status, --done, --notes
  deck delete <id>                             Delete a deck
  deck move <id> <x> <y>                       Move deck on canvas
  deck resize <id> <width> <height>            Resize a deck (legacy)

CARDS
  card list <deck-id>                          List cards in a deck
  card add <deck-id> <text> [--type x]         Add a card
    --priority, --top, --bottom
  card update <deck-id> <card-id> [options]    Update a card
    --text, --completed, --uncompleted, --type, --priority,
    --clear-priority
  card delete <deck-id> <card-id>              Delete a card
  card reorder <deck-id> <card-id> <index>     Move card to position
  card done <deck-id> <card-id>                Mark card complete
  card undo-done <deck-id> <card-id>           Mark card incomplete

CYCLES
  cycle new <deck-id>                          Start a new cycle
  cycle reset <deck-id>                        Force-reset a cycle

LAYOUT
  layout [--group-by x] [--sort-by x] [--padding n] [--margin n]

HISTORY
  history                                      Show action history
  history clear                                Clear history

UNDO / REDO
  undo                                         Undo last mutation
  redo                                         Redo last undo
  undo status                                  Check if undo available
  redo status                                  Check if redo available

EXPORT / IMPORT
  export                                       Export workspace as JSON
  import <file>                                Import workspace from file

GLOBAL FLAGS
  --compact, -c    Compact JSON output
  --help, -h       Show this help

ENVIRONMENT
  MINFLOW_DATA_DIR           Workspace data directory (default: ~/.config/minflow)
`);
}

// --- Main ---

function main() {
  const argv = process.argv.slice(2);

  // Extract global flags
  const gf = { compact: false, help: false };
  const cleaned = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--compact' || argv[i] === '-c') {
      gf.compact = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      gf.help = true;
    } else {
      cleaned.push(argv[i]);
    }
  }

  if (gf.help && cleaned.length === 0) {
    showHelp();
    process.exit(0);
  }

  if (cleaned.length === 0) {
    showHelp();
    process.exit(0);
  }

  // Resolve command key: try two-token, then one-token
  const first = cleaned[0];
  const second = cleaned[1];
  let key, rest;

  if (second && COMMANDS[`${first}:${second}`]) {
    key = `${first}:${second}`;
    rest = cleaned.slice(2);
  } else if (COMMANDS[first]) {
    key = first;
    rest = cleaned.slice(1);
  } else {
    die(`Unknown command: ${cleaned.join(' ')}\nRun "minflow --help" for usage.`);
  }

  const cmd = COMMANDS[key];

  const { values, positionals } = parseArgs({
    args: rest,
    options: cmd.opts,
    allowPositionals: true,
  });

  cmd.handler(positionals, values, gf);

  // Auto-layout after every mutating command
  if (!cmd.readOnly) {
    try { service.layoutDecks(); } catch (_) { /* layout is best-effort */ }
  }
}

main();
