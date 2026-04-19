// Main application entry point for MinFlow

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!checkBrowserSupport()) {
      showBrowserError();
      return;
    }

    // Dual-mode: use Electron IPC if available, otherwise HTTP client
    if (!window.minflowAPI) {
      window.minflowAPI = new MinflowHttpClient();
    }

    // Handle one-time migration from localStorage to main-process file storage
    if (window.minflowAPI && window.minflowAPI.onMigrateRequest) {
      window.minflowAPI.onMigrateRequest(async () => {
        try {
          const raw = localStorage.getItem('minflow-workspace');
          if (raw) {
            const data = JSON.parse(raw);
            await window.minflowAPI.importWorkspace(data);
            localStorage.removeItem('minflow-workspace');
            console.log('Migrated workspace data from localStorage to main process');
          }
        } catch (error) {
          console.error('Migration from localStorage failed:', error);
        }
      });
    }

    // Show main app directly (no auth)
    document.getElementById('main-app').classList.remove('hidden');

    const app = new AppController();
    app.init().catch((error) => {
      console.error('Failed to initialize app:', error);
      console.error('Error details:', error.message, error.stack);
      alert('Failed to initialize MinFlow.\n\nError: ' + error.message);
    });

    window.minflowApp = app;

    // Mobile panel toggle
    setupMobilePanelToggle();
  });

  function checkBrowserSupport() {
    const required = [
      'JSON' in window,
      'querySelector' in document,
      'addEventListener' in window,
      'classList' in document.documentElement,
      !!document.createElement('canvas').getContext,
    ];
    return required.every((feature) => feature);
  }

  function showBrowserError() {
    const app = document.getElementById('app');
    app.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 20px;">
                <div>
                    <h1>Browser Not Supported</h1>
                    <p>MinFlow requires a modern browser with support for:</p>
                    <ul style="list-style: none; padding: 0;">
                        <li>HTML5 Canvas</li>
                        <li>ES6 JavaScript</li>
                    </ul>
                    <p>Please update your browser to use MinFlow.</p>
                </div>
            </div>
        `;
  }

  function setupMobilePanelToggle() {
    const toggle = document.getElementById('mobile-panel-toggle');
    const backdrop = document.getElementById('mobile-panel-backdrop');
    const sidePanel = document.querySelector('.side-panel');
    if (!toggle || !backdrop || !sidePanel) return;

    function openPanel() {
      sidePanel.classList.add('mobile-open');
      backdrop.classList.add('visible');
    }
    function closePanel() {
      sidePanel.classList.remove('mobile-open');
      backdrop.classList.remove('visible');
    }

    toggle.addEventListener('click', () => {
      if (sidePanel.classList.contains('mobile-open')) {
        closePanel();
      } else {
        openPanel();
      }
    });
    backdrop.addEventListener('click', closePanel);

    window.minflowOpenSidePanel = openPanel;
    window.minflowCloseSidePanel = closePanel;
  }

  window.addEventListener('error', function (e) {
    console.error('Application error:', e);
  });
})();
