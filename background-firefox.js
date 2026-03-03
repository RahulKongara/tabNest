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

/* global BrowserAdapter, CONSTANTS, LifecycleManager, GroupingEngine, StorageManager */

(function () {
  'use strict';

  // In MV2 persistent background, tabRegistry survives between events.
  // The background page is always alive so Map state is stable.
  const tabRegistry = new Map();
  globalThis._tabRegistry = tabRegistry; // exposed for LifecycleManager and debugging

  const preWarmMap = new Map(); // savedId → preWarmTabId (RESTORE-02)

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
      isStateful:          false,          // legacy field — keep
      transitionType:      '',             // set by webNavigation.onCompleted; DATA-01
      hasUnsavedForm:      false,          // set by FORM_STATE_REPORT from content/form-detector.js
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
    console.log('[TabNest FF] Saved state loaded:', savedState
      ? `${savedState.savedEntries.length} saved entries, ${savedState.groups.length} groups`
      : 'none (fresh start)');

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

  // ─── saveAndCloseTab Helper ───────────────────────────────────────────────────

  async function saveAndCloseTab(tabId, entry) {
    const savedId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${tabId}`;

    // DATA-02: request navigation history from content script before closing
    let navHistory = [];
    try {
      const resp = await BrowserAdapter.tabs.sendMessage(tabId, { type: 'CAPTURE_NAV_HISTORY' });
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
    savedState.savedEntries.push(savedEntry);
    globalThis._savedState = savedState;

    await StorageManager.saveState(savedState);

    try {
      await BrowserAdapter.tabs.remove(tabId);
    } catch (err) {
      console.warn(`[TabNest FF] saveAndCloseTab: failed to close tabId=${tabId}:`, err.message);
    }

    pushToSidebar(MSG_TYPES.TAB_SAVED_AND_CLOSED, { entry, savedEntry });
  }

  // ─── findGroup Helper ─────────────────────────────────────────────────────────

  function findGroup(groupId) {
    const groups = (globalThis._savedState && globalThis._savedState.groups) || [];
    const idx = groups.findIndex(g => g.id === groupId);
    return { group: idx !== -1 ? groups[idx] : null, idx };
  }

  // ─── Tab Event Handlers ───────────────────────────────────────────────────────

  // LIFE-01: onCreated
  BrowserAdapter.tabs.onCreated.addListener((tab) => {
    const entry = createTabEntry(tab);
    tabRegistry.set(tab.id, entry);
    pushToSidebar(MSG_TYPES.TAB_CREATED, { entry });
    console.log(`[TabNest FF] Tab created: ${tab.id}`);
    StorageManager.scheduleSave(buildSessionState());
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

    const updatedEntry = tabRegistry.get(tabId);
    if (updatedEntry) pushToSidebar(MSG_TYPES.TAB_UPDATED, { entry: updatedEntry });
  });

  // LIFE-01: onRemoved
  BrowserAdapter.tabs.onRemoved.addListener((tabId) => {
    tabRegistry.delete(tabId);
    pushToSidebar(MSG_TYPES.TAB_REMOVED, { tabId });
    console.log(`[TabNest FF] Tab removed: ${tabId}`);
    StorageManager.scheduleSave(buildSessionState());
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

  // DATA-01: Track POST-backed page loads — stored on entry for UrlAnalyzer at save time
  BrowserAdapter.webNavigation.onCompleted.addListener(function(details) {
    if (details.frameId !== 0) return; // main frame only
    const entry = tabRegistry.get(details.tabId);
    if (entry) entry.transitionType = details.transitionType || '';
  });

  // ─── handleSaveAllInactive — callable from message handler and onCommand ──────

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
      await LifecycleManager.tick(tabRegistry, settings, pushToSidebar, saveAndCloseTab);
      // ── Stage 3→4 (Archive) promotion ──────────────────────────────────────
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
                console.log(`[TabNest FF] Stage 3→4 (Archive): savedId=${savedEntry.savedId}`);
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

  // ─── Sidebar Push Port ───────────────────────────────────────────────────────
  // Sidebar connects via browser.runtime.connect({ name: 'tabnest-sidebar' }) on load.
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

  // ─── Message Handler (Sidebar → Background) ──────────────────────────────────
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
        delete settingsToStore.userRules; // userRules stored under USER_RULES key

        await StorageManager.saveSettings(settingsToStore);

        // Persist userRules under their own key if included
        if (newSettings.userRules !== undefined) {
          try {
            await BrowserAdapter.storage.sync.set({
              [CONSTANTS.STORAGE_KEYS.USER_RULES]: newSettings.userRules,
            });
          } catch (err) {
            console.error('[TabNest FF] Failed to persist user rules:', err);
          }
          await refreshUserRulesCache();
        }

        // Whitelist changes also affect the grouping exception logic — refresh cache
        if (newSettings.whitelist !== undefined) {
          await refreshUserRulesCache();
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
          console.error('[TabNest FF] RESTORE_TAB failed:', err);
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
          console.error('[TabNest FF] DISCARD_TAB failed:', err);
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
              console.log(`[TabNest FF] Form dirty state set: tabId=${sender.tab.id}`);
            }
          }
        }
        return { success: true };
      }

      // ── Smart Restore (RESTORE-02) — hover pre-render ───────────────────
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
          console.error('[TabNest FF] HOVER_PRE_RENDER failed:', err);
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
          console.error('[TabNest FF] CANCEL_PRE_RENDER failed:', err);
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
          console.error('[TabNest FF] ACTIVATE_PRE_RENDERED failed:', err);
          return { success: false, error: err && err.message ? err.message : String(err) };
        }
      }

      // ── RESTORE_WORKSPACE (RESTORE-03 staggered batch) ──────────────────
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
          console.error('[TabNest FF] RESTORE_WORKSPACE failed:', err);
          return { success: false, error: err && err.message ? err.message : String(err) };
        }
      }

      // ── SESS-03: Workspace handlers ──────────────────────────────────────
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

      // ── CONF-03: Data management handlers ───────────────────────────────
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
          pushToSidebar(MSG_TYPES.SETTINGS_CHANGED, { settings: newSettings });
        }
        return result;
      }

      case MSG_TYPES.CLEAR_DATA: {
        const result = await StorageManager.clearAllData();
        if (result.success) {
          tabRegistry.clear();
          globalThis._savedState = { savedEntries: [], groups: [], timestamp: Date.now() };
          userRulesCache = [];
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

  // ─── CONF-02: Keyboard Shortcut Dispatcher ────────────────────────────────────
  if (typeof chrome !== 'undefined' && chrome.commands) {
    chrome.commands.onCommand.addListener(async (commandId) => {
      try {
        const [activeTab] = (await chrome.tabs.query({ active: true, currentWindow: true })) || [];
        switch (commandId) {
          case 'save-close-current':
            if (activeTab && !isInternalPage(activeTab.url || '')) {
              const entry = tabRegistry.get(activeTab.id);
              if (entry) await saveAndCloseTab(activeTab.id, entry);
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
            break;
        }
      } catch (err) {
        console.error('[TabNest FF] onCommand handler error:', commandId, err);
      }
    });
  } else if (typeof browser !== 'undefined' && browser.commands) {
    browser.commands.onCommand.addListener(async (commandId) => {
      try {
        const [activeTab] = (await browser.tabs.query({ active: true, currentWindow: true })) || [];
        switch (commandId) {
          case 'save-close-current':
            if (activeTab && !isInternalPage(activeTab.url || '')) {
              const entry = tabRegistry.get(activeTab.id);
              if (entry) await saveAndCloseTab(activeTab.id, entry);
            }
            break;
          case 'discard-current':
            if (activeTab) await BrowserAdapter.tabs.discard(activeTab.id).catch(() => {});
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
          case 'save-close-all': await handleSaveAllInactive(); break;
          case 'next-group': pushToSidebar(MSG_TYPES.FOCUS_NEXT_GROUP, {}); break;
          case 'prev-group': pushToSidebar(MSG_TYPES.FOCUS_PREV_GROUP, {}); break;
          case 'search-tabs': pushToSidebar(MSG_TYPES.FOCUS_SEARCH, {}); break;
          case 'toggle-sidebar': break;
        }
      } catch (err) {
        console.error('[TabNest FF] onCommand handler error:', commandId, err);
      }
    });
  }

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
