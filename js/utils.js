// Utility functions for MinFlow

const Utils = {
  _colorCache: new Map(),

  // Generate a unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // Format timestamp for display
  formatTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    // Less than a minute
    if (diff < 60000) {
      return 'Just now';
    }

    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }

    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    // Format as date
    return date.toLocaleDateString();
  },

  // Color utilities
  hexToRgba(hex, alpha = 1) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`
      : `rgba(0, 0, 0, ${alpha})`;
  },

  // Lighten a color
  lightenColor(hex, percent) {
    const key = `${hex}|${percent}`;
    const cached = this._colorCache.get(key);
    if (cached !== undefined) return cached;
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    const result =
      '#' +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1);
    this._colorCache.set(key, result);
    return result;
  },

  // Darken a color
  darkenColor(hex, percent) {
    return this.lightenColor(hex, -percent);
  },

  // Check if a color is light or dark
  isLightColor(hex) {
    const key = `light|${hex}`;
    const cached = this._colorCache.get(key);
    if (cached !== undefined) return cached;
    if (!hex || typeof hex !== 'string') return false;
    const color = hex.replace('#', '');
    if (color.length !== 6) return false;
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const result = brightness > 155;
    this._colorCache.set(key, result);
    return result;
  },

  // File utilities
  downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  loadJSONFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  // Canvas utilities
  getCanvasCoordinates(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  },

  // Shape drawing helpers
  drawShape(ctx, shape, x, y, width, height) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.min(width, height) / 2;

    ctx.beginPath();

    switch (shape) {
      case 'rectangle':
        ctx.rect(x, y, width, height);
        break;

      case 'circle':
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        break;

      case 'hexagon':
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;

      case 'pentagon':
        for (let i = 0; i < 5; i++) {
          const angle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;

      case 'octagon':
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI / 4) * i;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;

      default:
        ctx.rect(x, y, width, height);
    }
  },

  // Check if a point is inside a shape
  isPointInShape(x, y, shape, shapeX, shapeY, width, height) {
    const centerX = shapeX + width / 2;
    const centerY = shapeY + height / 2;
    const radius = Math.min(width, height) / 2;

    switch (shape) {
      case 'rectangle':
        return x >= shapeX && x <= shapeX + width && y >= shapeY && y <= shapeY + height;

      case 'circle':
        const dx = x - centerX;
        const dy = y - centerY;
        return dx * dx + dy * dy <= radius * radius;

      case 'hexagon':
      case 'pentagon':
      case 'octagon':
        // Simplified bounding box check for polygons
        // For more accuracy, implement point-in-polygon algorithm
        return x >= shapeX && x <= shapeX + width && y >= shapeY && y <= shapeY + height;

      default:
        return x >= shapeX && x <= shapeX + width && y >= shapeY && y <= shapeY + height;
    }
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function
  throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  // Deck geometry utilities

  // Check if mouse coordinates are over a deck's resize handle (inner shape bottom-right)
  getResizeHandle(deck, x, y) {
    // Handle is on inner shape (priority), not outer (display size)
    const staleness = deck.calculateStaleness();
    const displaySize = deck.width;
    const innerSize = displaySize - staleness;

    let hitArea;
    if (innerSize < 50) {
      hitArea = 10;
    } else if (innerSize < 100) {
      hitArea = 15;
    } else {
      hitArea = 20;
    }

    // Bottom-right of inner ring bounding box
    const innerBBX = deck.x + staleness / 2;
    const innerBBY = deck.y + staleness / 2;
    const handleX = innerBBX + innerSize;
    const handleY = innerBBY + innerSize;

    if (Math.abs(x - handleX) < hitArea && Math.abs(y - handleY) < hitArea) {
      return 'se';
    }

    return null;
  },

  // Check if a deck's bounding box intersects with a rectangle
  deckIntersectsRectangle(deck, rectX, rectY, rectWidth, rectHeight) {
    return (
      deck.x < rectX + rectWidth &&
      deck.x + deck.width > rectX &&
      deck.y < rectY + rectHeight &&
      deck.y + deck.height > rectY
    );
  },

  // Find the topmost visible deck at a point, accounting for shape scaling
  getDeckAtScaledPoint(decks, x, y) {
    for (let i = decks.length - 1; i >= 0; i--) {
      const deck = decks[i];
      if (deck.visible === false) continue;

      const scaleFactor = DeckQueries.SHAPE_SCALE_FACTORS[deck.shape] || 1.0;
      const scaledWidth = deck.width * scaleFactor;
      const scaledHeight = deck.height * scaleFactor;

      const scaledX = deck.x - (scaledWidth - deck.width) / 2;
      const scaledY = deck.y - (scaledHeight - deck.height) / 2;

      if (Utils.isPointInShape(x, y, deck.shape, scaledX, scaledY, scaledWidth, scaledHeight)) {
        return deck;
      }
    }

    return null;
  },
};
