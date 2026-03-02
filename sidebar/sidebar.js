/**
 * TabNest Sidebar Controller — sidebar/sidebar.js
 *
 * Entry point for the sidebar UI. Communicates with background exclusively
 * via chrome.runtime messages and the persistent push port.
 *
 * Dependencies (loaded via script tags before this file):
 *   - message-protocol.js → globalThis.MSG_TYPES
 *   - color-picker.js     → globalThis.ColorPicker
 *   - tab-entry.js        → globalThis.TabEntry
 *   - group-card.js       → globalThis.GroupCard
 *   - ram-indicator.js    → globalThis.RamIndicator
 *   - search-bar.js       → globalThis.SearchBar
 *
 * Phase 3 additions (03-03, 03-04, 03-05):
 *   - ContextMenu singleton for right-click context menus on tab entries and group headers
 *   - Search input wired to SearchBar.filter() with result count display
 *   - New Group button sends CREATE_GROUP to background
 */

(function () {
  'use strict';

  // ── Context Menu Singleton (Plan 03-04) ────────────────────────────────────
  const ContextMenu = (function () {
    let _el = null;

    function close() {
      if (_el) { _el.remove(); _el = null; }
    }

    /**
     * Show a context menu at the given page coordinates.
     * @param {number} x - clientX position
     * @param {number} y - clientY position
     * @param {Array<{label: string, action: function, disabled?: boolean, separator?: boolean}>} items
     */
    function show(x, y, items) {
      close();
      const menu = document.createElement('ul');
      menu.className = 'tn-context-menu';
      menu.setAttribute('role', 'menu');

      for (const item of items) {
        if (item.separator) {
          const sep = document.createElement('li');
          sep.className = 'tn-context-separator';
          sep.setAttribute('role', 'separator');
          menu.appendChild(sep);
          continue;
        }
        const li = document.createElement('li');
        li.className = 'tn-context-item';
        li.setAttribute('role', 'menuitem');
        li.textContent = item.label;
        if (item.disabled) {
          li.classList.add('tn-context-item--disabled');
          li.setAttribute('aria-disabled', 'true');
        } else {
          li.addEventListener('click', () => { close(); item.action(); });
        }
        menu.appendChild(li);
      }

      // Position the menu
      menu.style.position = 'fixed';
      menu.style.left = x + 'px';
      menu.style.top  = y + 'px';
      document.body.appendChild(menu);
      _el = menu;

      // Adjust position if menu overflows viewport
      const rect = menu.getBoundingClientRect();
      if (rect.right  > window.innerWidth)  menu.style.left = (x - rect.width)  + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top  = (y - rect.height) + 'px';

      // Close on outside click (deferred to avoid immediate close from this event)
      setTimeout(() => {
        document.addEventListener('click', close, { once: true });
      }, 0);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    return { show, close };
  })();

  // ── State ──────────────────────────────────────────────────────────────────
  let _state = {
    tabs: [],
    savedEntries: [],
    groups: [],
    settings: {},
  };

  // Current search query — persisted across push updates so fullRender() re-applies it
  let _searchQuery = '';

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
   * Applies the current _searchQuery filter before rendering.
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
    const active   = tabs.filter(e => e.stage === 'active').length;
    const discarded = tabs.filter(e => e.stage === 'discarded').length;
    const saved    = savedEntries.filter(e => e.stage === 'saved').length;
    const archived = savedEntries.filter(e => e.stage === 'archived').length;
    const total    = active + discarded + saved + archived;
    const countEl  = document.getElementById('tn-tab-count');
    countEl.textContent = `${total} tabs: ${active} active · ${discarded} discarded · ${saved} saved · ${archived} archived`;
  }

  /**
   * Update the search result count badge.
   * Hidden when no query is active.
   */
  function updateSearchResultCount(matchCount, totalCount) {
    const el = document.getElementById('tn-search-count');
    if (!el) return;
    if (!_searchQuery) {
      el.textContent = '';
      el.hidden = true;
    } else {
      el.textContent = `${matchCount} of ${totalCount} tabs`;
      el.hidden = false;
    }
  }

  /**
   * Full re-render, applying the current search filter before rendering.
   * Called after every state mutation (push updates and initial load).
   */
  function fullRender() {
    const { tabs, savedEntries, groups } = _state;
    const filtered = SearchBar.filter(_searchQuery, tabs, savedEntries, groups);
    renderGroups(filtered.tabs, filtered.savedEntries, filtered.groups);
    renderArchive(filtered.savedEntries);
    updateFooterCount(filtered.tabs, filtered.savedEntries);
    // RAM indicator uses unfiltered counts — shows true memory savings
    RamIndicator.update(tabs, savedEntries);
    updateSearchResultCount(filtered.matchCount, tabs.length + savedEntries.length);
    // RESTORE-02: re-wire hover pre-render on freshly rendered saved entries
    wireHoverPreRender();
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

  // ── Context menu handler (Plan 03-04) ─────────────────────────────────────
  function handleContextMenu(e) {
    const entryEl  = e.target.closest('.tn-tab-entry');
    const headerEl = e.target.closest('.tn-group-header');

    // Tab entry context menu
    if (entryEl) {
      e.preventDefault();
      const tabId   = entryEl.dataset.tabId   ? parseInt(entryEl.dataset.tabId, 10) : null;
      const savedId = entryEl.dataset.savedId  || null;
      const stage   = entryEl.dataset.stage    || '';
      const isSaved = stage === 'saved' || stage === 'archived';

      // "Move to Group" sub-items using current _state.groups
      const moveItems = _state.groups.map(g => ({
        label: '\u00a0\u00a0' + g.name,
        action: () => chrome.runtime.sendMessage({
          type: MSG_TYPES.MOVE_TO_GROUP,
          data: { tabId, savedId, groupId: g.id, isFirstDrag: false },
        }),
      }));

      const items = [];
      if (!isSaved && tabId) {
        items.push({ label: 'Discard',      action: () => chrome.runtime.sendMessage({ type: MSG_TYPES.DISCARD_TAB,        data: { tabId } }) });
        items.push({ label: 'Save & Close', action: () => chrome.runtime.sendMessage({ type: MSG_TYPES.SAVE_AND_CLOSE_TAB, data: { tabId } }) });
      }
      if (isSaved && savedId) {
        items.push({ label: 'Restore',      action: () => chrome.runtime.sendMessage({ type: MSG_TYPES.RESTORE_TAB,        data: { savedId } }) });
      }
      items.push({ separator: true });
      items.push({ label: 'Move to Group \u25b6', disabled: moveItems.length === 0, action: () => {} });
      for (const mi of moveItems) {
        items.push({ label: mi.label, action: mi.action });
      }

      ContextMenu.show(e.clientX, e.clientY, items);
      return;
    }

    // Group header context menu
    if (headerEl) {
      e.preventDefault();
      const card    = headerEl.closest('.tn-group-card');
      const groupId = card && card.dataset.groupId;
      if (!groupId) return;

      const group     = _state.groups.find(g => g.id === groupId);
      const groupName = group ? group.name : groupId;
      const otherGroups = _state.groups.filter(g => g.id !== groupId);

      const mergeItems = otherGroups.map(g => ({
        label: '\u00a0\u00a0' + g.name,
        action: () => chrome.runtime.sendMessage({
          type: MSG_TYPES.MERGE_GROUPS,
          data: { sourceGroupId: groupId, targetGroupId: g.id },
        }),
      }));

      const items = [
        {
          label: 'Rename',
          action: () => {
            // Trigger the double-click rename flow on the name span
            const nameSpan = headerEl.querySelector('.tn-group-name');
            if (nameSpan) nameSpan.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          },
        },
        {
          label: 'Change Color',
          action: () => {
            const colorBtn = headerEl.querySelector('.tn-color-btn');
            if (colorBtn) colorBtn.click();
          },
        },
        { separator: true },
        { label: 'Merge Into \u25b6', disabled: mergeItems.length === 0, action: () => {} },
        ...mergeItems,
        { separator: true },
        { label: 'Archive Group', action: () => chrome.runtime.sendMessage({ type: MSG_TYPES.ARCHIVE_GROUP, data: { groupId } }) },
        {
          label: 'Delete Group',
          action: () => {
            if (confirm(`Delete group "${groupName}"? All tabs will be moved to Other.`)) {
              chrome.runtime.sendMessage({ type: MSG_TYPES.DELETE_GROUP, data: { groupId } });
            }
          },
        },
      ];

      ContextMenu.show(e.clientX, e.clientY, items);
    }
  }

  // ── Event delegation for action buttons ───────────────────────────────────
  function setupEventDelegation() {
    const groupList     = document.getElementById('tn-group-list');
    const archiveSection = document.getElementById('tn-archive');

    function handleAction(e) {
      const btn = e.target.closest('button');
      if (!btn) return;

      const entry = btn.closest('.tn-tab-entry');
      if (!entry) return;

      const tabId   = entry.dataset.tabId   ? parseInt(entry.dataset.tabId, 10) : null;
      const savedId = entry.dataset.savedId  || null;

      if (btn.classList.contains('tn-action-discard') && tabId) {
        chrome.runtime.sendMessage({ type: MSG_TYPES.DISCARD_TAB,        data: { tabId } });
      } else if (btn.classList.contains('tn-action-close') && tabId) {
        chrome.runtime.sendMessage({ type: MSG_TYPES.SAVE_AND_CLOSE_TAB, data: { tabId } });
      } else if (btn.classList.contains('tn-action-restore') && savedId) {
        chrome.runtime.sendMessage({ type: MSG_TYPES.RESTORE_TAB,        data: { savedId } });
      }
    }

    groupList.addEventListener('click', handleAction);
    archiveSection.addEventListener('click', handleAction);

    // Context menus on tab entries and group headers (Plan 03-04)
    groupList.addEventListener('contextmenu', handleContextMenu);
    archiveSection.addEventListener('contextmenu', handleContextMenu);

    // Archive section toggle
    const archiveToggle = document.getElementById('tn-archive-toggle');
    const archiveList   = document.getElementById('tn-archive-list');
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

    // New Group button (Plan 03-03)
    const newGroupBtn = document.getElementById('tn-new-group-btn');
    if (newGroupBtn) {
      newGroupBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: MSG_TYPES.CREATE_GROUP,
          data: { name: 'New Group', color: '#95A5A6' },
        });
      });
    }

    // Search input wiring (Plan 03-05)
    const searchInput = document.getElementById('tn-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        _searchQuery = searchInput.value;
        fullRender();
      });
      // Clear search on Escape
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          _searchQuery = '';
          fullRender();
        }
      });
    }
  }

  // ── Hover Pre-Render (RESTORE-02) ─────────────────────────────────────────
  /**
   * Wire 500ms hover pre-render on all currently rendered saved tab entry elements.
   * Called at the end of every fullRender() — fullRender replaces all DOM nodes so
   * listeners from the previous render are automatically discarded (no accumulation).
   */
  function wireHoverPreRender() {
    document.querySelectorAll('.tn-tab-entry--saved[data-saved-id]').forEach(function (li) {
      let hoverTimer = null;
      const savedId = li.dataset.savedId;

      li.addEventListener('mouseenter', function () {
        hoverTimer = setTimeout(function () {
          chrome.runtime.sendMessage({ type: MSG_TYPES.HOVER_PRE_RENDER, data: { savedId: savedId } });
        }, 500);
      });

      li.addEventListener('mouseleave', function () {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        // Notify background to close the pre-warmed tab if it was created
        chrome.runtime.sendMessage({ type: MSG_TYPES.CANCEL_PRE_RENDER, data: { savedId: savedId } });
      });

      // Override the existing click handler to use pre-warm path
      li.addEventListener('click', function (e) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: MSG_TYPES.ACTIVATE_PRE_RENDERED, data: { savedId: savedId } })
          .catch(function () {
            // Background not ready — ignore; RESTORE_TAB fallback handled by ACTIVATE_PRE_RENDERED
          });
      }, { capture: true });
    });
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
