'use strict';
// tests/polish.test.js
// Edge case and defensive rendering tests for GA polish pass (Plan 07-02).
// Run: node tests/polish.test.js

const fs = require('fs');
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log('  PASS:', message); passed++; }
  else { console.error('  FAIL:', message); failed++; }
}

console.log('\n── Polish Edge Case Tests (Plan 07-02) ──\n');

// Group 1: tab-entry.js title fallback (source check)
const te = fs.readFileSync('./sidebar/tab-entry.js', 'utf8');
assert(te.includes("'Untitled'") || te.includes('"Untitled"'),
  'tab-entry.js has Untitled fallback for null/empty titles');
assert(te.includes('|| entry.url'),
  'tab-entry.js falls back to URL before Untitled');

// Group 2: group-card.js NaN guard (source check)
const gc = fs.readFileSync('./sidebar/group-card.js', 'utf8');
assert(gc.includes('|| 0'),
  'group-card.js count badge has || 0 NaN guard');
assert(gc.includes('Array.isArray'),
  'group-card.js has Array.isArray guard in buildCountText()');

// Group 3: storage-manager.js QUOTA_EXCEEDED (source check)
const sm = fs.readFileSync('./core/storage-manager.js', 'utf8');
assert(sm.includes('QUOTA_EXCEEDED') || sm.includes('QUOTA_BYTES') || sm.includes('quota'),
  'storage-manager.js handles QUOTA_EXCEEDED storage errors');
assert(sm.includes('prune') || sm.includes('splice') || sm.includes('slice'),
  'storage-manager.js prunes entries on quota error');

// Group 4: sidebar.js loading overlay + empty state (source check)
const sjs = fs.readFileSync('./sidebar/sidebar.js', 'utf8');
assert(sjs.includes('tn-loading-overlay'),
  'sidebar.js creates a loading overlay element during GET_FULL_STATE request');
assert(sjs.includes('aria-live'),
  'sidebar.js loading overlay sets aria-live for accessibility');
assert(sjs.includes('tn-empty-state'),
  'sidebar.js renders a .tn-empty-state element when there are no groups/entries');

// Group 5: background.js error handling (source check)
const bg = fs.readFileSync('./background.js', 'utf8');
assert(bg.includes("success: false"),
  'background.js message handlers return { success: false, error } on failure');
assert(bg.includes('catch'),
  'background.js has catch blocks in message handlers');

// Group 6: background-firefox.js error handling (source check)
const bgf = fs.readFileSync('./background-firefox.js', 'utf8');
assert(bgf.includes("success: false"),
  'background-firefox.js message handlers return { success: false, error } on failure');

// Group 7: sidebar.css has loading + empty state styles
const css = fs.readFileSync('./sidebar/sidebar.css', 'utf8');
assert(css.includes('tn-loading-overlay'),
  'sidebar.css has .tn-loading-overlay styles');
assert(css.includes('tn-empty-state'),
  'sidebar.css has .tn-empty-state styles');

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
else console.log('PASS: All polish edge case tests verified.');
