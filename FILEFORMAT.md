# MinFlow File Format Reference

This document describes the MinFlow workspace file format and the `LocalAPI` interface for manipulating it. It is intended as a reference for LLMs generating or transforming MinFlow data.

## Storage

Data is stored as a single JSON object. In the Electron app, it lives in `localStorage` under the key `minflow-workspace`. The same JSON shape is used for export/import files.

## Top-Level Structure

```json
{
  "version": "1.0.0",
  "workspace": { ... },
  "decks": [ ... ],
  "history": [ ... ],
  "metadata": { ... }
}
```

All five top-level keys are required.

### `version` (string, required)

Always `"1.0.0"`. Used for future migration logic.

### `workspace` (object, required)

```json
{
  "id": "m1a2b3c4d5e",
  "name": "My Workspace",
  "created": "2026-02-19T08:00:00.000Z",
  "updated": "2026-02-19T09:30:00.000Z",
  "settings": {
    "autosave": true,
    "autosaveInterval": 30000
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique workspace identifier |
| `name` | string | yes | Display name |
| `created` | ISO 8601 string | yes | Creation timestamp |
| `updated` | ISO 8601 string | yes | Last modification timestamp |
| `settings` | object | yes | App settings |
| `settings.autosave` | boolean | yes | Whether autosave is enabled |
| `settings.autosaveInterval` | number | yes | Autosave interval in milliseconds |

### `decks` (array, required)

Array of deck objects. May be empty (`[]`).

#### Deck Object

```json
{
  "id": "m1a2b3xyz",
  "title": "Sprint Tasks",
  "shape": "rectangle",
  "color": "#667eea",
  "position": { "x": 150.5, "y": 200.0 },
  "size": { "width": 120, "height": 120 },
  "cards": [ ... ],
  "created": "2026-02-19T08:00:00.000Z",
  "updated": "2026-02-19T09:00:00.000Z",
  "visible": true,
  "recurrent": false,
  "currentCycle": 0,
  "description": "Two-week sprint for auth feature",
  "status": "active",
  "done": "- Designed login page\n- Set up OAuth provider",
  "notes": "## Open Questions\n- SSO support needed?"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique deck identifier |
| `title` | string | yes | Deck display name |
| `shape` | string | yes | One of: `"rectangle"`, `"circle"`, `"hexagon"`, `"pentagon"`, `"octagon"` |
| `color` | string | yes | CSS hex color (e.g. `"#667eea"`) |
| `position` | object | yes | Canvas coordinates |
| `position.x` | number | yes | X coordinate (pixels from left) |
| `position.y` | number | yes | Y coordinate (pixels from top) |
| `size` | object | yes | Deck dimensions |
| `size.width` | number | yes | Width in pixels |
| `size.height` | number | yes | Height in pixels |
| `cards` | array | yes | Array of card objects (may be empty) |
| `created` | ISO 8601 string | yes | Creation timestamp |
| `updated` | ISO 8601 string | yes | Last modification timestamp |
| `visible` | boolean | yes | Whether deck passes current filters (always `true` in saved files) |
| `recurrent` | boolean | yes | Whether the deck uses cycle-based recurrence |
| `currentCycle` | number | yes | Current cycle number (0 for non-recurrent or first cycle) |
| `description` | string | no | One-liner project overview. Default: `""` |
| `status` | string | no | Lifecycle status (e.g. `"idea"`, `"active"`, `"prototype"`, `"done"`). Freeform. Default: `""` |
| `done` | string | no | Completed milestones narrative (markdown). Default: `""` |
| `notes` | string | no | Open questions, references, misc context (markdown). Default: `""` |

#### Card Object

```json
{
  "id": "m1a2b3abc",
  "text": "Implement login page",
  "completed": false,
  "cycle": 0,
  "type": "task",
  "created": "2026-02-19T08:05:00.000Z",
  "updated": "2026-02-19T08:05:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique card identifier |
| `text` | string | yes | Card/task text content |
| `completed` | boolean | yes | Whether the task is done |
| `cycle` | number | yes | Which cycle this card belongs to (matters for recurrent decks) |
| `type` | string | no | Card type: `"task"` (default), `"question"`, `"note"`, `"milestone"`. Freeform. |
| `created` | ISO 8601 string | yes | Creation timestamp |
| `updated` | ISO 8601 string | yes | Last modification timestamp |
| `parentCardId` | string | no | If this card was cloned from a previous cycle, the source card's ID |

### `history` (array, required)

Array of history entry objects. May be empty. Capped at 100 entries (oldest dropped first).

```json
{
  "action": "Created deck: Sprint Tasks",
  "type": "deck.created",
  "timestamp": "2026-02-19T08:00:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | yes | Human-readable description of what happened |
| `type` | string | no | Machine-readable event type (see list below) |
| `timestamp` | ISO 8601 string | yes | When the action occurred |

**Known history types:** `deck.created`, `deck.updated`, `deck.deleted`, `deck.cycle.started`, `deck.cycle.reset`, `card.created`, `card.updated`, `card.completed`, `card.uncompleted`, `card.deleted`, `history.cleared`, `general`

### `metadata` (object, required)

```json
{
  "lastSaved": "2026-02-19T09:30:00.000Z",
  "selectedDeckId": null,
  "notes": "<p>My notes here</p>",
  "darkMode": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lastSaved` | ISO 8601 string | yes | When the file was last written |
| `selectedDeckId` | string or null | yes | ID of the currently selected deck, or `null` |
| `notes` | string | no | HTML content for the notes editor |
| `darkMode` | boolean | no | Dark mode preference |

## ID Generation

IDs are generated via `Utils.generateId()`:

```js
Date.now().toString(36) + Math.random().toString(36).substr(2)
```

This produces strings like `"m1a2b3c4d5e"`. Any unique string works as an ID.

## Recurrent Decks

When `deck.recurrent === true`, the deck uses a cycle system:

- Each card has a `cycle` number matching the deck's `currentCycle` when created.
- **New cycle** (`currentCycle` increments): all cards from the current cycle are cloned as `completed: false` with the new cycle number. The `parentCardId` field links back to the source card. Old cards remain in the array.
- **Reset cycle**: same as new cycle — increment, clone all current-cycle cards as incomplete.
- The UI only shows cards matching `deck.currentCycle` as "active". Older-cycle cards remain in the array as historical data.

## LocalAPI Methods

The `LocalAPI` class in `js/local-api.js` provides all data operations. All mutation methods are `async` (return Promises). Every mutation triggers an `onChange` callback that refreshes the UI.

### Workspace

| Method | Signature | Description |
|--------|-----------|-------------|
| `getWorkspace()` | `() -> data` | Returns the full top-level object |
| `updateWorkspace(workspace)` | `(obj) -> data` | Merges `workspace.workspace` and `workspace.metadata` into stored data |
| `updateSettings(settings)` | `(obj) -> data` | Merges into `workspace.settings` |
| `updateNotes(notes)` | `(string) -> data` | Sets `metadata.notes` |

### Decks

| Method | Signature | Description |
|--------|-----------|-------------|
| `getDecks()` | `() -> deck[]` | Returns the decks array |
| `getDeck(deckId)` | `(string) -> deck` | Returns a single deck (throws if not found) |
| `createDeck(deckData)` | `(obj) -> deck` | Creates a deck. Accepts `{ title, shape, color, position, size, recurrent, description, status, done, notes }` |
| `updateDeck(deckId, updates)` | `(string, obj) -> deck` | Updates `title`, `shape`, `color`, `recurrent`, `description`, `status`, `done`, `notes` fields |
| `deleteDeck(deckId)` | `(string) -> { success }` | Removes the deck |
| `moveDeck(deckId, x, y)` | `(string, num, num) -> deck` | Sets `position` |
| `resizeDeck(deckId, w, h)` | `(string, num, num) -> deck` | Sets `size` |

### Cards

| Method | Signature | Description |
|--------|-----------|-------------|
| `getCards(deckId)` | `(string) -> card[]` | Returns cards for a deck |
| `createCard(deckId, cardData)` | `(string, { text, type? }) -> card` | Adds a card. `type` defaults to `"task"` |
| `updateCard(deckId, cardId, updates)` | `(string, string, obj) -> card` | Updates `text`, `completed`, or `type` |
| `deleteCard(deckId, cardId)` | `(string, string) -> { success }` | Removes a card |
| `reorderCards(deckId, cardId, newIndex)` | `(string, string, num) -> card[]` | Moves card to new position |

### Recurrent Cycle Operations

These are called via the generic `request()` router:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/decks/{id}/new-cycle` | POST | Increment cycle, clone all current-cycle cards as incomplete |
| `/decks/{id}/reset-cycle` | POST | Same behavior as new-cycle |

### History

| Method | Signature | Description |
|--------|-----------|-------------|
| `getHistory()` | `() -> entry[]` | Returns history array |
| `clearHistory()` | `() -> { success }` | Clears history |

### Export / Import

| Method | Signature | Description |
|--------|-----------|-------------|
| `exportWorkspace()` | `() -> data` | Returns the full stored object |
| `importWorkspace(data)` | `(obj) -> data` | Validates and overwrites all stored data. Requires `decks` to be an array. |

## Generating a Valid File Programmatically

Minimal valid file:

```json
{
  "version": "1.0.0",
  "workspace": {
    "id": "w1",
    "name": "My Workspace",
    "created": "2026-01-01T00:00:00.000Z",
    "updated": "2026-01-01T00:00:00.000Z",
    "settings": { "autosave": true, "autosaveInterval": 30000 }
  },
  "decks": [],
  "history": [],
  "metadata": {
    "lastSaved": "2026-01-01T00:00:00.000Z",
    "selectedDeckId": null
  }
}
```

To add a deck with one card:

```json
{
  "decks": [
    {
      "id": "d1",
      "title": "My Deck",
      "shape": "rectangle",
      "color": "#667eea",
      "position": { "x": 100, "y": 100 },
      "size": { "width": 120, "height": 120 },
      "cards": [
        {
          "id": "c1",
          "text": "My task",
          "completed": false,
          "cycle": 0,
          "created": "2026-01-01T00:00:00.000Z",
          "updated": "2026-01-01T00:00:00.000Z"
        }
      ],
      "created": "2026-01-01T00:00:00.000Z",
      "updated": "2026-01-01T00:00:00.000Z",
      "visible": true,
      "recurrent": false,
      "currentCycle": 0
    }
  ]
}
```

## Constraints and Invariants

- All IDs must be unique strings (within their scope: deck IDs globally, card IDs within a deck).
- `deck.shape` must be one of the five valid shapes.
- `deck.color` should be a valid CSS hex color (`#RRGGBB`).
- `position.x`, `position.y` should be non-negative numbers.
- `size.width`, `size.height` must be positive numbers (minimum 10 in the UI).
- `card.cycle` should be `<= deck.currentCycle`.
- `metadata.selectedDeckId` must be `null` or match an existing deck ID.
- History is capped at 100 entries.
- Timestamps are ISO 8601 strings (e.g. `"2026-02-19T08:00:00.000Z"`).
