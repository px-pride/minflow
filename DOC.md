# MinFlow — Engineer's Guide

Welcome to MinFlow, a visual task management app built on Electron. This guide walks you through the codebase in the order you'd naturally encounter it: boot sequence, data flow, rendering, and interaction.

## The Big Picture

MinFlow has two processes communicating via IPC:

```
┌─────────────────────┐         IPC          ┌──────────────────────┐
│   Main Process      │◄────────────────────►│   Renderer Process   │
│                     │                       │                      │
│  workspace-service  │  invoke/handle        │  AppController       │
│  (JSON file I/O)    │  workspace-changed    │  ├─ CanvasInteraction│
│                     │                       │  ├─ CardManager      │
│  main.js            │                       │  ├─ NotesEditor      │
│  (IPC registration) │                       │  ├─ KeyboardManager  │
│                     │                       │  └─ PreferencesManager│
└─────────────────────┘                       └──────────────────────┘
```

**Main process** owns all data. The renderer never touches the filesystem directly. Every action (create deck, move deck, complete card) is an IPC `invoke` call that goes to `WorkspaceService`, which reads/writes a JSON file and pushes a `workspace-changed` notification back.

## Boot Sequence

### 1. `main.js` — Electron Entry Point

When Electron starts:
1. Creates a `WorkspaceService` instance pointing at the user data directory
2. Registers ~25 IPC handlers that delegate to service methods
3. Creates a `BrowserWindow` with `preload.js` and `contextIsolation: true`
4. If no data file exists on disk, sends a `migrate-request` event after the page loads (for one-time localStorage migration)

### 2. `preload.js` — The Bridge

This runs in a privileged context before the renderer's page scripts. It uses `contextBridge.exposeInMainWorld` to create `window.minflowAPI` — an object with ~25 async methods that wrap `ipcRenderer.invoke` calls. This is the renderer's only way to talk to the main process.

### 3. `js/app.js` — Renderer Bootstrap

A minimal IIFE that:
- Checks browser support (Canvas, ES6 features)
- Sets up a one-time migration handler (reads old localStorage data, sends to main process)
- Creates an `AppController` and calls `init()`

### 4. `AppController.init()` — The Orchestrator

This is where everything comes together:
1. Subscribes to `workspace-changed` events for live updates
2. Loads workspace data via IPC → parses into `AppData` model
3. Creates all view instances (canvas, history, side panel, dialogs)
4. Creates all sub-managers with dependency injection
5. Sets up event handlers (delegates to sub-managers)
6. Loads notes content and dark mode preference
7. Does the initial render

## Data Layer

### `workspace-service.js` — The Source of Truth

All data lives in a single JSON file. The critical method is `_mutate(fn)`:

```
_mutate(fn):
  1. Read current state from disk
  2. Snapshot it (for undo)
  3. Apply the mutation function
  4. Write back to disk
  5. Push undo snapshot, clear redo stack
  6. Notify all windows
```

This single choke point means every data change automatically gets undo support and multi-window sync. The service has explicit methods for each operation (`createDeck`, `updateCard`, `moveDeck`, etc.) rather than a URL-based router.

### `js/models.js` — Client-Side Data Models

The renderer deserializes JSON into rich model objects:

- **`AppData`**: Root container with `decks[]`, `history[]`, `metadata`. Has convenience methods like `getDeck(id)`, `getSelectedDeck()`, `selectDeck(id)`.
- **`Deck`**: Has `position`, `size`, `cards[]`, `shape`, `color`, `recurrent`, `currentCycle`. Uses `Object.defineProperty` to provide `deck.x`, `deck.y`, `deck.width`, `deck.height` as shortcuts to `deck.position.x`, etc.
- **`Card`**: Simple data class with `text`, `completed`, `cycle`.

These models are local to the renderer. When data changes, the renderer re-fetches from main process and rebuilds them.

## Rendering

### `js/views.js` — Pure Display Logic

**`CanvasView`** is the star. It:
- Auto-sizes the canvas to fit all decks (with minimum 800x600)
- Draws each visible deck with shape-specific rendering (uses `Utils.drawShape`)
- Applies area-normalization so all shapes look the same size (`SHAPE_SCALE_FACTORS`)
- Renders deck content (title, card count, top card preview) within shape-safe text areas
- Shows selection rectangles, resize handles, and recurrent indicators

**`SidePanelView`** renders the selected deck's card list with Active/Completed tabs.

**`HistoryView`** shows action history with a verbose toggle (non-verbose only shows completions).

### `AppController.render()` — The Pipeline

Every user action eventually calls `render()`, which updates all three panels:

```js
render():
  preferences.updateColorFilterOptions()  // refresh color dropdown
  views.canvas.render(appData, selectedDeckIds)
  views.history.render(appData.history)
  views.sidePanel.render(selectedDeck or multiSelectionCount)
```

## Interaction — The Sub-Managers

The old monolithic controller was split into focused modules. Each receives its dependencies via constructor injection — no globals, no singletons.

### `CanvasInteractionManager`

Owns all canvas mouse state: `dragState`, `resizeState`, `selectionState`, `selectedDeckIds`. It's a state machine:

- **Idle**: Hover logic (cursor changes, tooltips)
- **Dragging**: Single or multi-deck drag, clamped to canvas bounds
- **Resizing**: 1:1 aspect ratio resize from SE corner handle
- **Selecting**: Drag rectangle on empty canvas, AABB intersection to find covered decks

On mouse-up, it saves positions/sizes to the API and does a full render.

### `CardManager`

Handles everything in the side panel's card list:
- Click delegation: complete, delete, edit buttons identified by CSS class
- Inline edit: dynamically creates a form element, handles save/cancel/escape
- Drag-and-drop reorder: tracks dragged card, calculates drop index, calls `api.reorderCards`

### `NotesEditor`

Sets up the rich text notes editor: `document.execCommand`-based formatting, font family/size selects, color picker, auto-save with 1-second debounce.

### `KeyboardManager`

A generic shortcut registry. Call `register(key, modifiers, handler)` and it handles the dispatch. Cross-platform: treats Ctrl and Cmd the same via `ctrlKey || metaKey`. Ignores events in input fields and content-editable elements.

Current shortcuts: `Delete` (delete deck), `Escape` (deselect), `Ctrl+Z` (undo), `Ctrl+Shift+Z`/`Ctrl+Y` (redo).

### `PreferencesManager`

Owns the filter state (`color`, `shape`, `minSize`) and dark mode toggle. `applyFilters()` sets `deck.visible = true/false` on the in-memory model, then triggers a re-render.

## Undo/Redo

The undo system is snapshot-based, operating entirely in the main process:

1. Before every mutation, the current state is serialized and pushed onto `undoStack`
2. On undo: current state → `redoStack`, pop `undoStack` → write to disk, notify
3. On redo: current state → `undoStack`, pop `redoStack` → write to disk, notify

The renderer's `undo()`/`redo()` methods call the IPC endpoint, receive the restored state, rebuild `AppData`, re-apply filters, and re-render.

## REST API — External Access

When MinFlow starts, it also launches an HTTP server on `localhost:9100` (configurable via `MINFLOW_API_PORT` env var). Any program can call it.

### Quick Start

```bash
# Get full workspace
curl http://localhost:9100/api/workspace

# Create a deck
curl -X POST http://localhost:9100/api/decks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Groceries", "shape": "circle", "color": "#ff6b6b"}'

# Add a card to a deck (use the deck ID from the response above)
curl -X POST http://localhost:9100/api/decks/DECK_ID/cards \
  -H 'Content-Type: application/json' \
  -d '{"text": "Buy milk"}'

# Complete a card
curl -X PUT http://localhost:9100/api/decks/DECK_ID/cards/CARD_ID \
  -H 'Content-Type: application/json' \
  -d '{"completed": true}'

# Undo the last action
curl -X POST http://localhost:9100/api/undo

# Check undo availability
curl http://localhost:9100/api/undo/status
```

### Endpoint Reference

| Method | Route | Description |
|--------|-------|-------------|
| **Workspace** | | |
| GET | `/api/workspace` | Get full workspace data |
| PUT | `/api/workspace` | Update workspace |
| PUT | `/api/workspace/settings` | Update settings |
| PUT | `/api/workspace/notes` | Update notes (`{"notes": "..."}`) |
| **Decks** | | |
| GET | `/api/decks` | List all decks |
| GET | `/api/decks/:id` | Get single deck |
| POST | `/api/decks` | Create deck (`{title, shape, color, recurrent, position, size}`) |
| PUT | `/api/decks/:id` | Update deck (`{title, shape, color, recurrent}`) |
| DELETE | `/api/decks/:id` | Delete deck |
| PUT | `/api/decks/:id/position` | Move deck (`{x, y}`) |
| PUT | `/api/decks/:id/size` | Resize deck (`{width, height}`) |
| **Cards** | | |
| GET | `/api/decks/:id/cards` | List cards in deck |
| POST | `/api/decks/:id/cards` | Add card (`{text}`) |
| PUT | `/api/decks/:id/cards/:cardId` | Update card (`{text}` or `{completed}`) |
| DELETE | `/api/decks/:id/cards/:cardId` | Delete card |
| PUT | `/api/decks/:id/cards/:cardId/reorder` | Reorder card (`{newIndex}`) |
| **Recurrent** | | |
| POST | `/api/decks/:id/new-cycle` | Start new cycle |
| POST | `/api/decks/:id/reset-cycle` | Reset cycle |
| **History** | | |
| GET | `/api/history` | Get action history |
| DELETE | `/api/history` | Clear history |
| **Export/Import** | | |
| GET | `/api/export` | Export full workspace JSON |
| POST | `/api/import` | Import workspace (full JSON body) |
| **Undo/Redo** | | |
| POST | `/api/undo` | Undo last action |
| POST | `/api/redo` | Redo last undone action |
| GET | `/api/undo/status` | Check if undo available (`{canUndo}`) |
| GET | `/api/redo/status` | Check if redo available (`{canRedo}`) |

### Error Responses

- **404**: Deck or card not found — `{"error": "Deck not found: abc123"}`
- **409**: Nothing to undo/redo — `{"error": "Nothing to undo"}`
- **500**: Other errors — `{"error": "..."}`

### Live Updates

When you modify data through the REST API, the MinFlow UI updates automatically. The `WorkspaceService._notify()` method pushes `workspace-changed` events to all renderer windows after every mutation. No polling needed.

## File Map

```
minflow-stableish/
├── main.js                      # Electron main process, IPC registration
├── preload.js                   # contextBridge IPC proxy
├── workspace-service.js         # Main-process data layer (JSON file, undo/redo)
├── api-server.js                # HTTP REST API server (Express)
├── index.html                   # Single-page app shell
├── css/styles.css               # All styles
├── js/
│   ├── utils.js                 # Shape drawing, color math, geometry, file I/O
│   ├── models.js                # Card, Deck, AppData data models
│   ├── views.js                 # CanvasView, HistoryView, SidePanelView, dialogs
│   ├── keyboard-manager.js      # Keyboard shortcut registry
│   ├── notes-editor.js          # Rich text notes editor
│   ├── preferences-manager.js   # Filters and dark mode
│   ├── canvas-interaction.js    # Canvas mouse interaction state machine
│   ├── card-manager.js          # Card CRUD and drag-drop
│   ├── controllers.js           # AppController coordinator (~400 lines)
│   └── app.js                   # Bootstrap entry point
├── DESIGN.md                    # Architecture and design decisions
├── DEV.md                       # Development journal
├── PSEUDOCODE.md                # Pseudocode flow of key algorithms
├── DOC.md                       # This file
├── ARCHITECTURE_AUDIT.md        # Pre-refactor architecture audit
└── commands.txt                 # How to launch the app
```
