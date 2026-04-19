# MinFlow Development Journal

## 2026-02-24 — Architecture Refactor

### Audit

Performed a full architecture audit (see `ARCHITECTURE_AUDIT.md`). Key findings:

1. **Event handling**: Working correctly but contained in a 1577-line god controller. Canvas events, card events, keyboard events, notes editor, filter controls — all monolithic.
2. **API readiness**: The old `LocalAPI` (localStorage-backed) used a REST-like `request()` router. Controller called it via async methods, making it easy to swap. However, data lived in the renderer process, blocking any future multi-window or external API use.
3. **Undo/redo readiness**: All mutations already funneled through a `_mutate()` choke point. Snapshot-based undo was straightforward to bolt on.
4. **Bug found**: `handleCanvasDoubleClick` called `this.renameDeck()` which doesn't exist. Should be `this.editDeck()`.

### Phase 1 — Quick Fixes

- Fixed `renameDeck` → `editDeck` bug
- Moved geometry functions (`getResizeHandle`, `deckIntersectsRectangle`, `getDeckAtScaledPoint`) from controller to `Utils`
- Cleaned up dead code: `autosaveInterval`, `refreshDebounce`

### Phase 2 — IPC Service Layer

- Created `workspace-service.js` — main-process data layer backed by JSON file
  - All mutations go through `_mutate(fn)` which captures undo snapshots
  - `_notify()` pushes `workspace-changed` to all BrowserWindows
  - Flattened REST-like `request()` router into explicit methods
  - Added `undo()`, `redo()`, `canUndo()`, `canRedo()`
- Created `preload.js` — `contextBridge` proxy exposing `window.minflowAPI`
  - 17 CRUD channels + 4 undo/redo + 1 event channel + 1 migration channel
- Rewrote `main.js` — IPC handler registration, service instantiation
  - One-time migration: detects missing data file, sends `migrate-request` to renderer
- Updated renderer to use `window.minflowAPI` instead of `LocalAPI`
- Deleted `js/local-api.js`

### Phase 3 — Controller Decomposition

Extracted 5 sub-managers from the god controller:

| Module | File | Responsibility |
|--------|------|---------------|
| CanvasInteractionManager | `js/canvas-interaction.js` | Mouse handlers, drag/resize/select state machine |
| CardManager | `js/card-manager.js` | Card CRUD, drag-drop reorder, inline edit |
| NotesEditor | `js/notes-editor.js` | Rich text editor, auto-save, toolbar |
| KeyboardManager | `js/keyboard-manager.js` | Shortcut registration and dispatch |
| PreferencesManager | `js/preferences-manager.js` | Dark mode, filters |

Rewrote `js/controllers.js` as a slim ~400-line coordinator:
- Creates sub-managers in `initManagers()`
- Delegates event handling to sub-managers in `setupEventHandlers()`
- Keeps only coordination logic: render pipeline, deck CRUD dialogs, recurrence handling, export/import

### Phase 4 — Undo/Redo UI

- Wired `Ctrl+Z` → undo, `Ctrl+Shift+Z` / `Ctrl+Y` → redo via KeyboardManager
- `undo()` and `redo()` call `api.undo()`/`api.redo()`, reload AppData from the returned snapshot, re-apply filters, and re-render

### Bug Fixes Along the Way

- Fixed `renameDeck` → `editDeck` (TypeError on double-click)
- Fixed `appData.selectedDeckId` → `appData.metadata.selectedDeckId` (incorrect property path in hover logic)
- Fixed HistoryView non-verbose filter: was checking `item.type === 'card.updated'`, now correctly checks `item.type === 'card.completed'`
- Cleaned up dead code in `card-manager.js` `completeTopTask`
