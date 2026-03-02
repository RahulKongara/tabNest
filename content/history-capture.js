/**
 * TabNest Content Script — Navigation History Capture (content/history-capture.js)
 *
 * Tracks this tab's navigation history in a local array (max 20 URLs).
 * Intercepts pushState, replaceState, popstate, and pageshow events.
 * On CAPTURE_NAV_HISTORY message from background, responds with the captured array.
 *
 * DATA-02 — SRS FR-21
 * Runs at document_idle, main frame only (all_frames: false in manifests).
 * Passive-listener only — no DOM mutation, no network requests.
 */
(function () {
  'use strict';

  const MAX_HISTORY = 20;
  const MSG_CAPTURE = 'CAPTURE_NAV_HISTORY';

  // Initialize history with the page's current URL
  const navHistory = [location.href];

  /** Push a URL to the capped history array (newest at end). */
  function record(url) {
    if (!url) return;
    // Avoid consecutive duplicates (e.g. pushState called twice with same URL)
    if (navHistory[navHistory.length - 1] === url) return;
    navHistory.push(url);
    if (navHistory.length > MAX_HISTORY) navHistory.shift();
  }

  // ── Intercept History API ──────────────────────────────────────────────────
  // Wrap pushState and replaceState — they do not fire events natively.

  const _origPushState = history.pushState.bind(history);
  history.pushState = function (state, title, url) {
    _origPushState(state, title, url);
    // url may be relative — resolve against current origin
    try { record(new URL(url || location.href, location.origin).href); } catch { record(location.href); }
  };

  const _origReplaceState = history.replaceState.bind(history);
  history.replaceState = function (state, title, url) {
    _origReplaceState(state, title, url);
    // replaceState changes the current entry — update the last recorded URL
    try {
      const resolved = new URL(url || location.href, location.origin).href;
      if (navHistory.length > 0) {
        navHistory[navHistory.length - 1] = resolved;
      } else {
        navHistory.push(resolved);
      }
    } catch { /* ignore malformed URLs */ }
  };

  // popstate fires when browser back/forward buttons are used
  window.addEventListener('popstate', () => {
    record(location.href);
  }, { passive: true });

  // pageshow fires on bfcache restores (back navigation from cache)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) record(location.href);
  }, { passive: true });

  // ── Message Listener ───────────────────────────────────────────────────────
  // background.js calls chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_NAV_HISTORY' })
  // just before closing the tab in saveAndCloseTab().

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === MSG_CAPTURE) {
      sendResponse({ history: navHistory.slice() }); // defensive copy
      return true; // keep channel open for async (required even though we respond synchronously)
    }
  });

})();
