# MinFlow Design Document

## Overview

MinFlow is a standalone Electron desktop application for visual task management. It uses a deck/card metaphor: decks are visual containers on a canvas, each holding multiple cards (tasks). Data persists in a JSON file managed by the main process via IPC.

## Architecture

### Technology Stack

- **Runtime**: Electron (Chromium + Node.js)
- **Frontend**: Pure HTML5, CSS3, JavaScript (ES6+)
- **Canvas Rendering**: HTML5 Canvas API
- **Data Storage**: JSON file in user data directory (main process)
- **IPC**: Electron `ipcMain.handle` / `ipcRenderer.invoke` via `contextBridge`
- **No Server**: Fully local, single-user application

### Design Patterns

- **MVC Architecture**: Clear separation between Models, Views, and Controllers
- **Service Layer**: `WorkspaceService` in the main process handles all data mutations
- **IPC Proxy**: `preload.js` exposes `window.minflowAPI` via `contextBridge`
- **Sub-Manager Delegation**: AppController delegates to specialized managers (canvas, cards, notes, keyboard, preferences)
- **Command Pattern**: All mutations go through `_mutate()` choke point, enabling undo/redo via snapshots
- **Singleton Pattern**: Single app controller instance
- **Factory Pattern**: Creation of decks and cards

## Component Structure

### Main Process

#### WorkspaceService (workspace-service.js)

Main-process data layer backed by a JSON file (`minflow-workspace.json` in `app.getPath('userData')`). All mutations go through `_mutate(fn)` which:
1. Loads current state from disk
2. Captures a snapshot for undo
3. Applies the mutation function
4. Saves to disk
5. Notifies all renderer windows via `workspace-changed` event

Includes full undo/redo support via snapshot stacks (max 50 depth).

#### Main Process Entry (main.js)

Creates BrowserWindow with `contextIsolation: true` and preload script. Registers all IPC handlers that delegate to WorkspaceService. Handles one-time localStorage-to-file migration.

#### Preload Script (preload.js)

Exposes `window.minflowAPI` via `contextBridge.exposeInMainWorld`. Maps 21+ async methods to `ipcRenderer.invoke` channels. Also exposes `onWorkspaceChanged` for push notifications from main process.

### Renderer Process

#### Models (js/models.js)

- **Card**: Individual task with text, completion status, cycle number, timestamps
- **Deck**: Container for cards with position, size, shape, color, recurrent flag, cycle counter. Uses `Object.defineProperty` for `x`/`y`/`width`/`height` convenience accessors.
- **AppData**: Root data model containing all decks, history, and application state

#### Views (js/views.js)

- **CanvasView**: Renders decks on the HTML5 canvas with shape-aware text layout and scaling
- **HistoryView**: Displays action history with verbose/non-verbose filtering
- **SidePanelView**: Shows selected deck details, card list with Active/Completed tabs
- **DialogView**: Manages modal dialogs (help)
- **ContextMenuView**: Handles right-click context menus with viewport-aware positioning
- **DeckCreationDialogView**: Deck creation/edit form with shape selector and color palette

#### Controller (js/controllers.js)

**AppController** is a slim coordinator (~400 lines) that:
- Initializes views and sub-managers
- Wires event handlers by delegating to sub-managers
- Handles deck CRUD dialogs, export/import, recurrent deck logic
- Orchestrates the `render()` pipeline (canvas + history + side panel)
- Provides undo/redo via `api.undo()` / `api.redo()`

#### Sub-Managers

- **CanvasInteractionManager** (js/canvas-interaction.js): Canvas mouse handlers, drag/resize/select state machine, multi-deck selection, cursor management
- **CardManager** (js/card-manager.js): Card CRUD, drag-drop reordering, inline editing, delegation-based click handling
- **NotesEditor** (js/notes-editor.js): Rich text editor setup, auto-save, toolbar, font controls, color picker
- **KeyboardManager** (js/keyboard-manager.js): Shortcut registration and dispatch, input element filtering, cross-platform modifier handling
- **PreferencesManager** (js/preferences-manager.js): Dark mode, filter controls (color, shape, size), filter application

#### Utilities (js/utils.js)

- Shape drawing and hit detection (all 5 shapes)
- Color manipulation (lighten, darken, brightness check)
- Coordinate transformations (`getCanvasCoordinates`)
- Geometry functions (`getResizeHandle`, `deckIntersectsRectangle`, `getDeckAtScaledPoint`)
- File download/upload helpers
- Timestamp formatting

#### Entry Point (js/app.js)

Minimal bootstrap: browser support check, one-time localStorage migration handler, create AppController, call init().

#### REST API Server (api-server.js)

Express HTTP server exposing all `WorkspaceService` methods as REST endpoints on `localhost:9100`. Lets external programs (scripts, CLI tools, other apps) call MinFlow's API. Created as a standalone module that receives the service instance — no business logic, pure routing.

## Key Features

### Visual Deck System

- 5 shape options: rectangle, circle, hexagon, pentagon, octagon
- Custom colors per deck with area-normalized scaling
- Drag to reposition, resize from corner handle
- Multi-select via drag rectangle on empty canvas
- Visual feedback for selection and hover

### Card Management

- Add/remove/edit cards within decks
- Toggle completion status
- Drag-and-drop reorder
- Active/Completed tab views
- Top incomplete card shown on deck shape

### Recurrent Decks

- Decks can be marked "recurrent"
- When all cards in current cycle are completed, a new cycle starts automatically
- New cycle clones all cards as incomplete
- Manual reset also available

### Undo/Redo

- Full snapshot-based undo/redo (max 50 levels)
- Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo)
- Snapshots captured automatically on every mutation

### REST API

- HTTP server on `localhost:9100` (configurable via `MINFLOW_API_PORT` env var)
- 27 REST endpoints covering all workspace, deck, card, history, and undo/redo operations
- JSON request/response format
- External programs can create decks, manage cards, trigger undo/redo, export/import
- UI updates in real-time when external changes are made (via existing `_notify()` mechanism)

### Data Persistence

- Every action saves immediately to JSON file via IPC
- Export workspace to JSON file
- Import workspace from JSON file
- One-time migration from localStorage on first launch
- Dark mode preference persists

### User Interface

- 3-panel layout: History/Notes, Canvas, Side Panel
- Context menus for deck operations
- Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, Delete, Escape)
- Help dialog
- Filter toolbar (color, shape, min size)
- Rich text notes editor

## Performance Considerations

- Canvas-based rendering for efficient deck display
- Deferred save: drag/resize updates are visual-only during interaction, saved on mouse-up
- History limited to 100 items
- Undo stack limited to 50 snapshots
- `workspace-changed` notifications for multi-window sync
