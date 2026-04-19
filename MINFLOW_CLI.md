# MinFlow CLI Reference

MinFlow is a visual task management app. It organizes work into **decks** (visual containers on a canvas) and **cards** (tasks inside decks). This document tells you everything you need to use the CLI.

## Connection

The CLI reads/writes the workspace JSON file directly. No server required.
The working directory must be in `MINFLOW_CLI_ALLOWED_DIRS` (set in `.env` or environment).

## Concepts

- **Workspace**: The root container. Has decks, history, metadata, and notes.
- **Deck**: A visual shape on the canvas. Has a title, shape, color, position, size, and cards. Can be "recurrent" (completed tasks auto-repeat).
- **Card**: A task inside a deck. Has text and a completed flag.
- Every mutation is undoable. Undo/redo stacks hold up to 50 snapshots.

## Common Workflows

### Create a deck and add tasks to it

```bash
# 1. Create a deck
minflow deck create "Sprint 12" --shape rectangle --color "#4a90d9"
# Output: {"id": "m1abc123", "title": "Sprint 12", ...}

# 2. Add cards (use the deck ID from step 1)
minflow card add m1abc123 "Design the login page"
minflow card add m1abc123 "Write unit tests"
```

### Complete a task

```bash
# Get the cards to find the card ID
minflow card list m1abc123
# Output: [{"id": "m1xyz789", "text": "Design the login page", "completed": false, ...}, ...]

# Mark it complete
minflow card done m1abc123 m1xyz789
```

### Read the full workspace state

```bash
minflow workspace get
```

Returns everything: all decks (with their cards), history, metadata, notes.

### Undo a mistake

```bash
minflow undo
```

---

## All Commands

### Workspace

- `minflow workspace get` — Get full workspace state.
- `minflow workspace update [--name x] [--meta '{...}']` — Update workspace metadata.
- `minflow workspace settings [--autosave] [--interval n]` — Update settings.
- `minflow workspace notes "<html>"` — Update freeform notes.

---

### Decks

- `minflow deck list` — List all decks.
- `minflow deck get <id>` — Get a single deck (includes its cards).
- `minflow deck create <title> [options]` — Create a new deck.
  Options: `--shape`, `--color`, `--recurrent`, `--x`, `--y`, `--width`, `--height`, `--description`, `--status`, `--done`, `--notes`
- `minflow deck update <id> [options]` — Update a deck's properties.
  Options: `--title`, `--shape`, `--color`, `--recurrent`, `--description`, `--status`, `--done`, `--notes`
- `minflow deck delete <id>` — Delete a deck and all its cards.
- `minflow deck move <id> <x> <y>` — Move a deck on the canvas.
- `minflow deck resize <id> <width> <height>` — Resize a deck.

Deck create options:
- `--shape` — `rectangle`, `circle`, `hexagon`, `pentagon`, or `octagon`. Default: `rectangle`
- `--color` — Hex color like `"#ff6b6b"`. Default: `"#667eea"`
- `--recurrent` — If set, completed tasks auto-repeat in cycles.
- `--description` — One-liner project overview.
- `--status` — Lifecycle status (`idea`, `planning`, `active`, `prototype`, `stable`, `paused`, `blocked`, `done`). Freeform.
- `--done` — Completed milestones narrative (markdown).
- `--notes` — Open questions, references, misc context (markdown).

---

### Cards

- `minflow card list <deck-id>` — List all cards in a deck.
- `minflow card add <deck-id> "<text>" [--type x]` — Add a card to a deck.
  Types: `task` (default), `question`, `note`, `milestone`. Freeform.
- `minflow card update <deck-id> <card-id> [options]` — Update a card.
  Options: `--text`, `--completed`, `--uncompleted`, `--type`
- `minflow card delete <deck-id> <card-id>` — Delete a card.
- `minflow card reorder <deck-id> <card-id> <index>` — Move a card to a new position (0 = top).
- `minflow card done <deck-id> <card-id>` — Mark card complete.
- `minflow card undo-done <deck-id> <card-id>` — Mark card incomplete.

---

### Recurrent Decks

Recurrent decks auto-repeat: when all cards in a cycle are completed, a new cycle starts with fresh copies. Old cycle cards are removed.

- `minflow cycle new <deck-id>` — Start a new cycle (removes current cards, creates fresh uncompleted copies).
- `minflow cycle reset <deck-id>` — Force-reset the cycle (same as new cycle).

---

### Layout

- `minflow layout [options]` — Auto-arrange all decks on the canvas.
  Options: `--group-by` (`color`, `shape`, `none`), `--sort-by` (`size`, `title`, `created`), `--padding n`, `--margin n`

---

### History

- `minflow history` — Show action history log.
- `minflow history clear` — Clear the history log.

---

### Undo / Redo

- `minflow undo` — Undo the last mutation.
- `minflow redo` — Redo the last undo.
- `minflow undo status` — Check if undo is available.
- `minflow redo status` — Check if redo is available.

---

### Export / Import

- `minflow export` — Export the full workspace as JSON.
- `minflow import <file>` — Replace the entire workspace with imported data.

---

## Global Flags

- `--compact, -c` — Compact JSON output (no pretty-printing).
- `--help, -h` — Show help.

## Environment

- `MINFLOW_CLI_ALLOWED_DIRS` — Comma-separated list of allowed directories (required). Supports `~` for home directory.
- `MINFLOW_DATA_DIR` — Workspace data directory (default: `~/.config/minflow`).

---

## Data Shapes

### Deck object
```json
{
  "id": "m1abc123",
  "title": "Sprint 12",
  "shape": "rectangle",
  "color": "#4a90d9",
  "position": {"x": 100, "y": 200},
  "size": {"width": 120, "height": 120},
  "cards": [],
  "visible": true,
  "recurrent": false,
  "currentCycle": 0,
  "description": "Two-week sprint for auth feature",
  "status": "active",
  "done": "- Designed login page\n- Set up OAuth provider",
  "notes": "## Open Questions\n- SSO support needed?",
  "created": "2026-02-25T12:00:00.000Z",
  "updated": "2026-02-25T12:00:00.000Z"
}
```

### Card object
```json
{
  "id": "m1xyz789",
  "text": "Design the login page",
  "completed": false,
  "cycle": 0,
  "type": "task",
  "created": "2026-02-25T12:00:00.000Z",
  "updated": "2026-02-25T12:00:00.000Z"
}
```

---

## Notes

- The MinFlow GUI auto-refreshes when the workspace file changes (via file watcher). CLI changes appear in the GUI immediately.
- All mutations are undoable (create, update, delete, move, resize, reorder, complete, import).
- IDs are generated strings like `"m1a2b3c4"`. Treat them as opaque.
