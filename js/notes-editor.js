// NotesEditor — Rich text editor setup, auto-save, and toolbar handling

class NotesEditor {
  constructor({ api, getAppData }) {
    this.api = api;
    this.getAppData = getAppData;
    this.hasManuallyChangedEditorColor = false;
  }

  setup() {
    const editor = document.getElementById('notes-editor');

    // Apply the current dropdown values to the editor
    const fontFamily = document.getElementById('font-family');
    const fontSize = document.getElementById('font-size');
    const fontColor = document.getElementById('font-color');

    if (fontFamily && fontFamily.value) {
      editor.style.fontFamily = fontFamily.value;
    }

    if (fontSize && fontSize.value) {
      editor.style.fontSize = fontSize.value;
    }

    if (fontColor && fontColor.value) {
      editor.style.color = fontColor.value;
    }

    // Auto-save notes
    let notesDebounce = null;
    editor.addEventListener('input', () => {
      if (notesDebounce) clearTimeout(notesDebounce);
      notesDebounce = setTimeout(async () => {
        const appData = this.getAppData();
        if (!appData) return;

        if (!appData.metadata) {
          appData.metadata = {};
        }
        appData.metadata.notes = editor.innerHTML;

        try {
          await this.api.updateNotes(editor.innerHTML);
        } catch (error) {
          console.error('Failed to save notes:', error);
        }
      }, 1000);
    });

    // Setup toolbar buttons
    const toolbarButtons = document.querySelectorAll('.toolbar-btn');
    toolbarButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const command = button.dataset.command;
        if (command) {
          document.execCommand(command, false, null);
          editor.focus();
        }
      });
    });

    // Setup font family select
    const fontFamilySelect = document.getElementById('font-family');
    if (fontFamilySelect) {
      fontFamilySelect.addEventListener('change', (e) => {
        document.execCommand('fontName', false, e.target.value);
        editor.focus();
      });
    }

    // Setup font size select
    const fontSizeSelect = document.getElementById('font-size');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        const sizeMap = {
          '12px': '1',
          '14px': '2',
          '16px': '3',
          '18px': '4',
          '20px': '5',
          '24px': '6',
          '28px': '7',
          '32px': '7',
        };
        const size = sizeMap[e.target.value] || '3';
        document.execCommand('fontSize', false, size);

        if (e.target.value === '28px' || e.target.value === '32px') {
          const selection = window.getSelection();
          if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const fontElements = container.querySelectorAll
              ? container.querySelectorAll('font[size="7"]')
              : [];

            fontElements.forEach((font) => {
              if (selection.containsNode(font, true)) {
                font.style.fontSize = e.target.value;
              }
            });
          }
        }

        editor.focus();
      });
    }

    // Setup color picker
    const colorPicker = document.querySelector('.color-picker');
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        const command = colorPicker.dataset.command;
        if (command) {
          this.hasManuallyChangedEditorColor = true;
          document.execCommand(command, false, e.target.value);
          editor.focus();
        }
      });
    }

    // Prevent formatting from being lost when clicking toolbar buttons
    const toolbar = document.querySelector('.notes-toolbar');
    toolbar.addEventListener('mousedown', (e) => {
      if (
        e.target.tagName !== 'SELECT' &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'OPTION'
      ) {
        e.preventDefault();
      }
    });
  }

  loadContent() {
    const editor = document.getElementById('notes-editor');
    const appData = this.getAppData();
    if (editor && appData && appData.metadata && appData.metadata.notes) {
      editor.innerHTML = appData.metadata.notes;
    }
  }

  // Called by dark mode toggle to auto-switch editor text color
  updateColorForDarkMode(isDarkMode) {
    if (!this.hasManuallyChangedEditorColor) {
      const fontColorPicker = document.getElementById('font-color');
      const editor = document.getElementById('notes-editor');
      if (fontColorPicker && editor) {
        const newColor = isDarkMode ? '#e0e0e0' : '#000000';
        fontColorPicker.value = newColor;
        editor.style.color = newColor;
        document.execCommand('foreColor', false, newColor);
      }
    }
  }
}
