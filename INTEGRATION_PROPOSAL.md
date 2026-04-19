# Proposal: Integrating Project Status Into MinFlow's Data Model

## Problem

Two systems track project state, and they drift apart:

1. **Project status files** (`~/coding-projects/personal-assistant/projects/*.md`) — rich structured docs with status tags, overviews, "What's Done", "What's Next", open questions, and reference links.
2. **MinFlow decks and cards** — visual spatial board where decks represent projects and cards represent tasks. Visual properties encode metadata (size=priority, color=category, shape=type).

A "record-updater" agent tries to sync them, but it's inherently fragile. The fix: make MinFlow the single source of truth by extending its data model to hold what the project files currently hold.

---

## Current State of Deck/Card Metadata

### Deck fields (from `js/models.js` and `workspace-service.js`)

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Unique identifier |
| `title` | string | Project name |
| `shape` | string | Visual type — `rectangle`, `circle`, `hexagon`, `pentagon`, `octagon` |
| `color` | string | Hex color — encodes category by convention |
| `position` | `{x, y}` | Canvas coordinates |
| `size` | `{width, height}` | Encodes priority by convention (bigger = more important) |
| `cards` | array | Child task list |
| `visible` | boolean | Filter visibility |
| `recurrent` | boolean | Auto-repeat completed tasks |
| `currentCycle` | number | Cycle counter for recurrent decks |
| `created` | ISO string | Creation timestamp |
| `updated` | ISO string | Last modification timestamp |

### Card fields

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Unique identifier |
| `text` | string | Task description |
| `completed` | boolean | Done flag |
| `cycle` | number | Which recurrent cycle this belongs to |
| `parentCardId` | string? | Source card if cloned from previous cycle |
| `created` | ISO string | Creation timestamp |
| `updated` | ISO string | Last modification timestamp |

### Workspace-level metadata

The workspace has a `metadata.notes` field (HTML string) for freeform notes, plus `metadata.darkMode` and `metadata.selectedDeckId`. But **individual decks have no notes or description fields**.

### How updates work

- `workspace-service.js` uses **strict field whitelists**: `updateDeck()` only allows `['title', 'shape', 'color', 'recurrent']`, `updateCard()` only allows `['text', 'completed']`.
- Extra fields passed via the API are silently dropped.
- Every mutation snapshots full state for undo/redo (50-deep stack).
- Persistence is a single JSON file (`minflow-workspace.json` in Electron's userData dir).

---

## What Project Status Files Contain

Analyzing `flowcoder.md`, `minflow.md`, `tidbits.md`, and `music.md`, every file follows this structure:

| Section | Example Content | Already in MinFlow? |
|---------|----------------|---------------------|
| **Overview** | "Visual spatial task manager with draggable decks..." | No — deck has `title` only |
| **Repo** | `~/coding-projects/minflow-stableish` | No |
| **Status** | `PROTOTYPE`, `ACTIVE`, `PRODUCT VALIDATION`, `STARTING FROM SPEC` | No |
| **What's Done** | Narrative bullet list of completed milestones with context | Partially — completed cards exist, but lack narrative grouping |
| **What's Next** | Ordered list of upcoming work items | Yes — this IS the uncompleted cards |
| **Open Questions** | Unresolved decisions that block progress | No |
| **Reference** | Links to specs, design docs, related repos | No |
| **Custom sections** | "Weekly Workflow", "Content Strategy", etc. | No |

**Key observation**: Cards already handle "What's Next" well. The gap is everything else — the contextual, narrative information that frames the tasks.

---

## Proposed Data Model Changes

### 1. Add `description` to decks (string)

One-liner project overview. Maps directly to the "Overview" section.

```json
"description": "Visual spatial task manager with draggable decks and cards on a canvas."
```

- Short, stable, rarely changes. Not a notes field — a summary line.

### 2. Add `status` to decks (string)

Project lifecycle status. Maps to the "Status" tag in project files.

```json
"status": "prototype"
```

Suggested vocabulary (lowercase, machine-friendly):
- `idea` — Not started, just captured
- `planning` — Researching, speccing, designing
- `active` — In active development/execution
- `prototype` — Working but rough
- `stable` — Shipped, working, maintained
- `paused` — On hold intentionally
- `blocked` — Stuck on something
- `done` — Finished

This is a freeform string, not an enum — agents and humans can use whatever terms make sense. The vocabulary above is a convention, not a constraint.

### 3. Add `done` to decks (string, markdown)

Completed milestones narrative. Tracks what has been accomplished — the "What's Done" section from project files.

```json
"done": "- Electron conversion landed\n- 5 deck shapes with colors\n- REST API on port 9100\n- Import/export workspace to JSON"
```

This is separate from completed cards. Cards track individual task checkoffs; `done` tracks narrative milestones with context that doesn't fit in a card title.

### 4. Add `notes` to decks (string, markdown)

Supplementary context — open questions, references, repo links, and anything else that doesn't fit in `description`, `status`, `done`, or cards.

```json
"notes": "## Open Questions\n- Should MinFlow sync with Axi's project files?\n\n## Reference\n- Repo: ~/coding-projects/minflow-stableish"
```

Using markdown (not HTML) keeps it agent-friendly. Agents can read/write/parse markdown trivially. The workspace-level `metadata.notes` is HTML because it uses a rich-text editor, but deck notes are primarily for programmatic access, so markdown is the right format.

### 5. Add `type` to cards (string, optional)

Cards currently represent only tasks. Open questions from project files are actionable items that can be "resolved" — they're a natural fit for cards, but they're not tasks.

```json
{"text": "Should this be an Electron app?", "type": "question", "completed": false}
{"text": "Write the spec", "type": "task", "completed": false}
```

- Default: `"task"` (backward-compatible — all existing cards are tasks)
- Other values: `"question"`, `"note"`, `"milestone"`
- UI can render these differently (e.g., `?` icon for questions)
- Agents can filter by type

This is the most optional of the four changes. Open questions could go in deck `notes` instead. But making them cards means they show up on the board, can be completed/resolved, and participate in the task count.

---

## How This Maps to Project File Sections

| Project file section | MinFlow equivalent |
|---------------------|-------------------|
| Overview | `deck.description` |
| Repo | In `deck.notes` under `## Reference` |
| Status | `deck.status` |
| What's Done | `deck.done` (dedicated field) |
| What's Next | Uncompleted cards (already works) |
| Open Questions | Cards with `type: "question"` OR in `deck.notes` |
| Reference | In `deck.notes` under `## Reference` |
| Custom sections | In `deck.notes` under custom headings |

---

## What Changes in Code

The app uses strict whitelists, so changes are explicit and contained.

### Files to modify

1. **`js/models.js`** — Add `description`, `status`, `done`, `notes` to Deck constructor and `toJSON()`/`fromJSON()`. Add `type` to Card constructor.

2. **`workspace-service.js`** — Add new fields to:
   - Deck creation: include `description`, `status`, `done`, `notes` with defaults
   - `updateDeck()` allowedFields whitelist: add `'description', 'status', 'done', 'notes'`
   - Card creation: include `type` with default `"task"`
   - `updateCard()` allowedFields whitelist: add `'type'`

3. **`api-server.js`** — No changes needed. It passes request bodies through to WorkspaceService, which handles validation via allowedFields.

4. **`validate-workspace.js`** — Add type checking for new fields (all optional strings).

5. **`MINFLOW_API.md`** / **`FILEFORMAT.md`** — Document new fields.

6. **`main.js` (IPC handlers)** — Pass new fields through IPC (if not already pass-through).

### Migration

Existing workspaces work without changes — all new fields default to empty/null. No migration script needed. The validator should treat all new fields as optional.

### Estimated scope

~100-150 lines of code across 4-5 files. No architectural changes. No new tables/files/services.

---

## New API Endpoints

No new endpoints needed. Existing ones accept the new fields:

```bash
# Create a deck with project info
curl -X POST http://localhost:9100/api/decks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "MinFlow",
    "description": "Visual spatial task manager",
    "status": "prototype",
    "notes": "## What'\''s Done\n- Electron conversion\n- REST API\n\n## Open Questions\n- Data model integration?",
    "shape": "rectangle",
    "color": "#2452ae"
  }'

# Update just the status
curl -X PUT http://localhost:9100/api/decks/mlu4siud8 \
  -H 'Content-Type: application/json' \
  -d '{"status": "active"}'

# Add a question card
curl -X POST http://localhost:9100/api/decks/mlu4siud8/cards \
  -H 'Content-Type: application/json' \
  -d '{"text": "Should this sync with Axi?", "type": "question"}'
```

A **convenience endpoint** might be worth adding later:

```
GET /api/decks/:id/notes — get just the notes markdown
PUT /api/decks/:id/notes — update just the notes
```

But this is sugar, not required.

---

## How This Eliminates Project Status Files

Once these fields exist, the Axi agent workflow becomes:

1. **Reading project state**: `GET /api/workspace` returns everything — status, description, notes, tasks, questions — all in one call.
2. **Updating after work**: Agent calls `PUT /api/decks/:id` to update `status` and `notes`, then `POST /api/decks/:id/cards` to add new tasks. One API, one source of truth.
3. **No sync needed**: There's nothing to sync. The project file IS the MinFlow deck.

The `record-updater` agent becomes unnecessary. Agents that currently read project files would read from MinFlow instead.

---

## Trade-offs and Open Questions

### What this gets right
- **Minimal changes**: 3 new deck fields + 1 new card field. No new entity types, no new persistence layer.
- **Backward-compatible**: All new fields optional with sensible defaults. Existing workspaces load fine.
- **Agent-friendly**: Agents already use the MinFlow REST API. Adding `description`, `status`, `notes` to existing endpoints is zero-friction.
- **One source of truth**: Eliminates the dual-system problem entirely.

### What this doesn't solve
- **Narrative history**: "What's Done" in deck notes is a manually maintained list, not auto-generated from card completions. You could build auto-generation later, but for now it's manual (same as project files today).
- **Cross-project views**: "Show me all projects with status=blocked" requires iterating all decks. This is fine for ~25 decks but wouldn't scale to hundreds. A tag/filter index could be added later if needed.
- **Rich formatting in the UI**: Deck notes are markdown for agents. The UI could render them, but that's a UI feature, not a data model concern.

### Open questions for the user
1. **Should `status` be a freeform string or a closed enum?** Freeform is more flexible (agents can use any term). Enum is more consistent (UI can render status badges). Recommendation: freeform with a documented vocabulary convention.
2. **Should open questions be cards or notes?** Cards are more visible and completable. Notes are simpler. Could support both — some questions are deck-notes material, others are actionable and card-worthy.
3. **Should deck notes be markdown or HTML?** Markdown is agent-friendly and parseable. HTML matches the existing workspace notes editor. Recommendation: markdown (agents are the primary consumer).
4. **Should there be a `repo` field or just put it in notes?** A dedicated field makes it queryable. But it's only relevant for dev projects, not life/business decks. Recommendation: keep it in notes under `## Reference` for now. Add a field later if needed.
5. **Card `type` field — worth the complexity?** It enables a clean distinction between tasks, questions, and notes. But it adds a field to every card and the UI needs to handle it. Could defer this and put questions in deck notes instead.

---

## Recommended Implementation Order

1. Add `description` and `status` to decks — simplest, highest value
2. Add `notes` (markdown) to decks — biggest win, absorbs most project file content
3. (Optional) Add `type` to cards — nice-to-have for open questions
4. Migrate existing project file content into MinFlow decks via a one-time script
5. Update Axi agents to read/write MinFlow instead of project files
6. Retire project status files and the record-updater agent
