'use strict';
// tests/cross-browser.test.js
// Verifies cross-browser file consistency: manifest sync, adapter coverage,
// and background-firefox.js parity with background.js.
// Run: node tests/cross-browser.test.js

const fs   = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  PASS:', message);
    passed++;
  } else {
    console.error('  FAIL:', message);
    failed++;
  }
}

const ROOT = path.resolve(__dirname, '..');

const bgSource   = fs.readFileSync(path.join(ROOT, 'background.js'),         'utf8');
const bgffSource = fs.readFileSync(path.join(ROOT, 'background-firefox.js'), 'utf8');
const adapterSrc = fs.readFileSync(path.join(ROOT, 'core', 'browser-adapter.js'), 'utf8');
const manifestFF = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest-firefox.json'), 'utf8'));
const manifestCR = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

console.log('\n── Cross-Browser Consistency Tests (Plan 06-01) ──');

// 1. BrowserAdapter.tabs.sendMessage exists
assert(adapterSrc.includes('sendMessage(tabId, message)') || adapterSrc.includes('sendMessage(tabId,message)'),
  'BrowserAdapter.tabs.sendMessage is defined in browser-adapter.js');

// 2. background-firefox.js does not use bare chrome.tabs.sendMessage
assert(!bgffSource.includes('chrome.tabs.sendMessage'),
  'background-firefox.js does not use chrome.tabs.sendMessage directly');

// 3. background-firefox.js does not use bare chrome.webNavigation
assert(!bgffSource.includes('chrome.webNavigation'),
  'background-firefox.js does not use chrome.webNavigation directly');

// 4. background-firefox.js uses BrowserAdapter.webNavigation.onCompleted
assert(bgffSource.includes('BrowserAdapter.webNavigation.onCompleted'),
  'background-firefox.js wires DATA-01 via BrowserAdapter.webNavigation.onCompleted');

// 5. background-firefox.js has FORM_STATE_REPORT handler
assert(bgffSource.includes('FORM_STATE_REPORT'),
  'background-firefox.js contains FORM_STATE_REPORT handler (DATA-03 parity)');

// 6. manifest-firefox.json manifest_version is 2
assert(manifestFF.manifest_version === 2,
  'manifest-firefox.json has manifest_version === 2');

// 7. manifest-firefox.json has persistent: true
assert(manifestFF.background && manifestFF.background.persistent === true,
  'manifest-firefox.json background.persistent is true');

// 8. manifest-firefox.json has sidebar_action (not side_panel)
assert(manifestFF.sidebar_action !== undefined && manifestFF.side_panel === undefined,
  'manifest-firefox.json uses sidebar_action, not side_panel');

// 9. manifest-firefox.json background.scripts ends with background-firefox.js
const scripts = manifestFF.background && manifestFF.background.scripts;
assert(Array.isArray(scripts) && scripts[scripts.length - 1] === 'background-firefox.js',
  'manifest-firefox.json background.scripts ends with background-firefox.js');

// 10. manifest-firefox.json scripts contain all files in background.js importScripts()
// Extract importScripts list from background.js
const importMatch = bgSource.match(/importScripts\s*\(([\s\S]*?)\)/);
if (importMatch) {
  const imported = importMatch[1]
    .split(',')
    .map(function(s) { return s.trim().replace(/['"]/g, ''); })
    .filter(Boolean);
  for (const f of imported) {
    assert(scripts && scripts.includes(f),
      'manifest-firefox.json scripts includes ' + f + ' (from importScripts)');
  }
} else {
  assert(false, 'Could not parse importScripts() list from background.js');
}

// 11. manifest.json (Chromium) has manifest_version 3
assert(manifestCR.manifest_version === 3,
  'manifest.json (Chromium) has manifest_version === 3');

// 12. manifest.json uses service_worker background
assert(manifestCR.background && manifestCR.background.service_worker === 'background.js',
  'manifest.json background uses service_worker: background.js');

// ── Phase 4/5 parity checks ───────────────────────────────────────────────

// 13. background-firefox.js includes UrlAnalyzer.isStateful (Phase 4 DATA-01 parity)
assert(bgffSource.includes('UrlAnalyzer.isStateful'),
  'background-firefox.js uses UrlAnalyzer.isStateful in saveAndCloseTab (DATA-01 parity)');

// 14. background-firefox.js stores navigationHistory in saveAndCloseTab (Phase 4 DATA-02 parity)
assert(bgffSource.includes('navigationHistory'),
  'background-firefox.js includes navigationHistory in saveAndCloseTab (DATA-02 parity)');

// 15. background-firefox.js has RESTORE_TAB handler
assert(bgffSource.includes('MSG_TYPES.RESTORE_TAB') || bgffSource.includes("'RESTORE_TAB'"),
  'background-firefox.js handleMessage includes RESTORE_TAB case');

// 16. background-firefox.js has SAVE_ALL_INACTIVE handler
assert(bgffSource.includes('MSG_TYPES.SAVE_ALL_INACTIVE') || bgffSource.includes("'SAVE_ALL_INACTIVE'"),
  'background-firefox.js handleMessage includes SAVE_ALL_INACTIVE case');

// 17. background-firefox.js has MOVE_TO_GROUP handler
assert(bgffSource.includes('MSG_TYPES.MOVE_TO_GROUP') || bgffSource.includes("'MOVE_TO_GROUP'"),
  'background-firefox.js handleMessage includes MOVE_TO_GROUP case');

// 18. background-firefox.js has DISCARD_ALL_INACTIVE handler (checks BrowserAdapter.features.canDiscard)
assert(bgffSource.includes('DISCARD_ALL_INACTIVE'),
  'background-firefox.js handleMessage includes DISCARD_ALL_INACTIVE case');

// 19. background-firefox.js DISCARD_ALL_INACTIVE checks BrowserAdapter.features.canDiscard
assert(bgffSource.includes('BrowserAdapter.features.canDiscard'),
  'background-firefox.js DISCARD_ALL_INACTIVE guards with BrowserAdapter.features.canDiscard');

// 20. background-firefox.js has Phase 5 SAVE_SETTINGS handler (not stub) — calls refreshUserRulesCache
assert(bgffSource.includes('refreshUserRulesCache'),
  'background-firefox.js SAVE_SETTINGS handler calls refreshUserRulesCache (Phase 5 parity)');

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
