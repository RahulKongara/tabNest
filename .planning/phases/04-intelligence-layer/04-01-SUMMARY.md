---
phase: 04-intelligence-layer
plan: 01
status: complete
completed: "2026-03-02"
duration: ~15m
---

# Plan 04-01 Summary: Stateful URL Detection

## What Was Built

Replaced the Phase 1 stub in `core/url-analyzer.js` with a full implementation of `UrlAnalyzer.isStateful(url, transitionType)` that detects four classes of stateful URLs. Wired into both background files and the sidebar tab-entry component.

## Files Modified

| File | Change |
|------|--------|
| `core/url-analyzer.js` | Full implementation replacing stub — 4 detection rules |
| `core/constants.js` | Added `DYNAMIC_DOMAINS` array (12 known stateful hostnames) |
| `background.js` | `importScripts` + `transitionType` field + webNavigation listener + `isStatefulUrl` in `saveAndCloseTab()` |
| `background-firefox.js` | Same 4 changes inside IIFE scope |
| `manifest-firefox.json` | Added `core/url-analyzer.js` to background.scripts |
| `sidebar/tab-entry.js` | Renders `span.tn-stateful-badge` with ⚠️ for `isStatefulUrl === true` entries |
| `tests/url-analyzer.test.js` | 19 tests covering all 4 detection paths + edge cases |

## Detection Rules Implemented

1. **SPA hash fragment**: `#/` or `#!/` in URL
2. **Session token query params**: `session=`, `token=`, `auth=`, `sid=`, or UUID pattern in query string
3. **POST-backed page**: `transitionType === 'form_submit'` (tracked via `chrome.webNavigation.onCompleted`)
4. **Known dynamic domain**: hostname matches `CONSTANTS.DYNAMIC_DOMAINS` (12 entries)

## Test Results

- `node tests/url-analyzer.test.js` — 19 passed, 0 failed
- `node tests/lifecycle-manager.test.js` — 40 passed, 0 failed (zero regressions)

## Key Design Decisions

- `transitionType` field added to `TabEntry` schema (initialized `''`), set by webNavigation listener on main-frame completion only (`frameId === 0`)
- `isStatefulUrl` is distinct from legacy `isStateful` — both fields coexist on `SavedTabEntry`
- DYNAMIC_DOMAINS fallback list hard-coded inside `url-analyzer.js` IIFE for test environments where `CONSTANTS` is not loaded
- Badge inserted between `stageSpan` and `actions` — purely additive, entries without `isStatefulUrl` are unchanged
