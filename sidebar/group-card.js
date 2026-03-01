/**
 * TabNest Group Card Component — sidebar/group-card.js
 *
 * Creates .tn-group-card elements containing all tab entries for a group.
 * Exported on globalThis.GroupCard for use by sidebar.js.
 *
 * Depends on globalThis.TabEntry (loaded via tab-entry.js before this file).
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

    // Header
    const header = document.createElement('div');
    header.className = 'tn-group-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tn-group-name';
    nameSpan.textContent = group.name;

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

    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    header.appendChild(collapseBtn);

    // Tab list
    const tabList = document.createElement('ul');
    tabList.className = 'tn-tab-list';
    tabList.setAttribute('role', 'list');

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
