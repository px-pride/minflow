// js/auth.js — Phase 2 client-side Clerk integration.
//
// Fetches the publishable key from /api/config, dynamically loads
// Clerk JS, and wires the Sign in / Upgrade / Sign out / Account
// buttons in #auth-controls. If Clerk isn't configured server-side
// (e.g. local Electron mode), the controls stay hidden.

(function () {
  if (typeof window === 'undefined') return;

  async function init() {
    let cfg;
    try {
      cfg = await fetch('/api/config').then((r) => r.json());
    } catch (_) {
      return; // server probably not reachable (e.g. file:// in Electron)
    }
    if (!cfg.clerkEnabled || !cfg.clerkPublishableKey) return;

    const controls = document.getElementById('auth-controls');
    if (!controls) return;

    const frontendApi = decodeFrontendApi(cfg.clerkPublishableKey);
    const scriptUrl = `https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;

    const s = document.createElement('script');
    s.src = scriptUrl;
    s.crossOrigin = 'anonymous';
    s.defer = true;
    s.dataset.clerkPublishableKey = cfg.clerkPublishableKey;
    s.onload = onClerkLoaded;
    document.head.appendChild(s);
  }

  function decodeFrontendApi(publishableKey) {
    // pk_test_<base64> or pk_live_<base64> — base64 decodes to the Clerk
    // frontend API host with a trailing '$' that we strip.
    const parts = publishableKey.split('_');
    if (parts.length < 3) return 'clerk.accounts.dev';
    try {
      const decoded = atob(parts.slice(2).join('_'));
      return decoded.replace(/\$$/, '');
    } catch (_) {
      return 'clerk.accounts.dev';
    }
  }

  async function onClerkLoaded() {
    if (!window.Clerk) return;
    await window.Clerk.load();

    const controls = document.getElementById('auth-controls');
    controls.hidden = false;

    const signIn = document.getElementById('sign-in-btn');
    const upgrade = document.getElementById('upgrade-btn');
    const userInfo = document.getElementById('user-info');
    const userEmail = document.getElementById('user-email');
    const account = document.getElementById('account-btn');
    const signOut = document.getElementById('sign-out-btn');

    function refresh() {
      const u = window.Clerk.user;
      if (u) {
        signIn.hidden = true;
        upgrade.hidden = true;
        userInfo.hidden = false;
        userEmail.textContent = u.primaryEmailAddress?.emailAddress || '';
      } else {
        signIn.hidden = false;
        upgrade.hidden = false;
        userInfo.hidden = true;
      }
    }

    signIn.addEventListener('click', () => window.Clerk.openSignIn());
    upgrade.addEventListener('click', () => window.Clerk.openSignUp());
    account.addEventListener('click', () => window.Clerk.openUserProfile());
    signOut.addEventListener('click', () => window.Clerk.signOut().then(refresh));

    window.Clerk.addListener(refresh);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
