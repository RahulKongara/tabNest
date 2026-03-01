---
phase: 01-foundation
plan: "01"
subsystem: scaffold
tags: [manifest, scaffold, cross-browser, directory-structure]
dependency_graph:
  requires: []
  provides: [manifest.json, manifest-firefox.json, source-stubs, build-script]
  affects: [01-02, 01-03, 01-04, 01-05]
tech_stack:
  added: [vanilla-js, manifest-v3, manifest-v2]
  patterns: [cross-browser-adapter, module-stub-contracts]
key_files:
  created:
    - manifest.json
    - manifest-firefox.json
    - background.js
    - background-firefox.js
    - sidebar/sidebar.html
    - sidebar/sidebar.css
    - sidebar/sidebar.js
    - content/form-detector.js
    - content/history-capture.js
    - core/browser-adapter.js
    - core/lifecycle-manager.js
    - core/grouping-engine.js
    - core/storage-manager.js
    - core/restore-manager.js
    - core/url-analyzer.js
    - core/constants.js
    - icons/icon16.png
    - icons/icon32.png
    - icons/icon48.png
    - icons/icon128.png
    - build/build.sh
  modified: []
decisions:
  - "Placeholder PNGs generated as real RGB 24-bit PNGs (#1B6B93 brand color) using Node.js zlib deflate — not empty files or base64 blobs — so Chrome manifest validation passes"
  - "build.sh uses set -euo pipefail and BASH_SOURCE-based path detection for portability across CI environments"
  - "All core/*.js stubs use dual export pattern (module.exports for Node test environments, globalThis for browser) to allow unit testing without a bundler"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-01"
  tasks_completed: 2
  files_created: 21
---

# Phase 1 Plan 01: Directory Structure and Extension Scaffold Summary

**One-liner:** MV3 Chrome and MV2 Firefox manifests with full source stub tree and build script skeleton using valid placeholder PNGs and dual-export JS contracts.

## What Was Created

```
TabNest_Scafold/
├── manifest.json              MV3 (Chrome/Edge/Brave) — service_worker, sidePanel, CSP, 6 permissions
├── manifest-firefox.json      MV2 (Firefox 109+) — sidebar_action, browser_action, persistent bg
├── background.js              MV3 service worker entry stub
├── background-firefox.js      MV2 persistent background stub
├── icons/
│   ├── icon16.png             Valid 16x16 RGB PNG, #1B6B93 brand color
│   ├── icon32.png             Valid 32x32 RGB PNG
│   ├── icon48.png             Valid 48x48 RGB PNG
│   └── icon128.png            Valid 128x128 RGB PNG
├── sidebar/
│   ├── sidebar.html           Semantic HTML5 with header/main/section/footer, CSP meta tag
│   ├── sidebar.css            Flexbox layout stub, system font stack
│   └── sidebar.js             Sidebar controller stub
├── content/
│   ├── form-detector.js       FORM_STATE_REPORT contract documented
│   └── history-capture.js     NAV_HISTORY_REPORT contract documented
├── core/
│   ├── browser-adapter.js     BrowserAdapter stub (dual export)
│   ├── lifecycle-manager.js   LifecycleManager stub with start/tick/isExempt API
│   ├── grouping-engine.js     GroupingEngine stub with classify() API
│   ├── storage-manager.js     StorageManager stub with load/save/getSettings/saveSettings
│   ├── restore-manager.js     RestoreManager stub with restoreTab/restoreWorkspace
│   ├── url-analyzer.js        UrlAnalyzer stub with isStateful() API
│   └── constants.js           CONSTANTS stub with T1/T2/T3/ALARM defaults
└── build/
    └── build.sh               Build skeleton with --help/--chromium/--firefox flags
```

## Verification Results

- manifest.json: Valid JSON, manifest_version 3, service_worker: background.js, side_panel.default_path: sidebar/sidebar.html
- manifest-firefox.json: Valid JSON, manifest_version 2, background.scripts: [background-firefox.js]
- All 17 source stubs present and non-empty
- All 4 icon PNGs: valid binary PNGs (79–306 bytes each, non-zero)
- build.sh --help: Prints usage correctly; set -euo pipefail active

## Deviations from Plan

None — plan executed exactly as written.

The plan suggested using a 1x1 transparent PNG as a fallback if tools were unavailable. Node.js was available so proper sized RGB PNGs were generated for each resolution (16x16, 32x32, 48x48, 128x128) with correct color.

## Downstream Plan Notes

- **01-02** (browser-adapter + constants): Fills in `core/browser-adapter.js` and `core/constants.js` stubs. The stub exports (`BrowserAdapter`, `CONSTANTS`) are the exact names 01-02 must implement.
- **01-03** (tab tracking): Imports from `core/browser-adapter.js` — the module export pattern is established.
- **01-04** (lifecycle alarm): `LifecycleManager.start()` and `.tick()` signatures are pre-defined in the stub.
- **01-05** (grouping engine): `GroupingEngine.classify(url, title, userRules)` signature pre-defined.
- **Phase 2+**: `StorageManager` and `RestoreManager` stub APIs define the contracts.
- Extension can be loaded in Chrome developer mode now (Load unpacked at project root). The sidebar will be blank but no manifest errors will occur.

## Commits

| Task | Description | Hash |
|------|-------------|------|
| Task 1 | Directory structure, manifests, icons | 3ad0162 |
| Task 2 | All source stubs and build script | 67bd06b |

## Self-Check: PASSED

All 22 files verified present on disk. Both task commits (3ad0162, 67bd06b) confirmed in git log.
