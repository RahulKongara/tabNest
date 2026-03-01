/**
 * TabNest Background Service Worker — background.js
 * Chrome 114+, Edge 114+, Brave (Manifest V3)
 *
 * Non-persistent service worker. Reinitializes tabRegistry from storage on every wake.
 * All browser API calls routed through BrowserAdapter (core/browser-adapter.js).
 *
 * Responsibilities:
 *   - LIFE-01: Track all tab events (onCreated, onUpdated, onRemoved, onActivated,
 *              onMoved, onAttached, onDetached, onReplaced, onFocusChanged)
 *   - LIFE-02: Track lastActiveTimestamp per tab; persist to storage.local every 60s
 *   - LIFE-03, LIFE-07: Lifecycle alarm and exception rules (via LifecycleManager)
 *   - GROUP-01, GROUP-02: Auto-classify new tabs via GroupingEngine
 *   - XBROWSER-02: All API calls via BrowserAdapter
 *
 * Uses importScripts() (not ES modules) so BrowserAdapter and CONSTANTS are
 * available as globalThis properties set by their respective IIFE scripts.
 */

/* global BrowserAdapter, CONSTANTS, LifecycleManager, GroupingEngine, StorageManager */

// In non-module service workers, importScripts() loads scripts synchronously.
// In the Node.js test environment, importScripts is stubbed as a no-op
// (globals are set by the test harness before require()).
if (typeof importScripts === 'function') {
  importScripts(
    'core/browser-adapter.js',
    'core/constants.js',
    'core/lifecycle-manager.js',
    'core/grouping-engine.js',
    'core/storage-manager.js',
    'sidebar/message-protocol.js'
  );
}

// ─── In-Memory Tab Registry ────────────────────────────────────────────────────
// Map<tabId: number, TabEntry>
// Re-initialized from storage on every service worker wake (see initializeRegistry).
const tabRegistry = new Map();
globalThis._tabRegistry = tabRegistry; // exposed for LifecycleManager and debugging

// User rules cache — loaded from storage.sync on init and refreshed on settings change.
// Avoids async work in the hot onCreated event path.
// TODO(Phase 5): Settings panel must call refreshUserRulesCache() after saving new rules.
let userRulesCache = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect browser-internal pages that should never be managed.
 * Blank/undefined URLs are treated as internal.
 * @param {string} url
 * @returns {boolean}
 */
function isInternalPage(url) {
  if (!url) return true; // blank tab — treat as internal
  return CONSTANTS.BROWSER_INTERNAL_PROTOCOLS.some(prefix => url.startsWith(prefix));
}

/**
 * Build a TabEntry object from a chrome.tabs.Tab object.
 * groupId defaults to 'other' — GroupingEngine assigns the real groupId in 01-05.
 * @param {chrome.tabs.Tab} tab
 * @returns {TabEntry}
 */
function createTabEntry(tab) {
  const now = Date.now();
  const url = tab.url || tab.pendingUrl || '';
  return {
    tabId:              tab.id,
    url,
    title:              tab.title || '',
    favicon:            tab.favIconUrl || '',
    groupId:            GroupingEngine.classify(url, tab.title || '', userRulesCache),
    stage:              CONSTANTS.STAGE.ACTIVE,
    lastActiveTimestamp: tab.active ? now : (now - 1000), // active tabs start fresh
    createdAt:          now,
    isStateful:         false,             // UrlAnalyzer sets this in Phase 4
    isPinned:           tab.pinned  || false,
    isAudible:          tab.audible || false,
    windowId:           tab.windowId,
    index:              tab.index,
    isInternal:         isInternalPage(url),
  };
}

/**
 * Update an existing tab entry with the latest data from a chrome.tabs.Tab object.
 * Preserves lastActiveTimestamp, stage, createdAt, groupId, and isStateful.
 * @param {TabEntry} entry - Existing registry entry (mutated in place)
 * @param {chrome.tabs.Tab} tab - Updated tab object from browser event
 */
function updateTabEntry(entry, tab) {
  entry.url      = tab.url || tab.pendingUrl || entry.url;
  entry.title    = tab.title   || entry.title;
  entry.favicon  = tab.favIconUrl || entry.favicon;
  entry.isPinned = tab.pinned  || false;
  entry.isAudible = tab.audible || false;
  entry.windowId = tab.windowId;
  entry.index    = tab.index;
  entry.isInternal = isInternalPage(entry.url);
}

// ─── Timestamp Persistence ─────────────────────────────────────────────────────

const PERSIST_ALARM_NAME = 'tabnest-persist-timestamps';
const PERSIST_ALARM_PERIOD_MINUTES = 1; // every 60 seconds

/**
 * Write all tabRegistry lastActiveTimestamp values to storage.local.
 * Called on the 1-minute alarm tick (LIFE-02).
 */
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
    console.error('[TabNest] Failed to persist timestamps:', err);
  }
}

// ─── Tab Registry Initialization ──────────────────────────────────────────────

/**
 * Load saved timestamps from storage to restore context after service worker wake.
 * @returns {Promise<object>} Plain object: tabId (string) → lastActiveTimestamp (number)
 */
async function loadSavedTimestamps() {
  try {
    const result = await BrowserAdapter.storage.local.get(CONSTANTS.STORAGE_KEYS.TIMESTAMPS);
    return result[CONSTANTS.STORAGE_KEYS.TIMESTAMPS] || {};
  } catch {
    return {};
  }
}

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

/**
 * Initialize the tab registry by querying all currently open tabs.
 * Must be called on every service worker wake (onInstalled, onStartup, and
 * at the top of the script to handle mid-session wake-ups).
 */
async function initializeRegistry() {
  tabRegistry.clear();
  const savedTimestamps = await loadSavedTimestamps();

  // Load last saved session state (SESS-02: startup reconciliation)
  // Stored on globalThis so the GET_FULL_STATE message handler (wired in 02-02)
  // can return savedEntries and groups to the sidebar without re-reading storage.
  let savedState = null;
  try {
    savedState = await StorageManager.loadState();
  } catch {
    savedState = null;
  }
  globalThis._savedState = savedState;

  // Load user rules for GroupingEngine classification
  await refreshUserRulesCache();

  let allTabs;
  try {
    allTabs = await BrowserAdapter.tabs.query({});
  } catch (err) {
    console.error('[TabNest] Failed to query tabs on init:', err);
    return;
  }

  for (const tab of allTabs) {
    const entry = createTabEntry(tab);
    // Restore saved timestamp if available — more accurate after a service worker restart
    if (savedTimestamps[tab.id] !== undefined) {
      entry.lastActiveTimestamp = savedTimestamps[tab.id];
    }
    tabRegistry.set(tab.id, entry);
  }

  console.log(`[TabNest] Registry initialized: ${tabRegistry.size} tabs`);
}

// ─── Tab Event Handlers ────────────────────────────────────────────────────────

// LIFE-01: onCreated — add new tab to registry immediately
BrowserAdapter.tabs.onCreated.addListener((tab) => {
  const entry = createTabEntry(tab);
  tabRegistry.set(tab.id, entry);
  console.log(`[TabNest] Tab created: ${tab.id} — ${entry.url}`);
});

// LIFE-01: onUpdated — update url/title/favicon; handle service-worker-restart edge case
BrowserAdapter.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const entry = tabRegistry.get(tabId);
  if (!entry) {
    // Tab was open before the service worker registered this listener (restart edge case)
    tabRegistry.set(tabId, createTabEntry(tab));
    return;
  }
  updateTabEntry(entry, tab);

  // Re-classify if URL changed (user may navigate to a different context)
  if (changeInfo.url) {
    entry.groupId = GroupingEngine.classify(entry.url, entry.title, userRulesCache);
  }
});

// LIFE-01: onRemoved — remove tab from registry
BrowserAdapter.tabs.onRemoved.addListener((tabId) => {
  tabRegistry.delete(tabId);
  console.log(`[TabNest] Tab removed: ${tabId}`);
});

// LIFE-02: onActivated — update lastActiveTimestamp for the newly active tab
BrowserAdapter.tabs.onActivated.addListener((activeInfo) => {
  const { tabId } = activeInfo;
  const now = Date.now();

  const entry = tabRegistry.get(tabId);
  if (entry) {
    entry.lastActiveTimestamp = now;
    entry.stage = CONSTANTS.STAGE.ACTIVE;
  }

  console.log(`[TabNest] Tab activated: ${tabId} at ${now}`);
});

// LIFE-01: onMoved — update windowId and index when user rearranges tabs
BrowserAdapter.tabs.onMoved.addListener((tabId, moveInfo) => {
  const entry = tabRegistry.get(tabId);
  if (entry) {
    entry.windowId = moveInfo.windowId;
    entry.index    = moveInfo.toIndex;
  }
});

// LIFE-01: onAttached — tab dragged to a different window
BrowserAdapter.tabs.onAttached.addListener((tabId, attachInfo) => {
  const entry = tabRegistry.get(tabId);
  if (entry) {
    entry.windowId = attachInfo.newWindowId;
    entry.index    = attachInfo.newPosition;
  }
});

// LIFE-01: onDetached — tab in transit between windows; entry stays in registry.
// windowId/index will be updated by the subsequent onAttached event.
BrowserAdapter.tabs.onDetached.addListener((_tabId, _detachInfo) => {
  // intentionally empty — entry preserved for the onAttached update
});

// LIFE-01: onReplaced — browser replaces a tab (e.g., pre-rendering).
// Transfer the old entry to the new tabId.
BrowserAdapter.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  const oldEntry = tabRegistry.get(removedTabId);
  if (oldEntry) {
    oldEntry.tabId = addedTabId;
    tabRegistry.set(addedTabId, oldEntry);
    tabRegistry.delete(removedTabId);
  }
});

// LIFE-02: onFocusChanged — update lastActiveTimestamp for the active tab in
// the newly focused window (handles multi-window focus switching)
BrowserAdapter.windows.onFocusChanged.addListener(async (windowId) => {
  // WINDOW_ID_NONE (-1) means focus left the browser entirely
  const WINDOW_ID_NONE = (typeof chrome !== 'undefined' && chrome.windows)
    ? chrome.windows.WINDOW_ID_NONE
    : -1;
  if (windowId === WINDOW_ID_NONE) return;

  try {
    const [activeTab] = await BrowserAdapter.tabs.query({ active: true, windowId });
    if (activeTab) {
      const entry = tabRegistry.get(activeTab.id);
      if (entry) {
        entry.lastActiveTimestamp = Date.now();
      }
    }
  } catch {
    // Non-critical — next alarm tick will catch any missed update
  }
});

// ─── Alarm Listeners ───────────────────────────────────────────────────────────

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

// ─── Startup and Installation ──────────────────────────────────────────────────

// onInstalled fires on first install, extension update, and browser update
BrowserAdapter.runtime.onInstalled.addListener(async (details) => {
  console.log('[TabNest] Extension installed/updated:', details && details.reason);
  await initializeRegistry();
  // Register both alarms (alarms do NOT persist across MV3 service worker restarts)
  await BrowserAdapter.alarms.create(PERSIST_ALARM_NAME, {
    periodInMinutes: PERSIST_ALARM_PERIOD_MINUTES,
  });
  await BrowserAdapter.alarms.create(CONSTANTS.ALARM_NAME, {
    periodInMinutes: CONSTANTS.ALARM_PERIOD_MINUTES,
  });
});

// onStartup fires when the browser starts with the extension already installed
BrowserAdapter.runtime.onStartup.addListener(async () => {
  console.log('[TabNest] Browser startup — reinitializing registry');
  await initializeRegistry();
  // Re-register alarms — they do NOT persist in MV3 service workers after browser restart
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

// ─── Service Worker Wake (mid-session) ────────────────────────────────────────
// The service worker can be killed and restarted between events at any time.
// On restart, tabRegistry is empty — reinitialize immediately from storage.
initializeRegistry().then(() => {
  console.log('[TabNest] Background script ready');
});

// ─── Exports (Node.js test environment only) ──────────────────────────────────
// Export tabRegistry so unit tests can verify registry state directly.
// In the browser, module.exports is undefined — this block is safely ignored.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tabRegistry,
    isInternalPage,
    createTabEntry,
    updateTabEntry,
    persistTimestamps,
    initializeRegistry,
    refreshUserRulesCache,
    get userRulesCache() { return userRulesCache; },
  };
}
