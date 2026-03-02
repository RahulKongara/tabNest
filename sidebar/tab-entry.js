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
  /** Stage label map — used for aria-labels and tn-sr-only text (UI-12 / NFR-23). */
  const STAGE_LABELS = { active: 'Active', discarded: 'Discarded', saved: 'Saved', archived: 'Archived' };

  function create(entry) {
    const li = document.createElement('li');
    li.className = 'tn-tab-entry';
    // data-stage drives CSS stage indicator appearance and context menu targeting
    li.setAttribute('data-stage', entry.stage);
    // UI-12: role and tabindex for keyboard navigation and screen readers
    li.setAttribute('role', 'listitem');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label',
      (entry.title || entry.url || 'Tab') + ', ' + (STAGE_LABELS[entry.stage] || entry.stage));

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
    stageSpan.setAttribute('data-stage', entry.stage);
    // UI-12 / NFR-23: mark icon as decorative; use tn-sr-only text for screen readers
    stageSpan.setAttribute('aria-hidden', 'true');

    const stageText = document.createElement('span');
    stageText.className = 'tn-sr-only';
    stageText.textContent = STAGE_LABELS[entry.stage] || entry.stage;
    stageSpan.appendChild(stageText);

    // ── Action buttons ────────────────────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'tn-tab-actions';

    const tabLabel = entry.title || entry.url || 'tab';

    if (entry.stage === 'active' || entry.stage === 'discarded') {
      const discardBtn = document.createElement('button');
      discardBtn.className = 'tn-action-btn tn-action-discard';
      discardBtn.setAttribute('aria-label', 'Discard ' + tabLabel);
      discardBtn.title = 'Discard';
      discardBtn.innerHTML = '&#128473;';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tn-action-btn tn-action-close';
      closeBtn.setAttribute('aria-label', 'Save and close ' + tabLabel);
      closeBtn.title = 'Save & Close';
      closeBtn.innerHTML = '&#10006;';

      actions.appendChild(discardBtn);
      actions.appendChild(closeBtn);
    } else {
      // saved/archived — restore button only
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'tn-action-btn tn-action-restore';
      restoreBtn.setAttribute('aria-label', 'Restore ' + tabLabel);
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

    // DATA-01: Stateful URL warning badge — rendered only when isStatefulUrl is true
    if (entry.isStatefulUrl) {
      const badge = document.createElement('span');
      badge.className = 'tn-stateful-badge';
      badge.setAttribute('aria-label', 'Warning: this URL may not fully restore page state');
      badge.title = 'Stateful URL \u2014 restoring may not return you to exactly this page state ' +
                    '(SPA route, session token, or form-submitted page)';
      badge.textContent = '\u26A0\uFE0F'; // ⚠️
      li.appendChild(badge);
    }

    li.appendChild(actions);

    // DATA-02: Collapsible navigation history section for saved/archived entries
    if ((entry.stage === 'saved' || entry.stage === 'archived') &&
        Array.isArray(entry.navigationHistory) && entry.navigationHistory.length > 0) {

      const toggle = document.createElement('button');
      toggle.className = 'tn-nav-history-toggle';
      toggle.textContent = 'History (' + entry.navigationHistory.length + ')';
      toggle.setAttribute('aria-expanded', 'false');

      const histSection = document.createElement('div');
      histSection.className = 'tn-nav-history';
      histSection.hidden = true;

      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        const nowExpanded = histSection.hidden;
        histSection.hidden = !nowExpanded;
        toggle.setAttribute('aria-expanded', String(nowExpanded));
      });

      const list = document.createElement('ol');
      list.className = 'tn-nav-history-list';
      entry.navigationHistory.forEach(function (url) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.appendChild(link);
        list.appendChild(item);
      });

      histSection.appendChild(list);
      li.appendChild(toggle);
      li.appendChild(histSection);
    }

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
