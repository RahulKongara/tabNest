'use strict';
// tests/manifest-validation.test.js
// Validates both browser manifests for store submission readiness.
// Run: node tests/manifest-validation.test.js

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { console.log('  PASS:', message); passed++; }
  else { console.error('  FAIL:', message); failed++; }
}

function loadManifest(filename) {
  const filePath = path.join(ROOT, filename);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { return null; }
}

function semverValid(v) { return /^\d+\.\d+\.\d+$/.test(v); }
function parseMinVersion(v) { return parseInt(String(v).split('.')[0], 10); }

console.log('\n── Manifest Validation Tests (Plan 07-03) ──\n');

// ── Chromium MV3 Manifest ──────────────────────────────────────────────────────
console.log('  -- manifest.json (Chromium MV3) --');

const crPath = path.join(ROOT, 'manifest.json');
assert(fs.existsSync(crPath), 'manifest.json file exists');
const cr = loadManifest('manifest.json');
assert(cr !== null, 'manifest.json is valid JSON');

if (cr) {
  assert(cr.manifest_version === 3, 'manifest.json has manifest_version === 3');
  assert(cr.name === 'TabNest', 'manifest.json name is "TabNest"');
  assert(typeof cr.description === 'string' && cr.description.length > 0,
    'manifest.json has a non-empty description');
  assert(typeof cr.description === 'string' && cr.description.length <= 132,
    'manifest.json description is <= 132 characters (current: ' + (cr.description || '').length + ')');
  assert(typeof cr.version === 'string' && semverValid(cr.version),
    'manifest.json version is valid semver: ' + cr.version);

  const crPerms = Array.isArray(cr.permissions) ? cr.permissions : [];
  assert(crPerms.includes('tabs'),          'manifest.json permissions includes "tabs"');
  assert(crPerms.includes('storage'),       'manifest.json permissions includes "storage"');
  assert(crPerms.includes('alarms'),        'manifest.json permissions includes "alarms"');
  assert(crPerms.includes('webNavigation'), 'manifest.json permissions includes "webNavigation"');
  assert(!crPerms.includes('history'),      'manifest.json does NOT include "history" permission');
  assert(!crPerms.includes('bookmarks'),    'manifest.json does NOT include "bookmarks" permission');
  assert(!crPerms.includes('downloads'),    'manifest.json does NOT include "downloads" permission');

  assert(cr.icons && cr.icons['16'],  'manifest.json icons has key "16"');
  assert(cr.icons && cr.icons['48'],  'manifest.json icons has key "48"');
  assert(cr.icons && cr.icons['128'], 'manifest.json icons has key "128"');

  if (cr.icons && cr.icons['16']) {
    assert(fs.existsSync(path.join(ROOT, cr.icons['16'])),
      'manifest.json icons["16"] file exists: ' + cr.icons['16']);
  }
  if (cr.icons && cr.icons['128']) {
    assert(fs.existsSync(path.join(ROOT, cr.icons['128'])),
      'manifest.json icons["128"] file exists: ' + cr.icons['128']);
  }

  assert(cr.minimum_chrome_version !== undefined && parseMinVersion(cr.minimum_chrome_version) >= 114,
    'manifest.json minimum_chrome_version >= 114 (current: ' + cr.minimum_chrome_version + ')');
  assert(cr.content_security_policy && typeof cr.content_security_policy === 'object' &&
    cr.content_security_policy.extension_pages,
    'manifest.json content_security_policy is an object with extension_pages (MV3 format)');
  assert(cr.background && cr.background.service_worker === 'background.js',
    'manifest.json background.service_worker === "background.js"');
}

// ── Firefox MV2 Manifest ───────────────────────────────────────────────────────
console.log('\n  -- manifest-firefox.json (Firefox MV2) --');

const ffPath = path.join(ROOT, 'manifest-firefox.json');
assert(fs.existsSync(ffPath), 'manifest-firefox.json file exists');
const ff = loadManifest('manifest-firefox.json');
assert(ff !== null, 'manifest-firefox.json is valid JSON');

if (ff) {
  assert(ff.manifest_version === 2, 'manifest-firefox.json has manifest_version === 2');
  assert(typeof ff.description === 'string' && ff.description.length > 0,
    'manifest-firefox.json has a non-empty description');
  assert(typeof ff.description === 'string' && ff.description.length <= 132,
    'manifest-firefox.json description is <= 132 characters (current: ' + (ff.description || '').length + ')');
  assert(typeof ff.version === 'string' && semverValid(ff.version),
    'manifest-firefox.json version is valid semver: ' + ff.version);
  assert(ff.background && ff.background.persistent === true,
    'manifest-firefox.json background.persistent === true');
  assert(Array.isArray(ff.background && ff.background.scripts) && ff.background.scripts.length > 0,
    'manifest-firefox.json background.scripts is a non-empty array');
  assert(ff.sidebar_action !== undefined,
    'manifest-firefox.json has sidebar_action key');
  assert(ff.side_panel === undefined,
    'manifest-firefox.json does NOT have side_panel key (MV3-only)');
  assert(ff.browser_specific_settings && ff.browser_specific_settings.gecko &&
    typeof ff.browser_specific_settings.gecko.id === 'string' &&
    ff.browser_specific_settings.gecko.id.length > 0,
    'manifest-firefox.json browser_specific_settings.gecko.id is present');
  const strictMin = ff.browser_specific_settings && ff.browser_specific_settings.gecko &&
    ff.browser_specific_settings.gecko.strict_min_version;
  assert(strictMin && parseMinVersion(strictMin) >= 109,
    'manifest-firefox.json gecko.strict_min_version >= 109 (current: ' + strictMin + ')');
  assert(typeof ff.content_security_policy === 'string',
    'manifest-firefox.json content_security_policy is a plain string (MV2 format)');

  const ffPerms = Array.isArray(ff.permissions) ? ff.permissions : [];
  assert(ffPerms.includes('tabs'),    'manifest-firefox.json permissions includes "tabs"');
  assert(ffPerms.includes('storage'), 'manifest-firefox.json permissions includes "storage"');
  assert(ffPerms.includes('alarms'),  'manifest-firefox.json permissions includes "alarms"');
}

// ── Cross-manifest consistency ────────────────────────────────────────────────
if (cr && ff) {
  console.log('\n  -- Cross-manifest consistency --');
  assert(cr.name === ff.name, 'Both manifests have the same name');
  assert(cr.version === ff.version, 'Both manifests have the same version: ' + cr.version);
}

// ── Store assets exist ────────────────────────────────────────────────────────
console.log('\n  -- Store assets --');
assert(fs.existsSync(path.join(ROOT, 'store/STORE-LISTING.md')), 'store/STORE-LISTING.md exists');
assert(fs.existsSync(path.join(ROOT, 'store/SCREENSHOTS-SPEC.md')), 'store/SCREENSHOTS-SPEC.md exists');
assert(fs.existsSync(path.join(ROOT, 'store/PRIVACY-POLICY.md')), 'store/PRIVACY-POLICY.md exists');

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) {
  console.error('FAIL: Fix the manifest issues above before store submission.');
  process.exit(1);
} else {
  console.log('PASS: Both manifests are valid for store submission.');
}
