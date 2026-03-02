/**
 * Tests for core/restore-manager.js
 * Plan 04-04: RESTORE-02, RESTORE-03, RESTORE-04
 * Run with: node tests/restore-manager.test.js
 */
'use strict';

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else           { console.error(`  FAIL: ${message}`); failed++; }
}

// ── Stubs ──────────────────────────────────────────────────────────────────────

let createdTabs = [];
let removedTabIds = [];
let updatedTabIds = [];

global.MSG_TYPES = { TAB_RESTORED: 'TAB_RESTORED' };
global.BrowserAdapter = {
  tabs: {
    create: async (opts) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      createdTabs.push({ id, opts });
      return { id };
    },
    remove: async (tabId) => { removedTabIds.push(tabId); },
    update: async (tabId, props) => { updatedTabIds.push({ tabId, props }); return { id: tabId }; },
  },
  features: { canDiscard: true },
};

function makeStorageMgr() {
  return { saveState: async () => {} };
}

require('../core/restore-manager.js');
const { RestoreManager } = globalThis;

// ── RESTORE-02: hoverPreRender ─────────────────────────────────────────────────
console.log('\n── RESTORE-02: hoverPreRender ──');

(async () => {
  createdTabs = [];
  const entry = { savedId: 'id1', url: 'https://example.com' };
  const result = await RestoreManager.hoverPreRender(entry);
  assert(typeof result.preWarmTabId === 'number', 'hoverPreRender returns { preWarmTabId: number }');
  assert(createdTabs.length === 1, 'hoverPreRender creates exactly one tab');
  assert(createdTabs[0].opts.active === false, 'pre-warmed tab is not active');
  assert(createdTabs[0].opts.url === 'https://example.com', 'pre-warmed tab has correct URL');

// ── RESTORE-02: cancelPreRender ────────────────────────────────────────────────
  console.log('\n── RESTORE-02: cancelPreRender ──');

  removedTabIds = [];
  await RestoreManager.cancelPreRender(result.preWarmTabId);
  assert(removedTabIds.includes(result.preWarmTabId), 'cancelPreRender calls tabs.remove with preWarmTabId');

  // cancelPreRender on already-closed tab should not crash
  const origRemove = global.BrowserAdapter.tabs.remove;
  global.BrowserAdapter.tabs.remove = async () => { throw new Error('Tab not found'); };
  let threw = false;
  try { await RestoreManager.cancelPreRender(9999); } catch { threw = true; }
  assert(!threw, 'cancelPreRender does not throw when remove() fails');
  global.BrowserAdapter.tabs.remove = origRemove;

// ── RESTORE-02: activatePreRendered ───────────────────────────────────────────
  console.log('\n── RESTORE-02: activatePreRendered ──');

  updatedTabIds = [];
  const savedState = { savedEntries: [{ savedId: 'id2', url: 'https://example.com' }] };
  const savedEntry = savedState.savedEntries[0];
  const pushCalls = [];
  await RestoreManager.activatePreRendered(42, savedEntry, savedState, (t,d) => pushCalls.push({t,d}), makeStorageMgr());
  assert(updatedTabIds.some(u => u.tabId === 42 && u.props.active === true), 'activatePreRendered activates tab 42');
  assert(savedState.savedEntries.length === 0, 'activatePreRendered removes savedEntry from state');
  assert(pushCalls.length === 1 && pushCalls[0].t === 'TAB_RESTORED', 'activatePreRendered pushes TAB_RESTORED');

// ── RESTORE-03: batchRestore ──────────────────────────────────────────────────
  console.log('\n── RESTORE-03: batchRestore ──');

  createdTabs = [];
  const urls = ['https://a.com','https://b.com','https://c.com','https://d.com','https://e.com'];
  const tabIds = await RestoreManager.batchRestore(urls, 2, 0);
  assert(tabIds.length === 5, 'batchRestore(5 urls, batch=2) creates 5 tabs');
  assert(createdTabs.every(t => t.opts.active === false), 'all batch-restored tabs are inactive');

  createdTabs = [];
  const emptyResult = await RestoreManager.batchRestore([], 3, 0);
  assert(Array.isArray(emptyResult) && emptyResult.length === 0, 'batchRestore([]) returns empty array');

// ── RESTORE-04: lazyRestore ───────────────────────────────────────────────────
  console.log('\n── RESTORE-04: lazyRestore (canDiscard=true) ──');

  createdTabs = [];
  global.BrowserAdapter.features.canDiscard = true;
  const savedState2 = { savedEntries: [{ savedId: 'id3', url: 'https://lazy.com' }] };
  const pushCalls2 = [];
  await RestoreManager.lazyRestore(savedState2.savedEntries[0], savedState2, (t,d) => pushCalls2.push({t,d}), makeStorageMgr());
  assert(createdTabs.length === 1, 'lazyRestore creates one tab');
  assert(createdTabs[0].opts.discarded === true, 'Chromium lazyRestore uses discarded:true');
  assert(createdTabs[0].opts.active === false, 'Chromium lazyRestore tab is not active');
  assert(savedState2.savedEntries.length === 0, 'lazyRestore removes savedEntry from state');
  assert(pushCalls2.length === 1 && pushCalls2[0].t === 'TAB_RESTORED', 'lazyRestore pushes TAB_RESTORED');

  console.log('\n── RESTORE-04: lazyRestore (canDiscard=false — Firefox fallback) ──');

  createdTabs = [];
  global.BrowserAdapter.features.canDiscard = false;
  const savedState3 = { savedEntries: [{ savedId: 'id4', url: 'https://firefox.com' }] };
  await RestoreManager.lazyRestore(savedState3.savedEntries[0], savedState3, () => {}, makeStorageMgr());
  assert(createdTabs.length === 1, 'Firefox lazyRestore creates one tab');
  assert(createdTabs[0].opts.discarded !== true, 'Firefox lazyRestore does NOT use discarded:true');
  assert(createdTabs[0].opts.active === false, 'Firefox lazyRestore tab is not active');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
