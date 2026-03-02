/**
 * TabNest Tab Entry Component — sidebar/tab-entry.js
 *
 * Creates <li> elements representing individual tab entries.
 * Exported on globalThis.TabEntry for use by group-card.js and sidebar.js.
 *
 * Supports both live tabs (TabEntry: stage active/discarded)
 * and closed tabs (SavedTabEntry: stage saved/archived).
 *
 * Phase 3 additions (03-04):
 *   - Entries are draggable (HTML5 drag API) for cross-group reordering
 *   - dragstart encodes tabId/savedId/domain/sourceGroupId into dataTransfer
 *   - data-stage attribute set for context menu targeting in sidebar.js
 */

(function () {
  'use strict';

  const DEFAULT_FAVICON = chrome.runtime.getURL('icons/icon16.png');

  /**
   * Create a tab entry list item element.
   * @param {TabEntry|SavedTabEntry} entry
   * @returns {HTMLLIElement}
   */
  function create(entry) {
    const li = document.createElement('li');
    li.className = 'tn-tab-entry';
    // data-stage drives CSS stage indicator appearance and context menu targeting
    li.setAttribute('data-stage', entry.stage);

    // Set the appropriate data attribute for JS targeting
    if (entry.tabId !== undefined) {
      li.dataset.tabId = entry.tabId;
    } else {
      li.dataset.savedId = entry.savedId;
    }

    // ── Drag-and-drop support (Plan 03-04) ────────────────────────────────────
    li.draggable = true;

    li.addEventListener('dragstart', (e) => {
      const domain = extractDomain(entry.url || '');
      const payload = {
        tabId:         entry.tabId   !== undefined ? entry.tabId   : null,
        savedId:       entry.savedId !== undefined ? entry.savedId : null,
        domain,
        sourceGroupId: entry.groupId,
      };
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('tn-drag-source');
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('tn-drag-source');
    });

    // ── Favicon ───────────────────────────────────────────────────────────────
    const img = document.createElement('img');
    img.className = 'tn-favicon';
    img.width = 16;
    img.height = 16;
    img.alt = '';
    img.src = entry.favicon || DEFAULT_FAVICON;
    img.onerror = () => { img.src = DEFAULT_FAVICON; };

    // ── Info block ────────────────────────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'tn-tab-info';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tn-tab-title';
    titleSpan.textContent = entry.title || entry.url || 'Untitled';
    titleSpan.title = entry.title || entry.url || '';  // full title on hover

    const domainSpan = document.createElement('span');
    domainSpan.className = 'tn-tab-domain';
    domainSpan.textContent = extractDomain(entry.url);

    info.appendChild(titleSpan);
    info.appendChild(domainSpan);

    // ── Stage indicator ───────────────────────────────────────────────────────
    const stageSpan = document.createElement('span');
    stageSpan.className = 'tn-stage-indicator';
    const stageLabels = { active: 'Active', discarded: 'Discarded', saved: 'Saved', archived: 'Archived' };
    stageSpan.setAttribute('aria-label', stageLabels[entry.stage] || entry.stage);

    // ── Action buttons ────────────────────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'tn-tab-actions';

    if (entry.stage === 'active' || entry.stage === 'discarded') {
      const discardBtn = document.createElement('button');
      discardBtn.className = 'tn-action-btn tn-action-discard';
      discardBtn.setAttribute('aria-label', 'Discard tab');
      discardBtn.title = 'Discard';
      discardBtn.innerHTML = '&#128473;';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tn-action-btn tn-action-close';
      closeBtn.setAttribute('aria-label', 'Save and close tab');
      closeBtn.title = 'Save & Close';
      closeBtn.innerHTML = '&#10006;';

      actions.appendChild(discardBtn);
      actions.appendChild(closeBtn);
    } else {
      // saved/archived — restore button only
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'tn-action-btn tn-action-restore';
      restoreBtn.setAttribute('aria-label', 'Restore tab');
      restoreBtn.title = 'Restore';
      restoreBtn.innerHTML = '&#8617;';
      actions.appendChild(restoreBtn);

      // Clicking the entry title also restores
      li.classList.add('tn-tab-entry--saved');
      li.style.cursor = 'pointer';
    }

    li.appendChild(img);
    li.appendChild(info);
    li.appendChild(stageSpan);
    li.appendChild(actions);

    return li;
  }

  /**
   * Extract display domain from a URL string.
   * Strips www. prefix for cleaner display.
   * @param {string} url
   * @returns {string}
   */
  function extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
      return '';
    }
  }

  globalThis.TabEntry = { create, extractDomain };
})();
