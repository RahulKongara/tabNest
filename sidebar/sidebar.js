/**
 * TabNest Sidebar Controller — sidebar/sidebar.js
 *
 * Entry point for the sidebar UI. Communicates with background exclusively
 * via chrome.runtime messages and the persistent push port.
 *
 * Dependencies (loaded via script tags before this file):
 *   - message-protocol.js → globalThis.MSG_TYPES
 *   - tab-entry.js        → globalThis.TabEntry
 *   - group-card.js       → globalThis.GroupCard
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _state = {
    tabs: [],
    savedEntries: [],
    groups: [],
    settings: {},
  };

  // ── Port connection ────────────────────────────────────────────────────────
  let _port = null;

  function connectToBackground() {
    _port = chrome.runtime.connect({ name: 'tabnest-sidebar' });
    _port.onMessage.addListener(handlePush);
    _port.onDisconnect.addListener(() => {
      _port = null;
      // Attempt reconnect after 1 second (handles background worker restart)
      setTimeout(connectToBackground, 1000);
    });
  }

  // ── Initial load ───────────────────────────────────────────────────────────
  async function loadInitialState() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: MSG_TYPES.GET_FULL_STATE }, (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (response && response.success) resolve(response.data);
        else reject(new Error((response && response.error) || 'GET_FULL_STATE failed'));
      });
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /**
   * Full re-render of the group list.
   * Uses a single DocumentFragment for < 200ms render with 200 entries (UI-11).
   */
  function renderGroups(tabs, savedEntries, groups) {
    const entriesByGroup = new Map();
    for (const group of groups) entriesByGroup.set(group.id, []);

    // Distribute active/discarded tabs into their groups
    for (const entry of tabs) {
      if (!entry.isInternal) {
        const list = entriesByGroup.get(entry.groupId) || entriesByGroup.get('other');
        if (list) list.push(entry);
      }
    }

    // Distribute saved entries (not archived) into their groups
    for (const entry of savedEntries) {
      if (entry.stage === 'saved') {
        const list = entriesByGroup.get(entry.groupId) || entriesByGroup.get('other');
        if (list) list.push(entry);
      }
    }

    // Build fragment — one DOM write at end
    const fragment = document.createDocumentFragment();
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
    for (const group of sortedGroups) {
      const entries = entriesByGroup.get(group.id) || [];
      if (entries.length === 0) continue;
      fragment.appendChild(GroupCard.create(group, entries));
    }

    const list = document.getElementById('tn-group-list');
    list.innerHTML = '';
    list.appendChild(fragment);
  }

  function renderArchive(savedEntries) {
    const archived = savedEntries.filter(e => e.stage === 'archived');
    const archiveList = document.getElementById('tn-archive-list');
    const archiveCount = document.getElementById('tn-archive-count');

    archiveList.innerHTML = '';
    if (archived.length === 0) {
      document.getElementById('tn-archive').style.display = 'none';
      return;
    }

    document.getElementById('tn-archive').style.display = '';
    archiveCount.textContent = `${archived.length} archived`;

    const fragment = document.createDocumentFragment();
    for (const entry of archived) {
      fragment.appendChild(TabEntry.create(entry));
    }
    archiveList.appendChild(fragment);
  }

  function updateFooterCount(tabs, savedEntries) {
    const active = tabs.filter(e => e.stage === 'active').length;
    const discarded = tabs.filter(e => e.stage === 'discarded').length;
    const saved = savedEntries.filter(e => e.stage === 'saved').length;
    const archived = savedEntries.filter(e => e.stage === 'archived').length;
    const total = active + discarded + saved + archived;
    const countEl = document.getElementById('tn-tab-count');
    countEl.textContent = `${total} tabs: ${active} active · ${discarded} discarded · ${saved} saved · ${archived} archived`;
  }

  function fullRender() {
    const { tabs, savedEntries, groups } = _state;
    renderGroups(tabs, savedEntries, groups);
    renderArchive(savedEntries);
    updateFooterCount(tabs, savedEntries);
  }

  // ── Push message handler ───────────────────────────────────────────────────
  function handlePush(message) {
    const { type, data } = message || {};

    switch (type) {
      case MSG_TYPES.TAB_CREATED:
        _state.tabs.push(data.entry);
        fullRender();
        break;

      case MSG_TYPES.TAB_UPDATED: {
        const idx = _state.tabs.findIndex(t => t.tabId === data.entry.tabId);
        if (idx !== -1) _state.tabs[idx] = data.entry;
        else _state.tabs.push(data.entry);
        fullRender();
        break;
      }

      case MSG_TYPES.TAB_REMOVED:
        _state.tabs = _state.tabs.filter(t => t.tabId !== data.tabId);
        fullRender();
        break;

      case MSG_TYPES.TAB_DISCARDED:
        // Update stage to 'discarded' in local state
        if (data.entry) {
          const idx = _state.tabs.findIndex(t => t.tabId === data.entry.tabId);
          if (idx !== -1) _state.tabs[idx] = data.entry;
        }
        fullRender();
        break;

      case MSG_TYPES.TAB_SAVED_AND_CLOSED:
        _state.tabs = _state.tabs.filter(t => t.tabId !== (data.entry && data.entry.tabId));
        if (data.savedEntry) _state.savedEntries.push(data.savedEntry);
        fullRender();
        break;

      case MSG_TYPES.TAB_RESTORED:
        _state.savedEntries = _state.savedEntries.filter(e => e.savedId !== data.savedId);
        fullRender();
        break;

      case MSG_TYPES.TAB_ARCHIVED: {
        // Update stage in savedEntries
        const arEntry = _state.savedEntries.find(e => e.savedId === data.savedId);
        if (arEntry) arEntry.stage = 'archived';
        fullRender();
        break;
      }

      case MSG_TYPES.GROUP_UPDATED: {
        // Update or add group in state
        const gIdx = _state.groups.findIndex(g => g.id === data.group.id);
        if (gIdx !== -1) _state.groups[gIdx] = data.group;
        else _state.groups.push(data.group);
        fullRender();
        break;
      }

      case MSG_TYPES.SETTINGS_CHANGED:
        _state.settings = data.settings;
        break;

      default:
        // Unknown push type — ignore
    }
  }

  // ── Event delegation for action buttons ───────────────────────────────────
  function setupEventDelegation() {
    const groupList = document.getElementById('tn-group-list');
    const archiveSection = document.getElementById('tn-archive');

    function handleAction(e) {
      const btn = e.target.closest('button');
      if (!btn) return;

      const entry = btn.closest('.tn-tab-entry');
      if (!entry) return;

      const tabId = entry.dataset.tabId ? parseInt(entry.dataset.tabId, 10) : null;
      const savedId = entry.dataset.savedId || null;

      if (btn.classList.contains('tn-action-discard') && tabId) {
        chrome.runtime.sendMessage({ type: MSG_TYPES.DISCARD_TAB, data: { tabId } });
      } else if (btn.classList.contains('tn-action-close') && tabId) {
        chrome.runtime.sendMessage({ type: MSG_TYPES.SAVE_AND_CLOSE_TAB, data: { tabId } });
      } else if (btn.classList.contains('tn-action-restore') && savedId) {
        chrome.runtime.sendMessage({ type: MSG_TYPES.RESTORE_TAB, data: { savedId } });
      }
    }

    groupList.addEventListener('click', handleAction);
    archiveSection.addEventListener('click', handleAction);

    // Archive section toggle
    const archiveToggle = document.getElementById('tn-archive-toggle');
    const archiveList = document.getElementById('tn-archive-list');
    if (archiveToggle && archiveList) {
      archiveToggle.addEventListener('click', () => {
        const isHidden = archiveList.hidden;
        archiveList.hidden = !isHidden;
        archiveToggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    }

    // Save all inactive button
    const saveAllBtn = document.getElementById('tn-save-all-btn');
    if (saveAllBtn) {
      saveAllBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MSG_TYPES.SAVE_ALL_INACTIVE });
      });
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  async function init() {
    connectToBackground();
    setupEventDelegation();

    try {
      const data = await loadInitialState();
      _state = { ...data };
      fullRender();
    } catch (err) {
      console.error('[TabNest Sidebar] Failed to load initial state:', err);
      document.getElementById('tn-group-list').textContent = 'Loading...';
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
