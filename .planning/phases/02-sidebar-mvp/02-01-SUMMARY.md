---
phase: 02-sidebar-mvp
plan: 01
subsystem: database
tags: [storage, chrome-storage, session-persistence, debounce, tdd]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: BrowserAdapter.storage API, CONSTANTS.STORAGE_KEYS, CONSTANTS.DEFAULT_SETTINGS, core module IIFE+dual-export pattern

provides:
  - StorageManager with loadState, saveState, scheduleSave, getSettings, saveSettings
  - globalThis._savedState pattern for GET_FULL_STATE message handler in 02-02
  - 30-second debounced auto-save (SESS-01)
  - Startup session restore via loadState() (SESS-02 partial — full reconciliation in 02-05)

affects: [02-02, 02-03, 02-04, 02-05, 03-lifecycle-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IIFE + dual export (globalThis + module.exports) — applied to storage-manager.js
    - TDD red-green: write failing tests first, then implement to pass
    - Internal error swallowing: all StorageManager methods catch exceptions and return null/defaults
    - Debounce via clearTimeout/setTimeout for sidebar-context saves (not alarm-based)

key-files:
  created:
    - core/storage-manager.js
    - tests/storage-manager.test.js
  modified:
    - background.js
    - background-firefox.js

key-decisions:
  - "StorageManager.scheduleSave() uses clearTimeout/setTimeout (not alarms) — called from sidebar context which has window timers; background uses alarm-based triggering independently"
  - "saveState() stamps state.timestamp = Date.now() before writing — callers don't manage timestamps"
  - "getSettings() spread pattern: { ...DEFAULT_SETTINGS, ...stored } — stored values override defaults, missing fields always get defaults"
  - "globalThis._savedState set in initializeRegistry() — avoids extra storage read in GET_FULL_STATE handler; reconciliation logic deferred to 02-05"

patterns-established:
  - "StorageManager never throws: all async methods have try/catch, return null or defaults on any error"
  - "Storage key pattern: CONSTANTS.STORAGE_KEYS.SESSION_STATE for local, CONSTANTS.STORAGE_KEYS.SETTINGS for sync"

requirements-completed: [SESS-01, SESS-02]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 02 Plan 01: Storage Manager Summary

**StorageManager with 30s debounced session persistence (SESS-01) and startup restore hook (SESS-02) using BrowserAdapter.storage.local/sync**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T13:25:15Z
- **Completed:** 2026-03-01T13:28:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented full StorageManager module (loadState, saveState, scheduleSave, getSettings, saveSettings) replacing the Phase 1 stub
- 30-second debounced auto-save via clearTimeout/setTimeout pattern (SESS-01)
- Startup session restore: both background.js and background-firefox.js call StorageManager.loadState() during initializeRegistry() and store the result as globalThis._savedState (SESS-02 partial)
- 22 unit tests across all StorageManager behaviors (TDD red-green cycle)
- Full test suite regression check: all 4 test files pass (22 + 30 + 25 + 33 = 110 tests, 0 failures)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for StorageManager** - `3683641` (test)
2. **Task 1 GREEN: StorageManager implementation** - `610855a` (feat)
3. **Task 2: Wire StorageManager into background startup** - `fd793c4` (feat)

_Note: TDD Task 1 has separate red (test) and green (impl) commits_

## StorageManager API Surface

```javascript
StorageManager.loadState()           // Promise<object|null> — reads SESSION_STATE from storage.local
StorageManager.saveState(state)      // Promise<void> — writes to storage.local, stamps timestamp
StorageManager.scheduleSave(state)   // void — debounced (30s) saveState, resets timer on each call
StorageManager.getSettings()         // Promise<object> — reads SETTINGS from storage.sync, merges with DEFAULT_SETTINGS
StorageManager.saveSettings(settings) // Promise<void> — writes to storage.sync
```

## Session State Schema

The blob saved/loaded via `loadState()`/`saveState()`:

```javascript
{
  savedEntries: [],   // SavedTabEntry[] — Stage 3/4 entries (closed tabs saved in sidebar)
  groups: [],         // TabGroup[] — group metadata (name, color, order, isCollapsed)
  timestamp: 0        // Date.now() when last saved (stamped by saveState, not callers)
}
```

## globalThis._savedState Pattern

Established in this plan for use by the GET_FULL_STATE message handler in 02-02:

- `initializeRegistry()` (both background.js and background-firefox.js) calls `StorageManager.loadState()`
- Result stored as `globalThis._savedState` (null if no prior session or on error)
- 02-02's GET_FULL_STATE handler returns `_savedState.savedEntries` and `_savedState.groups` to sidebar
- Full reconciliation (matching open tabs to saved groups) deferred to 02-05

## Files Created/Modified

- `core/storage-manager.js` — Full StorageManager implementation (IIFE + dual export, 122 lines)
- `tests/storage-manager.test.js` — 22 unit tests covering all StorageManager methods
- `background.js` — initializeRegistry() now calls StorageManager.loadState(), stores globalThis._savedState
- `background-firefox.js` — Same change as background.js, mirrored for Firefox MV2

## Decisions Made

- scheduleSave uses clearTimeout/setTimeout (not alarms): sidebar context has window timers; background uses alarm-based triggering separately
- saveState stamps `state.timestamp = Date.now()` before writing so callers don't manage timestamps
- getSettings spread `{ ...DEFAULT_SETTINGS, ...stored }` ensures missing stored fields always get defaults
- globalThis._savedState avoids extra storage read in GET_FULL_STATE hot path; full reconciliation logic is in 02-05

## Deviations from Plan

None - plan executed exactly as written.

The test file require path used `../core/storage-manager.js` (correct relative path from tests/ directory) rather than the `./core/storage-manager.js` shown in the plan spec (which was illustrative). This is not a deviation from intent.

## Issues Encountered

None - clean execution. All 22 new tests pass, no regressions in the 88 existing tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- StorageManager fully operational — all Phase 2 modules can use loadState/saveState/getSettings
- globalThis._savedState available in both background contexts for 02-02 GET_FULL_STATE handler
- scheduleSave ready for sidebar to call on any group/tab change event
- No blockers for 02-02 (message protocol) or 02-03 (sidebar components)

---
*Phase: 02-sidebar-mvp*
*Completed: 2026-03-01*

## Self-Check: PASSED

- FOUND: core/storage-manager.js
- FOUND: tests/storage-manager.test.js
- FOUND: .planning/phases/02-sidebar-mvp/02-01-SUMMARY.md
- FOUND commit: 3683641 (test: failing tests)
- FOUND commit: 610855a (feat: StorageManager implementation)
- FOUND commit: fd793c4 (feat: background wiring)
