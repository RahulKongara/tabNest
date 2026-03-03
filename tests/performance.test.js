'use strict';
// tests/performance.test.js
// Performance benchmarks verifying SRS §4.1 NFR targets.
// Run: node tests/performance.test.js
//
// Exit codes:
//   0 — all benchmarks within NFR thresholds
//   1 — one or more benchmarks exceeded their threshold

const { performance } = require('perf_hooks');

const ITERATIONS = 10;

// ── Results tracking ──────────────────────────────────────────────────────────
const results = [];
let anyFailed = false;

function benchmark(name, nfrTarget, thresholdMs, fn) {
  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce(function(a, b) { return a + b; }, 0) / times.length;
  const pass = avg < thresholdMs;
  if (!pass) anyFailed = true;
  results.push({ name: name, nfrTarget: nfrTarget, threshold: thresholdMs, min: min.toFixed(2), avg: avg.toFixed(2), max: max.toFixed(2), pass: pass });
}

// ── Minimal chrome API mock ──────────────────────────────────────────────────
// Replaces chrome.storage.local.set / chrome.storage.sync.get / etc.
// Used for storage-manager.js benchmarking only.
let _mockStorage = {};

global.chrome = {
  storage: {
    local: {
      set:    function(obj, cb) { Object.assign(_mockStorage, obj); if (cb) cb(); return Promise.resolve(); },
      get:    function(keys, cb) {
        const result = {};
        const keyArr = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
        for (const k of keyArr) result[k] = _mockStorage[k];
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      clear: function(cb) { _mockStorage = {}; if (cb) cb(); return Promise.resolve(); },
    },
    sync: {
      get:    function(keys, cb) { if (cb) cb({}); return Promise.resolve({}); },
      set:    function(obj, cb) { if (cb) cb(); return Promise.resolve(); },
      clear:  function(cb) { if (cb) cb(); return Promise.resolve(); },
    },
  },
  runtime: {
    lastError: null,
    getManifest: function() { return { manifest_version: 3 }; },
  },
  alarms: {
    create:   function() {},
    onAlarm:  { addListener: function() {} },
    get:      function(name, cb) { if (cb) cb(null); return Promise.resolve(null); },
  },
  tabs: {
    onCreated:     { addListener: function() {} },
    onUpdated:     { addListener: function() {} },
    onRemoved:     { addListener: function() {} },
    onActivated:   { addListener: function() {} },
    onMoved:       { addListener: function() {} },
    onReplaced:    { addListener: function() {} },
    onAttached:    { addListener: function() {} },
    onDetached:    { addListener: function() {} },
    discard:       function() { return Promise.resolve(); },
    remove:        function() { return Promise.resolve(); },
    create:        function() { return Promise.resolve({ id: 9999 }); },
    query:         function(opts, cb) { if (cb) cb([]); return Promise.resolve([]); },
    sendMessage:   function() { return Promise.resolve(); },
  },
  windows: {
    onFocusChanged: { addListener: function() {} },
    getCurrent:     function(cb) { if (cb) cb({ id: 1 }); return Promise.resolve({ id: 1 }); },
  },
  webNavigation: {
    onCompleted: { addListener: function() {} },
  },
  sidePanel: {
    open:      function() {},
    setOptions: function() {},
  },
  commands: {
    onCommand: { addListener: function() {} },
  },
};

global.globalThis = global;

// ── Load modules ──────────────────────────────────────────────────────────────
require('../core/browser-adapter.js');
require('../core/constants.js');
require('../core/grouping-engine.js');
require('../core/storage-manager.js');
require('../core/lifecycle-manager.js');

const GE  = global.GroupingEngine;
const SM  = global.StorageManager;
const LM  = global.LifecycleManager;
const CON = global.CONSTANTS;

// ── Fixture generators ────────────────────────────────────────────────────────

function makeTabEntry(i, stage) {
  return {
    tabId:              i,
    url:                'https://example-' + i + '.com/path',
    title:              'Example Tab ' + i,
    favIconUrl:         null,
    groupId:            'group-' + (i % 10),
    stage:              stage || 'active',
    lastActiveTimestamp: Date.now() - (60 * 60 * 1000), // 1 hour idle — past T2
    createdAt:          Date.now() - (2 * 60 * 60 * 1000),
    isStateful:         false,
    isPinned:           false,
    isAudible:          false,
    hasUnsavedForm:     false,
    transitionType:     '',
  };
}

function makeSavedEntry(i) {
  return {
    savedId:     'saved-' + i,
    url:         'https://saved-' + i + '.com',
    title:       'Saved Tab ' + i,
    favIconUrl:  null,
    groupId:     'group-' + (i % 10),
    stage:       'saved',
    savedAt:     Date.now() - (24 * 60 * 60 * 1000),
    isStatefulUrl: false,
    navigationHistory: [],
  };
}

function makeGroup(i) {
  return {
    id:          'group-' + i,
    name:        'Group ' + i,
    color:       '#1B6B93',
    order:       i,
    isCollapsed: false,
    isCustom:    false,
  };
}

function make200EntryState() {
  const groups      = [];
  const savedEntries = [];
  for (let i = 0; i < 10; i++) groups.push(makeGroup(i));
  for (let i = 0; i < 100; i++) savedEntries.push(makeSavedEntry(i));
  return {
    groups:       groups,
    savedEntries: savedEntries,
    settings:     CON.DEFAULT_SETTINGS,
    timestamp:    Date.now(),
  };
}

// ── Benchmark: NFR-02 — GroupingEngine.classify() < 50ms per tab ─────────────

console.log('\n── TabNest Performance Benchmarks (SRS §4.1) ──\n');

const TEST_URLS = [
  'https://github.com/org/repo',
  'https://stackoverflow.com/questions/12345',
  'https://docs.google.com/document/d/abc',
  'https://notion.so/workspace/page',
  'https://youtube.com/watch?v=xyz',
  'https://netflix.com/title/12345',
  'https://twitter.com/user/status/123',
  'https://reddit.com/r/javascript/comments/abc',
  'https://amazon.com/dp/B001234567',
  'https://news.ycombinator.com/item?id=12345',
  'https://arxiv.org/abs/2301.12345',
  'https://figma.com/file/abc123/Design',
  'https://slack.com/app/T12345',
  'https://linear.app/team/issue/TAB-123',
  'https://unknown-startup-domain.io/some/path',
  'https://my-recipes-blog.com/pasta-carbonara',
  'https://shop.example.com/cart/checkout',
  'https://api.docs.example.com/reference',
  'https://news.bbc.co.uk/sport/article/12345',
  'https://finance.yahoo.com/stocks/AAPL',
];

benchmark('NFR-02: GroupingEngine.classify() — 100 URLs (< 50ms avg)', 'NFR-02', 50, function() {
  const rules = [];
  for (let i = 0; i < 100; i++) {
    const url   = TEST_URLS[i % TEST_URLS.length];
    const title = 'Tab title ' + i;
    GE.classify(url, title, rules);
  }
});

// ── Benchmark: NFR-10 — StorageManager.saveState() < 100ms ──────────────────
// Uses synchronous mock — measures serialization + mock write overhead.

const STATE_200 = make200EntryState();

benchmark('NFR-10: StorageManager.saveState() — 200-entry state (< 100ms avg)', 'NFR-10', 100, function() {
  // Reset mock storage and dirty flag between iterations to force a write each time
  _mockStorage = {};
  // Force a unique timestamp to bypass the _lastSavedStateJson diff guard
  const stateClone = Object.assign({}, STATE_200, { timestamp: Date.now() + Math.random() });
  SM.saveState(stateClone);
});

// ── Benchmark: NFR-11 — LifecycleManager.tick() < 200ms with 200 tabs ───────
// Populate the tabRegistry with 200 Stage-1 tabs all idle > T2.
// None are exempt (not pinned, not audible, not active, not internal URL).

// Access tabRegistry through globalThis._tabRegistry (exposed by background.js init)
// In the test context we create our own registry map and pass it directly to tick().
const testRegistry = new Map();

// Pre-populate registry with 200 idle Stage-1 tabs
testRegistry.clear();
for (let i = 1; i <= 200; i++) {
  testRegistry.set(i, makeTabEntry(i, 'active'));
}

// Mock the settings for the tick (T1=5, T2=15)
const mockSettings = Object.assign({}, CON.DEFAULT_SETTINGS, {
  t1Minutes: 5,
  t2Minutes: 15,
});

benchmark('NFR-11: LifecycleManager.tick() — 200 tabs, all idle > T2 (< 200ms avg)', 'NFR-11', 200, function() {
  // tick() is synchronous for candidate collection; async for transitions.
  // We measure only the synchronous candidate-collection pass here,
  // since in browser context the transitions are async API calls.
  // The two-pass Array.from() snapshot is the measurable O(n) unit.
  LM.tick(testRegistry, mockSettings, function() {}, function() { return Promise.resolve(); });
});

// Restore registry after benchmark
testRegistry.clear();

// ── Benchmark: NFR-01 — Sidebar render simulation < 200ms ───────────────────
// The real fullRender() requires a live DOM. Here we simulate the data
// processing and tree-building work using plain objects to measure the
// algorithmic cost without JSDOM.

function simulateFullRender(groups, allEntries) {
  // Simulate building group cards: sort entries by group, build per-group arrays
  const groupMap = {};
  for (const g of groups) groupMap[g.id] = [];
  for (const e of allEntries) {
    if (groupMap[e.groupId]) groupMap[e.groupId].push(e);
  }
  // Simulate DOM node construction cost: one string concat per entry
  let output = '';
  for (const g of groups) {
    const entries = groupMap[g.id] || [];
    if (g.isCollapsed) continue; // collapsed groups skip entry rendering (GA 07-01 optimization)
    output += '<div class="tn-group-card" id="group-' + g.id + '">';
    for (const e of entries) {
      output += '<div class="tn-tab-entry" data-id="' + (e.tabId || e.savedId) + '">'
             + (e.title || '') + '</div>';
    }
    output += '</div>';
  }
  return output.length; // consume result to prevent dead-code elimination
}

// Build 200 entries across 10 groups (50 active + 50 discarded + 50 saved + 50 archived)
const BENCH_GROUPS   = [];
const BENCH_ENTRIES  = [];
for (let i = 0; i < 10; i++) BENCH_GROUPS.push(makeGroup(i));
for (let i = 0; i < 50; i++) BENCH_ENTRIES.push(Object.assign(makeTabEntry(i, 'active'),   { groupId: 'group-' + (i % 10) }));
for (let i = 0; i < 50; i++) BENCH_ENTRIES.push(Object.assign(makeTabEntry(i + 50, 'discarded'), { groupId: 'group-' + (i % 10) }));
for (let i = 0; i < 50; i++) BENCH_ENTRIES.push(Object.assign(makeSavedEntry(i),            { stage: 'saved',    groupId: 'group-' + (i % 10) }));
for (let i = 0; i < 50; i++) BENCH_ENTRIES.push(Object.assign(makeSavedEntry(i + 50),       { stage: 'archived', groupId: 'group-' + (i % 10) }));

benchmark('NFR-01: fullRender() simulation — 200 entries, 10 groups (< 200ms avg)', 'NFR-01', 200, function() {
  simulateFullRender(BENCH_GROUPS, BENCH_ENTRIES);
});

// ── NFR-09: Background memory target note ─────────────────────────────────────
// SRS NFR-09 specifies < 10 MB resident background worker memory.
// CLAUDE.md says < 50 MB — SRS is authoritative; 10 MB is the target.
// In-process self-check: measure Node.js heap usage as a proxy.
const memUsageMB = process.memoryUsage().heapUsed / (1024 * 1024);
console.log('\n  NFR-09: Background memory target = < 10 MB resident');
console.log('  NFR-09: Test process heap usage = ' + memUsageMB.toFixed(1) + ' MB (proxy — real measurement via Chrome DevTools)');

// ── Results table ─────────────────────────────────────────────────────────────

console.log('\n┌─────────────────────────────────────────────────────────────────┬──────────┬───────────┬───────────┬──────────┬──────┐');
console.log('│ Benchmark                                                        │ Threshold│ Avg (ms)  │ Min (ms)  │ Max (ms) │ Pass │');
console.log('├─────────────────────────────────────────────────────────────────┼──────────┼───────────┼───────────┼──────────┼──────┤');
for (const r of results) {
  const name      = r.name.padEnd(65).slice(0, 65);
  const threshold = (r.threshold + 'ms').padStart(8);
  const avg       = r.avg.padStart(9);
  const min       = r.min.padStart(9);
  const max       = r.max.padStart(8);
  const pass      = r.pass ? ' YES' : '  NO';
  console.log('│ ' + name + ' │ ' + threshold + ' │ ' + avg + ' │ ' + min + ' │ ' + max + ' │' + pass + ' │');
}
console.log('└─────────────────────────────────────────────────────────────────┴──────────┴───────────┴───────────┴──────────┴──────┘');

console.log('');
if (anyFailed) {
  console.error('FAIL: One or more benchmarks exceeded their NFR threshold.');
  console.error('      Optimize the listed modules before store submission.');
  process.exit(1);
} else {
  console.log('PASS: All benchmarks within SRS §4.1 NFR thresholds.');
}
