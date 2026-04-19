# MinFlow Architecture Audit

**Date:** 2026-02-24
**Scope:** Event handling, API readiness, undo/redo readiness
**Codebase:** 6 JS files, ~2,700 lines of application code

---

## 1. Event Handling System

### Overview

All event registration lives in `AppController.setupEventHandlers()` (`controllers.js:121–233`), with satellite setup methods for filters (`setupFilterControls()`, line 235), tabs (`setupTabControls()`, line 338), and the notes editor (`setupNotesEditor()`, line 357). Views also register their own listeners internally — `DeckCreationDialogView.setupEventHandlers()` (`views.js:737`), `ContextMenuView` constructor (`views.js:648`), `HistoryView` constructor (`views.js:430`), and `SidePanelView.setupTabHandlers()` (`views.js:505`).

### What's Working

- **Event delegation on card list.** Card clicks (complete, delete, edit) use delegation on `#card-list` (`controllers.js:192–193`) instead of per-card listeners. This is correct.
- **Context menu callback pattern.** `ContextMenuView.onAction()` (`views.js:704`) provides a clean callback interface. The controller registers once and the view dispatches.
- **Canvas events are centralized.** All six canvas listeners (mousedown, mousemove, mouseup, mouseleave, contextmenu, dblclick) are registered in one place (`controllers.js:132–138`).

### Architectural Problems

**1. God Controller — 1,648 lines, does everything.**

`AppController` is the event handler, state machine, business logic layer, and render coordinator all fused into one class. There is no separation between:
- Input handling (what the user did)
- State transitions (what should change)
- Side effects (API calls, DOM updates)
- Rendering (what to show)

For example, `handleCardClick()` (`controllers.js:828–945`) does all of the following in one function:
- Reads state from the model (`deck.getCard()`)
- Shows loading UI (`this.showLoading()`)
- Calls the API (`this.api.updateCard()`)
- Checks business rules (`deck.recurrent && !card.completed`)
- Creates DOM nodes with innerHTML (the inline edit form, lines 886–894)
- Registers new event listeners on dynamically created elements (lines 906, 931, 937)

This makes it impossible to test, reuse, or reason about any of these concerns independently.

**2. No event bus or command dispatch.**

Events go directly from DOM listener → handler method → inline business logic → API call → render. There's no intermediary like an event bus, command dispatcher, or action system. Every interaction is a bespoke chain of imperative code. This means:
- You can't intercept, log, or replay user actions.
- You can't batch related operations.
- Two features that need the same trigger require duplicating logic or creating awkward call chains.

**3. State is scattered across 7+ mutable properties on the controller.**

```
this.dragState        // controllers.js:7
this.resizeState      // controllers.js:8
this.draggedCard      // controllers.js:9
this.selectionState   // controllers.js:19
this.selectedDeckIds  // controllers.js:20
this.filters          // controllers.js:14–18
this.isLoading        // controllers.js:12
this.hasManuallyChangedEditorColor  // controllers.js:470 (set implicitly)
```

There's no state machine. `handleCanvasMouseMove()` (`controllers.js:581–733`) uses a 150-line if/else-if chain checking which state object is truthy to decide behavior. The states `dragState`, `resizeState`, and `selectionState` are mutually exclusive but nothing enforces that — it's just hoped that mouseDown sets only one.

**4. No cleanup of event listeners.**

`addEventListener` is called ~40 times across the codebase. `removeEventListener` is called zero times. If any view component is ever recreated, the old listeners leak. The inline edit form listeners (created in `handleCardClick`, line 906) are registered on elements that get destroyed on refresh, but the form itself is never explicitly torn down if a refresh happens mid-edit.

**5. handleCanvasMouseMove does too much.**

This single function (`controllers.js:581–733`) handles:
- Selection rectangle updates (lines 584–612)
- Single deck dragging (lines 627–640)
- Multi-deck dragging (lines 615–626)
- Resize with 4-direction calculations (lines 645–700)
- Hover cursor changes (lines 701–731)
- Tooltip text updates (lines 723–731)

It runs on every pixel of mouse movement with no throttling. During drags it calls `this.views.canvas.render()` directly (line 644), bypassing the full `this.render()` path — a performance optimization that creates an inconsistent render path.

**6. Keyboard shortcuts are trivially hardcoded.**

`handleKeyDown()` (`controllers.js:1163–1194`) handles exactly two keys: Delete and Escape. There's no shortcut registration system, no key binding configuration, no modifier key support, and no conflict detection. Adding keyboard shortcuts means adding more if-statements to this function.

**7. Bug: `renameDeck()` is called but never defined.**

`handleCanvasDoubleClick()` (`controllers.js:819–826`) calls `this.renameDeck(deck.id)`, but there is no `renameDeck` method anywhere in the controller. Double-clicking a deck throws a runtime error. The likely intention was to call `this.editDeck(deck.id)` (line 1464).

### Verdict

The event system is **functional but monolithic**. It works because the app is small enough that one person can hold the whole flow in their head. It will not scale. Adding a new interaction type requires editing a 1,648-line file, understanding which of 7 state properties to check, and hoping you don't break the implicit state machine.

---

## 2. API Readiness

### Overview

`LocalAPI` (`local-api.js`) is the sole data persistence layer. It wraps `localStorage` with an async interface that mirrors REST-style operations. The controller (`controllers.js`) talks to both `LocalAPI` and the in-memory `AppData` model, using them for different purposes.

### What's Working

**1. The LocalAPI interface is genuinely well-designed for swappability.**

All methods are `async` despite localStorage being synchronous (`local-api.js:89–91`). The method signatures — `getWorkspace()`, `createDeck(data)`, `updateCard(deckId, cardId, updates)` — map cleanly to REST endpoints. WebSocket stubs exist (`local-api.js:387–393`). The class was clearly designed with the intent of being replaceable.

**2. `_mutate()` centralizes the load-modify-save-notify pattern.**

```js
_mutate(fn) {                    // local-api.js:34
    const data = this._load();
    const result = fn(data);
    this._save(data);
    this._notify();
    return result;
}
```

Every write operation goes through this single choke point. This is the most valuable architectural decision in the codebase for future API work.

**3. `onChange` callback provides a clean refresh trigger.**

The controller sets `this.api.onChange = () => this.refreshWorkspace()` (`controllers.js:26`). After any mutation, the API notifies the controller to reload. This decouples persistence from rendering.

**4. Allowlisted update fields prevent over-writing.**

`updateDeck()` (`local-api.js:155`) and `updateCard()` (`local-api.js:229`) only apply explicitly allowed fields. This prevents callers from corrupting internal fields like `id` or `created`.

### What Blocks an External API

**1. The controller bypasses the API for state changes.**

During drag operations (`controllers.js:617–640`), the controller calls `deck.updatePosition()` directly on the in-memory model. The API is only called on mouseUp (`controllers.js:758–771`). This means:
- The in-memory model and the persisted data are out of sync during drags.
- An external API consumer reading the data mid-drag would see stale positions.
- The model is the live truth during interactions; the API is just a persistence dump.

Similarly, selection state is managed via `this.appData.selectDeck()` (`models.js:270`) and `this.selectedDeckIds` (a Set on the controller), never persisted through the API. Filter visibility (`deck.visible`) is set directly on model objects (`controllers.js:321–327`), also never persisted.

**2. Business logic lives in the controller, not the API or a service layer.**

Recurrent deck cycle logic: the controller checks if a deck is empty after completing a card (`checkAndHandleEmptyRecurrentDeck`, `controllers.js:1591–1607`), decides whether to start a new cycle, and then calls the API. The _decision_ happens in the controller. An external API consumer would need to re-implement this logic or the cycle behavior wouldn't trigger.

Multi-deck delete: the controller loops over `selectedDeckIds` and fires individual `deleteDeck()` calls (`controllers.js:1138–1143`). There's no batch operation. An external API consumer can't atomically delete multiple decks.

**3. No data validation layer.**

`LocalAPI.createDeck()` (`local-api.js:129–149`) accepts whatever is passed and fills in defaults. There's no schema validation — an API consumer could create a deck with `shape: "banana"` and it would be persisted. The model classes (`models.js`) don't validate either; `Deck.updateShape()` (line 164) checks valid shapes, but it's never called from the API path.

**4. No authentication or authorization hooks.**

`main.js` creates the Electron window with `nodeIntegration: false` and `contextIsolation: true` (line 9-10), but there's no `preload.js` and no IPC bridge. The renderer runs in a sandbox with no channel to the main process. Adding IPC would require:
- Creating a preload script with `contextBridge.exposeInMainWorld()`
- Moving LocalAPI (or a new API layer) to the main process
- Replacing direct localStorage calls with IPC round-trips

**5. Nested data structure makes independent entity access hard.**

Cards are nested inside decks in the storage format. To get a card, you must know its deck ID. There's no way to query "all cards across all decks" or "find a card by ID" without iterating every deck. An API endpoint like `GET /cards/:id` would require a linear scan of all decks.

### What Would Need to Change

To make a clean external API:

1. **Extract a service layer** between the controller and LocalAPI. Move business rules (recurrent deck cycling, multi-deck operations, validation) into service functions that both the controller and an external API can call.

2. **Stop mutating models directly in the controller.** Every data change should go through the API/service layer, not through `deck.updatePosition()` during a drag. Buffer UI-only state (drag positions) separately and commit through the API on completion.

3. **Add a preload.js with IPC channels.** This is the Electron-standard way to expose a backend API to the renderer.

4. **Add input validation.** Either in the API layer or the service layer.

5. **Flatten the data access.** Either add a card index/lookup, or accept that card operations always require a deck context.

### Verdict

The API layer is **the best-architected part of the codebase**. Its async interface, `_mutate()` pattern, and clean method signatures give you a 60% head start on an external API. The remaining 40% is extracting business logic from the controller into a shared service layer, adding IPC, and adding validation. Estimated effort: medium. The hard part isn't the API itself — it's untangling the controller.

---

## 3. Undo/Redo Readiness

### Overview

There is no undo/redo infrastructure. No command pattern, no state snapshots, no operation log, no diff system.

### What Exists That's Relevant

**1. History log — display-only, not reversible.**

`LocalAPI._addHistory()` (`local-api.js:64–73`) records human-readable strings like `"Completed card \"Buy milk\" in Groceries"`. These are rendered in `HistoryView` (`views.js:441–482`). They contain no data about the previous state, no operation type enum, and no parameters. You cannot reconstruct a reverse operation from them.

**2. `_mutate()` is a natural interception point.**

Every data mutation goes through `_mutate()` (`local-api.js:34–40`). This is where you'd capture before/after snapshots:

```js
_mutate(fn) {
    const data = this._load();
    const before = JSON.parse(JSON.stringify(data));  // snapshot
    const result = fn(data);
    this._save(data);
    this.undoStack.push(before);                      // push to undo stack
    this._notify();
    return result;
}
```

The fact that all mutations are centralized here makes undo mechanically feasible without rewriting the whole app.

**3. Full-state reload already works.**

`refreshWorkspace()` (`controllers.js:63–89`) reloads the entire app state from localStorage and re-renders everything. This means "undo" could be as simple as: restore the previous localStorage snapshot and call `refreshWorkspace()`. The rendering pipeline already handles full state replacement.

### What's Missing

**1. No command objects.**

Operations are not encapsulated. "Create a card" is just an inline call to `this.api.createCard()` buried in `addNewCard()` (`controllers.js:1360–1381`). There's no object that represents the operation, its parameters, or how to reverse it.

**2. No immutable state or diffing.**

Models are fully mutable. `Deck.updatePosition()` (`models.js:152`) modifies the object in place. There's no way to compare "state before" and "state after" without a deep clone.

**3. UI state is not captured.**

Selection state (`selectedDeckIds`, `metadata.selectedDeckId`), filter state (`this.filters`), and view state (which tab is active, scroll position) are managed separately from data state. A data-level undo wouldn't restore the UI context of the previous action. For example: undo a card deletion wouldn't re-select the deck the card was in.

**4. Some operations are fire-and-forget.**

`handleCanvasMouseUp` (`controllers.js:758–771`) calls `this.api.moveDeck()` with `.catch()` and no `await`. Multi-deck delete (`controllers.js:1170–1174`) fires `deleteDeck()` in a `forEach` with `.catch()`. These async fire-and-forget patterns mean the operation might not have completed when the next operation starts, making it hard to maintain a consistent undo stack.

**5. Composite operations have no transaction boundary.**

"Reset recurrent deck" clones cards and increments the cycle counter. "Complete all tasks and start new cycle" involves multiple API calls across `handleCardClick` → `checkAndHandleEmptyRecurrentDeck` → `startNewCycle`. There's no way to group these into a single undoable unit.

### Implementation Difficulty Assessment

**Approach A: Full-state snapshots in `_mutate()` (Easiest)**

- Wrap `_mutate()` to deep-clone state before mutation, push onto stack.
- Undo = pop from stack, write to localStorage, call `_notify()`.
- Pros: Works today with ~30 lines of code. No refactoring needed.
- Cons: Memory usage grows linearly. No granular redo labels. Composite operations are multiple undo steps. UI state not captured.
- **Effort: 1–2 hours for basic version.**

**Approach B: Command pattern with reversible operations (Best)**

- Define command objects for each operation type (CreateDeck, DeleteCard, MoveDeck, etc.).
- Each command knows how to `execute()` and `undo()`.
- Route all controller actions through a command dispatcher.
- Group composite operations into macro commands.
- Pros: Clean, granular, supports redo, composable.
- Cons: Requires significant refactoring. Every operation in the controller needs to be rewritten as a command. Estimated ~40 command types based on current operations.
- **Effort: 2–4 days.**

**Approach C: Event sourcing with operation log (Most powerful)**

- Replace `_addHistory()` with structured operation events that include full parameters and previous values.
- Replay or reverse events to reconstruct state.
- Pros: Supports undo, redo, collaboration, audit trails.
- Cons: Requires redesigning the entire data mutation pipeline. Overkill unless you also want collaboration or sync.
- **Effort: 1–2 weeks.**

### Recommended Path

Start with **Approach A** (snapshot in `_mutate()`) to get basic undo working immediately. Then migrate toward **Approach B** incrementally by converting high-value operations (delete deck, delete card, complete card) to command objects first.

### Verdict

The codebase has **no undo infrastructure, but the `_mutate()` choke point makes bolt-on undo surprisingly feasible**. A basic snapshot-based undo could work in hours. A proper command pattern would take days and requires controller refactoring. The biggest risk is composite operations (recurrent deck cycling) that span multiple `_mutate()` calls — these would show up as multiple undo steps unless you add transaction grouping.

---

## Summary of Findings

| Area | Rating | Key Issue |
|------|--------|-----------|
| Event Handling | ⚠️ Functional but fragile | God controller, no event bus, implicit state machine |
| API Readiness | ✅ Good foundation | LocalAPI is well-designed; controller business logic needs extraction |
| Undo/Redo | ❌ No infrastructure | But `_mutate()` makes snapshot-based undo easy to bolt on |

### Critical Bug Found

`handleCanvasDoubleClick()` (`controllers.js:825`) calls `this.renameDeck(deck.id)` — a method that does not exist. Double-clicking a deck throws `TypeError: this.renameDeck is not a function`. Should be `this.editDeck(deck.id)`.

### Top 3 Refactoring Priorities

1. **Split the controller.** Extract event handling, canvas interaction state machine, and business logic into separate modules. The controller should coordinate, not implement.

2. **Extract a service layer.** Move business rules (recurrent cycling, validation, composite operations) out of the controller into service functions that both the UI and a future API can share.

3. **Add `_mutate()` snapshots for undo.** This is the highest-value, lowest-effort improvement. 30 lines of code gives you basic undo with the architecture you already have.
