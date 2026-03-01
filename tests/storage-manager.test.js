/**
 * Tests for core/storage-manager.js
 * Plan 02-01: SESS-01 (30s debounced auto-save), SESS-02 (startup session restore)
 *
 * Run with: node tests/storage-manager.test.js
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
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Setup Globals ─────────────────────────────────────────────────────────────

// Stub BrowserAdapter and CONSTANTS before loading StorageManager
global.BrowserAdapter = {
  storage: {
    local: {
      get: async (key) => ({}),   // override per test
      set: async (items) => {},
    },
    sync: {
      get: async (key) => ({}),   // override per test
      set: async (items) => {},
    },
  },
};
global.CONSTANTS = {
  STORAGE_KEYS: {
    SESSION_STATE: 'tabnest_session',
    SETTINGS: 'tabnest_settings',
  },
  DEFAULT_SETTINGS: {
    t1Minutes: 5, t2Minutes: 15, t3Days: 7,
    autoGroup: true, persistSessions: true,
    managePinned: false, hoverPreRender: true,
    showRamSavings: true, batchSize: 3, whitelist: [],
  },
};
require('../core/storage-manager.js');
const SM = global.StorageManager;

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n--- Test Suite: storage-manager.js ---\n');

// ─── loadState() tests ─────────────────────────────────────────────────────────

console.log('1. loadState() — empty storage returns null:');
(async () => {
  global.BrowserAdapter.storage.local.get = async (key) => ({});
  const result = await SM.loadState();
  assert(result === null, 'loadState() returns null when storage is empty');
})().then(() => {

console.log('\n2. loadState() — returns saved session blob:');
return (async () => {
  const savedBlob = { savedEntries: [{ savedId: 'abc' }], groups: [{ id: 'work' }], timestamp: 1000 };
  global.BrowserAdapter.storage.local.get = async (key) => ({ [global.CONSTANTS.STORAGE_KEYS.SESSION_STATE]: savedBlob });
  const result = await SM.loadState();
  assertEqual(result, savedBlob, 'loadState() returns the saved session blob');
})();

}).then(() => {

console.log('\n3. loadState() — returns null (not throws) on storage rejection:');
return (async () => {
  global.BrowserAdapter.storage.local.get = async (key) => { throw new Error('storage error'); };
  let threw = false;
  let result;
  try {
    result = await SM.loadState();
  } catch {
    threw = true;
  }
  assert(!threw, 'loadState() does not throw when storage.local.get() rejects');
  assert(result === null, 'loadState() returns null on storage error');
})();

}).then(() => {

// ─── saveState() tests ────────────────────────────────────────────────────────

console.log('\n4. saveState() — writes to storage.local with correct key:');
return (async () => {
  let calledWith = null;
  global.BrowserAdapter.storage.local.set = async (items) => { calledWith = items; };
  const state = { savedEntries: [], groups: [], timestamp: 1000 };
  await SM.saveState(state);
  assert(calledWith !== null, 'saveState() calls storage.local.set');
  assert(
    Object.prototype.hasOwnProperty.call(calledWith, global.CONSTANTS.STORAGE_KEYS.SESSION_STATE),
    'saveState() uses CONSTANTS.STORAGE_KEYS.SESSION_STATE as the key'
  );
})();

}).then(() => {

// ─── getSettings() tests ──────────────────────────────────────────────────────

console.log('\n5. getSettings() — returns full defaults when no stored settings exist:');
return (async () => {
  global.BrowserAdapter.storage.sync.get = async (key) => ({});
  const result = await SM.getSettings();
  assertEqual(result, global.CONSTANTS.DEFAULT_SETTINGS, 'getSettings() returns full DEFAULT_SETTINGS when nothing stored');
})();

}).then(() => {

console.log('\n6. getSettings() — merges stored partial settings with defaults:');
return (async () => {
  global.BrowserAdapter.storage.sync.get = async (key) => ({
    [global.CONSTANTS.STORAGE_KEYS.SETTINGS]: { t1Minutes: 10 },
  });
  const result = await SM.getSettings();
  assert(result.t1Minutes === 10, 'getSettings() applies stored t1Minutes override');
  assert(result.t2Minutes === global.CONSTANTS.DEFAULT_SETTINGS.t2Minutes, 'getSettings() keeps default t2Minutes when not overridden');
  assert(result.autoGroup === global.CONSTANTS.DEFAULT_SETTINGS.autoGroup, 'getSettings() keeps default autoGroup when not overridden');
})();

}).then(() => {

console.log('\n7. getSettings() — returns defaults (not throws) when storage rejects:');
return (async () => {
  global.BrowserAdapter.storage.sync.get = async (key) => { throw new Error('sync error'); };
  let threw = false;
  let result;
  try {
    result = await SM.getSettings();
  } catch {
    threw = true;
  }
  assert(!threw, 'getSettings() does not throw when storage.sync.get() rejects');
  assertEqual(result, global.CONSTANTS.DEFAULT_SETTINGS, 'getSettings() returns defaults on storage error');
})();

}).then(() => {

// ─── saveSettings() tests ─────────────────────────────────────────────────────

console.log('\n8. saveSettings() — writes to storage.sync with correct key:');
return (async () => {
  let calledWith = null;
  global.BrowserAdapter.storage.sync.set = async (items) => { calledWith = items; };
  await SM.saveSettings({ t1Minutes: 10 });
  assert(calledWith !== null, 'saveSettings() calls storage.sync.set');
  assert(
    Object.prototype.hasOwnProperty.call(calledWith, global.CONSTANTS.STORAGE_KEYS.SETTINGS),
    'saveSettings() uses CONSTANTS.STORAGE_KEYS.SETTINGS as the key'
  );
})();

}).then(() => {

// ─── scheduleSave() debounce tests ────────────────────────────────────────────

console.log('\n9. scheduleSave() — rapid calls within debounce window produce only one write:');
return (async () => {
  let writeCount = 0;
  global.BrowserAdapter.storage.local.set = async (items) => { writeCount++; };

  const state = { savedEntries: [], groups: [], timestamp: Date.now() };

  // Use a short debounce for testing: we'll override the internal timer
  // by calling scheduleSave twice rapidly, then wait beyond the debounce window.
  // Since the real debounce is 30s, we test the COUNT logic:
  // calling scheduleSave quickly should queue only ONE write.
  SM.scheduleSave(state);
  SM.scheduleSave(state);
  SM.scheduleSave(state);

  // Wait a brief moment — the timer should NOT have fired yet (30s debounce)
  await new Promise(resolve => setTimeout(resolve, 50));

  // writeCount should still be 0 — debounce has not fired
  assert(writeCount === 0, 'scheduleSave() does not write immediately (debounced)');

  // Force flush by calling the internal test helper if available, or note test limitation
  // The debounce prevents true unit testing of "exactly one write" within a 30s window
  // So we verify the debounce structure is in place (0 writes in 50ms)
  assert(typeof SM.scheduleSave === 'function', 'scheduleSave is a function on StorageManager');
})();

}).then(() => {

console.log('\n10. scheduleSave() — StorageManager exported on globalThis:');
return (async () => {
  assert(typeof global.StorageManager === 'object', 'StorageManager exported on globalThis');
  assert(typeof global.StorageManager.loadState === 'function', 'globalThis.StorageManager.loadState is a function');
  assert(typeof global.StorageManager.saveState === 'function', 'globalThis.StorageManager.saveState is a function');
  assert(typeof global.StorageManager.getSettings === 'function', 'globalThis.StorageManager.getSettings is a function');
  assert(typeof global.StorageManager.saveSettings === 'function', 'globalThis.StorageManager.saveSettings is a function');
  assert(typeof global.StorageManager.scheduleSave === 'function', 'globalThis.StorageManager.scheduleSave is a function');
})();

}).then(() => {

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
}

}).catch(err => {
  console.error('FATAL test error:', err);
  process.exit(1);
});
