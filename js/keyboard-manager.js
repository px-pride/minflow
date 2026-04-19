// KeyboardManager — Keyboard shortcut registration and dispatch

class KeyboardManager {
  constructor() {
    this.shortcuts = [];
    document.addEventListener('keydown', (e) => this._dispatch(e));
  }

  // Register a keyboard shortcut
  // key: string (e.g. 'Delete', 'Escape', 'z')
  // modifiers: array of strings (e.g. ['ctrl'], ['ctrl', 'shift'])
  // handler: function(event)
  register(key, modifiers, handler) {
    this.shortcuts.push({ key, modifiers: modifiers || [], handler });
  }

  _dispatch(e) {
    // Don't intercept when typing in inputs, textareas, or contenteditable
    const target = e.target;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    for (const shortcut of this.shortcuts) {
      if (this._matches(e, shortcut)) {
        shortcut.handler(e);
        return;
      }
    }
  }

  _matches(event, shortcut) {
    // Case-insensitive key comparison (Shift changes 'z' → 'Z')
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;

    const mods = shortcut.modifiers;
    const needsCtrl = mods.includes('ctrl');
    const needsShift = mods.includes('shift');
    const needsAlt = mods.includes('alt');
    const needsMeta = mods.includes('meta');

    // Use ctrlKey or metaKey for cross-platform (Cmd on Mac, Ctrl on Windows/Linux)
    const ctrlOrMeta = event.ctrlKey || event.metaKey;

    if (needsCtrl && !ctrlOrMeta) return false;
    if (!needsCtrl && ctrlOrMeta) return false;

    if (needsShift && !event.shiftKey) return false;
    if (!needsShift && event.shiftKey) return false;

    if (needsAlt && !event.altKey) return false;
    if (!needsAlt && event.altKey) return false;

    if (needsMeta && !event.metaKey) return false;

    return true;
  }
}
