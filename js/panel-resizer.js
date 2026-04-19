// PanelResizer — Draggable resize handles between left, main, and right panels

class PanelResizer {
  constructor() {
    this.leftPanel = document.querySelector('.left-panel');
    this.sidePanel = document.querySelector('.side-panel');
    this.leftHandle = document.querySelector('.resize-handle-left');
    this.rightHandle = document.querySelector('.resize-handle-right');

    this.MIN_WIDTH = 150;
    this.MAX_WIDTH = 500;

    this._activeHandle = null;
    this._startX = 0;
    this._startWidth = 0;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  setup() {
    this._loadSavedWidths();

    this.leftHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._activeHandle = 'left';
      this._startX = e.clientX;
      this._startWidth = this.leftPanel.offsetWidth;
      this.leftHandle.classList.add('active');
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mouseup', this._onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    this.rightHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._activeHandle = 'right';
      this._startX = e.clientX;
      this._startWidth = this.sidePanel.offsetWidth;
      this.rightHandle.classList.add('active');
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mouseup', this._onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
  }

  _onMouseMove(e) {
    const dx = e.clientX - this._startX;

    if (this._activeHandle === 'left') {
      const newWidth = Math.min(this.MAX_WIDTH, Math.max(this.MIN_WIDTH, this._startWidth + dx));
      this.leftPanel.style.width = newWidth + 'px';
    } else if (this._activeHandle === 'right') {
      // Dragging right handle leftward increases side panel width
      const newWidth = Math.min(this.MAX_WIDTH, Math.max(this.MIN_WIDTH, this._startWidth - dx));
      this.sidePanel.style.width = newWidth + 'px';
    }
  }

  _onMouseUp() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (this._activeHandle === 'left') {
      this.leftHandle.classList.remove('active');
    } else if (this._activeHandle === 'right') {
      this.rightHandle.classList.remove('active');
    }

    this._activeHandle = null;
    this._saveWidths();

    // Trigger canvas resize so it redraws at the new dimensions
    window.dispatchEvent(new Event('resize'));
  }

  _saveWidths() {
    localStorage.setItem('minflow-panel-widths', JSON.stringify({
      left: this.leftPanel.offsetWidth,
      right: this.sidePanel.offsetWidth,
    }));
  }

  _loadSavedWidths() {
    const saved = localStorage.getItem('minflow-panel-widths');
    if (!saved) return;

    try {
      const widths = JSON.parse(saved);
      if (widths.left >= this.MIN_WIDTH && widths.left <= this.MAX_WIDTH) {
        this.leftPanel.style.width = widths.left + 'px';
      }
      if (widths.right >= this.MIN_WIDTH && widths.right <= this.MAX_WIDTH) {
        this.sidePanel.style.width = widths.right + 'px';
      }
    } catch (e) {
      // Ignore invalid saved data
    }
  }
}
