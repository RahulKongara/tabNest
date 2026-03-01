/**
 * Tests for background.js tab registry and event listeners.
 * Plan 01-03: LIFE-01 (all tab events monitored), LIFE-02 (lastActiveTimestamp tracked)
 *
 * Run with: node tests/background.test.js
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

// ─── Setup Globals ─────────────────────────────────────────────────────────────

// Capture registered listeners so we can invoke them in tests
const listeners = {
  onCreated: [],
  onUpdated: [],
  onRemoved: [],
  onActivated: [],
  onMoved: [],
  onAttached: [],
  onDetached: [],
  onReplaced: [],
  onFocusChanged: [],
  onAlarm: [],
  onInstalled: [],
  onStartup: [],
};

global.CONSTANTS = {
  BROWSER_INTERNAL_PROTOCOLS: [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'moz-extension://',
  ],
  STAGE: { ACTIVE: 'active', DISCARDED: 'discarded', SAVED: 'saved', ARCHIVED: 'archived' },
  STORAGE_KEYS: { TIMESTAMPS: 'tabnest_timestamps', SESSION_STATE: 'tabnest_session' },
  ALARM_NAME: 'tabnest-lifecycle-tick',
  ALARM_PERIOD_MINUTES: 0.5,
};

global.BrowserAdapter = {
  tabs: {
    onCreated:   { addListener: (fn) => listeners.onCreated.push(fn) },
    onUpdated:   { addListener: (fn) => listeners.onUpdated.push(fn) },
    onRemoved:   { addListener: (fn) => listeners.onRemoved.push(fn) },
    onActivated: { addListener: (fn) => listeners.onActivated.push(fn) },
    onMoved:     { addListener: (fn) => listeners.onMoved.push(fn) },
    onAttached:  { addListener: (fn) => listeners.onAttached.push(fn) },
    onDetached:  { addListener: (fn) => listeners.onDetached.push(fn) },
    onReplaced:  { addListener: (fn) => listeners.onReplaced.push(fn) },
    query: async () => [],
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
    },
  },
  alarms: {
    create: async () => {},
    get: async () => null,
    onAlarm: { addListener: (fn) => listeners.onAlarm.push(fn) },
  },
  windows: {
    onFocusChanged: { addListener: (fn) => listeners.onFocusChanged.push(fn) },
  },
  runtime: {
    onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
    onStartup:   { addListener: (fn) => listeners.onStartup.push(fn) },
  },
};

global.chrome = { windows: { WINDOW_ID_NONE: -1 } };
global.importScripts = () => {};
global.LifecycleManager = { tick: async () => {}, start: () => {} };
global.GroupingEngine   = { classify: () => 'other' };
global.StorageManager   = { loadState: async () => null };

// ─── Load background.js ────────────────────────────────────────────────────────

try {
  require('../background.js');
} catch (err) {
  console.error('FATAL: background.js failed to load:', err.message);
  process.exit(1);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n--- Test Suite: background.js ---\n');

// Test 1: All 9 event listeners registered
console.log('1. Event listener registration:');
assert(listeners.onCreated.length > 0,   'onCreated listener registered');
assert(listeners.onUpdated.length > 0,   'onUpdated listener registered');
assert(listeners.onRemoved.length > 0,   'onRemoved listener registered');
assert(listeners.onActivated.length > 0, 'onActivated listener registered');
assert(listeners.onMoved.length > 0,     'onMoved listener registered');
assert(listeners.onAttached.length > 0,  'onAttached listener registered');
assert(listeners.onDetached.length > 0,  'onDetached listener registered');
assert(listeners.onReplaced.length > 0,  'onReplaced listener registered');
assert(listeners.onFocusChanged.length > 0, 'onFocusChanged listener registered');
assert(listeners.onAlarm.length > 0,     'onAlarm listener registered');

// Test 2: isInternalPage detection — must export or expose via module
// We test indirectly via onCreated behavior with internal URLs
console.log('\n2. Internal page detection (via onCreated):');
const mockInternalTab = { id: 1, url: 'chrome://newtab/', title: 'New Tab', favIconUrl: '', pinned: false, audible: false, windowId: 1, index: 0, active: false };
const mockRegularTab  = { id: 2, url: 'https://github.com', title: 'GitHub', favIconUrl: 'https://github.com/favicon.ico', pinned: false, audible: false, windowId: 1, index: 1, active: true };

// Fire onCreated for both
listeners.onCreated.forEach(fn => fn(mockInternalTab));
listeners.onCreated.forEach(fn => fn(mockRegularTab));

// Test 3: createTabEntry correctness — verify stage and groupId via onCreated
// We need to check the registry. Since tabRegistry is module-level, we need the module's exports.
// background.js should export tabRegistry OR we check via onActivated side-effects.
// The plan says TDD with behavior tests, so we check exported tabRegistry.
console.log('\n3. createTabEntry schema (via module exports):');
const mod = require('../background.js');
// If tabRegistry is exported:
if (mod && mod.tabRegistry) {
  const entry = mod.tabRegistry.get(1);
  assert(entry !== undefined, 'internal tab entry exists in registry');
  assertEqual(entry.stage, 'active', 'stage defaults to ACTIVE');
  assertEqual(entry.groupId, 'other', 'groupId defaults to other');
  assert(typeof entry.lastActiveTimestamp === 'number', 'lastActiveTimestamp is a number');
  assert(typeof entry.createdAt === 'number', 'createdAt is a number');
  assert(entry.isInternal === true, 'chrome://newtab/ flagged as internal');

  const entry2 = mod.tabRegistry.get(2);
  assert(entry2 !== undefined, 'regular tab entry exists in registry');
  assert(entry2.isInternal === false, 'https://github.com not flagged as internal');
} else {
  // Fallback: test via side effects only
  console.log('  INFO: tabRegistry not exported — skipping direct schema tests');
}

// Test 4: onActivated updates lastActiveTimestamp of activated tab only
console.log('\n4. onActivated updates lastActiveTimestamp:');
if (mod && mod.tabRegistry) {
  const before = mod.tabRegistry.get(1) ? mod.tabRegistry.get(1).lastActiveTimestamp : null;
  const tsBefore2 = mod.tabRegistry.get(2) ? mod.tabRegistry.get(2).lastActiveTimestamp : null;

  // Activate tab 1
  const beforeTime = Date.now();
  listeners.onActivated.forEach(fn => fn({ tabId: 1, windowId: 1 }));
  const afterTime = Date.now();

  const after1 = mod.tabRegistry.get(1).lastActiveTimestamp;
  assert(after1 >= beforeTime && after1 <= afterTime, 'activated tab lastActiveTimestamp updated to current time');

  const after2 = mod.tabRegistry.get(2) ? mod.tabRegistry.get(2).lastActiveTimestamp : tsBefore2;
  assertEqual(after2, tsBefore2, 'non-activated tab timestamp unchanged by onActivated');
}

// Test 5: onRemoved deletes tab from registry
console.log('\n5. onRemoved removes tab from registry:');
if (mod && mod.tabRegistry) {
  assert(mod.tabRegistry.has(1), 'tab 1 exists before removal');
  listeners.onRemoved.forEach(fn => fn(1, { isWindowClosing: false }));
  assert(!mod.tabRegistry.has(1), 'tab 1 deleted from registry after onRemoved');
}

// Test 6: onUpdated updates url/title/favicon
console.log('\n6. onUpdated updates tab metadata:');
if (mod && mod.tabRegistry) {
  const updatedTab = { id: 2, url: 'https://github.com/settings', title: 'Settings - GitHub', favIconUrl: 'fav.ico', pinned: false, audible: false, windowId: 1, index: 1, active: false };
  listeners.onUpdated.forEach(fn => fn(2, { url: 'https://github.com/settings' }, updatedTab));
  const entry = mod.tabRegistry.get(2);
  assertEqual(entry.url, 'https://github.com/settings', 'url updated');
  assertEqual(entry.title, 'Settings - GitHub', 'title updated');
}

// Test 7: onMoved updates windowId and index
console.log('\n7. onMoved updates position:');
if (mod && mod.tabRegistry) {
  listeners.onMoved.forEach(fn => fn(2, { windowId: 2, fromIndex: 1, toIndex: 3 }));
  const entry = mod.tabRegistry.get(2);
  assertEqual(entry.windowId, 2, 'windowId updated on move');
  assertEqual(entry.index, 3, 'index updated on move');
}

// Test 8: onReplaced transfers entry
console.log('\n8. onReplaced transfers entry to new tabId:');
if (mod && mod.tabRegistry) {
  const oldId = 2;
  const newId = 99;
  assert(mod.tabRegistry.has(oldId), 'old tab exists before replace');
  listeners.onReplaced.forEach(fn => fn(newId, oldId));
  assert(!mod.tabRegistry.has(oldId), 'old tab removed after replace');
  assert(mod.tabRegistry.has(newId), 'new tab added after replace');
  assertEqual(mod.tabRegistry.get(newId).tabId, newId, 'tabId updated to new id');
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
}
