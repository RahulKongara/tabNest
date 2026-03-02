'use strict';
// tests/build-output.test.js
// Validates the output of bash build/build.sh.
// Must be run AFTER `bash build/build.sh` has been executed.
// Run: node tests/build-output.test.js
//   or: bash build/build.sh && node tests/build-output.test.js

const { execSync } = require('child_process');
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
const DIST = path.join(ROOT, 'dist');

console.log('\n── Build Output Tests (Plan 06-03) ──');
console.log('Running bash build/build.sh ...');

// ── Step 0: Run the build script ─────────────────────────────────────────────
let buildExitCode = 0;
try {
  execSync('bash ' + path.join(ROOT, 'build', 'build.sh'), { cwd: ROOT, stdio: 'pipe' });
} catch (err) {
  buildExitCode = err.status || 1;
  console.error('  Build script stderr:', (err.stderr || '').toString().slice(0, 500));
}
assert(buildExitCode === 0, 'bash build/build.sh exits with code 0');

// Helper: get the file list from a ZIP
function zipContents(zipPath) {
  try {
    const out = execSync('unzip -l ' + JSON.stringify(zipPath), { cwd: ROOT }).toString();
    return out;
  } catch {
    return '';
  }
}

// Helper: read a single file from a ZIP
function zipReadFile(zipPath, filePath) {
  try {
    return execSync('unzip -p ' + JSON.stringify(zipPath) + ' ' + filePath, { cwd: ROOT }).toString();
  } catch {
    return null;
  }
}

// Helper: check whether a ZIP contains a file matching a path pattern
function zipHas(zipPath, filePath) {
  const contents = zipContents(zipPath);
  return contents.includes(filePath);
}

const CR_ZIP = path.join(DIST, 'tabnest-chromium.zip');
const FF_ZIP = path.join(DIST, 'tabnest-firefox.zip');

// ── Chromium ZIP checks ───────────────────────────────────────────────────────
console.log('\n  -- Chromium package --');

assert(fs.existsSync(CR_ZIP), 'dist/tabnest-chromium.zip exists');

const crManifestRaw = zipReadFile(CR_ZIP, 'manifest.json');
assert(crManifestRaw !== null, 'Chromium ZIP contains manifest.json');

let crManifest = null;
try { crManifest = JSON.parse(crManifestRaw); } catch { /* parse failed */ }
assert(crManifest !== null, 'Chromium ZIP manifest.json is valid JSON');
assert(crManifest && crManifest.manifest_version === 3,
  'Chromium ZIP manifest.json has manifest_version === 3');
assert(crManifest && crManifest.background && crManifest.background.service_worker === 'background.js',
  'Chromium ZIP manifest.json has background.service_worker: background.js');
assert(crManifest && crManifest.content_security_policy && typeof crManifest.content_security_policy === 'object',
  'Chromium ZIP manifest.json content_security_policy is an object (MV3 format)');
assert(crManifest && crManifest.minimum_chrome_version !== undefined,
  'Chromium ZIP manifest.json has minimum_chrome_version set');

assert(zipHas(CR_ZIP, 'background.js'),
  'Chromium ZIP contains background.js');
assert(zipHas(CR_ZIP, 'core/browser-adapter.js'),
  'Chromium ZIP contains core/browser-adapter.js');
assert(zipHas(CR_ZIP, 'core/lifecycle-manager.js'),
  'Chromium ZIP contains core/lifecycle-manager.js');
assert(zipHas(CR_ZIP, 'core/restore-manager.js'),
  'Chromium ZIP contains core/restore-manager.js');
assert(zipHas(CR_ZIP, 'sidebar/sidebar.html'),
  'Chromium ZIP contains sidebar/sidebar.html');
assert(zipHas(CR_ZIP, 'content/form-detector.js'),
  'Chromium ZIP contains content/form-detector.js');
assert(zipHas(CR_ZIP, 'content/history-capture.js'),
  'Chromium ZIP contains content/history-capture.js');

assert(!zipHas(CR_ZIP, 'manifest-firefox.json'),
  'Chromium ZIP does NOT contain manifest-firefox.json (was renamed)');
assert(!zipHas(CR_ZIP, 'background-firefox.js'),
  'Chromium ZIP does NOT contain background-firefox.js (Firefox-only)');

// ── Firefox ZIP checks ────────────────────────────────────────────────────────
console.log('\n  -- Firefox package --');

assert(fs.existsSync(FF_ZIP), 'dist/tabnest-firefox.zip exists');

const ffManifestRaw = zipReadFile(FF_ZIP, 'manifest.json');
assert(ffManifestRaw !== null, 'Firefox ZIP contains manifest.json');

let ffManifest = null;
try { ffManifest = JSON.parse(ffManifestRaw); } catch { /* parse failed */ }
assert(ffManifest !== null, 'Firefox ZIP manifest.json is valid JSON');
assert(ffManifest && ffManifest.manifest_version === 2,
  'Firefox ZIP manifest.json has manifest_version === 2');
assert(ffManifest && ffManifest.background && ffManifest.background.persistent === true,
  'Firefox ZIP manifest.json has background.persistent === true');
assert(ffManifest && ffManifest.sidebar_action !== undefined,
  'Firefox ZIP manifest.json has sidebar_action key');
assert(ffManifest && ffManifest.side_panel === undefined,
  'Firefox ZIP manifest.json does NOT have side_panel key');
assert(ffManifest && ffManifest.browser_specific_settings &&
       ffManifest.browser_specific_settings.gecko &&
       ffManifest.browser_specific_settings.gecko.strict_min_version === '109.0',
  'Firefox ZIP manifest.json has gecko.strict_min_version: 109.0');
assert(ffManifest && typeof ffManifest.content_security_policy === 'string',
  'Firefox ZIP manifest.json content_security_policy is a plain string (MV2 format)');
assert(ffManifest && ffManifest.browser_specific_settings &&
       ffManifest.browser_specific_settings.gecko &&
       ffManifest.browser_specific_settings.gecko.id === 'tabnest@extension',
  'Firefox ZIP manifest.json has gecko.id: tabnest@extension');

assert(zipHas(FF_ZIP, 'background-firefox.js'),
  'Firefox ZIP contains background-firefox.js');
assert(zipHas(FF_ZIP, 'core/browser-adapter.js'),
  'Firefox ZIP contains core/browser-adapter.js');
assert(zipHas(FF_ZIP, 'core/lifecycle-manager.js'),
  'Firefox ZIP contains core/lifecycle-manager.js');
assert(zipHas(FF_ZIP, 'core/restore-manager.js'),
  'Firefox ZIP contains core/restore-manager.js');
assert(zipHas(FF_ZIP, 'sidebar/sidebar.html'),
  'Firefox ZIP contains sidebar/sidebar.html');
assert(zipHas(FF_ZIP, 'content/history-capture.js'),
  'Firefox ZIP contains content/history-capture.js');

// Firefox ZIP should not contain a top-level background.js
// (background-firefox.js is the entry; background.js is chromium-only)
// Note: core/ files are fine; we check for root-level background.js specifically
const ffContents = zipContents(FF_ZIP);
// unzip -l output has lines like "   1234  2026-03-02 00:00   background.js"
// We check that 'background.js' does not appear as a root-level entry (no directory prefix)
const ffLines = ffContents.split('\n').filter(function(l) {
  return /\s+background\.js$/.test(l.trim());
});
assert(ffLines.length === 0,
  'Firefox ZIP does NOT contain top-level background.js (only background-firefox.js)');

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
