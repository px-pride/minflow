// PreferencesManager — Dark mode, filter controls, and UI preferences

class PreferencesManager {
  constructor({ api, getAppData, onRender }) {
    this.api = api;
    this.getAppData = getAppData;
    this.onRender = onRender;
    this.filters = {
      color: '',
      shape: '',
      minSize: 10,
    };
  }

  setupFilterControls() {
    const colorFilter = document.getElementById('color-filter');
    const shapeFilter = document.getElementById('shape-filter');
    const sizeFilter = document.getElementById('size-filter');
    const sizeFilterValue = document.getElementById('size-filter-value');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    this.updateColorFilterOptions();

    colorFilter.addEventListener('change', (e) => {
      this.filters.color = e.target.value;

      if (e.target.value) {
        e.target.style.backgroundColor = e.target.value;
        e.target.style.color = Utils.isLightColor(e.target.value) ? '#000' : '#fff';
      } else {
        e.target.style.backgroundColor = '';
        e.target.style.color = '';
      }

      this.applyFilters();
      this.onRender();
    });

    shapeFilter.addEventListener('change', (e) => {
      this.filters.shape = e.target.value;
      this.applyFilters();
      this.onRender();
    });

    sizeFilter.addEventListener('input', (e) => {
      this.filters.minSize = parseInt(e.target.value);
      sizeFilterValue.textContent = e.target.value;
      this.applyFilters();
      this.onRender();
    });

    clearFiltersBtn.addEventListener('click', () => {
      this.filters = { color: '', shape: '', minSize: 10 };
      colorFilter.value = '';
      colorFilter.style.backgroundColor = '';
      colorFilter.style.color = '';
      shapeFilter.value = '';
      sizeFilter.value = 10;
      sizeFilterValue.textContent = '10';
      this.applyFilters();
      this.onRender();
    });
  }

  updateColorFilterOptions() {
    const appData = this.getAppData();
    const colorFilter = document.getElementById('color-filter');
    const existingColors = [...new Set(appData.decks.map((deck) => deck.color))];
    const currentValue = colorFilter.value;

    while (colorFilter.options.length > 1) {
      colorFilter.remove(1);
    }

    existingColors.forEach((color) => {
      const option = document.createElement('option');
      option.value = color;
      option.textContent = color;
      option.style.backgroundColor = color;
      option.style.color = Utils.isLightColor(color) ? '#000' : '#fff';
      colorFilter.appendChild(option);
    });

    colorFilter.value = currentValue;
    if (currentValue) {
      colorFilter.style.backgroundColor = currentValue;
      colorFilter.style.color = Utils.isLightColor(currentValue) ? '#000' : '#fff';
    }
  }

  applyFilters() {
    const appData = this.getAppData();
    appData.decks.forEach((deck) => {
      const matchesColor = !this.filters.color || deck.color === this.filters.color;
      const matchesShape = !this.filters.shape || deck.shape === this.filters.shape;
      const matchesSize = Math.min(deck.width, deck.height) >= this.filters.minSize;

      deck.visible = matchesColor && matchesShape && matchesSize;
    });

    const selectedDeck = appData.getSelectedDeck();
    if (selectedDeck && !selectedDeck.visible) {
      appData.deselectDeck();
    }

    this.onRender();
  }

  toggleDarkMode(notesEditor) {
    const body = document.body;
    const isDarkMode = body.classList.toggle('dark-mode');
    const darkModeToggle = document.getElementById('dark-mode-toggle');

    darkModeToggle.textContent = isDarkMode ? '☀️' : '🌙';

    localStorage.setItem('darkMode', isDarkMode);

    const appData = this.getAppData();
    if (appData && appData.metadata) {
      appData.metadata.darkMode = isDarkMode;
      this.api.updateWorkspace(appData.toJSON()).catch((error) => {
        console.error('Failed to save dark mode preference:', error);
      });
    }

    // Delegate editor color update to NotesEditor
    if (notesEditor) {
      notesEditor.updateColorForDarkMode(isDarkMode);
    }
  }

  loadDarkModePreference() {
    const appData = this.getAppData();
    const hasLocalPreference = localStorage.getItem('darkMode') !== null;
    const localDarkMode = localStorage.getItem('darkMode') === 'true';

    const workspaceDarkMode = appData?.metadata?.darkMode;

    let isDarkMode;
    if (workspaceDarkMode !== undefined) {
      isDarkMode = workspaceDarkMode;
    } else if (hasLocalPreference) {
      isDarkMode = localDarkMode;
    } else {
      isDarkMode = true;
    }

    if (isDarkMode) {
      document.body.classList.add('dark-mode');
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      if (darkModeToggle) {
        darkModeToggle.textContent = '☀️';
      }
    }
  }
}
