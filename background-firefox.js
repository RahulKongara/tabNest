/**
 * TabNest Background Script — background-firefox.js
 * Firefox 109+ (Manifest V2, persistent background page)
 *
 * All shared modules (browser-adapter.js, constants.js, etc.) are loaded
 * before this script via manifest-firefox.json background.scripts ordering.
 * They attach BrowserAdapter and CONSTANTS to globalThis via their IIFE export.
 *
 * Logic mirrors background.js. Key differences from the MV3 service worker:
 *   - Persistent: background page stays alive; tabRegistry survives between events
 *     (no need to query + rebuild on every wake — only done once on load/startup)
 *   - Alarms registered via browser.alarms persist across browser sessions in MV2,
 *     so re-registration on startup is conditional (check before creating)
 *   - No importScripts() needed — manifest scripts array handles load order
 *   - Uses WINDOW_ID_NONE = -1 directly (browser.windows.WINDOW_ID_NONE equivalent)
 *
 * XBROWSER-02: All API calls routed through BrowserAdapter.
 */

/* global BrowserAdapter, CONSTANTS, LifecycleManager, GroupingEngine */

(function () {
  'use strict';

  // In MV2 persistent background, tabRegistry survives between events.
  // The background page is always alive so Map state is stable.
  const tabRegistry = new Map();
  globalThis._tabRegistry = tabRegistry; // exposed for LifecycleManager and debugging

  // User rules cache — loaded from storage.sync on init and refreshed on settings change.
  // Avoids async work in the hot onCreated event path.
  // TODO(Phase 5): Settings panel must call refreshUserRulesCache() after saving new rules.
  let userRulesCache = [];

  const PERSIST_ALARM_NAME = 'tabnest-persist-timestamps';
  const PERSIST_ALARM_PERIOD_MINUTES = 1;
  const WINDOW_ID_NONE = -1; // browser.windows.WINDOW_ID_NONE

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function isInternalPage(url) {
    if (!url) return true;
    return CONSTANTS.BROWSER_INTERNAL_PROTOCOLS.some(prefix => url.startsWith(prefix));
  }

  function createTabEntry(tab) {
    const now = Date.now();
    const url = tab.url || tab.pendingUrl || '';
    return {
      tabId:               tab.id,
      url,
      title:               tab.title || '',
      favicon:             tab.favIconUrl || '',
      groupId:             GroupingEngine.classify(url, tab.title || '', userRulesCache),
      stage:               CONSTANTS.STAGE.ACTIVE,
      lastActiveTimestamp: tab.active ? now : (now - 1000),
      createdAt:           now,
      isStateful:          false,          // UrlAnalyzer sets this in Phase 4
      isPinned:            tab.pinned  || false,
      isAudible:           tab.audible || false,
      windowId:            tab.windowId,
      index:               tab.index,
      isInternal:          isInternalPage(url),
    };
  }

  function updateTabEntry(entry, tab) {
    entry.url       = tab.url || tab.pendingUrl || entry.url;
    entry.title     = tab.title     || entry.title;
    entry.favicon   = tab.favIconUrl || entry.favicon;
    entry.isPinned  = tab.pinned  || false;
    entry.isAudible = tab.audible || false;
    entry.windowId  = tab.windowId;
    entry.index     = tab.index;
    entry.isInternal = isInternalPage(entry.url);
  }

  // ─── Timestamp Persistence ───────────────────────────────────────────────────

  async function persistTimestamps() {
    const timestamps = {};
    for (const [tabId, entry] of tabRegistry) {
      timestamps[tabId] = entry.lastActiveTimestamp;
    }
    try {
      await BrowserAdapter.storage.local.set({
        [CONSTANTS.STORAGE_KEYS.TIMESTAMPS]: timestamps,
      });
    } catch (err) {
      console.error('[TabNest FF] Failed to persist timestamps:', err);
    }
  }

  async function loadSavedTimestamps() {
    try {
      const result = await BrowserAdapter.storage.local.get(CONSTANTS.STORAGE_KEYS.TIMESTAMPS);
      return result[CONSTANTS.STORAGE_KEYS.TIMESTAMPS] || {};
    } catch {
      return {};
    }
  }

  // ─── Tab Registry Initialization ─────────────────────────────────────────────

  /**
   * Load user override rules from storage.sync into the module-level cache.
   * Called during initializeRegistry() and when settings change (Phase 5).
   */
  async function refreshUserRulesCache() {
    try {
      const rulesData = await BrowserAdapter.storage.sync.get(CONSTANTS.STORAGE_KEYS.USER_RULES);
      userRulesCache = rulesData[CONSTANTS.STORAGE_KEYS.USER_RULES] || [];
    } catch {
      userRulesCache = [];
    }
  }

  async function initializeRegistry() {
    tabRegistry.clear();
    const savedTimestamps = await loadSavedTimestamps();

    // Load user rules for GroupingEngine classification
    await refreshUserRulesCache();
    try {
      const allTabs = await BrowserAdapter.tabs.query({});
      for (const tab of allTabs) {
        const entry = createTabEntry(tab);
        if (savedTimestamps[tab.id] !== undefined) {
          entry.lastActiveTimestamp = savedTimestamps[tab.id];
        }
        tabRegistry.set(tab.id, entry);
      }
      console.log(`[TabNest FF] Registry initialized: ${tabRegistry.size} tabs`);
    } catch (err) {
      console.error('[TabNest FF] Failed to query tabs on init:', err);
    }
  }

  // ─── Tab Event Handlers ───────────────────────────────────────────────────────

  // LIFE-01: onCreated
  BrowserAdapter.tabs.onCreated.addListener((tab) => {
    tabRegistry.set(tab.id, createTabEntry(tab));
    console.log(`[TabNest FF] Tab created: ${tab.id}`);
  });

  // LIFE-01: onUpdated
  BrowserAdapter.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const entry = tabRegistry.get(tabId);
    if (!entry) {
      tabRegistry.set(tabId, createTabEntry(tab));
      return;
    }
    updateTabEntry(entry, tab);

    // Re-classify if URL changed (user may navigate to a different context)
    if (changeInfo.url) {
      entry.groupId = GroupingEngine.classify(entry.url, entry.title, userRulesCache);
    }
  });

  // LIFE-01: onRemoved
  BrowserAdapter.tabs.onRemoved.addListener((tabId) => {
    tabRegistry.delete(tabId);
    console.log(`[TabNest FF] Tab removed: ${tabId}`);
  });

  // LIFE-02: onActivated
  BrowserAdapter.tabs.onActivated.addListener(({ tabId }) => {
    const entry = tabRegistry.get(tabId);
    if (entry) {
      entry.lastActiveTimestamp = Date.now();
      entry.stage = CONSTANTS.STAGE.ACTIVE;
    }
  });

  // LIFE-01: onMoved
  BrowserAdapter.tabs.onMoved.addListener((tabId, moveInfo) => {
    const entry = tabRegistry.get(tabId);
    if (entry) {
      entry.windowId = moveInfo.windowId;
      entry.index    = moveInfo.toIndex;
    }
  });

  // LIFE-01: onAttached
  BrowserAdapter.tabs.onAttached.addListener((tabId, attachInfo) => {
    const entry = tabRegistry.get(tabId);
    if (entry) {
      entry.windowId = attachInfo.newWindowId;
      entry.index    = attachInfo.newPosition;
    }
  });

  // LIFE-01: onDetached — entry stays in registry; onAttached will update windowId/index
  BrowserAdapter.tabs.onDetached.addListener(() => {});

  // LIFE-01: onReplaced — transfer old entry to new tabId
  BrowserAdapter.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    const oldEntry = tabRegistry.get(removedTabId);
    if (oldEntry) {
      oldEntry.tabId = addedTabId;
      tabRegistry.set(addedTabId, oldEntry);
      tabRegistry.delete(removedTabId);
    }
  });

  // LIFE-02: onFocusChanged — update active tab timestamp on window focus change
  BrowserAdapter.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === WINDOW_ID_NONE) return;
    try {
      const [activeTab] = await BrowserAdapter.tabs.query({ active: true, windowId });
      if (activeTab) {
        const entry = tabRegistry.get(activeTab.id);
        if (entry) entry.lastActiveTimestamp = Date.now();
      }
    } catch {
      // Non-critical — next alarm tick will catch any missed update
    }
  });

  // ─── Alarm Listeners ─────────────────────────────────────────────────────────

  BrowserAdapter.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === PERSIST_ALARM_NAME) {
      await persistTimestamps();
      return;
    }
    if (alarm.name === CONSTANTS.ALARM_NAME) {
      // Load current settings for this tick
      let settings = CONSTANTS.DEFAULT_SETTINGS;
      try {
        const stored = await BrowserAdapter.storage.local.get(CONSTANTS.STORAGE_KEYS.SETTINGS);
        if (stored[CONSTANTS.STORAGE_KEYS.SETTINGS]) {
          settings = { ...CONSTANTS.DEFAULT_SETTINGS, ...stored[CONSTANTS.STORAGE_KEYS.SETTINGS] };
        }
      } catch {
        // Use defaults if storage read fails
      }
      await LifecycleManager.tick(tabRegistry, settings);
    }
  });

  // ─── Startup and Installation ─────────────────────────────────────────────────

  BrowserAdapter.runtime.onInstalled.addListener(async () => {
    await initializeRegistry();
    // In MV2, alarms can persist across sessions — only create if not already registered
    const existingLifecycle = await BrowserAdapter.alarms.get(CONSTANTS.ALARM_NAME);
    if (!existingLifecycle) {
      await BrowserAdapter.alarms.create(CONSTANTS.ALARM_NAME, {
        periodInMinutes: CONSTANTS.ALARM_PERIOD_MINUTES,
      });
    }
    const existingPersist = await BrowserAdapter.alarms.get(PERSIST_ALARM_NAME);
    if (!existingPersist) {
      await BrowserAdapter.alarms.create(PERSIST_ALARM_NAME, {
        periodInMinutes: PERSIST_ALARM_PERIOD_MINUTES,
      });
    }
  });

  BrowserAdapter.runtime.onStartup.addListener(async () => {
    // MV2 persistent background page — tabRegistry is still intact on browser restart
    // but we re-initialize to pick up any tabs opened before the extension loaded
    await initializeRegistry();
    console.log('[TabNest FF] Browser startup — registry re-synced');
  });

  // ─── Initialize on Load ───────────────────────────────────────────────────────
  // MV2 background page is always alive — initialize once when the script loads
  initializeRegistry().then(() => {
    console.log('[TabNest FF] Background script ready');
  });

})();
