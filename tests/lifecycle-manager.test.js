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

// ─── Results ──────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}, 200);
