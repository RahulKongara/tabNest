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

  // GA 07-01: dirty-flag diff — skip writes when state is unchanged (NFR-10 optimization)
  let _lastSavedStateJson = null;

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
    state.timestamp = Date.now();

    // GA 07-01: Skip write if state is identical to last save (NFR-10 optimization)
    const stateJson = JSON.stringify(state);
    if (stateJson === _lastSavedStateJson) return;
    _lastSavedStateJson = stateJson;

    try {
      await BrowserAdapter.storage.local.set({
        [CONSTANTS.STORAGE_KEYS.SESSION_STATE]: state,
      });
    } catch (err) {
      const isQuota = err && err.message && (
        err.message.includes('QUOTA_BYTES') ||
        err.message.includes('QUOTA_EXCEEDED') ||
        err.message.includes('quota')
      );
      if (isQuota) {
        // GA 07-02: NFR-14 — prune oldest archived entries and retry once
        console.warn('[TabNest] saveState: QUOTA_EXCEEDED — pruning oldest archived entries');
        const archived = (state.savedEntries || [])
          .filter(function(e) { return e.stage === 'archived'; })
          .sort(function(a, b) { return (a.archivedAt || a.savedAt || 0) - (b.archivedAt || b.savedAt || 0); });
        const toPrune = archived.slice(0, 20);
        const pruneIds = new Set(toPrune.map(function(e) { return e.savedId || e.id; }));
        state.savedEntries = (state.savedEntries || []).filter(function(e) {
          return !pruneIds.has(e.savedId || e.id);
        });
        console.log('[TabNest] saveState: pruned ' + toPrune.length + ' archived entries; retrying');
        try {
          await BrowserAdapter.storage.local.set({
            [CONSTANTS.STORAGE_KEYS.SESSION_STATE]: state,
          });
        } catch (retryErr) {
          console.error('[TabNest] saveState: retry also failed — state not persisted:', retryErr);
        }
      } else {
        console.error('[TabNest] StorageManager.saveState() failed:', err);
      }
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

  /**
   * CONF-03: Serialize all TabNest data to a JSON string for export.
   * Reads from both storage.local (session state, workspaces) and storage.sync (settings, user rules).
   * Returns a JSON string, or '{}' on error. Never throws.
   * @returns {Promise<string>}
   */
  async function exportData() {
    try {
      const wsKey = (typeof CONSTANTS !== 'undefined' && CONSTANTS.STORAGE_KEYS && CONSTANTS.STORAGE_KEYS.WORKSPACES)
        ? CONSTANTS.STORAGE_KEYS.WORKSPACES : 'tabnest_workspaces';
      const [sessionResult, settingsResult, rulesResult, workspacesResult] = await Promise.all([
        BrowserAdapter.storage.local.get(CONSTANTS.STORAGE_KEYS.SESSION_STATE),
        BrowserAdapter.storage.sync.get(CONSTANTS.STORAGE_KEYS.SETTINGS),
        BrowserAdapter.storage.sync.get(CONSTANTS.STORAGE_KEYS.USER_RULES),
        BrowserAdapter.storage.local.get(wsKey),
      ]);

      const session   = sessionResult[CONSTANTS.STORAGE_KEYS.SESSION_STATE] || {};
      const settings  = settingsResult[CONSTANTS.STORAGE_KEYS.SETTINGS] || {};
      const userRules = rulesResult[CONSTANTS.STORAGE_KEYS.USER_RULES] || [];
      const workspaces = workspacesResult[wsKey] || [];

      const allSaved = Array.isArray(session.savedEntries) ? session.savedEntries : [];
      const savedEntries    = allSaved.filter(e => e.stage === 'saved');
      const archivedEntries = allSaved.filter(e => e.stage === 'archived');

      const exportObj = {
        version:         1,
        exportedAt:      Date.now(),
        settings:        Object.assign({}, CONSTANTS.DEFAULT_SETTINGS, settings),
        userRules:       userRules,
        groups:          Array.isArray(session.groups) ? session.groups : [],
        savedEntries:    savedEntries,
        archivedEntries: archivedEntries,
        workspaces:      workspaces,
      };

      return JSON.stringify(exportObj, null, 2);
    } catch (err) {
      console.error('[TabNest] StorageManager.exportData() failed:', err);
      return '{}';
    }
  }

  /**
   * CONF-03: Validate and restore state from an exported JSON string.
   * On success, overwrites storage.local session state and storage.sync settings.
   * Returns { success: true } or { success: false, error: string }.
   * Never throws.
   * @param {string} jsonString
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async function importData(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      return { success: false, error: 'Invalid JSON: ' + err.message };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { success: false, error: 'Invalid export: expected an object at root' };
    }
    if (parsed.version !== 1) {
      return { success: false, error: 'Unsupported export version: ' + parsed.version };
    }
    if (!Array.isArray(parsed.groups)) {
      return { success: false, error: 'Invalid export: missing or non-array "groups" field' };
    }

    try {
      const wsKey = (typeof CONSTANTS !== 'undefined' && CONSTANTS.STORAGE_KEYS && CONSTANTS.STORAGE_KEYS.WORKSPACES)
        ? CONSTANTS.STORAGE_KEYS.WORKSPACES : 'tabnest_workspaces';

      if (parsed.settings && typeof parsed.settings === 'object') {
        await BrowserAdapter.storage.sync.set({
          [CONSTANTS.STORAGE_KEYS.SETTINGS]: parsed.settings,
        });
      }
      if (Array.isArray(parsed.userRules)) {
        await BrowserAdapter.storage.sync.set({
          [CONSTANTS.STORAGE_KEYS.USER_RULES]: parsed.userRules,
        });
      }
      const savedEntries = [
        ...(Array.isArray(parsed.savedEntries)    ? parsed.savedEntries    : []),
        ...(Array.isArray(parsed.archivedEntries) ? parsed.archivedEntries : []),
      ];
      const sessionState = {
        groups:       parsed.groups,
        savedEntries: savedEntries,
        timestamp:    Date.now(),
      };
      await BrowserAdapter.storage.local.set({
        [CONSTANTS.STORAGE_KEYS.SESSION_STATE]: sessionState,
      });
      if (Array.isArray(parsed.workspaces)) {
        await BrowserAdapter.storage.local.set({
          [wsKey]: parsed.workspaces,
        });
      }
      return { success: true };
    } catch (err) {
      console.error('[TabNest] StorageManager.importData() failed:', err);
      return { success: false, error: 'Storage write failed: ' + err.message };
    }
  }

  /**
   * CONF-03: Wipe all TabNest data from storage.local and storage.sync.
   * Returns { success: true } or { success: false, error: string }.
   * Never throws.
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async function clearAllData() {
    try {
      await Promise.all([
        BrowserAdapter.storage.local.clear(),
        BrowserAdapter.storage.sync.clear(),
      ]);
      _lastSavedStateJson = null; // GA 07-01: reset dirty flag after clear
      return { success: true };
    } catch (err) {
      console.error('[TabNest] StorageManager.clearAllData() failed:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * SESS-03: Persist a WorkspaceSnapshot to storage.local.
   * Enforces MAX_WORKSPACES limit by removing the oldest workspace first.
   * @param {object} snapshot
   * @returns {Promise<{ success: boolean, workspace?: object, error?: string }>}
   */
  async function saveWorkspace(snapshot) {
    try {
      const existing = await loadWorkspaces();
      let workspaces = Array.isArray(existing) ? existing : [];
      const MAX = (typeof CONSTANTS !== 'undefined' && CONSTANTS.MAX_WORKSPACES) || 20;
      if (workspaces.length >= MAX) {
        workspaces = workspaces.slice(1); // oldest is at index 0
      }
      workspaces.push(snapshot);
      const wsKey = (typeof CONSTANTS !== 'undefined' && CONSTANTS.STORAGE_KEYS && CONSTANTS.STORAGE_KEYS.WORKSPACES)
        ? CONSTANTS.STORAGE_KEYS.WORKSPACES : 'tabnest_workspaces';
      await BrowserAdapter.storage.local.set({ [wsKey]: workspaces });
      return { success: true, workspace: snapshot };
    } catch (err) {
      console.error('[TabNest] StorageManager.saveWorkspace() failed:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * SESS-03: Load all saved WorkspaceSnapshots from storage.local.
   * Returns [] on error or missing key.
   * @returns {Promise<object[]>}
   */
  async function loadWorkspaces() {
    try {
      const key = (typeof CONSTANTS !== 'undefined' && CONSTANTS.STORAGE_KEYS && CONSTANTS.STORAGE_KEYS.WORKSPACES)
        ? CONSTANTS.STORAGE_KEYS.WORKSPACES : 'tabnest_workspaces';
      const result = await BrowserAdapter.storage.local.get(key);
      const wks = result[key];
      return Array.isArray(wks) ? wks : [];
    } catch (err) {
      console.error('[TabNest] StorageManager.loadWorkspaces() failed:', err);
      return [];
    }
  }

  /**
   * SESS-03: Delete a saved workspace by ID.
   * @param {string} workspaceId
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async function deleteWorkspace(workspaceId) {
    try {
      const existing = await loadWorkspaces();
      const filtered = existing.filter(w => w.workspaceId !== workspaceId);
      const wsKey = (typeof CONSTANTS !== 'undefined' && CONSTANTS.STORAGE_KEYS && CONSTANTS.STORAGE_KEYS.WORKSPACES)
        ? CONSTANTS.STORAGE_KEYS.WORKSPACES : 'tabnest_workspaces';
      await BrowserAdapter.storage.local.set({ [wsKey]: filtered });
      return { success: true };
    } catch (err) {
      console.error('[TabNest] StorageManager.deleteWorkspace() failed:', err);
      return { success: false, error: err.message };
    }
  }

  const StorageManager = {
    loadState, saveState, scheduleSave,
    getSettings, saveSettings,
    exportData, importData, clearAllData,
    saveWorkspace, loadWorkspaces, deleteWorkspace,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager };
  }
  globalThis.StorageManager = StorageManager;

})();
