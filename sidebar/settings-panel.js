/**
 * TabNest Settings Panel — sidebar/settings-panel.js
 *
 * Renders the full settings overlay with five sections:
 *   1. Lifecycle Timers (T1/T2/T3 sliders)
 *   2. Behavior (5 toggles)
 *   3. Whitelist Domains (add/remove)
 *   4. Custom Domain Rules (view/delete)
 *   5. Restore (batch size slider)
 *
 * Every control fires onSave(partialSettings) immediately — no Save button (CONF-04).
 *
 * Pattern: IIFE + globalThis.SettingsPanel export (same as all sidebar/*.js modules).
 */
(function () {
  'use strict';

  const OVERLAY_ID = 'tn-settings-overlay';

  // DEFAULT_SHORTCUTS and SHORTCUT_LABELS — added for Plan 05-02 Keyboard Shortcuts section
  const DEFAULT_SHORTCUTS = {
    'toggle-sidebar':     'Ctrl+Shift+T',
    'save-close-current': 'Ctrl+Shift+S',
    'restore-last':       'Ctrl+Shift+R',
    'next-group':         'Ctrl+Shift+]',
    'prev-group':         'Ctrl+Shift+[',
    'save-close-all':     'Ctrl+Shift+X',
    'search-tabs':        'Ctrl+Shift+F',
    'discard-current':    'Ctrl+Shift+D',
  };

  const SHORTCUT_LABELS = {
    'toggle-sidebar':     'Toggle sidebar',
    'save-close-current': 'Save & close current tab',
    'restore-last':       'Restore last saved tab',
    'next-group':         'Next group',
    'prev-group':         'Previous group',
    'save-close-all':     'Save & close all inactive',
    'search-tabs':        'Focus search',
    'discard-current':    'Discard current tab',
  };

  // Module-level state: current settings + rules held for the duration the overlay is open.
  let _settings  = null;
  let _userRules = [];
  let _onSave    = null;

  /** CONF-03: Trigger a file download of the given string as JSON. */
  function _downloadJson(json, filename) {
    if (typeof URL === 'undefined' || typeof Blob === 'undefined') return; // test/Node environment
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** Remove the overlay from the DOM if it exists. */
  function close() {
    const el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    // Use body.removeChild for test-stub compatibility (modifies array in-place).
    // Fall back to el.remove() in a real DOM.
    try {
      document.body.removeChild(el);
    } catch (_) {
      try { el.remove(); } catch (__) { /* ignore */ }
    }
  }

  /**
   * Open the settings panel overlay.
   * Idempotent — calling while already open replaces the existing overlay.
   *
   * @param {object}   settings  - Current merged settings (from _state.settings)
   * @param {TabGroup[]} groups  - For displaying groupId names in custom rules section
   * @param {Array<{domain:string,groupId:string}>} userRules - Current user domain rules
   * @param {function(object):void} onSave - Called with partial settings on every control change
   */
  function open(settings, groups, userRules, onSave) {
    close(); // idempotent

    _settings  = Object.assign({}, settings);
    _userRules = Array.isArray(userRules) ? userRules.slice() : [];
    _onSave    = onSave;

    const overlay = document.createElement('div');
    overlay.id        = OVERLAY_ID;
    overlay.className = 'tn-settings-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'TabNest Settings');
    overlay.setAttribute('aria-modal', 'true');

    // Header
    const header  = document.createElement('div');
    header.className = 'tn-settings-header';
    const titleEl = document.createElement('h2');
    titleEl.className   = 'tn-settings-title';
    titleEl.textContent = 'Settings';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tn-settings-close';
    closeBtn.setAttribute('aria-label', 'Close settings');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', close);
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'tn-settings-body';
    body.appendChild(_buildTimerSection());
    body.appendChild(_buildBehaviorSection());
    body.appendChild(_buildWhitelistSection());
    body.appendChild(_buildCustomRulesSection(groups));
    body.appendChild(_buildRestoreSection());
    body.appendChild(_buildShortcutsSection());
    body.appendChild(_buildDataSection());
    overlay.appendChild(body);

    // Escape key closes the panel
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    document.body.appendChild(overlay);
    closeBtn.focus();
  }

  // ── Section builders ───────────────────────────────────────────────────────

  /** Create a titled <section> element. */
  function _section(title) {
    const s  = document.createElement('section');
    s.className = 'tn-settings-section';
    const h3 = document.createElement('h3');
    h3.className   = 'tn-settings-section-title';
    h3.textContent = title;
    s.appendChild(h3);
    return s;
  }

  /**
   * Create a labeled range-slider row.
   * Fires onSave({ [key]: numericValue }) on every 'input' event.
   */
  function _sliderRow(label, key, min, max, step, unit) {
    const row   = document.createElement('div');
    row.className = 'tn-settings-row';
    const id    = 'tn-setting-' + key;

    const valueSpan = document.createElement('span');
    valueSpan.className   = 'tn-settings-value';
    valueSpan.textContent = _settings[key] + '\u00a0' + unit;

    const lbl = document.createElement('label');
    lbl.setAttribute('for', id);
    lbl.className   = 'tn-settings-label';
    lbl.textContent = label + ' ';
    lbl.appendChild(valueSpan);

    const input = document.createElement('input');
    input.type  = 'range';
    input.id    = id;
    input.className = 'tn-settings-slider';
    input.min   = String(min);
    input.max   = String(max);
    input.step  = String(step);
    input.value = String(_settings[key]);
    input.setAttribute('aria-label',    label);
    input.setAttribute('aria-valuemin', String(min));
    input.setAttribute('aria-valuemax', String(max));
    input.setAttribute('aria-valuenow', String(_settings[key]));

    input.addEventListener('input', function () {
      const val = Number(input.value);
      valueSpan.textContent = val + '\u00a0' + unit;
      input.setAttribute('aria-valuenow', String(val));
      _settings[key] = val;
      if (_onSave) _onSave({ [key]: val });
    });

    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  /**
   * Create a labeled checkbox toggle row.
   * Fires onSave({ [key]: booleanValue }) on every 'change' event.
   */
  function _toggleRow(label, key) {
    const row = document.createElement('div');
    row.className = 'tn-settings-row tn-settings-row--toggle';
    const id  = 'tn-setting-' + key;

    const input = document.createElement('input');
    input.type      = 'checkbox';
    input.id        = id;
    input.className = 'tn-settings-toggle';
    input.checked   = !!_settings[key];
    input.setAttribute('aria-label', label);
    input.addEventListener('change', function () {
      _settings[key] = input.checked;
      if (_onSave) _onSave({ [key]: input.checked });
    });

    const lbl = document.createElement('label');
    lbl.setAttribute('for', id);
    lbl.className   = 'tn-settings-label';
    lbl.textContent = label;

    row.appendChild(input);
    row.appendChild(lbl);
    return row;
  }

  function _buildTimerSection() {
    const s = _section('Lifecycle Timers');
    s.appendChild(_sliderRow('T1 \u2014 Discard after',       't1Minutes', 1,   60,  1, 'min'));
    s.appendChild(_sliderRow('T2 \u2014 Save & Close after',  't2Minutes', 5,  120,  5, 'min'));
    s.appendChild(_sliderRow('T3 \u2014 Archive after',       't3Days',    1,   30,  1, 'days'));
    return s;
  }

  function _buildBehaviorSection() {
    const s = _section('Behavior');
    s.appendChild(_toggleRow('Auto-group new tabs',                    'autoGroup'));
    s.appendChild(_toggleRow('Persist sessions across restarts',       'persistSessions'));
    s.appendChild(_toggleRow('Hover pre-render (500\u00a0ms)',         'hoverPreRender'));
    s.appendChild(_toggleRow('Manage pinned tabs (allow Stage\u00a02)', 'managePinned'));
    s.appendChild(_toggleRow('Show RAM savings indicator',             'showRamSavings'));
    return s;
  }

  function _buildWhitelistSection() {
    const s = _section('Whitelist Domains');

    const desc = document.createElement('p');
    desc.className   = 'tn-settings-desc';
    desc.textContent = 'Domains listed here will never be auto-closed (max Stage\u00a02).';
    s.appendChild(desc);

    const listEl = document.createElement('ul');
    listEl.className = 'tn-settings-domain-list';
    listEl.id        = 'tn-whitelist-list';

    function renderList() {
      listEl.innerHTML = '';
      const domains = _settings.whitelist || [];
      if (domains.length === 0) {
        const empty = document.createElement('li');
        empty.className   = 'tn-settings-empty';
        empty.textContent = 'No domains whitelisted.';
        listEl.appendChild(empty);
        return;
      }
      for (const domain of domains) {
        const li    = document.createElement('li');
        li.className = 'tn-settings-domain-item';
        const span  = document.createElement('span');
        span.textContent = domain;
        const btn   = document.createElement('button');
        btn.className = 'tn-settings-remove-btn';
        btn.setAttribute('aria-label', 'Remove ' + domain + ' from whitelist');
        btn.textContent = '\u00d7';
        btn.addEventListener('click', function () {
          _settings.whitelist = (_settings.whitelist || []).filter(function (d) { return d !== domain; });
          if (_onSave) _onSave({ whitelist: _settings.whitelist });
          renderList();
        });
        li.appendChild(span);
        li.appendChild(btn);
        listEl.appendChild(li);
      }
    }
    renderList();

    // Add-domain row
    const addRow   = document.createElement('div');
    addRow.className = 'tn-settings-add-row';
    const addInput = document.createElement('input');
    addInput.type        = 'text';
    addInput.className   = 'tn-settings-domain-input';
    addInput.placeholder = 'example.com';
    addInput.setAttribute('aria-label', 'Add domain to whitelist');
    const addBtn = document.createElement('button');
    addBtn.className   = 'tn-settings-add-btn';
    addBtn.textContent = 'Add';
    addBtn.setAttribute('aria-label', 'Add domain to whitelist');

    function addDomain() {
      const raw    = addInput.value.trim().toLowerCase();
      const domain = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!domain) return;
      if (!_settings.whitelist) _settings.whitelist = [];
      if (_settings.whitelist.includes(domain)) { addInput.value = ''; return; }
      _settings.whitelist = _settings.whitelist.concat([domain]);
      if (_onSave) _onSave({ whitelist: _settings.whitelist });
      addInput.value = '';
      renderList();
    }

    addBtn.addEventListener('click', addDomain);
    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addDomain(); }
    });

    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    s.appendChild(listEl);
    s.appendChild(addRow);
    return s;
  }

  function _buildCustomRulesSection(groups) {
    const s = _section('Custom Domain Rules');

    const desc = document.createElement('p');
    desc.className   = 'tn-settings-desc';
    desc.textContent = 'Domain-to-group overrides created by drag-and-drop. Delete a rule to revert to auto-grouping.';
    s.appendChild(desc);

    // Build groupId → name lookup
    const groupMap = {};
    if (Array.isArray(groups)) {
      for (var i = 0; i < groups.length; i++) {
        groupMap[groups[i].id] = groups[i].name;
      }
    }

    const listEl = document.createElement('ul');
    listEl.className = 'tn-settings-domain-list';
    listEl.id        = 'tn-rules-list';

    function renderRules() {
      listEl.innerHTML = '';
      if (!_userRules || _userRules.length === 0) {
        const empty = document.createElement('li');
        empty.className   = 'tn-settings-empty';
        empty.textContent = 'No custom rules yet.';
        listEl.appendChild(empty);
        return;
      }
      for (var j = 0; j < _userRules.length; j++) {
        (function (rule) {
          const li   = document.createElement('li');
          li.className = 'tn-settings-domain-item';
          const span = document.createElement('span');
          span.textContent = rule.domain + ' \u2192 ' + (groupMap[rule.groupId] || rule.groupId);
          const btn  = document.createElement('button');
          btn.className = 'tn-settings-remove-btn';
          btn.setAttribute('aria-label', 'Remove custom rule for ' + rule.domain);
          btn.textContent = '\u00d7';
          btn.addEventListener('click', function () {
            _userRules = _userRules.filter(function (r) { return r.domain !== rule.domain; });
            if (_onSave) _onSave({ userRules: _userRules });
            renderRules();
          });
          li.appendChild(span);
          li.appendChild(btn);
          listEl.appendChild(li);
        })(_userRules[j]);
      }
    }
    renderRules();
    s.appendChild(listEl);
    return s;
  }

  function _buildRestoreSection() {
    const s = _section('Restore');
    s.appendChild(_sliderRow('Batch size (tabs opened per batch)', 'batchSize', 1, 10, 1, 'tabs'));
    return s;
  }

  function _buildShortcutsSection() {
    const s = _section('Keyboard Shortcuts');

    const note = document.createElement('p');
    note.className   = 'tn-settings-desc';
    note.textContent = 'Click Record then press your desired key combination. Changes apply immediately.';
    s.appendChild(note);

    const currentShortcuts = Object.assign({}, DEFAULT_SHORTCUTS, _settings.keyboardShortcuts || {});

    Object.keys(DEFAULT_SHORTCUTS).forEach(function (commandId) {
      const row    = document.createElement('div');
      row.className = 'tn-settings-row tn-settings-row--shortcut';

      const label = document.createElement('span');
      label.className   = 'tn-settings-label';
      label.textContent = SHORTCUT_LABELS[commandId] || commandId;

      const bindingSpan = document.createElement('span');
      bindingSpan.className   = 'tn-shortcut-binding';
      bindingSpan.textContent = currentShortcuts[commandId] || DEFAULT_SHORTCUTS[commandId];

      const recordBtn = document.createElement('button');
      recordBtn.className = 'tn-shortcut-record-btn';
      recordBtn.setAttribute('aria-label', 'Record new shortcut for ' + (SHORTCUT_LABELS[commandId] || commandId));
      recordBtn.textContent = 'Record';

      recordBtn.addEventListener('click', function () {
        recordBtn.textContent = 'Press keys\u2026';
        recordBtn.classList.add('recording');

        function onKeyDown(e) {
          e.preventDefault();
          e.stopPropagation();

          // Build human-readable binding string
          const parts = [];
          if (e.ctrlKey  || e.metaKey)  parts.push('Ctrl');
          if (e.altKey)                  parts.push('Alt');
          if (e.shiftKey)                parts.push('Shift');
          const key = e.key;
          if (!['Control','Alt','Shift','Meta'].includes(key)) parts.push(key);
          const binding = parts.join('+');

          document.removeEventListener('keydown', onKeyDown, true);
          recordBtn.textContent = 'Record';
          recordBtn.classList.remove('recording');

          if (parts.length > 1) {
            bindingSpan.textContent = binding;
            const updated = Object.assign({}, _settings.keyboardShortcuts || {}, { [commandId]: binding });
            _settings.keyboardShortcuts = updated;
            if (_onSave) _onSave({ keyboardShortcuts: updated });
          }
        }
        document.addEventListener('keydown', onKeyDown, true);
      });

      row.appendChild(label);
      row.appendChild(bindingSpan);
      row.appendChild(recordBtn);
      s.appendChild(row);
    });

    return s;
  }

  function _buildDataSection() {
    const s = _section('Data');

    // Description
    const desc = document.createElement('p');
    desc.className   = 'tn-settings-desc';
    desc.textContent = 'Export or import all saved tabs, groups, workspaces, and settings as JSON. Clear removes everything permanently.';
    s.appendChild(desc);

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'tn-settings-action-btn';
    exportBtn.id        = 'tn-export-btn';
    exportBtn.setAttribute('aria-label', 'Export all TabNest data as JSON');
    exportBtn.textContent = 'Export Data';
    exportBtn.addEventListener('click', function () {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { type: (typeof MSG_TYPES !== 'undefined' ? MSG_TYPES.EXPORT_DATA : 'EXPORT_DATA') },
          function (response) {
            if (response && response.success && response.data && response.data.json) {
              const date = new Date().toISOString().slice(0, 10);
              _downloadJson(response.data.json, 'tabnest-export-' + date + '.json');
            } else {
              console.error('[TabNest] Export failed:', response);
            }
          }
        );
      }
    });

    // Import file picker (label triggers hidden input)
    const importLabel = document.createElement('label');
    importLabel.className = 'tn-settings-action-btn tn-import-label';
    importLabel.setAttribute('aria-label', 'Import TabNest data from JSON file');
    importLabel.textContent = 'Import Data';

    const importInput = document.createElement('input');
    importInput.type    = 'file';
    importInput.id      = 'tn-import-btn';
    importInput.accept  = '.json,application/json';
    importInput.className = 'tn-import-file-input';
    importInput.setAttribute('aria-label', 'Select JSON file to import');

    const importStatus = document.createElement('p');
    importStatus.className   = 'tn-settings-import-status';
    importStatus.textContent = '';
    importStatus.setAttribute('aria-live', 'polite');

    importInput.addEventListener('change', function () {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      const ReaderClass = (typeof FileReader !== 'undefined') ? FileReader : null;
      if (!ReaderClass) return;
      const reader = new ReaderClass();
      reader.onload = function (e) {
        const json = e.target && e.target.result;
        if (typeof json !== 'string') return;
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage(
            { type: (typeof MSG_TYPES !== 'undefined' ? MSG_TYPES.IMPORT_DATA : 'IMPORT_DATA'), data: { json: json } },
            function (response) {
              if (response && response.success) {
                importStatus.textContent = 'Import successful. Reload the sidebar to see changes.';
                importStatus.style.color = '#27AE60';
              } else {
                importStatus.textContent = 'Import failed: ' + ((response && response.error) || 'unknown error');
                importStatus.style.color = '#E74C3C';
              }
            }
          );
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });

    importLabel.appendChild(importInput);

    // Clear All Data button with inline confirmation
    const clearBtn = document.createElement('button');
    clearBtn.className = 'tn-settings-action-btn tn-settings-action-btn--danger';
    clearBtn.id        = 'tn-clear-btn';
    clearBtn.setAttribute('aria-label', 'Clear all TabNest data');
    clearBtn.textContent = 'Clear All Data';

    const confirmRow = document.createElement('div');
    confirmRow.className = 'tn-settings-confirm-row';
    confirmRow.hidden    = true;

    const confirmMsg = document.createElement('span');
    confirmMsg.className   = 'tn-settings-confirm-msg';
    confirmMsg.textContent = 'This will permanently delete all saved tabs, groups, workspaces, and settings.';

    const confirmYes = document.createElement('button');
    confirmYes.className   = 'tn-settings-confirm-yes';
    confirmYes.textContent = 'Yes, clear everything';
    confirmYes.setAttribute('aria-label', 'Confirm clear all TabNest data');

    const confirmNo = document.createElement('button');
    confirmNo.className   = 'tn-settings-confirm-no';
    confirmNo.textContent = 'Cancel';
    confirmNo.setAttribute('aria-label', 'Cancel clear all data');

    clearBtn.addEventListener('click', function () {
      confirmRow.hidden = false;
      confirmYes.focus();
      clearBtn.disabled = true;
    });

    confirmNo.addEventListener('click', function () {
      confirmRow.hidden = true;
      clearBtn.disabled = false;
      clearBtn.focus();
    });

    confirmYes.addEventListener('click', function () {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { type: (typeof MSG_TYPES !== 'undefined' ? MSG_TYPES.CLEAR_DATA : 'CLEAR_DATA') },
          function (response) {
            if (response && response.success) {
              if (typeof SettingsPanel !== 'undefined') SettingsPanel.close();
            } else {
              confirmMsg.textContent = 'Clear failed: ' + ((response && response.error) || 'unknown error');
              confirmRow.hidden = false;
            }
          }
        );
      }
    });

    confirmRow.appendChild(confirmMsg);
    confirmRow.appendChild(confirmYes);
    confirmRow.appendChild(confirmNo);

    s.appendChild(exportBtn);
    s.appendChild(importLabel);
    s.appendChild(importStatus);
    s.appendChild(clearBtn);
    s.appendChild(confirmRow);
    return s;
  }

  globalThis.SettingsPanel = { open: open, close: close };

  // Node.js test environment export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SettingsPanel: { open: open, close: close } };
  }
})();
