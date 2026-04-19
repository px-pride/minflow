# MinFlow Pseudocode Layout

## Main Process Boot Sequence

```
app.whenReady():
  service = new WorkspaceService(userData path)
  register all IPC handlers (map channel → service method)
  createWindow()
    BrowserWindow with preload.js, contextIsolation: true
    load index.html
    if no data file exists:
      on did-finish-load → send 'migrate-request' to renderer
```

## Renderer Boot Sequence

```
DOMContentLoaded:
  check browser support
  register migration handler (localStorage → main process)
  show main app
  app = new AppController()
  app.init()
```

## AppController.init()

```
init():
  wire onWorkspaceChanged → refreshWorkspace()
  loadAppData()                    // IPC: getWorkspace → AppData.fromJSON
  initViews()                      // Create CanvasView, HistoryView, SidePanelView, dialogs
  initManagers()                   // Create sub-managers with dependency injection
  setupEventHandlers()             // Delegate to sub-managers + wire toolbar buttons
  notes.loadContent()              // Populate notes editor from appData
  preferences.loadDarkModePreference()
  render()                         // Full render: canvas + history + side panel
```

## Sub-Manager Wiring

```
initManagers():
  canvas = new CanvasInteractionManager({
    getAppData, api, views,
    onRender: () → render(),
    onEditDeck: (id) → editDeck(id)
  })

  cards = new CardManager({
    api, getSelectedDeck,
    showLoading, hideLoading,
    checkRecurrentDeck
  })

  notes = new NotesEditor({ api, getAppData })
  keyboard = new KeyboardManager()
  preferences = new PreferencesManager({ api, getAppData, onRender })
```

## Canvas Interaction State Machine

```
handleMouseDown(e):
  coords = getCanvasCoordinates(e)

  if right-click on selected deck → do nothing (context menu will handle)

  if click on resize handle:
    set resizeState = { deck, handle, startX/Y, startWidth/Height }
  else if click on deck:
    if deck is part of multi-selection:
      set dragState = { isMultiple: true, decks with offsets }
    else:
      clear selection, select this deck
      set dragState = { deck, offsetX/Y }
  else:
    clear selection, deselect
    set selectionState = { startX/Y, currentX/Y }

  emit selection changed
  render()

handleMouseMove(e):
  if selectionState:
    update selectionState.currentX/Y
    find all decks intersecting selection rectangle
    render canvas with selection rect overlay
  else if dragState:
    update deck position(s), clamped to canvas bounds
    render canvas only
  else if resizeState:
    calculate new size (1:1 aspect ratio maintained)
    clamp to min 10px, max canvas bounds
    render canvas only
  else:
    update cursor (resize handle → nwse-resize, selected deck → move, other deck → pointer, empty → crosshair)
    show tooltip on deck hover

handleMouseUp(e):
  capture was-dragging/resizing/selecting
  clear all states
  if was dragging → api.moveDeck() for each deck
  if was resizing → api.resizeDeck()
  if was selecting → finalize selection (select single or deselect)
  full render()
```

## Data Mutation Flow (Main Process)

```
_mutate(fn):
  data = read JSON file
  snapshot = JSON.stringify(data)     // capture for undo
  result = fn(data)                   // apply mutation
  write JSON file
  undoStack.push(snapshot)
  if undoStack > 50 → shift oldest
  redoStack = []                      // clear redo on new mutation
  notify all windows (workspace-changed)
  return result
```

## Undo/Redo

```
undo():
  if undoStack empty → return null
  current = stringify(load())
  redoStack.push(current)
  previous = undoStack.pop()
  write previous to file
  notify windows
  return parsed previous

redo():
  if redoStack empty → return null
  current = stringify(load())
  undoStack.push(current)
  next = redoStack.pop()
  write next to file
  notify windows
  return parsed next
```

## Render Pipeline

```
render():
  preferences.updateColorFilterOptions()
  canvas.render(appData, selectedDeckIds)
  history.render(appData.history)

  if selectedDeckIds.size > 1:
    sidePanel.renderMultipleSelection(count)
  else if selectedDeckIds.size == 1:
    sidePanel.render(deck)
  else:
    sidePanel.render(appData.getSelectedDeck())
```

## Card Operations

```
handleCardClick(e):
  delegate based on clicked element class:
    .btn-complete → toggle card completion via API
    .btn-delete → confirm + delete via API
    .btn-edit → show inline edit form

addNewCard():
  get selected deck
  get text from input
  api.createCard(deck.id, { text })
  clear input

Card drag-drop:
  dragstart → store dragged card element + index, add .dragging class
  dragover → calculate drop position, show drag-over indicator
  drop → calculate new index, api.reorderCards()
  dragend → clean up classes, clear draggedCard
```

## Recurrent Deck Cycle

```
checkAndHandleEmptyRecurrentDeck(deckId):
  after 200ms delay:
    get deck from appData
    if all current-cycle cards completed:
      startNewCycle(deckId)

startNewCycle(deckId) [main process]:
  increment deck.currentCycle
  for each card in old cycle:
    create clone with new cycle number, completed=false
  save + notify
```
