# MinFlow - Visual Task Management

A web-based visual task management application that lets you organize tasks using a deck/card metaphor on a spatial canvas.

## Features

- **Visual Organization**: Arrange task decks freely on a canvas
- **7 Deck Shapes**: Rectangle, Circle, Hexagon, Triangle, Diamond, Pentagon, Octagon
- **Drag & Drop**: Intuitive repositioning of decks
- **Resizable Decks**: Adjust deck sizes by dragging corners
- **Color Customization**: Personalize each deck with custom colors
- **Task Cards**: Add multiple tasks to each deck
- **Progress Tracking**: See completed vs pending tasks at a glance
- **Auto-save**: Never lose your work with automatic saving
- **History Panel**: Track all your actions
- **Keyboard Shortcuts**: Quick actions for power users

## Quick Start

1. Open `index.html` in a modern web browser
2. Click "Start" on the intro screen
3. Create your first deck with the "Add Deck" button
4. Click on a deck to select it
5. Add cards (tasks) using the side panel
6. Drag decks to organize your workspace
7. Right-click decks for more options

## Keyboard Shortcuts

- `Ctrl/Cmd + S` - Save workspace
- `Ctrl/Cmd + O` - Load workspace
- `Ctrl/Cmd + N` - Add new deck
- `Delete` - Delete selected deck
- `Escape` - Deselect current deck

## Running Locally

Simply open `index.html` in your browser, or serve it:

```bash
python3 -m http.server 8000
# Then open http://localhost:8000
```

## Browser Support

MinFlow requires a modern browser with support for:

- HTML5 Canvas
- Local Storage
- ES6 JavaScript

Tested on:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Architecture

MinFlow is built with vanilla JavaScript following MVC architecture:

- **Models**: Data structures for cards, decks, and app state
- **Views**: Canvas rendering and UI components
- **Controllers**: Business logic and event handling

## Development

### Code Structure

To modify MinFlow:

1. Edit the JavaScript files in the `js/` directory
2. Modify styles in `css/styles.css`
3. Update HTML structure in `index.html`

## License

MinFlow is released under the MIT License. See `LICENSE` for details.
