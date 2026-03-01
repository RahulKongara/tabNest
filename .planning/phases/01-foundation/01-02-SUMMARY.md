---
phase: 01-foundation
plan: 02
subsystem: core
tags: [browser-adapter, constants, cross-browser, domain-dictionary, keyword-sets]
dependency_graph:
  requires: []
  provides: [BrowserAdapter, CONSTANTS]
  affects: [core/lifecycle-manager.js, core/grouping-engine.js, core/storage-manager.js, background.js]
tech_stack:
  added: []
  patterns: [IIFE-with-globalThis, feature-detection, namespace-abstraction]
key_files:
  created:
    - core/browser-adapter.js
    - core/constants.js
  modified: []
decisions:
  - "IIFE + globalThis export used so both module (background.js type:module) and non-module (sidebar, content scripts) contexts share the same adapter without bundler"
  - "tabs.discard() feature-detected at load time via typeof check — safe no-op on Firefox rather than build-time branching"
  - "Domain dictionary keys use bare hostnames without www. prefix — callers must strip www. before lookup"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-01"
  tasks_completed: 2
  files_created: 2
---

# Phase 01 Plan 02: Browser Adapter and Constants Summary

One-liner: Cross-browser API abstraction layer (BrowserAdapter) and complete data constants (179-domain dictionary, 10-category keyword sets, PRD-color group definitions) implemented as vanilla JS IIFE modules.

## What Was Built

### core/browser-adapter.js (156 lines)

Wraps all `chrome.*` / `browser.*` API calls behind a single `BrowserAdapter` object. Detection logic:

```javascript
const _api = (typeof browser !== 'undefined') ? browser : chrome;
const _isFirefox = typeof browser !== 'undefined';
const _isMV3 = _api.runtime.getManifest().manifest_version === 3;
const _canDiscard = typeof _api.tabs.discard === 'function';
```

Namespaces covered: `tabs`, `storage.local`, `storage.sync`, `alarms`, `runtime`, `windows`, `sidePanel`, `webNavigation`.

Key safety behavior: `BrowserAdapter.tabs.discard()` returns `Promise.resolve(null)` when `tabs.discard` is unavailable — never throws on Firefox.

### core/constants.js (372 lines)

- **DEFAULT_GROUPS**: 10 groups with exact PRD §7.2 hex colors
- **DOMAIN_DICT**: 179 entries across all 10 categories (30 dev, 29 work, 18 social, 16 shopping, 17 entertainment, 20 news, 16 research, 18 finance, 15 lifestyle)
- **KEYWORD_SETS**: 9 non-trivial keyword arrays (30+ keywords each for dev/work; 20+ for others); `other` intentionally empty as fallback
- **DEFAULT_SETTINGS**: t1=5min, t2=15min, t3=7days, batchSize=3, all fields present
- **STAGE**: `active | discarded | saved | archived`
- **BROWSER_INTERNAL_PROTOCOLS**: 9 protocol prefixes for LifecycleManager exemption checks
- **ALARM_NAME**: `tabnest-lifecycle-tick`, period 0.5 min (30s)

## Export Pattern

Both files use identical dual-export:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BrowserAdapter }; // Node.js test environment
}
globalThis.BrowserAdapter = BrowserAdapter; // all browser contexts
```

This allows Node.js `require()` in tests while also working in sidebar (script tag), content scripts (injected), and background (either module or globalThis access).

## Verification Results

```
BrowserAdapter: all assertions passed
CONSTANTS: all assertions passed. Domain count: 179
Phase 01-02 verification passed. Domain count: 179
```

## Deviations from Plan

None — plan executed exactly as written.

## Notes for Downstream Plans

**For 01-03 (Tab Tracker / background.js):**
- Use `BrowserAdapter.tabs.query({ currentWindow: true })` to enumerate open tabs
- Register all event listeners via `BrowserAdapter.tabs.onCreated.addListener(...)` etc.
- Use `CONSTANTS.STORAGE_KEYS.TIMESTAMPS` and `CONSTANTS.STORAGE_KEYS.SESSION_STATE` for storage key names
- Use `BrowserAdapter.alarms.create(CONSTANTS.ALARM_NAME, { periodInMinutes: CONSTANTS.ALARM_PERIOD_MINUTES })`
- Check `BrowserAdapter.features.canDiscard` before calling `BrowserAdapter.tabs.discard()`

**For 01-05 (Grouping Engine):**
- Import via `globalThis.CONSTANTS` (or `require('./core/constants.js').CONSTANTS` in tests)
- `CONSTANTS.DOMAIN_DICT[hostname]` returns groupId or undefined — strip `www.` before lookup
- `CONSTANTS.KEYWORD_SETS[groupId]` returns string array — match case-insensitively against `url + title`
- Tie-breaking: if multiple categories score equally, fall back to `'other'`

## Self-Check

Files verified to exist:
- core/browser-adapter.js: FOUND
- core/constants.js: FOUND

Commits:
- a56e4c5: feat(01-02): implement core/browser-adapter.js
- f85a0ce: feat(01-02): implement core/constants.js

## Self-Check: PASSED
