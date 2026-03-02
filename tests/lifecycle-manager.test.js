/**
 * Tests for core/lifecycle-manager.js
 * Plan 01-04: LIFE-03 (30s alarm evaluation), LIFE-07 (exception rules)
 *
 * Run with: node tests/lifecycle-manager.test.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Setup browser globals ────────────────────────────────────────────────────

global.CONSTANTS = {
  STAGE: { ACTIVE: 'active', DISCARDED: 'discarded', SAVED: 'saved', ARCHIVED: 'archived' },
  BROWSER_INTERNAL_PROTOCOLS: ['chrome://', 'about:', 'edge://', 'moz-extension://'],
  DEFAULT_SETTINGS: { t1Minutes: 5, t2Minutes: 15, t3Days: 7, whitelist: [] },
  ALARM_NAME: 'tabnest-lifecycle-tick',
  ALARM_PERIOD_MINUTES: 0.5,
};

let discardedTabIds = [];
global.BrowserAdapter = {
  tabs: {
    query: async (filter) => {
      if (filter && filter.active) return mockActiveTabs;
      return [];
    },
    discard: async (tabId) => {
      discardedTabIds.push(tabId);
      return {};
    },
  },
  features: { canDiscard: true },
};

let mockActiveTabs = [];

require('../core/lifecycle-manager.js');

const LM = global.LifecycleManager;
const baseSettings = { t1Minutes: 5, t2Minutes: 15, t3Days: 7, whitelist: [] };

// ─── isExempt() Tests ─────────────────────────────────────────────────────────

console.log('\n=== isExempt() — LIFE-07 exception rules ===');

// Test 1: Browser-internal pages are never managed
{
  const r = LM.isExempt(
    { isInternal: true, url: 'chrome://newtab/', tabId: 1, stage: 'active', isAudible: false, isPinned: false, hasUnsavedForm: false },
    baseSettings, []
  );
  assertEqual(r.exempt, true, 'Test 1: internal page is exempt');
  assertEqual(r.reason, 'internal', 'Test 1: reason is "internal"');
}

// Test 2: Currently active tab is exempt
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://github.com', tabId: 5, stage: 'active', isAudible: false, isPinned: false, hasUnsavedForm: false },
    baseSettings, [5]
  );
  assertEqual(r.exempt, true, 'Test 2: active tab is exempt');
  assertEqual(r.reason, 'active', 'Test 2: reason is "active"');
}

// Test 3: Audible tab is exempt from all transitions
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://youtube.com', tabId: 2, stage: 'active', isAudible: true, isPinned: false, hasUnsavedForm: false },
    baseSettings, []
  );
  assertEqual(r.exempt, true, 'Test 3: audible tab is exempt');
  assertEqual(r.reason, 'audible', 'Test 3: reason is "audible"');
}

// Test 4a: Pinned tab is exempt from Stage 3 (no close)
{
  const pinnedEntry = { isInternal: false, url: 'https://gmail.com', tabId: 3, stage: 'discarded', isAudible: false, isPinned: true, hasUnsavedForm: false };
  const r = LM.isExempt(pinnedEntry, baseSettings, [], 'stage2to3');
  assertEqual(r.exempt, true, 'Test 4a: pinned tab exempt from stage2to3');
  assertEqual(r.reason, 'pinned-no-close', 'Test 4a: reason is "pinned-no-close"');
}

// Test 4b: Pinned tab is NOT exempt from Stage 2 (can be discarded)
{
  const pinnedEntry = { isInternal: false, url: 'https://gmail.com', tabId: 3, stage: 'active', isAudible: false, isPinned: true, hasUnsavedForm: false };
  const r = LM.isExempt(pinnedEntry, baseSettings, [], 'stage1to2');
  assertEqual(r.exempt, false, 'Test 4b: pinned tab NOT exempt from stage1to2 (discard is allowed)');
}

// Test 5: Whitelisted domain tab exempt from Stage 3
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://gmail.com', tabId: 4, stage: 'discarded', isAudible: false, isPinned: false, hasUnsavedForm: false },
    { ...baseSettings, whitelist: ['gmail.com'] }, [], 'stage2to3'
  );
  assertEqual(r.exempt, true, 'Test 5: whitelisted domain exempt from stage2to3');
  assertEqual(r.reason, 'whitelisted', 'Test 5: reason is "whitelisted"');
}

// Test 5b: Whitelisted domain can still be discarded (Stage 2 is ok)
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://gmail.com', tabId: 4, stage: 'active', isAudible: false, isPinned: false, hasUnsavedForm: false },
    { ...baseSettings, whitelist: ['gmail.com'] }, [], 'stage1to2'
  );
  assertEqual(r.exempt, false, 'Test 5b: whitelisted domain NOT exempt from stage1to2 (discard allowed)');
}

// Test 6: Already-saved tab is exempt
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://example.com', tabId: 6, stage: 'saved', isAudible: false, isPinned: false, hasUnsavedForm: false },
    baseSettings, []
  );
  assertEqual(r.exempt, true, 'Test 6: already-saved tab is exempt');
  assertEqual(r.reason, 'already-saved', 'Test 6: reason is "already-saved"');
}

// Test 6b: Archived tab is also exempt
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://example.com', tabId: 7, stage: 'archived', isAudible: false, isPinned: false, hasUnsavedForm: false },
    baseSettings, []
  );
  assertEqual(r.exempt, true, 'Test 6b: archived tab is exempt');
  assertEqual(r.reason, 'already-saved', 'Test 6b: reason is "already-saved"');
}

// Test 7: Normal tab with no exemptions returns exempt=false
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://github.com', tabId: 9, stage: 'active', isAudible: false, isPinned: false, hasUnsavedForm: false },
    baseSettings, [1, 2, 3]
  );
  assertEqual(r.exempt, false, 'Test 7: normal tab with no exemptions returns exempt=false');
  assertEqual(r.reason, '', 'Test 7: reason is empty string');
}

// Test 8: Tab with unsaved form data is exempt (Phase 4 feature — default false handled)
{
  const r = LM.isExempt(
    { isInternal: false, url: 'https://example.com', tabId: 8, stage: 'active', isAudible: false, isPinned: false, hasUnsavedForm: true },
    baseSettings, []
  );
  assertEqual(r.exempt, true, 'Test 8: tab with unsaved form is exempt');
  assertEqual(r.reason, 'form-data', 'Test 8: reason is "form-data"');
}

// ─── tick() Tests ─────────────────────────────────────────────────────────────

console.log('\n=== tick() — LIFE-03 lifecycle transitions ===');

// Test T1: tick() with empty registry completes without error
{
  const registry = new Map();
  LM.tick(registry, baseSettings).then(() => {
    assert(true, 'Test T1: tick() with empty registry completes without error');
  }).catch(err => {
    assert(false, 'Test T1: tick() threw: ' + err.message);
  });
}

// Test T2: tick() calls discard() for tab past T1 threshold and not exempt
{
  discardedTabIds = [];
  const now = Date.now();
  const registry = new Map();
  const t1Ms = baseSettings.t1Minutes * 60 * 1000;
  registry.set(101, {
    tabId: 101,
    url: 'https://example.com',
    stage: 'active',
    lastActiveTimestamp: now - t1Ms - 5000, // past T1
    isInternal: false,
    isPinned: false,
    isAudible: false,
    hasUnsavedForm: false,
  });
  mockActiveTabs = []; // tab 101 is not the active tab

  LM.tick(registry, baseSettings).then(() => {
    assert(discardedTabIds.includes(101), 'Test T2: tick() called discard() for expired tab');
    const entry = registry.get(101);
    assertEqual(entry.stage, 'discarded', 'Test T2: entry.stage updated to discarded after discard()');
  });
}

// Test T3: tick() does NOT discard an active (focused) tab
{
  discardedTabIds = [];
  const now = Date.now();
  const registry = new Map();
  const t1Ms = baseSettings.t1Minutes * 60 * 1000;
  registry.set(102, {
    tabId: 102,
    url: 'https://example.com',
    stage: 'active',
    lastActiveTimestamp: now - t1Ms - 5000, // past T1
    isInternal: false,
    isPinned: false,
    isAudible: false,
    hasUnsavedForm: false,
  });
  mockActiveTabs = [{ id: 102 }]; // tab 102 IS the active tab

  LM.tick(registry, baseSettings).then(() => {
    assert(!discardedTabIds.includes(102), 'Test T3: active tab NOT discarded even if past T1');
  });
}

// Test T4: tick() does NOT discard a tab that has not reached T1 threshold
{
  discardedTabIds = [];
  const now = Date.now();
  const registry = new Map();
  registry.set(103, {
    tabId: 103,
    url: 'https://example.com',
    stage: 'active',
    lastActiveTimestamp: now - 1000, // only 1 second idle
    isInternal: false,
    isPinned: false,
    isAudible: false,
    hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings).then(() => {
    assert(!discardedTabIds.includes(103), 'Test T4: recently active tab NOT discarded');
  });
}

// ── Stage 2 push tests (Plan 03-01) ──────────────────────────────────────────

console.log('\n=== tick() — Stage 2 push (Plan 03-01) ===');

// Test P1: tick() with pushCallback — successful discard calls pushCallback with TAB_DISCARDED
{
  const pushCalls = [];
  const cb = (t, d) => pushCalls.push({ t, d });
  const registry = new Map();
  const now = Date.now();
  const t1Ms = baseSettings.t1Minutes * 60 * 1000;
  registry.set(201, {
    tabId: 201, url: 'https://a.com', stage: 'active',
    lastActiveTimestamp: now - t1Ms - 5000,
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
  });
  discardedTabIds = [];
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, cb).then(() => {
    assert(pushCalls.length === 1, 'Test P1: pushCallback called once after successful discard');
    assertEqual(pushCalls[0] && pushCalls[0].t, 'TAB_DISCARDED', 'Test P1: type is TAB_DISCARDED');
    assertEqual(pushCalls[0] && pushCalls[0].d && pushCalls[0].d.entry && pushCalls[0].d.entry.stage, 'discarded', 'Test P1: entry.stage is discarded');
  });
}

// Test P2: deferred — runs after concurrent tests to avoid global state interference
// (see sequentialTests below)

// Test P3: tick() without pushCallback (undefined) — discard still executes, no TypeError
{
  discardedTabIds = [];
  const registry = new Map();
  const now = Date.now();
  const t1Ms = baseSettings.t1Minutes * 60 * 1000;
  registry.set(203, {
    tabId: 203, url: 'https://c.com', stage: 'active',
    lastActiveTimestamp: now - t1Ms - 5000,
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, undefined).then(() => {
    assert(discardedTabIds.includes(203), 'Test P3: discard still executes with no pushCallback');
    assertEqual(registry.get(203).stage, 'discarded', 'Test P3: stage becomes discarded without pushCallback');
  }).catch(err => {
    assert(false, 'Test P3: tick() without pushCallback threw: ' + err.message);
  });
}

// Test P4: deferred — runs after concurrent tests to avoid global state interference
// (see sequentialTests below)

// ── Stage 2→3 save-and-close tests (Plan 03-02) ──────────────────────────────

console.log('\n=== tick() — Stage 2→3 save-and-close (Plan 03-02) ===');

// Test S1: DISCARDED entry idle > T2, NOT exempt → saveAndCloseCallback called; entry removed from registry
{
  const saveCalls = [];
  const saveCb = (tabId, entry) => saveCalls.push({ tabId, entry });
  const registry = new Map();
  const now = Date.now();
  const t2Ms = baseSettings.t2Minutes * 60 * 1000;
  registry.set(301, {
    tabId: 301, url: 'https://e.com', stage: 'discarded',
    lastActiveTimestamp: now - t2Ms - 5000,
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, undefined, saveCb).then(() => {
    assert(saveCalls.length === 1, 'Test S1: saveAndCloseCallback called for discarded entry past T2');
    assertEqual(saveCalls[0] && saveCalls[0].tabId, 301, 'Test S1: correct tabId passed to callback');
    assert(!registry.has(301), 'Test S1: entry removed from tabRegistry after callback');
  });
}

// Test S2: DISCARDED entry idle > T2 but isPinned=true → saveAndCloseCallback NOT called
{
  const saveCalls = [];
  const saveCb = (tabId, entry) => saveCalls.push({ tabId, entry });
  const registry = new Map();
  const now = Date.now();
  const t2Ms = baseSettings.t2Minutes * 60 * 1000;
  registry.set(302, {
    tabId: 302, url: 'https://f.com', stage: 'discarded',
    lastActiveTimestamp: now - t2Ms - 5000,
    isInternal: false, isPinned: true, isAudible: false, hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, undefined, saveCb).then(() => {
    assert(saveCalls.length === 0, 'Test S2: saveAndCloseCallback NOT called for pinned discarded entry');
  });
}

// Test S3: DISCARDED entry idle < T2 → saveAndCloseCallback NOT called
{
  const saveCalls = [];
  const saveCb = (tabId, entry) => saveCalls.push({ tabId, entry });
  const registry = new Map();
  const now = Date.now();
  registry.set(303, {
    tabId: 303, url: 'https://g.com', stage: 'discarded',
    lastActiveTimestamp: now - 1000, // only 1 second idle
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, undefined, saveCb).then(() => {
    assert(saveCalls.length === 0, 'Test S3: saveAndCloseCallback NOT called when entry not past T2');
  });
}

// Test S4: tick() without saveAndCloseCallback (undefined) — discarded entry > T2, tick() completes without error
{
  const registry = new Map();
  const now = Date.now();
  const t2Ms = baseSettings.t2Minutes * 60 * 1000;
  registry.set(304, {
    tabId: 304, url: 'https://h.com', stage: 'discarded',
    lastActiveTimestamp: now - t2Ms - 5000,
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, undefined, undefined).then(() => {
    assert(true, 'Test S4: tick() without saveAndCloseCallback completes without error');
  }).catch(err => {
    assert(false, 'Test S4: tick() threw with no saveAndCloseCallback: ' + err.message);
  });
}

// ── Form dirty-state block tests (Plan 04-03) ─────────────────────────────────

console.log('\n=== tick() — Form dirty-state lifecycle block (Plan 04-03) ===');

// Test F1: Stage 1→2 blocked by hasUnsavedForm=true
{
  discardedTabIds = [];
  const registry = new Map();
  const now = Date.now();
  const t1Ms = baseSettings.t1Minutes * 60 * 1000;
  registry.set(401, {
    tabId: 401, url: 'https://form.com', stage: 'active',
    lastActiveTimestamp: now - t1Ms - 5000, // past T1
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: true,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings).then(() => {
    assert(!discardedTabIds.includes(401), 'Test F1: tab with dirty form NOT discarded (Stage 1→2 blocked)');
    assertEqual(registry.get(401) && registry.get(401).stage, 'active', 'Test F1: entry.stage stays active with dirty form');
  });
}

// Test F2: Stage 2→3 blocked by hasUnsavedForm=true
{
  const saveCalls = [];
  const saveCb = (tabId, entry) => saveCalls.push({ tabId, entry });
  const registry = new Map();
  const now = Date.now();
  const t2Ms = baseSettings.t2Minutes * 60 * 1000;
  registry.set(402, {
    tabId: 402, url: 'https://form2.com', stage: 'discarded',
    lastActiveTimestamp: now - t2Ms - 5000, // past T2
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: true,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings, undefined, saveCb).then(() => {
    assert(saveCalls.length === 0, 'Test F2: saveAndCloseCallback NOT called for tab with dirty form (Stage 2→3 blocked)');
    assert(registry.has(402), 'Test F2: entry stays in registry when form is dirty');
  });
}

// Test F3: Stage 1→2 proceeds normally when hasUnsavedForm=false
{
  discardedTabIds = [];
  const registry = new Map();
  const now = Date.now();
  const t1Ms = baseSettings.t1Minutes * 60 * 1000;
  registry.set(403, {
    tabId: 403, url: 'https://clean.com', stage: 'active',
    lastActiveTimestamp: now - t1Ms - 5000, // past T1
    isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
  });
  mockActiveTabs = [];

  LM.tick(registry, baseSettings).then(() => {
    assert(discardedTabIds.includes(403), 'Test F3: tab without dirty form IS discarded (Stage 1→2 proceeds)');
    assertEqual(registry.get(403) && registry.get(403).stage, 'discarded', 'Test F3: entry.stage becomes discarded');
  });
}

// ─── Sequential tests (P2, P4) — BrowserAdapter global mutation ──────────────
// These tests modify global BrowserAdapter state and MUST run after all concurrent
// async ticks above have resolved. We chain them after a short delay.

async function runSequentialTests() {
  console.log('\n=== tick() — BrowserAdapter mutation tests (sequential) ===');

  // Test P2: tick() when tabs.discard() throws — entry.stage stays active; pushCallback NOT called
  {
    const origDiscard = global.BrowserAdapter.tabs.discard;
    global.BrowserAdapter.tabs.discard = async () => { throw new Error('discard failed'); };
    const pushCalls = [];
    const cb = (t, d) => pushCalls.push({ t, d });
    const registry = new Map();
    const now = Date.now();
    const t1Ms = baseSettings.t1Minutes * 60 * 1000;
    registry.set(202, {
      tabId: 202, url: 'https://b.com', stage: 'active',
      lastActiveTimestamp: now - t1Ms - 5000,
      isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
    });
    mockActiveTabs = [];
    await LM.tick(registry, baseSettings, cb);
    assert(pushCalls.length === 0, 'Test P2: pushCallback NOT called when discard throws');
    assertEqual(registry.get(202).stage, 'active', 'Test P2: entry.stage stays active on discard failure');
    global.BrowserAdapter.tabs.discard = origDiscard;
  }

  // Test P4: canDiscard=false — entry.stage stays active; pushCallback NOT called for Stage 1→2
  {
    const origCanDiscard = global.BrowserAdapter.features.canDiscard;
    global.BrowserAdapter.features.canDiscard = false;
    const pushCalls = [];
    const cb = (t, d) => pushCalls.push({ t, d });
    const registry = new Map();
    const now = Date.now();
    const t1Ms = baseSettings.t1Minutes * 60 * 1000;
    registry.set(204, {
      tabId: 204, url: 'https://d.com', stage: 'active',
      lastActiveTimestamp: now - t1Ms - 5000,
      isInternal: false, isPinned: false, isAudible: false, hasUnsavedForm: false,
    });
    mockActiveTabs = [];
    await LM.tick(registry, baseSettings, cb);
    const discardedCalls = pushCalls.filter(c => c.t === 'TAB_DISCARDED');
    assert(discardedCalls.length === 0, 'Test P4: TAB_DISCARDED NOT pushed on no-discard browser');
    assertEqual(registry.get(204).stage, 'active', 'Test P4: entry.stage stays active on no-discard browser');
    global.BrowserAdapter.features.canDiscard = origCanDiscard;
  }
}

// ─── Results ──────────────────────────────────────────────────────────────────

setTimeout(() => {
  runSequentialTests().then(async () => {

    // ── Group 5: No-discard fallback (LIFE-08 / NFR-33) ──────────────────────────
    console.log('\n── Group 5: No-discard fallback tests ──');

    // Fixture: override canDiscard to false for this group
    const origCanDiscard = global.BrowserAdapter.features.canDiscard;
    global.BrowserAdapter.features.canDiscard = false;
    // Also patch BrowserAdapter.tabs.discard to detect accidental calls
    let discardCallCount = 0;
    const origDiscard = global.BrowserAdapter.tabs.discard;
    global.BrowserAdapter.tabs.discard = function() { discardCallCount++; return Promise.resolve(null); };

    const T1_MIN = 5;
    const T2_MIN = 15;
    const noDiscardSettings = {
      t1Minutes: T1_MIN,
      t2Minutes: T2_MIN,
      t3Days: 7,
      whitelist: [],
      managePinned: false,
    };

    // Test 5-1: Tab idle beyond T2 — saveAndClose called, removed from registry
    {
      const reg = new Map();
      const now5 = Date.now();
      reg.set(501, {
        tabId: 501, url: 'https://example.com', title: 'Ex', favicon: '',
        groupId: 'other', stage: CONSTANTS.STAGE.ACTIVE, isInternal: false,
        isPinned: false, isAudible: false, hasUnsavedForm: false,
        lastActiveTimestamp: now5 - (T2_MIN * 60 * 1000 + 5000), // T2 + 5s
        createdAt: now5 - 100000, isStateful: false, transitionType: '',
      });
      let saveCloseCalled = false;
      let saveCloseTabId = null;
      await LM.tick(reg, noDiscardSettings, function() {}, async function(tabId) {
        saveCloseCalled = true;
        saveCloseTabId = tabId;
      });
      assert(saveCloseCalled, '5-1: canDiscard=false + idle>T2 — saveAndClose is called');
      assertEqual(saveCloseTabId, 501, '5-1: saveAndClose called with correct tabId=501');
      assert(!reg.has(501), '5-1: tab removed from registry after no-discard Stage 1->3');
    }

    // Test 5-2: Tab idle between T1 and T2 — no action (stays Stage 1)
    {
      const reg = new Map();
      const now5 = Date.now();
      reg.set(502, {
        tabId: 502, url: 'https://between.com', title: 'Between', favicon: '',
        groupId: 'other', stage: CONSTANTS.STAGE.ACTIVE, isInternal: false,
        isPinned: false, isAudible: false, hasUnsavedForm: false,
        lastActiveTimestamp: now5 - (T1_MIN * 60 * 1000 + 5000), // T1+5s, less than T2
        createdAt: now5 - 100000, isStateful: false, transitionType: '',
      });
      let saveCloseCount = 0;
      await LM.tick(reg, noDiscardSettings, function() {}, async function() { saveCloseCount++; });
      assert(saveCloseCount === 0, '5-2: canDiscard=false + idle between T1 and T2 — no action taken');
      assert(reg.has(502), '5-2: tab remains in registry when idle between T1 and T2');
    }

    // Test 5-3: Tab idle beyond T2 but pinned — exempt (not saved-and-closed)
    {
      const reg = new Map();
      const now5 = Date.now();
      reg.set(503, {
        tabId: 503, url: 'https://pinned.com', title: 'Pinned', favicon: '',
        groupId: 'other', stage: CONSTANTS.STAGE.ACTIVE, isInternal: false,
        isPinned: true, isAudible: false, hasUnsavedForm: false,
        lastActiveTimestamp: now5 - (T2_MIN * 60 * 1000 + 5000),
        createdAt: now5 - 100000, isStateful: false, transitionType: '',
      });
      let saveClosePinned = false;
      await LM.tick(reg, noDiscardSettings, function() {}, async function() { saveClosePinned = true; });
      assert(!saveClosePinned, '5-3: canDiscard=false + pinned tab idle>T2 — exempt, saveAndClose NOT called');
    }

    // Test 5-4: With canDiscard=false, BrowserAdapter.tabs.discard is never called
    {
      const reg = new Map();
      const now5 = Date.now();
      reg.set(504, {
        tabId: 504, url: 'https://nodiscard.com', title: 'ND', favicon: '',
        groupId: 'other', stage: CONSTANTS.STAGE.ACTIVE, isInternal: false,
        isPinned: false, isAudible: false, hasUnsavedForm: false,
        lastActiveTimestamp: now5 - (T2_MIN * 60 * 1000 + 5000),
        createdAt: now5 - 100000, isStateful: false, transitionType: '',
      });
      discardCallCount = 0;
      await LM.tick(reg, noDiscardSettings, function() {}, async function() {});
      assert(discardCallCount === 0, '5-4: canDiscard=false — BrowserAdapter.tabs.discard never called');
    }

    // Test 5-5: With canDiscard=true (normal path), T1-idle tab discarded, saveAndClose NOT called
    {
      global.BrowserAdapter.features.canDiscard = true;
      discardCallCount = 0;
      const reg = new Map();
      const now5 = Date.now();
      reg.set(505, {
        tabId: 505, url: 'https://normal.com', title: 'Norm', favicon: '',
        groupId: 'other', stage: CONSTANTS.STAGE.ACTIVE, isInternal: false,
        isPinned: false, isAudible: false, hasUnsavedForm: false,
        lastActiveTimestamp: now5 - (T1_MIN * 60 * 1000 + 5000),
        createdAt: now5 - 100000, isStateful: false, transitionType: '',
      });
      let scCalled = false;
      await LM.tick(reg, noDiscardSettings, function() {}, async function() { scCalled = true; });
      assert(discardCallCount === 1, '5-5: canDiscard=true + idle>T1 — discard called once');
      assert(!scCalled, '5-5: canDiscard=true + idle>T1 only — saveAndClose NOT called (tab in Stage 2 now)');
      global.BrowserAdapter.features.canDiscard = false; // restore for any remaining tests
    }

    // Restore patched functions
    global.BrowserAdapter.features.canDiscard = origCanDiscard;
    global.BrowserAdapter.tabs.discard = origDiscard;

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    if (failed > 0) process.exit(1);
  }).catch(err => {
    console.error('Sequential tests threw:', err);
    process.exit(1);
  });
}, 300);
