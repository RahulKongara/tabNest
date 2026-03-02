/**
 * TabNest Restore Manager — core/restore-manager.js
 *
 * Implements all three smart restore strategies (Phase 4):
 *   - RESTORE-02: Hover pre-render (500ms delay, silent background tab creation)
 *   - RESTORE-03: Staggered batch restore (batchSize tabs at a time, 500ms gaps)
 *   - RESTORE-04: Lazy restore on Chromium (discarded: true, loads only on click)
 */
(function () {
  'use strict';

  // ── RESTORE-02: Hover Pre-Render ─────────────────────────────────────────────

  /**
   * Create a background tab for a saved entry (pre-warm for instant restore on click).
   * @param {SavedTabEntry} savedEntry
   * @returns {Promise<{ preWarmTabId: number }>}
   */
  async function hoverPreRender(savedEntry) {
    const tab = await BrowserAdapter.tabs.create({ url: savedEntry.url, active: false });
    return { preWarmTabId: tab.id };
  }

  /**
   * Close the pre-warmed tab (user moved mouse away before clicking).
   * @param {number} preWarmTabId
   */
  async function cancelPreRender(preWarmTabId) {
    try {
      await BrowserAdapter.tabs.remove(preWarmTabId);
    } catch {
      // Tab may already be closed (user closed it manually, etc.) — ignore
    }
  }

  /**
   * Activate the pre-warmed tab, remove the saved entry from state, push TAB_RESTORED.
   * @param {number} preWarmTabId
   * @param {SavedTabEntry} savedEntry
   * @param {{ savedEntries: SavedTabEntry[] }} savedState
   * @param {function} pushFn  — pushToSidebar(type, data)
   * @param {{ saveState: function }} StorageManagerRef
   */
  async function activatePreRendered(preWarmTabId, savedEntry, savedState, pushFn, StorageManagerRef) {
    // Activate the pre-warmed tab
    try {
      await BrowserAdapter.tabs.update(preWarmTabId, { active: true });
    } catch {
      // Pre-warmed tab was closed externally — fall back to a fresh create
      try {
        const fallback = await BrowserAdapter.tabs.create({ url: savedEntry.url, active: true });
        preWarmTabId = fallback.id;
      } catch { /* nothing we can do */ }
    }

    // Remove the saved entry from state
    if (Array.isArray(savedState.savedEntries)) {
      const idx = savedState.savedEntries.findIndex(e => e.savedId === savedEntry.savedId);
      if (idx !== -1) savedState.savedEntries.splice(idx, 1);
    }

    // Persist updated state
    try { await StorageManagerRef.saveState(savedState); } catch { /* non-critical */ }

    // Notify sidebar
    const type = (typeof MSG_TYPES !== 'undefined') ? MSG_TYPES.TAB_RESTORED : 'TAB_RESTORED';
    if (typeof pushFn === 'function') {
      pushFn(type, { savedId: savedEntry.savedId, newTabId: preWarmTabId });
    }
  }

  // ── RESTORE-03: Staggered Batch Restore ─────────────────────────────────────

  /**
   * Open an array of URLs in batches with a delay between each batch.
   * Used by RESTORE_WORKSPACE handler.
   * @param {string[]} urlList
   * @param {number} batchSize  — tabs per batch (default 3)
   * @param {number} delayMs    — ms to wait between batches (default 500)
   * @returns {Promise<number[]>}  — array of created tab IDs
   */
  async function batchRestore(urlList, batchSize, delayMs) {
    if (!Array.isArray(urlList) || urlList.length === 0) return [];
    batchSize = (typeof batchSize === 'number' && batchSize > 0) ? batchSize : 3;
    delayMs   = (typeof delayMs   === 'number' && delayMs >= 0)  ? delayMs   : 500;

    const allTabIds = [];

    for (let i = 0; i < urlList.length; i += batchSize) {
      const batch = urlList.slice(i, i + batchSize);

      // Open all tabs in this batch concurrently
      const results = await Promise.allSettled(
        batch.map(url => BrowserAdapter.tabs.create({ url, active: false }))
      );
      for (const result of results) {
        if (result.status === 'fulfilled') allTabIds.push(result.value.id);
      }

      // Wait between batches (skip delay after the last batch)
      if (i + batchSize < urlList.length && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return allTabIds;
  }

  // ── RESTORE-04: Lazy Restore (Chromium only) ─────────────────────────────────

  /**
   * Create a tab that appears in the tab bar but does not load until clicked.
   * Uses { discarded: true } on Chromium; falls back to { active: false } on Firefox.
   * Removes the saved entry from state and pushes TAB_RESTORED.
   * @param {SavedTabEntry} savedEntry
   * @param {{ savedEntries: SavedTabEntry[] }} savedState
   * @param {function} pushFn
   * @param {{ saveState: function }} StorageManagerRef
   */
  async function lazyRestore(savedEntry, savedState, pushFn, StorageManagerRef) {
    const canDiscard = (typeof BrowserAdapter !== 'undefined' && BrowserAdapter.features && BrowserAdapter.features.canDiscard);

    let newTab;
    if (canDiscard) {
      // RESTORE-04: lazy tab — visible in bar, no renderer until clicked
      newTab = await BrowserAdapter.tabs.create({ url: savedEntry.url, active: false, discarded: true });
    } else {
      // Firefox fallback: standard inactive tab
      newTab = await BrowserAdapter.tabs.create({ url: savedEntry.url, active: false });
    }

    // Remove saved entry from state
    if (Array.isArray(savedState.savedEntries)) {
      const idx = savedState.savedEntries.findIndex(e => e.savedId === savedEntry.savedId);
      if (idx !== -1) savedState.savedEntries.splice(idx, 1);
    }

    // Persist
    try { await StorageManagerRef.saveState(savedState); } catch { /* non-critical */ }

    // Notify sidebar
    const type = (typeof MSG_TYPES !== 'undefined') ? MSG_TYPES.TAB_RESTORED : 'TAB_RESTORED';
    if (typeof pushFn === 'function') {
      pushFn(type, { savedId: savedEntry.savedId, newTabId: newTab.id });
    }
  }

  const RestoreManager = {
    hoverPreRender,
    cancelPreRender,
    activatePreRendered,
    batchRestore,
    lazyRestore,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RestoreManager };
  }
  globalThis.RestoreManager = RestoreManager;

})();
