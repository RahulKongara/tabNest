/**
 * Tests for export/import/clear data (Plan 05-03, CONF-03)
 * Tests: StorageManager.exportData(), importData(), clearAllData()
 * Run with: node tests/export-import.test.js
 */
'use strict';

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log('  PASS:', message); passed++; }
  else           { console.error('  FAIL:', message); failed++; }
}

// ── Storage stub ──────────────────────────────────────────────────────────────
const _local  = {};
const _sync   = {};
let _localCleared = false;
let _syncCleared  = false;

global.BrowserAdapter = {
  storage: {
    local: {
      get:   async (key) => ({ [key]: _local[key] }),
      set:   async (obj) => { Object.assign(_local, obj); },
      clear: async ()    => { _localCleared = true; Object.keys(_local).forEach(k => delete _local[k]); },
    },
    sync: {
      get:   async (key) => ({ [key]: _sync[key] }),
      set:   async (obj) => { Object.assign(_sync, obj); },
      clear: async ()    => { _syncCleared = true; Object.keys(_sync).forEach(k => delete _sync[k]); },
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
  DEFAULT_SETTINGS: { t1Minutes: 5, t2Minutes: 15, t3Days: 7, autoGroup: true },
  MAX_WORKSPACES: 20,
};

require('../core/storage-manager.js');
const { StorageManager } = global;

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeExportJson(overrides) {
  return JSON.stringify(Object.assign({
    version: 1,
    exportedAt: Date.now(),
    settings: { t1Minutes: 10 },
    userRules: [],
    groups: [{ id: 'g1', name: 'Dev', color: '#1B6B93', order: 0, isCollapsed: false, isCustom: false }],
    savedEntries: [{ savedId: 's1', url: 'https://example.com', stage: 'saved', savedAt: Date.now() }],
    archivedEntries: [],
    workspaces: [],
  }, overrides));
}

// ── Tests ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n── exportData() ──');

  // Seed storage
  _local['tabnest_session'] = {
    groups: [{ id: 'g1', name: 'Dev' }],
    savedEntries: [
      { savedId: 's1', url: 'https://a.com', stage: 'saved', savedAt: 1 },
      { savedId: 's2', url: 'https://b.com', stage: 'archived', savedAt: 2 },
    ],
  };
  _sync['tabnest_settings']   = { t1Minutes: 10 };
  _sync['tabnest_user_rules'] = [{ domain: 'github.com', groupId: 'g1' }];

  const json = await StorageManager.exportData();
  assert(typeof json === 'string', 'exportData() returns a string');

  const parsed = JSON.parse(json);
  assert(parsed.version === 1, 'exported JSON has version: 1');
  assert(typeof parsed.exportedAt === 'number', 'exported JSON has exportedAt timestamp');
  assert(typeof parsed.settings === 'object', 'exported JSON has settings object');
  assert(Array.isArray(parsed.groups), 'exported JSON has groups array');
  assert(Array.isArray(parsed.savedEntries), 'exported JSON has savedEntries array');
  assert(Array.isArray(parsed.archivedEntries), 'exported JSON has archivedEntries array');
  assert(parsed.savedEntries.every(e => e.stage === 'saved'),
    'savedEntries contains only stage=saved entries');
  assert(parsed.archivedEntries.every(e => e.stage === 'archived'),
    'archivedEntries contains only stage=archived entries');
  assert(parsed.savedEntries.length === 1, 'one saved entry exported');
  assert(parsed.archivedEntries.length === 1, 'one archived entry exported');

  // Test error fallback — storage throws
  const origGet = global.BrowserAdapter.storage.local.get;
  global.BrowserAdapter.storage.local.get = async () => { throw new Error('quota exceeded'); };
  const failJson = await StorageManager.exportData();
  assert(failJson === '{}', 'exportData() returns "{}" when storage throws');
  global.BrowserAdapter.storage.local.get = origGet;

  console.log('\n── importData() ──');

  const validJson = makeExportJson({});
  const result = await StorageManager.importData(validJson);
  assert(result.success === true, 'importData(valid JSON) returns { success: true }');
  assert(_local['tabnest_session'] !== undefined, 'importData writes session state to storage.local');
  assert(_sync['tabnest_settings'] !== undefined, 'importData writes settings to storage.sync');

  // Invalid JSON
  const r1 = await StorageManager.importData('not-json');
  assert(r1.success === false && typeof r1.error === 'string',
    'importData("not-json") returns { success: false, error: string }');
  assert(r1.error.includes('Invalid JSON'), 'error message says "Invalid JSON"');

  // null JSON
  const r2 = await StorageManager.importData('null');
  assert(r2.success === false, 'importData("null") returns { success: false }');
  assert(r2.error.includes('expected an object'), 'error message describes root object requirement');

  // Wrong version
  const r3 = await StorageManager.importData(makeExportJson({ version: 2 }));
  assert(r3.success === false && r3.error.includes('version'),
    'importData(version:2) returns { success: false, error: "...version..." }');

  // Missing groups
  const noGroups = JSON.parse(makeExportJson({}));
  delete noGroups.groups;
  const r4 = await StorageManager.importData(JSON.stringify(noGroups));
  assert(r4.success === false && r4.error.includes('groups'),
    'importData(missing groups) returns { success: false, error: "...groups..." }');

  // Merged saved+archived into savedEntries in session
  const withArchived = makeExportJson({
    savedEntries: [{ savedId: 'x1', url: 'https://x.com', stage: 'saved' }],
    archivedEntries: [{ savedId: 'x2', url: 'https://y.com', stage: 'archived' }],
  });
  await StorageManager.importData(withArchived);
  const restoredSession = _local['tabnest_session'];
  assert(Array.isArray(restoredSession.savedEntries) && restoredSession.savedEntries.length === 2,
    'importData merges savedEntries + archivedEntries into session.savedEntries');

  console.log('\n── clearAllData() ──');

  _localCleared = false;
  _syncCleared  = false;
  const clearResult = await StorageManager.clearAllData();
  assert(clearResult.success === true, 'clearAllData() returns { success: true }');
  assert(_localCleared, 'clearAllData() calls storage.local.clear()');
  assert(_syncCleared,  'clearAllData() calls storage.sync.clear()');

  // Error path
  const origClear = global.BrowserAdapter.storage.local.clear;
  global.BrowserAdapter.storage.local.clear = async () => { throw new Error('permission denied'); };
  const clearFail = await StorageManager.clearAllData();
  assert(clearFail.success === false && typeof clearFail.error === 'string',
    'clearAllData() returns { success: false, error } when storage throws');
  global.BrowserAdapter.storage.local.clear = origClear;

  console.log('\n' + '='.repeat(50));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
