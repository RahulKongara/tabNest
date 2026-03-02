/**
 * TabNest Group Card Component — sidebar/group-card.js
 *
 * Creates .tn-group-card elements containing all tab entries for a group.
 * Exported on globalThis.GroupCard for use by sidebar.js.
 *
 * Depends on globalThis.TabEntry (loaded via tab-entry.js before this file).
 * Depends on globalThis.ColorPicker (loaded via color-picker.js before this file).
 * Depends on globalThis.MSG_TYPES (loaded via message-protocol.js before this file).
 *
 * Phase 3 additions (03-03):
 *   - Double-click on group name triggers inline rename → sends RENAME_GROUP
 *   - Color button in header opens ColorPicker popup → sends SET_GROUP_COLOR
 *   - Drag-and-drop drop target on tabList (03-04)
 */

(function () {
  'use strict';

  /**
   * Create a group card element containing all entries for a group.
   * @param {TabGroup} group - { id, name, color, order, isCollapsed, isCustom }
   * @param {Array<TabEntry|SavedTabEntry>} entries
   * @returns {HTMLDivElement}
   */
  function create(group, entries) {
    const card = document.createElement('div');
    card.className = 'tn-group-card';
    card.dataset.groupId = group.id;
    // data-collapsed drives CSS collapse visibility
    card.setAttribute('data-collapsed', group.isCollapsed ? 'true' : 'false');
    card.style.setProperty('--group-color', group.color);

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'tn-group-header';

    // Color button (UI-10) — opens ColorPicker popup on click
    const colorBtn = document.createElement('button');
    colorBtn.className = 'tn-color-btn';
    colorBtn.style.backgroundColor = group.color;
    colorBtn.setAttribute('aria-label', `Change color for ${group.name}`);
    colorBtn.title = 'Change color';

    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Toggle: if popup already exists, remove it
      const existing = header.querySelector('.tn-color-picker-popup');
      if (existing) { existing.remove(); return; }

      const popup = document.createElement('div');
      popup.className = 'tn-color-picker-popup';

      const picker = ColorPicker.create(group.color, (newColor) => {
        popup.remove();
        chrome.runtime.sendMessage({
          type: MSG_TYPES.SET_GROUP_COLOR,
          data: { groupId: group.id, color: newColor },
        });
      });

      popup.appendChild(picker);
      header.appendChild(popup);

      // Close when user clicks anywhere outside the popup
      setTimeout(() => {
        document.addEventListener('click', function closeHandler() {
          popup.remove();
          document.removeEventListener('click', closeHandler);
        }, { once: true });
      }, 0);
    });

    // Group name span with double-click rename
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tn-group-name';
    nameSpan.textContent = group.name;

    nameSpan.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tn-group-rename-input';
      input.value = nameSpan.textContent;
      input.setAttribute('aria-label', 'Rename group');
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      function commitRename() {
        const newName = input.value.trim();
        if (newName && newName !== group.name) {
          chrome.runtime.sendMessage({
            type: MSG_TYPES.RENAME_GROUP,
            data: { groupId: group.id, name: newName },
          });
        }
        input.replaceWith(nameSpan);
        nameSpan.textContent = newName || group.name;
      }

      input.addEventListener('blur', commitRename);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
        if (e.key === 'Escape') { input.replaceWith(nameSpan); }
      });
    });

    const countSpan = document.createElement('span');
    countSpan.className = 'tn-group-count';
    countSpan.textContent = buildCountText(entries);

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'tn-collapse-btn';
    collapseBtn.setAttribute('aria-label', `${group.isCollapsed ? 'Expand' : 'Collapse'} ${group.name} group`);
    collapseBtn.setAttribute('aria-expanded', group.isCollapsed ? 'false' : 'true');
    collapseBtn.innerHTML = group.isCollapsed ? '&#9654;' : '&#9660;';
    collapseBtn.addEventListener('click', () => {
      const collapsed = card.getAttribute('data-collapsed') === 'true';
      card.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      collapseBtn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      collapseBtn.innerHTML = collapsed ? '&#9660;' : '&#9654;';
      collapseBtn.setAttribute('aria-label', `${collapsed ? 'Collapse' : 'Expand'} ${group.name} group`);
    });

    // Header order: colorBtn, nameSpan, countSpan, collapseBtn
    header.appendChild(colorBtn);
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    header.appendChild(collapseBtn);

    // ── Tab list ──────────────────────────────────────────────────────────────
    const tabList = document.createElement('ul');
    tabList.className = 'tn-tab-list';
    tabList.setAttribute('role', 'list');

    // Drag-and-drop drop target (Plan 03-04)
    tabList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tabList.classList.add('tn-drag-over');
    });

    tabList.addEventListener('dragleave', () => {
      tabList.classList.remove('tn-drag-over');
    });

    tabList.addEventListener('drop', (e) => {
      e.preventDefault();
      tabList.classList.remove('tn-drag-over');
      let payload;
      try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (!payload) return;
      // No-op if dropped in the same group
      if (payload.sourceGroupId === group.id) return;

      chrome.runtime.sendMessage({
        type: MSG_TYPES.MOVE_TO_GROUP,
        data: {
          tabId:       payload.tabId,
          savedId:     payload.savedId,
          groupId:     group.id,
          domain:      payload.domain,
          isFirstDrag: true, // Background checks if rule already exists before writing
        },
      });
    });

    const listFragment = document.createDocumentFragment();
    for (const entry of entries) {
      listFragment.appendChild(TabEntry.create(entry));
    }
    tabList.appendChild(listFragment);

    card.appendChild(header);
    card.appendChild(tabList);

    return card;
  }

  /**
   * Build count badge text for a group showing open and saved tab counts.
   * @param {Array<TabEntry|SavedTabEntry>} entries
   * @returns {string}
   */
  function buildCountText(entries) {
    const open = entries.filter(e => e.stage === 'active' || e.stage === 'discarded').length;
    const saved = entries.filter(e => e.stage === 'saved').length;
    const parts = [];
    if (open > 0) parts.push(`${open} open`);
    if (saved > 0) parts.push(`${saved} saved`);
    return parts.join(' · ') || '0 tabs';
  }

  globalThis.GroupCard = { create, buildCountText };
})();
