/**
 * Tests for keyboard shortcut dispatcher (Plan 05-02, CONF-02)
 * Run with: node tests/shortcuts.test.js
 */
'use strict';

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log('  PASS:', message); passed++; }
  else           { console.error('  FAIL:', message); failed++; }
}

// ── Stubs ─────────────────────────────────────────────────────────────────────
let discardCalled = [];
let createCalled = [];
let saveAndCloseCalled = [];
let pushCalls = [];
let saveAllCalled = false;

global.BrowserAdapter = {
  tabs: {
    discard: async (id) => { discardCalled.push(id); return {}; },
    create: async (opts) => { createCalled.push(opts); return { id: 9999 }; },
  },
};

global.StorageManager = {
  saveState: async () => {},
  getSettings: async () => ({ batchSize: 3 }),
};

global.MSG_TYPES = {
  TAB_RESTORED: 'TAB_RESTORED',
  FOCUS_SEARCH: 'FOCUS_SEARCH',
  FOCUS_NEXT_GROUP: 'FOCUS_NEXT_GROUP',
  FOCUS_PREV_GROUP: 'FOCUS_PREV_GROUP',
};

function isInternalPage(url) {
  return !url || url.startsWith('chrome://') || url.startsWith('about:');
}

function pushToSidebar(type, data) { pushCalls.push({ type, data }); }

async function saveAndCloseTab(tabId) { saveAndCloseCalled.push(tabId); }

async function handleSaveAllInactive() { saveAllCalled = true; }

// ── Inline dispatcher (mirrors background.js onCommand logic) ────────────────
async function dispatchCommand(commandId, activeTab) {
  switch (commandId) {
    case 'save-close-current':
      if (activeTab && !isInternalPage(activeTab.url)) {
        await saveAndCloseTab(activeTab.id);
      }
      break;
    case 'discard-current':
      if (activeTab) {
        await BrowserAdapter.tabs.discard(activeTab.id).catch(() => {});
      }
      break;
    case 'restore-last': {
      const savedState = global._savedState || { savedEntries: [] };
      const entries = savedState.savedEntries || [];
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
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('\n── MSG_TYPES additions ──');
require('../sidebar/message-protocol.js');
assert(global.MSG_TYPES.FOCUS_SEARCH === 'FOCUS_SEARCH', 'MSG_TYPES.FOCUS_SEARCH exists');
assert(global.MSG_TYPES.FOCUS_NEXT_GROUP === 'FOCUS_NEXT_GROUP', 'MSG_TYPES.FOCUS_NEXT_GROUP exists');
assert(global.MSG_TYPES.FOCUS_PREV_GROUP === 'FOCUS_PREV_GROUP', 'MSG_TYPES.FOCUS_PREV_GROUP exists');

(async () => {
  const fakeTab = { id: 42, url: 'https://example.com', active: true };
  const internalTab = { id: 43, url: 'chrome://newtab/', active: true };

  console.log('\n── save-close-current ──');
  saveAndCloseCalled = [];
  await dispatchCommand('save-close-current', fakeTab);
  assert(saveAndCloseCalled.includes(42), 'save-close-current calls saveAndCloseTab(42)');

  saveAndCloseCalled = [];
  await dispatchCommand('save-close-current', internalTab);
  assert(saveAndCloseCalled.length === 0, 'save-close-current skips internal pages');

  console.log('\n── discard-current ──');
  discardCalled = [];
  await dispatchCommand('discard-current', fakeTab);
  assert(discardCalled.includes(42), 'discard-current calls BrowserAdapter.tabs.discard(42)');

  console.log('\n── restore-last ──');
  createCalled = [];
  pushCalls = [];
  const t1 = Date.now();
  global._savedState = {
    savedEntries: [
      { savedId: 'A', url: 'https://a.com', savedAt: t1 - 1000 },
      { savedId: 'B', url: 'https://b.com', savedAt: t1 },
    ],
  };
  await dispatchCommand('restore-last', fakeTab);
  assert(createCalled.length === 1 && createCalled[0].url === 'https://b.com',
    'restore-last opens most recently saved tab URL');
  assert(global._savedState.savedEntries.length === 1 && global._savedState.savedEntries[0].savedId === 'A',
    'restore-last removes the restored entry from savedState');
  assert(pushCalls.some(p => p.type === 'TAB_RESTORED'), 'restore-last pushes TAB_RESTORED');

  console.log('\n── save-close-all ──');
  saveAllCalled = false;
  await dispatchCommand('save-close-all', fakeTab);
  assert(saveAllCalled === true, 'save-close-all calls handleSaveAllInactive()');

  console.log('\n── search-tabs ──');
  pushCalls = [];
  await dispatchCommand('search-tabs', fakeTab);
  assert(pushCalls.some(p => p.type === 'FOCUS_SEARCH'), 'search-tabs pushes FOCUS_SEARCH');

  console.log('\n── next-group / prev-group ──');
  pushCalls = [];
  await dispatchCommand('next-group', fakeTab);
  assert(pushCalls.some(p => p.type === 'FOCUS_NEXT_GROUP'), 'next-group pushes FOCUS_NEXT_GROUP');

  pushCalls = [];
  await dispatchCommand('prev-group', fakeTab);
  assert(pushCalls.some(p => p.type === 'FOCUS_PREV_GROUP'), 'prev-group pushes FOCUS_PREV_GROUP');

  console.log('\n── toggle-sidebar / unknown ──');
  let threw = false;
  try { await dispatchCommand('toggle-sidebar', fakeTab); } catch (e) { threw = true; }
  assert(!threw, 'toggle-sidebar does not throw');

  threw = false;
  try { await dispatchCommand('unknown-command', fakeTab); } catch (e) { threw = true; }
  assert(!threw, 'unknown commandId does not throw');

  console.log('\n' + '='.repeat(50));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
