/**
 * TabNest Workspace Manager — sidebar/workspace-manager.js
 *
 * Renders the Workspaces section of the sidebar.
 * Provides:
 *   - render(workspaces, onRestore, onDelete) → DOM section element
 *   - renderSavePrompt(onSave) → inline name prompt element
 *
 * Pattern: IIFE + globalThis.WorkspaceManager export (same as all sidebar modules).
 *
 * SESS-03: Named workspace snapshots — save, list, restore, delete.
 */
(function () {
  'use strict';

  /**
   * Format a Date.now() timestamp for display.
   * @param {number} ts - milliseconds since epoch
   * @returns {string}
   */
  function _formatDate(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch (_) {
      return String(ts);
    }
  }

  /**
   * Render the workspaces section.
   *
   * @param {object[]} workspaces   - Array of WorkspaceSnapshot objects
   * @param {function} onRestore    - Called with workspaceId when Restore clicked
   * @param {function} onDelete     - Called with workspaceId when Delete clicked
   * @param {function} onSaveClick  - Called when the Save Workspace button is clicked
   * @returns {HTMLElement} section element
   */
  function render(workspaces, onRestore, onDelete, onSaveClick) {
    const section = document.createElement('section');
    section.className = 'tn-workspace-section';
    section.id        = 'tn-workspace-section';
    section.setAttribute('aria-label', 'Workspaces');

    // Header: "Workspaces" label + "Save Workspace" button
    const header = document.createElement('div');
    header.className = 'tn-workspace-header';

    const title = document.createElement('h3');
    title.className   = 'tn-workspace-title';
    title.textContent = 'Workspaces';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'tn-workspace-save-btn';
    saveBtn.id        = 'tn-save-workspace-btn';
    saveBtn.setAttribute('aria-label', 'Save current session as a workspace');
    saveBtn.textContent = '+ Save Workspace';
    saveBtn.addEventListener('click', function () {
      if (typeof onSaveClick === 'function') onSaveClick();
    });

    header.appendChild(title);
    header.appendChild(saveBtn);
    section.appendChild(header);

    // List
    const list = document.createElement('ul');
    list.className = 'tn-workspace-list';
    list.id        = 'tn-workspace-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Saved workspaces');

    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      const empty = document.createElement('li');
      empty.className   = 'tn-workspace-empty';
      empty.textContent = 'No saved workspaces yet.';
      list.appendChild(empty);
    } else {
      for (const ws of workspaces) {
        list.appendChild(_buildWorkspaceItem(ws, onRestore, onDelete));
      }
    }

    section.appendChild(list);
    return section;
  }

  /**
   * Build a single workspace list item.
   * @param {object}   ws        - WorkspaceSnapshot
   * @param {function} onRestore
   * @param {function} onDelete
   * @returns {HTMLLIElement}
   */
  function _buildWorkspaceItem(ws, onRestore, onDelete) {
    const li = document.createElement('li');
    li.className = 'tn-workspace-item';
    li.setAttribute('role', 'listitem');
    li.setAttribute('data-workspace-id', ws.workspaceId || '');

    const info = document.createElement('div');
    info.className = 'tn-workspace-info';

    const nameEl = document.createElement('div');
    nameEl.className   = 'tn-workspace-name';
    nameEl.textContent = ws.name || 'Unnamed Workspace';

    const tabCount = (Array.isArray(ws.tabEntries)   ? ws.tabEntries.length   : 0) +
                     (Array.isArray(ws.savedEntries)  ? ws.savedEntries.length  : 0);
    const metaEl = document.createElement('div');
    metaEl.className   = 'tn-workspace-meta';
    metaEl.textContent = _formatDate(ws.createdAt || 0) + ' · ' + tabCount + ' tab' + (tabCount !== 1 ? 's' : '');

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    const actions = document.createElement('div');
    actions.className = 'tn-workspace-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'tn-workspace-restore-btn';
    restoreBtn.setAttribute('aria-label', 'Restore workspace: ' + (ws.name || 'Unnamed'));
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', function () {
      if (typeof onRestore === 'function') onRestore(ws.workspaceId);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tn-workspace-delete-btn';
    deleteBtn.setAttribute('aria-label', 'Delete workspace: ' + (ws.name || 'Unnamed'));
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function () {
      if (typeof onDelete === 'function') onDelete(ws.workspaceId);
    });

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(info);
    li.appendChild(actions);
    return li;
  }

  /**
   * Render an inline "name your workspace" prompt.
   * Returns the prompt element. The caller must insert it into the DOM.
   *
   * @param {function(string):void} onSave - Called with the trimmed name when confirmed
   * @param {function():void} onCancel     - Called when user cancels
   * @returns {HTMLElement}
   */
  function renderSavePrompt(onSave, onCancel) {
    const wrap = document.createElement('div');
    wrap.className = 'tn-workspace-prompt-wrap';
    wrap.id        = 'tn-workspace-prompt-wrap';

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'tn-workspace-name-input';
    input.id          = 'tn-workspace-name-input';
    input.placeholder = 'Workspace name\u2026';
    input.setAttribute('aria-label', 'Workspace name');
    input.maxLength   = 100;

    const confirmBtn = document.createElement('button');
    confirmBtn.className   = 'tn-workspace-confirm-btn';
    confirmBtn.textContent = 'Save';
    confirmBtn.setAttribute('aria-label', 'Confirm save workspace');

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'tn-workspace-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.setAttribute('aria-label', 'Cancel save workspace');

    function doSave() {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      if (typeof onSave === 'function') onSave(name);
    }

    function doCancel() {
      if (typeof onCancel === 'function') onCancel();
    }

    confirmBtn.addEventListener('click', doSave);
    cancelBtn.addEventListener('click', doCancel);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); doSave(); }
      if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
    });

    wrap.appendChild(input);
    wrap.appendChild(confirmBtn);
    wrap.appendChild(cancelBtn);

    // Auto-focus the input after mount (deferred)
    setTimeout(function () {
      try { input.focus(); } catch (_) {}
    }, 0);

    return wrap;
  }

  globalThis.WorkspaceManager = { render, renderSavePrompt };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorkspaceManager: { render, renderSavePrompt } };
  }
})();
