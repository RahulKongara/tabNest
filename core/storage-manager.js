/**
 * TabNest Storage Manager — core/storage-manager.js
 *
 * Persistent state layer for TabNest. Reads and writes session state to
 * storage.local and user settings to storage.sync, with 30-second debounced
 * auto-save (SESS-01).
 *
 * storage.sync  — user preferences and settings (100KB total / 8KB item limit)
 * storage.local — session state: savedEntries, groups, timestamps (10MB default)
 *
 * All async functions catch internally — StorageManager NEVER propagates exceptions.
 *
 * SESS-01: auto-save debounced at 30 seconds (scheduleSave)
 * SESS-02: loadState() returns last saved session blob for startup reconciliation
 *
 * Pattern: IIFE + dual export (globalThis + module.exports) — same as all core/ modules.
 */

(function () {
  'use strict';

  // 30-second debounce timer handle (SESS-01)
  let _saveTimer = null;
  const DEBOUNCE_MS = 30 * 1000; // 30-second debounced auto-save

  /**
   * Load full session state from storage.local.
   * Returns the saved session blob, or null if no state has been saved yet.
   * Returns null (not throws) on any storage error.
   *
   * Session blob schema:
   *   { savedEntries: SavedTabEntry[], groups: TabGroup[], timestamp: number }
   *
   * @returns {Promise<object|null>}
   */
  async function loadState() {
    try {
      const result = await BrowserAdapter.storage.local.get(CONSTANTS.STORAGE_KEYS.SESSION_STATE);
      const blob = result[CONSTANTS.STORAGE_KEYS.SESSION_STATE];
      return blob || null;
    } catch (err) {
      console.error('[TabNest] StorageManager.loadState() failed:', err);
      return null;
    }
  }

  /**
   * Save full session state to storage.local immediately (no debounce).
   * Stamps state.timestamp = Date.now() before writing.
   * Use scheduleSave() for event-triggered saves.
   *
   * @param {object} state - { savedEntries, groups, timestamp }
   * @returns {Promise<void>}
   */
  async function saveState(state) {
    try {
      state.timestamp = Date.now();
      await BrowserAdapter.storage.local.set({
        [CONSTANTS.STORAGE_KEYS.SESSION_STATE]: state,
      });
    } catch (err) {
      console.error('[TabNest] StorageManager.saveState() failed:', err);
    }
  }

  /**
   * Debounced save — call on every lifecycle or group change event.
   * Resets the 30s timer on each call; writes only once when the timer fires.
   * SESS-01: ensures at most one storage write per 30-second window.
   *
   * Uses clearTimeout/setTimeout (window-timer pattern, available in both sidebar
   * and background service worker contexts). The background uses alarm-based
   * triggering in addition; this covers sidebar-initiated saves.
   *
   * @param {object} state - { savedEntries, groups, timestamp }
   */
  function scheduleSave(state) {
    if (_saveTimer !== null) {
      clearTimeout(_saveTimer);
    }
    _saveTimer = setTimeout(async () => {
      _saveTimer = null;
      await saveState(state);
    }, DEBOUNCE_MS);
  }

  /**
   * Load user settings from storage.sync.
   * Merges stored values with CONSTANTS.DEFAULT_SETTINGS so missing fields
   * always have sensible defaults. Returns full defaults on any error.
   *
   * @returns {Promise<object>} Settings object — never null, never throws.
   */
  async function getSettings() {
    try {
      const result = await BrowserAdapter.storage.sync.get(CONSTANTS.STORAGE_KEYS.SETTINGS);
      const stored = result[CONSTANTS.STORAGE_KEYS.SETTINGS] || {};
      return { ...CONSTANTS.DEFAULT_SETTINGS, ...stored };
    } catch (err) {
      console.error('[TabNest] StorageManager.getSettings() failed:', err);
      return { ...CONSTANTS.DEFAULT_SETTINGS };
    }
  }

  /**
   * Save user settings to storage.sync immediately.
   *
   * @param {object} settings - Partial or full settings object
   * @returns {Promise<void>}
   */
  async function saveSettings(settings) {
    try {
      await BrowserAdapter.storage.sync.set({
        [CONSTANTS.STORAGE_KEYS.SETTINGS]: settings,
      });
    } catch (err) {
      console.error('[TabNest] StorageManager.saveSettings() failed:', err);
    }
  }

  const StorageManager = { loadState, saveState, scheduleSave, getSettings, saveSettings };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager };
  }
  globalThis.StorageManager = StorageManager;

})();
