/**
 * Tests for WorkspaceManager component and StorageManager workspace methods (Plan 05-04, SESS-03)
 * Run with: node tests/workspace-manager.test.js
 */
'use strict';

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log('  PASS:', message); passed++; }
  else           { console.error('  FAIL:', message); failed++; }
}

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
function makeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    id: '', className: '', type: '', textContent: '', innerHTML: '',
    value: '', maxLength: 0, placeholder: '',
    children: [], _listeners: {}, _attrs: {}, style: {}, dataset: {},
    setAttribute:    function (k, v) { this._attrs[k] = v; },
    getAttribute:    function (k)    { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
    appendChild:     function (c)    { this.children.push(c); return c; },
    insertBefore:    function (c, ref) {
      const idx = this.children.indexOf(ref);
      if (idx !== -1) this.children.splice(idx, 0, c);
      else this.children.push(c);
      return c;
    },
    removeChild:     function (c)    { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); },
    addEventListener: function (ev, fn) {
      if (!this._listeners[ev]) this._listeners[ev] = [];
      this._listeners[ev].push(fn);
    },
    dispatchEvent:   function (ev) { (this._listeners[ev.type] || []).forEach(h => h(ev)); },
    remove:          function () {},
    focus:           function () {},
    click:           function () { (this._listeners['click'] || []).forEach(h => h({})); },
    firstChild:      null,
    classList: {
      _list: new Set(),
      add:      function (c) { this._list.add(c); },
      remove:   function (c) { this._list.delete(c); },
      contains: function (c) { return this._list.has(c); },
    },
  };
  return el;
}

global.document = { createElement: (tag) => makeEl(tag) };

// ── Load modules ──────────────────────────────────────────────────────────────
require('../sidebar/workspace-manager.js');
const WM = global.WorkspaceManager;

// ── StorageManager workspace method tests ─────────────────────────────────────
const _localWs = {};
global.BrowserAdapter = {
  storage: {
    local: {
      get:  async (key) => ({ [key]: _localWs[key] }),
      set:  async (obj) => { Object.assign(_localWs, obj); },
    },
    sync: {
      get:  async (key) => ({}),
      set:  async () => {},
    },
  },
};
global.CONSTANTS = {
  STORAGE_KEYS: {
    SESSION_STATE: 'tabnest_session',
    SETTINGS:      'tabnest_settings',
    USER_RULES:    'tabnest_user_rules',
    WORKSPACES:    'tabnest_workspaces',
  },
  DEFAULT_SETTINGS: { t1Minutes: 5 },
  MAX_WORKSPACES: 20,
};

require('../core/storage-manager.js');
const { StorageManager } = global;

// Helper: make a workspace snapshot
function makeWs(id, name, createdAt) {
  return {
    workspaceId: id,
    name:        name || 'Test',
    createdAt:   createdAt || Date.now(),
    groups:      [],
    tabEntries:  [{ url: 'https://a.com', title: 'A', favicon: '', groupId: 'dev' }],
    savedEntries: [],
  };
}

(async () => {
  console.log('\n── StorageManager.saveWorkspace() ──');

  const ws1 = makeWs('ws1', 'Morning Session', Date.now());
  const r1 = await StorageManager.saveWorkspace(ws1);
  assert(r1.success === true, 'saveWorkspace() returns { success: true }');
  assert(r1.workspace && r1.workspace.workspaceId === 'ws1', 'saveWorkspace returns the snapshot in response');

  const loaded = await StorageManager.loadWorkspaces();
  assert(Array.isArray(loaded) && loaded.length === 1, 'loadWorkspaces() returns array with 1 workspace after save');
  assert(loaded[0].workspaceId === 'ws1', 'loadWorkspaces returns the correct workspace');

  console.log('\n── StorageManager.loadWorkspaces() — empty ──');
  delete _localWs['tabnest_workspaces'];
  const emptyLoad = await StorageManager.loadWorkspaces();
  assert(Array.isArray(emptyLoad) && emptyLoad.length === 0, 'loadWorkspaces() returns [] when no workspaces stored');

  console.log('\n── StorageManager.deleteWorkspace() ──');
  await StorageManager.saveWorkspace(makeWs('ws-del1', 'Delete Me'));
  await StorageManager.saveWorkspace(makeWs('ws-del2', 'Keep Me'));
  const dResult = await StorageManager.deleteWorkspace('ws-del1');
  assert(dResult.success === true, 'deleteWorkspace() returns { success: true }');
  const afterDelete = await StorageManager.loadWorkspaces();
  assert(afterDelete.length === 1 && afterDelete[0].workspaceId === 'ws-del2',
    'deleteWorkspace() removes only the targeted workspace');

  console.log('\n── MAX_WORKSPACES limit enforcement ──');
  // Fill up to 20 workspaces
  delete _localWs['tabnest_workspaces'];
  for (let i = 0; i < 20; i++) {
    await StorageManager.saveWorkspace(makeWs('ws-' + i, 'WS ' + i, i));
  }
  const before21 = await StorageManager.loadWorkspaces();
  assert(before21.length === 20, 'exactly 20 workspaces stored at limit');
  // Add 21st — oldest should be evicted
  await StorageManager.saveWorkspace(makeWs('ws-21', 'Twenty-First', 21));
  const after21 = await StorageManager.loadWorkspaces();
  assert(after21.length === 20, 'workspace count stays at 20 after eviction');
  assert(after21[0].workspaceId === 'ws-1', 'oldest workspace (ws-0) was evicted; ws-1 is now first');
  assert(after21[after21.length - 1].workspaceId === 'ws-21', 'newest workspace (ws-21) is last');

  console.log('\n── WorkspaceManager.render() ──');
  const workspaces = [
    makeWs('ws-a', 'Alpha'),
    makeWs('ws-b', 'Beta'),
  ];
  let restoreCalled = null, deleteCalled = null, saveBtnCalled = false;
  const section = WM.render(
    workspaces,
    function (id) { restoreCalled = id; },
    function (id) { deleteCalled = id; },
    function ()   { saveBtnCalled = true; }
  );
  assert(section.id === 'tn-workspace-section', 'render() returns element with id tn-workspace-section');
  assert(section.className.includes('tn-workspace-section'), 'render() element has tn-workspace-section class');

  // Find list
  function findEl(el, id) {
    if (el.id === id) return el;
    for (const c of el.children || []) {
      const f = findEl(c, id);
      if (f) return f;
    }
    return null;
  }
  const list = findEl(section, 'tn-workspace-list');
  assert(list !== null, 'render() contains element with id tn-workspace-list');
  assert(list.children.length === 2, 'workspace list has 2 items for 2 workspaces');

  // Test restore button
  function findByClass(el, cls) {
    const results = [];
    if (el.className && el.className.includes(cls)) results.push(el);
    for (const c of el.children || []) for (const r of findByClass(c, cls)) results.push(r);
    return results;
  }
  const restoreBtns = findByClass(section, 'tn-workspace-restore-btn');
  assert(restoreBtns.length === 2, 'render() has 2 restore buttons');
  restoreBtns[0].dispatchEvent({ type: 'click' });
  assert(restoreCalled === 'ws-a', 'restore button calls onRestore with correct workspaceId');

  const deleteBtns = findByClass(section, 'tn-workspace-delete-btn');
  deleteBtns[1].dispatchEvent({ type: 'click' });
  assert(deleteCalled === 'ws-b', 'delete button calls onDelete with correct workspaceId');

  // Save Workspace button
  const saveBtns = findByClass(section, 'tn-workspace-save-btn');
  assert(saveBtns.length === 1, 'render() has 1 save workspace button');
  saveBtns[0].dispatchEvent({ type: 'click' });
  assert(saveBtnCalled, 'save workspace button calls onSaveClick');

  console.log('\n── WorkspaceManager.renderSavePrompt() ──');
  let promptSaveName = null, promptCancelled = false;
  const prompt = WM.renderSavePrompt(
    function (name) { promptSaveName = name; },
    function ()     { promptCancelled = true; }
  );
  assert(prompt.id === 'tn-workspace-prompt-wrap', 'renderSavePrompt returns element with id tn-workspace-prompt-wrap');

  const input = findEl(prompt, 'tn-workspace-name-input');
  assert(input !== null, 'prompt contains input with id tn-workspace-name-input');

  // Simulate typing and pressing Enter
  input.value = 'My Workspace';
  input.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: function () {} });
  assert(promptSaveName === 'My Workspace', 'Enter key calls onSave with the typed name');

  // Cancel
  input.value = '';
  input.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: function () {} });
  assert(promptCancelled, 'Escape key calls onCancel');

  console.log('\n── Empty workspace list ──');
  const emptySection = WM.render([], function () {}, function () {}, function () {});
  const emptyItems = findByClass(emptySection, 'tn-workspace-empty');
  assert(emptyItems.length > 0, 'render() shows empty-state message when workspaces array is empty');

  console.log('\n' + '='.repeat(50));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
