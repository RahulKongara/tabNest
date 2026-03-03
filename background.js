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
    'core/url-analyzer.js',
    'core/restore-manager.js',
    'sidebar/message-protocol.js'
  );
}

// ─── In-Memory Tab Registry ────────────────────────────────────────────────────
// Map<tabId: number, TabEntry>
// Re-initialized from storage on every service worker wake (see initializeRegistry).
const tabRegistry = new Map();
globalThis._tabRegistry = tabRegistry; // exposed for LifecycleManager and debugging

const preWarmMap = new Map(); // savedId → preWarmTabId (RESTORE-02)

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
    isStateful:         false,             // legacy field — keep
    transitionType:     '',                // set by webNavigation.onCompleted; DATA-01
    hasUnsavedForm:     false,             // set by FORM_STATE_REPORT from content/form-detector.js
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

  // SESS-02: Load and reconcile saved session state
  // Stored on globalThis so the GET_FULL_STATE message handler (wired in 02-02)
  // can return savedEntries and groups to the sidebar without re-reading storage.
  let savedState = null;
  try {
    savedState = await StorageManager.loadState();
  } catch {
    savedState = null;
  }

  // Normalize: ensure groups is always an array
  if (savedState && !Array.isArray(savedState.groups)) {
    savedState.groups = CONSTANTS.DEFAULT_GROUPS;
  }
  if (savedState && !Array.isArray(savedState.savedEntries)) {
    savedState.savedEntries = [];
  }

  globalThis._savedState = savedState;
  console.log('[TabNest] Saved state loaded:', savedState
    ? `${savedState.savedEntries.length} saved entries, ${savedState.groups.length} groups`
    : 'none (fresh start)');

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

/**
 * Build the session state blob to persist to storage.local.
 * Includes savedEntries and groups from _savedState (preserves Phase 3+ customizations).
 * @returns {{ savedEntries: SavedTabEntry[], groups: TabGroup[], timestamp: number }}
 */
function buildSessionState() {
  const savedState = globalThis._savedState || {};
  return {
    savedEntries: savedState.savedEntries || [],
    groups: savedState.groups || CONSTANTS.DEFAULT_GROUPS,
    timestamp: Date.now(),
  };
}

// ─── saveAndCloseTab Helper ────────────────────────────────────────────────────

/**
 * Capture a tab snapshot, close the browser tab, push TAB_SAVED_AND_CLOSED to sidebar,
 * and persist the new saved entry to _savedState.
 * Called by LifecycleManager.tick() for Stage 2→3 candidates.
 * @param {number} tabId
 * @param {TabEntry} entry
 */
async function saveAndCloseTab(tabId, entry) {
  const savedId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${tabId}`;

  // DATA-02: request navigation history from content script before closing
  let navHistory = [];
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_NAV_HISTORY' });
    if (resp && Array.isArray(resp.history)) {
      navHistory = resp.history.slice(0, 20); // enforce max-20 server-side too
    }
  } catch {
    // Content script not injected (restricted page, new tab, etc.) — proceed without history (NFR-18)
  }

  const savedEntry = {
    savedId,
    url:               entry.url,
    title:             entry.title,
    favicon:           entry.favicon,
    groupId:           entry.groupId,
    stage:             CONSTANTS.STAGE.SAVED,
    savedAt:           Date.now(),
    navigationHistory: navHistory,
    isStateful:        false, // legacy field — keep
    isStatefulUrl:     UrlAnalyzer.isStateful(entry.url, entry.transitionType || ''),
  };

  const savedState = globalThis._savedState || { savedEntries: [], groups: CONSTANTS.DEFAULT_GROUPS };
  if (!Array.isArray(savedState.savedEntries)) savedState.savedEntries = [];
  // Upsert: update existing saved entry with same URL instead of creating a duplicate
  const existingIdx = savedState.savedEntries.findIndex(e => e.url === savedEntry.url);
  if (existingIdx !== -1) {
    savedState.savedEntries[existingIdx] = savedEntry;
  } else {
    savedState.savedEntries.push(savedEntry);
  }
  globalThis._savedState = savedState;

  await StorageManager.saveState(savedState);

  try {
    await BrowserAdapter.tabs.remove(tabId);
  } catch (err) {
    console.warn(`[TabNest] saveAndCloseTab: failed to close tabId=${tabId}:`, err.message);
  }

  pushToSidebar(MSG_TYPES.TAB_SAVED_AND_CLOSED, { entry, savedEntry });
}

// ─── findGroup Helper ──────────────────────────────────────────────────────────

/**
 * Find a group by ID in _savedState.groups.
 * @param {string} groupId
 * @returns {{ group: object|null, idx: number }}
 */
function findGroup(groupId) {
  const groups = (globalThis._savedState && globalThis._savedState.groups) || [];
  const idx = groups.findIndex(g => g.id === groupId);
  return { group: idx !== -1 ? groups[idx] : null, idx };
}

// ─── Tab Event Handlers ────────────────────────────────────────────────────────

// LIFE-01: onCreated — add new tab to registry immediately
BrowserAdapter.tabs.onCreated.addListener((tab) => {
  const entry = createTabEntry(tab);
  tabRegistry.set(tab.id, entry);
  pushToSidebar(MSG_TYPES.TAB_CREATED, { entry });
  console.log(`[TabNest] Tab created: ${tab.id} — ${entry.url}`);
  StorageManager.scheduleSave(buildSessionState());
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

  const updatedEntry = tabRegistry.get(tabId);
  if (updatedEntry) pushToSidebar(MSG_TYPES.TAB_UPDATED, { entry: updatedEntry });
});

// LIFE-01: onRemoved — remove tab from registry
BrowserAdapter.tabs.onRemoved.addListener((tabId) => {
  tabRegistry.delete(tabId);
  pushToSidebar(MSG_TYPES.TAB_REMOVED, { tabId });
  console.log(`[TabNest] Tab removed: ${tabId}`);
  StorageManager.scheduleSave(buildSessionState());
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

// DATA-01: Track POST-backed page loads — stored on entry for UrlAnalyzer at save time
if (typeof chrome !== 'undefined' && chrome.webNavigation) {
  chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId !== 0) return; // main frame only
    const entry = tabRegistry.get(details.tabId);
    if (entry) entry.transitionType = details.transitionType || '';
  });
}

// ─── handleSaveAllInactive — callable from message handler and onCommand ───────

/**
 * Save and close all inactive, non-exempt tabs.
 * Returns the count of tabs closed.
 * @returns {Promise<number>}
 */
async function handleSaveAllInactive() {
  const activeTabIds = await LifecycleManager.getActiveTabIds();
  const settings = await StorageManager.getSettings();
  const toClose = [];
  for (const [tabId, entry] of tabRegistry) {
    if (entry.isInternal) continue;
    if (activeTabIds.includes(tabId)) continue;
    const { exempt } = LifecycleManager.isExempt(entry, settings, activeTabIds, 'stage2to3');
    if (!exempt) toClose.push({ tabId, entry });
  }
  for (const { tabId, entry } of toClose) {
    await saveAndCloseTab(tabId, entry);
    tabRegistry.delete(tabId);
  }
  return toClose.length;
}

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
    await LifecycleManager.tick(tabRegistry, settings, pushToSidebar, saveAndCloseTab);
    // ── Stage 3→4 (Archive) promotion ────────────────────────────────────────
    {
      const t3Ms = ((settings.t3Days !== undefined ? settings.t3Days : CONSTANTS.DEFAULT_SETTINGS.t3Days)) * 24 * 60 * 60 * 1000;
      const savedState = globalThis._savedState;
      if (savedState && Array.isArray(savedState.savedEntries)) {
        let archiveCount = 0;
        for (const savedEntry of savedState.savedEntries) {
          if (savedEntry.stage === CONSTANTS.STAGE.SAVED) {
            const ageMs = Date.now() - (savedEntry.savedAt || 0);
            if (ageMs > t3Ms) {
              savedEntry.stage = CONSTANTS.STAGE.ARCHIVED;
              archiveCount++;
              pushToSidebar(MSG_TYPES.TAB_ARCHIVED, { savedId: savedEntry.savedId });
              console.log(`[TabNest] Stage 3→4 (Archive): savedId=${savedEntry.savedId}`);
            }
          }
        }
        if (archiveCount > 0) {
          await StorageManager.saveState(savedState);
        }
      }
    }
    // SESS-01: Auto-save after lifecycle tick (stage transitions may have occurred)
    StorageManager.scheduleSave(buildSessionState());
  }
});

// ─── Sidebar Push Port ─────────────────────────────────────────────────────────
// Sidebar connects via chrome.runtime.connect({ name: 'tabnest-sidebar' }) on load.
// All background-initiated push messages go through this port.
let sidebarPort = null;

BrowserAdapter.runtime.onConnect.addListener((port) => {
  if (port.name === 'tabnest-sidebar') {
    sidebarPort = port;
    port.onDisconnect.addListener(() => {
      sidebarPort = null;
    });
  }
});

function pushToSidebar(type, data) {
  if (sidebarPort) {
    try {
      sidebarPort.postMessage({ type, data });
    } catch (err) {
      // Port disconnected — clear reference
      sidebarPort = null;
    }
  }
}

// ─── Message Handler (Sidebar → Background) ────────────────────────────────────
BrowserAdapter.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message || 'Unknown error' });
  });
  return true; // keep message channel open for async sendResponse
});

async function handleMessage(message, sender) {
  const { type, data } = message || {};

  switch (type) {

    case MSG_TYPES.GET_FULL_STATE: {
      const tabs = [...tabRegistry.values()].filter(e => !e.isInternal);
      const savedState = globalThis._savedState || {};
      const settings = await StorageManager.getSettings();
      return {
        success: true,
        data: {
          tabs,
          savedEntries: savedState.savedEntries || [],
          groups: savedState.groups || CONSTANTS.DEFAULT_GROUPS,
          settings,
        },
      };
    }

    case MSG_TYPES.GET_SETTINGS: {
      const settings = await StorageManager.getSettings();
      return { success: true, data: { settings } };
    }

    case MSG_TYPES.SAVE_SETTINGS: {
      const newSettings = (data && data.settings) ? data.settings : {};

      // Persist all settings fields (excluding userRules) to storage.sync SETTINGS key
      const settingsToStore = Object.assign({}, newSettings);
      delete settingsToStore.userRules; // userRules are stored under USER_RULES key, not SETTINGS

      await StorageManager.saveSettings(settingsToStore);

      // Persist userRules under their own key if included
      if (newSettings.userRules !== undefined) {
        try {
          await BrowserAdapter.storage.sync.set({
            [CONSTANTS.STORAGE_KEYS.USER_RULES]: newSettings.userRules,
          });
        } catch (err) {
          console.error('[TabNest] Failed to persist user rules:', err);
        }
        await refreshUserRulesCache();
      }

      // Whitelist changes also affect the grouping exception logic — refresh cache
      if (newSettings.whitelist !== undefined) {
        await refreshUserRulesCache();
      }

      // Keep module-level settings current so lifecycle ticks use new thresholds immediately
      if (typeof settings !== 'undefined') {
        settings = Object.assign({}, settings, settingsToStore);
      }

      pushToSidebar(MSG_TYPES.SETTINGS_CHANGED, { settings: newSettings });
      return { success: true };
    }

    case MSG_TYPES.RESTORE_TAB: {
      // RESTORE-01: Create new tab, remove saved entry from state
      try {
        const { savedId } = data || {};
        if (!savedId) return { success: false, error: 'savedId is required' };
        const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
        const entryIndex = (savedState.savedEntries || []).findIndex(e => e.savedId === savedId);
        if (entryIndex === -1) return { success: false, error: 'Saved entry not found' };
        const [savedEntry] = savedState.savedEntries.splice(entryIndex, 1);
        // Persist updated state
        await StorageManager.saveState(savedState);
        // Open new tab
        const newTab = await BrowserAdapter.tabs.create({ url: savedEntry.url });
        pushToSidebar(MSG_TYPES.TAB_RESTORED, { savedId, newTabId: newTab.id });
        return { success: true, data: { newTabId: newTab.id } };
      } catch (err) {
        console.error('[TabNest] RESTORE_TAB failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    }

    case MSG_TYPES.DISCARD_TAB: {
      try {
        const { tabId } = data || {};
        if (tabId == null) return { success: false, error: 'tabId is required' };
        await BrowserAdapter.tabs.discard(tabId);
        return { success: true };
      } catch (err) {
        console.error('[TabNest] DISCARD_TAB failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    }

    case MSG_TYPES.MOVE_TO_GROUP: {
      const { tabId, savedId, groupId, domain, isFirstDrag } = data || {};

      if (tabId != null) {
        const entry = tabRegistry.get(tabId);
        if (entry) {
          entry.groupId = groupId;
          pushToSidebar(MSG_TYPES.TAB_UPDATED, { entry });
        }
      }

      if (savedId != null) {
        const savedState = globalThis._savedState || {};
        const se = (savedState.savedEntries || []).find(e => e.savedId === savedId);
        if (se) {
          se.groupId = groupId;
          await StorageManager.saveState(savedState);
        }
      }

      if (isFirstDrag && domain) {
        const existing = await BrowserAdapter.storage.sync.get(CONSTANTS.STORAGE_KEYS.USER_RULES);
        const rules = existing[CONSTANTS.STORAGE_KEYS.USER_RULES] || [];
        const ruleIdx = rules.findIndex(r => r.domain === domain);
        if (ruleIdx === -1) {
          rules.push({ domain, groupId });
        } else {
          rules[ruleIdx].groupId = groupId;
        }
        await BrowserAdapter.storage.sync.set({ [CONSTANTS.STORAGE_KEYS.USER_RULES]: rules });
        await refreshUserRulesCache();
        console.log(`[TabNest] Domain rule upserted: ${domain} → ${groupId}`);
      }

      return { success: true };
    }

    case MSG_TYPES.SAVE_AND_CLOSE_TAB: {
      const { tabId } = data || {};
      const entry = tabRegistry.get(tabId);
      if (!entry) return { success: false, error: 'Tab not found in registry' };
      await saveAndCloseTab(tabId, entry);
      tabRegistry.delete(tabId);
      return { success: true };
    }

    case MSG_TYPES.SAVE_ALL_INACTIVE: {
      const count = await handleSaveAllInactive();
      return { success: true, data: { count } };
    }

    case MSG_TYPES.DISCARD_ALL_INACTIVE: {
      const activeTabIds = await LifecycleManager.getActiveTabIds();
      const settings = await StorageManager.getSettings();
      for (const [tabId, entry] of tabRegistry) {
        if (entry.isInternal || activeTabIds.includes(tabId)) continue;
        const { exempt } = LifecycleManager.isExempt(entry, settings, activeTabIds, 'stage1to2');
        if (!exempt && BrowserAdapter.features.canDiscard) {
          try {
            await BrowserAdapter.tabs.discard(tabId);
            entry.stage = CONSTANTS.STAGE.DISCARDED;
            pushToSidebar(MSG_TYPES.TAB_DISCARDED, { entry });
          } catch { /* leave in Stage 1 */ }
        }
      }
      return { success: true };
    }

    case MSG_TYPES.CREATE_GROUP: {
      const { name, color } = data || {};
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      if (!Array.isArray(savedState.groups)) savedState.groups = [...CONSTANTS.DEFAULT_GROUPS];
      const newGroup = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `group-${Date.now()}`,
        name: (name || 'New Group').trim(),
        color: color || '#95A5A6',
        order: savedState.groups.length,
        isCollapsed: false,
        isCustom: true,
      };
      savedState.groups.push(newGroup);
      globalThis._savedState = savedState;
      await StorageManager.saveState(savedState);
      pushToSidebar(MSG_TYPES.GROUP_UPDATED, { group: newGroup });
      return { success: true, data: { group: newGroup } };
    }

    case MSG_TYPES.RENAME_GROUP: {
      const { groupId, name } = data || {};
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      const { group, idx } = findGroup(groupId);
      if (!group) return { success: false, error: 'Group not found' };
      group.name = (name || '').trim() || group.name;
      savedState.groups[idx] = group;
      await StorageManager.saveState(savedState);
      pushToSidebar(MSG_TYPES.GROUP_UPDATED, { group });
      return { success: true };
    }

    case MSG_TYPES.SET_GROUP_COLOR: {
      const { groupId, color } = data || {};
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      const { group, idx } = findGroup(groupId);
      if (!group) return { success: false, error: 'Group not found' };
      group.color = color || group.color;
      savedState.groups[idx] = group;
      await StorageManager.saveState(savedState);
      pushToSidebar(MSG_TYPES.GROUP_UPDATED, { group });
      return { success: true };
    }

    case MSG_TYPES.DELETE_GROUP: {
      const { groupId } = data || {};
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      if (!Array.isArray(savedState.groups)) return { success: false, error: 'No groups' };
      for (const [, entry] of tabRegistry) {
        if (entry.groupId === groupId) entry.groupId = 'other';
      }
      if (Array.isArray(savedState.savedEntries)) {
        for (const se of savedState.savedEntries) {
          if (se.groupId === groupId) se.groupId = 'other';
        }
      }
      savedState.groups = savedState.groups.filter(g => g.id !== groupId);
      globalThis._savedState = savedState;
      await StorageManager.saveState(savedState);
      for (const g of savedState.groups) {
        pushToSidebar(MSG_TYPES.GROUP_UPDATED, { group: g });
      }
      return { success: true };
    }

    case MSG_TYPES.MERGE_GROUPS: {
      const { sourceGroupId, targetGroupId } = data || {};
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      for (const [, entry] of tabRegistry) {
        if (entry.groupId === sourceGroupId) entry.groupId = targetGroupId;
      }
      if (Array.isArray(savedState.savedEntries)) {
        for (const se of savedState.savedEntries) {
          if (se.groupId === sourceGroupId) se.groupId = targetGroupId;
        }
      }
      savedState.groups = savedState.groups.filter(g => g.id !== sourceGroupId);
      globalThis._savedState = savedState;
      await StorageManager.saveState(savedState);
      const { group: targetGroup } = findGroup(targetGroupId);
      if (targetGroup) pushToSidebar(MSG_TYPES.GROUP_UPDATED, { group: targetGroup });
      return { success: true };
    }

    case MSG_TYPES.ARCHIVE_GROUP: {
      const { groupId } = data || {};
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      if (Array.isArray(savedState.savedEntries)) {
        for (const se of savedState.savedEntries) {
          if (se.groupId === groupId && se.stage === CONSTANTS.STAGE.SAVED) {
            se.stage = CONSTANTS.STAGE.ARCHIVED;
            pushToSidebar(MSG_TYPES.TAB_ARCHIVED, { savedId: se.savedId });
          }
        }
      }
      const { group, idx } = findGroup(groupId);
      if (group) {
        group.isCollapsed = true;
        savedState.groups[idx] = group;
        pushToSidebar(MSG_TYPES.GROUP_UPDATED, { group });
      }
      await StorageManager.saveState(savedState);
      return { success: true };
    }

    case 'FORM_STATE_REPORT': {
      // DATA-03: content script reports whether a form field has been modified
      const hasDirtyForm = Boolean((message.payload || {}).hasDirtyForm);
      if (sender && sender.tab && typeof sender.tab.id === 'number') {
        const entry = tabRegistry.get(sender.tab.id);
        if (entry) {
          entry.hasUnsavedForm = hasDirtyForm;
          if (hasDirtyForm) {
            console.log(`[TabNest] Form dirty state set: tabId=${sender.tab.id}`);
          }
        }
      }
      return { success: true };
    }

    // ── Smart Restore (RESTORE-02) — hover pre-render ─────────────────────
    case MSG_TYPES.HOVER_PRE_RENDER: {
      try {
        const { savedId } = data || {};
        const settings = await StorageManager.getSettings();
        if (settings.hoverPreRenderEnabled === false) return { success: false, reason: 'disabled' };
        const savedState = globalThis._savedState || { savedEntries: [] };
        const savedEntry = (savedState.savedEntries || []).find(e => e.savedId === savedId);
        if (!savedEntry) return { success: false, error: 'Saved entry not found' };
        const { preWarmTabId } = await RestoreManager.hoverPreRender(savedEntry);
        preWarmMap.set(savedId, preWarmTabId);
        return { success: true, data: { preWarmTabId } };
      } catch (err) {
        console.error('[TabNest] HOVER_PRE_RENDER failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    }

    case MSG_TYPES.CANCEL_PRE_RENDER: {
      try {
        const { savedId } = data || {};
        const preWarmTabId = preWarmMap.get(savedId);
        if (preWarmTabId !== undefined) {
          preWarmMap.delete(savedId);
          await RestoreManager.cancelPreRender(preWarmTabId);
        }
        return { success: true };
      } catch (err) {
        console.error('[TabNest] CANCEL_PRE_RENDER failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    }

    case MSG_TYPES.ACTIVATE_PRE_RENDERED: {
      try {
        const { savedId } = data || {};
        const preWarmTabId = preWarmMap.get(savedId);
        const savedState = globalThis._savedState || { savedEntries: [] };
        const savedEntry = (savedState.savedEntries || []).find(e => e.savedId === savedId);
        if (!savedEntry) return { success: false, error: 'Saved entry not found' };
        preWarmMap.delete(savedId);
        if (preWarmTabId !== undefined) {
          await RestoreManager.activatePreRendered(preWarmTabId, savedEntry, savedState, pushToSidebar, StorageManager);
        } else {
          // User clicked before hover pre-render completed — fall back to lazy restore
          await RestoreManager.lazyRestore(savedEntry, savedState, pushToSidebar, StorageManager);
        }
        return { success: true };
      } catch (err) {
        console.error('[TabNest] ACTIVATE_PRE_RENDERED failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    }

    // ── RESTORE_WORKSPACE (RESTORE-03 staggered batch) ────────────────────
    case MSG_TYPES.RESTORE_WORKSPACE: {
      try {
        const { workspaceId } = data || {};
        const settings = await StorageManager.getSettings();
        const batchSize = settings.batchRestoreSize || settings.batchSize || 3;
        let workspaces = [];
        try { workspaces = await StorageManager.loadWorkspaces() || []; } catch {}
        const workspace = workspaces.find(w => w.workspaceId === workspaceId);
        if (!workspace) return { success: false, error: 'Workspace not found' };
        const urls = [
          ...(workspace.tabEntries   || []).map(e => e.url),
          ...(workspace.savedEntries || []).map(e => e.url),
        ].filter(Boolean);
        await RestoreManager.batchRestore(urls, batchSize, 500);
        return { success: true, data: { count: urls.length } };
      } catch (err) {
        console.error('[TabNest] RESTORE_WORKSPACE failed:', err);
        return { success: false, error: err && err.message ? err.message : String(err) };
      }
    }

    // ── SESS-03: Workspace handlers ────────────────────────────────────────
    case MSG_TYPES.SAVE_WORKSPACE: {
      const name = (data && data.name) ? String(data.name).trim() : 'Workspace ' + new Date().toLocaleDateString();
      if (!name) return { success: false, error: 'Workspace name cannot be empty' };
      const workspaceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      const savedState = globalThis._savedState || { savedEntries: [], groups: [] };
      const tabEntries = [...tabRegistry.values()]
        .filter(e => !e.isInternal)
        .map(e => ({ url: e.url, title: e.title, favicon: e.favicon, groupId: e.groupId }));
      const snapshot = {
        workspaceId,
        name,
        createdAt:    Date.now(),
        groups:       Array.isArray(savedState.groups) ? savedState.groups.slice() : [],
        tabEntries,
        savedEntries: Array.isArray(savedState.savedEntries) ? savedState.savedEntries.slice() : [],
      };
      const result = await StorageManager.saveWorkspace(snapshot);
      if (result.success) {
        pushToSidebar(MSG_TYPES.WORKSPACE_SAVED, { workspace: snapshot });
      }
      return result;
    }

    case MSG_TYPES.LIST_WORKSPACES: {
      const workspaces = await StorageManager.loadWorkspaces();
      return { success: true, data: workspaces };
    }

    case MSG_TYPES.DELETE_WORKSPACE: {
      const { workspaceId } = data || {};
      const result = await StorageManager.deleteWorkspace(workspaceId);
      if (result.success) {
        pushToSidebar(MSG_TYPES.WORKSPACE_DELETED, { workspaceId });
      }
      return result;
    }

    // ── CONF-03: Data management handlers ─────────────────────────────────
    case MSG_TYPES.EXPORT_DATA: {
      const json = await StorageManager.exportData();
      return { success: true, data: { json } };
    }

    case MSG_TYPES.IMPORT_DATA: {
      const { json } = data || {};
      if (typeof json !== 'string' || json.length === 0) {
        return { success: false, error: 'No JSON string provided' };
      }
      const result = await StorageManager.importData(json);
      if (result.success) {
        const newState = await StorageManager.loadState();
        if (newState) globalThis._savedState = newState;
        if (typeof refreshUserRulesCache === 'function') await refreshUserRulesCache();
        const newSettings = await StorageManager.getSettings();
        if (typeof settings !== 'undefined') Object.assign(settings, newSettings);
        pushToSidebar(MSG_TYPES.SETTINGS_CHANGED, { settings: newSettings });
      }
      return result;
    }

    case MSG_TYPES.CLEAR_DATA: {
      const result = await StorageManager.clearAllData();
      if (result.success) {
        if (typeof tabRegistry !== 'undefined') tabRegistry.clear();
        globalThis._savedState = { savedEntries: [], groups: [], timestamp: Date.now() };
        if (Array.isArray(userRulesCache)) userRulesCache.length = 0;
        pushToSidebar(MSG_TYPES.SETTINGS_CHANGED, {
          settings: { ...(typeof CONSTANTS !== 'undefined' ? CONSTANTS.DEFAULT_SETTINGS : {}) },
        });
      }
      return result;
    }

    case MSG_TYPES.OPEN_SETTINGS_PANEL:
      return { success: true };

    default:
      return { success: false, error: `Unknown message type: ${type}` };
  }
}

// ─── CONF-02: Keyboard Shortcut Dispatcher ─────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.commands) {
  chrome.commands.onCommand.addListener(async (commandId) => {
    try {
      const [activeTab] = (await chrome.tabs.query({ active: true, currentWindow: true })) || [];
      switch (commandId) {
        case 'save-close-current':
          if (activeTab && !isInternalPage(activeTab.url || '')) {
            await saveAndCloseTab(activeTab.id, tabRegistry.get(activeTab.id) || { url: activeTab.url || '', title: activeTab.title || '', favicon: '', groupId: 'other', stage: 'active', savedAt: 0, isStateful: false, transitionType: '' });
          }
          break;
        case 'discard-current':
          if (activeTab) {
            await BrowserAdapter.tabs.discard(activeTab.id).catch(() => {});
          }
          break;
        case 'restore-last': {
          const savedState = globalThis._savedState || { savedEntries: [] };
          const entries = Array.isArray(savedState.savedEntries) ? savedState.savedEntries : [];
          if (entries.length > 0) {
            const last = entries.reduce((a, b) => (a.savedAt > b.savedAt ? a : b));
            const newTab = await BrowserAdapter.tabs.create({ url: last.url, active: true });
            savedState.savedEntries = entries.filter(e => e.savedId !== last.savedId);
            await StorageManager.saveState(savedState);
            pushToSidebar(MSG_TYPES.TAB_RESTORED, { savedId: last.savedId, newTabId: newTab.id });
          }
          break;
        }
        case 'save-close-all':
          await handleSaveAllInactive();
          break;
        case 'next-group':
          pushToSidebar(MSG_TYPES.FOCUS_NEXT_GROUP, {});
          break;
        case 'prev-group':
          pushToSidebar(MSG_TYPES.FOCUS_PREV_GROUP, {});
          break;
        case 'search-tabs':
          pushToSidebar(MSG_TYPES.FOCUS_SEARCH, {});
          break;
        case 'toggle-sidebar':
          // Browser handles toggle natively via manifest command binding
          break;
      }
    } catch (err) {
      console.error('[TabNest] onCommand handler error:', commandId, err);
    }
  });
}

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
