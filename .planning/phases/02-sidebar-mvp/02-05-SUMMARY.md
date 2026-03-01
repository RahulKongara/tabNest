---
phase: 02-sidebar-mvp
plan: 05
subsystem: ui
tags: [ram-indicator, session-persistence, auto-save, sidebar, background-service-worker]

# Dependency graph
requires:
  - phase: 02-04
    provides: sidebar.js controller with fullRender(), _state management, push handler
  - phase: 02-01
    provides: StorageManager.scheduleSave(), loadState(), saveState()
  - phase: 02-02
    provides: handleMessage RESTORE_TAB, pushToSidebar, MSG_TYPES
provides:
  - RamIndicator module (computeRamMB, formatRam, update) wired into sidebar fullRender
  - SESS-01 auto-save: StorageManager.scheduleSave() after onCreated, onRemoved, alarm tick
  - SESS-02 startup reconciliation: _savedState normalization in initializeRegistry()
  - buildSessionState() helper gathering savedEntries + groups + timestamp
  - Full Phase 2 feature set complete (UI-06, UI-08, RESTORE-01, SESS-01, SESS-02)
affects: [03-tab-lifecycle, 05-settings, 06-firefox-port]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RamIndicator IIFE module with globalThis export — consistent with all sidebar components"
    - "computeRamMB pure function: discarded × 150MB + saved/archived × 200MB"
    - "buildSessionState() gathers _savedState + DEFAULT_GROUPS fallback for scheduleSave calls"
    - "SESS-02 normalization: Array.isArray guards before using savedState.groups/savedEntries"

key-files:
  created:
    - sidebar/ram-indicator.js
  modified:
    - sidebar/sidebar.js (RamIndicator.update call in fullRender)
    - sidebar/sidebar.html (ram-indicator.js script tag already present from 02-04)
    - background.js (buildSessionState, scheduleSave in onCreated/onRemoved/alarm, SESS-02 normalization)
    - background-firefox.js (same changes mirrored)

key-decisions:
  - "RamIndicator.update() called from fullRender() — every state push updates the badge automatically"
  - "formatRam threshold is 1024MB (not 1000MB) for GB display — binary prefix matches system conventions"
  - "buildSessionState() reads from globalThis._savedState — single source of truth; no extra storage read"
  - "SESS-02 normalization uses Array.isArray guards — handles null/corrupted session data gracefully"
  - "scheduleSave debounces at 30s (StorageManager implementation) — three trigger points (onCreated, onRemoved, alarm tick) but batched automatically"

patterns-established:
  - "All sidebar component modules follow IIFE + globalThis.ComponentName export pattern"
  - "fullRender() is the single render entry point — all state mutations call it after updating _state"
  - "Session state persistence: scheduleSave for debounced writes, saveState for immediate writes (RESTORE_TAB)"

requirements-completed: [UI-06, UI-08, RESTORE-01, SESS-01, SESS-02]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 2 Plan 05: RAM Indicator, Session Auto-Save, and Startup Reconciliation Summary

**RamIndicator (Stage 2 x 150MB + Stage 3/4 x 200MB) wired into sidebar header; SESS-01 scheduleSave after tab events and alarm tick; SESS-02 startup normalization of _savedState groups and savedEntries arrays**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T13:43:17Z
- **Completed:** 2026-03-01T13:48:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `sidebar/ram-indicator.js` with `computeRamMB()` (discarded x 150MB + saved/archived x 200MB), `formatRam()` (MB up to 1023MB, GB at 1024MB+, empty string at 0), and `update()` that sets `#tn-ram-indicator` textContent
- Wired `RamIndicator.update(_state.tabs, _state.savedEntries)` into `fullRender()` so the RAM badge updates on every push from background
- Added `buildSessionState()` helper to `background.js` and `background-firefox.js` gathering `savedEntries`, `groups` (from `_savedState` with `DEFAULT_GROUPS` fallback), and `timestamp`
- Added `StorageManager.scheduleSave(buildSessionState())` after `onCreated`, `onRemoved`, and the alarm tick (SESS-01) in both background files
- SESS-02 reconciliation: `initializeRegistry()` in both background files normalizes `_savedState.groups` and `_savedState.savedEntries` with `Array.isArray` guards before assignment to `globalThis._savedState`
- All 4 test suites pass with 0 regressions (22 + 30 + 25 + 33 = 110 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement sidebar/ram-indicator.js and integrate into sidebar.js** - `aeb77ca` (feat)
2. **Task 2: Wire SESS-01 auto-save triggers and SESS-02 reconciliation in background.js** - `84f7164` (feat)

## Files Created/Modified

- `sidebar/ram-indicator.js` - IIFE module: computeRamMB, formatRam, update; exported as globalThis.RamIndicator
- `sidebar/sidebar.js` - Added `RamIndicator.update(tabs, savedEntries)` call in `fullRender()`
- `sidebar/sidebar.html` - script tag for `ram-indicator.js` already present from 02-04 (confirmed)
- `background.js` - Added `buildSessionState()`, `StorageManager.scheduleSave()` in 3 event handlers, SESS-02 normalization in `initializeRegistry()`
- `background-firefox.js` - Same additions mirrored: `buildSessionState()`, `scheduleSave()` calls, SESS-02 normalization

## SESS-01 Trigger Points

`StorageManager.scheduleSave(buildSessionState())` is called after:
1. `BrowserAdapter.tabs.onCreated` listener — new tab entered registry
2. `BrowserAdapter.tabs.onRemoved` listener — tab closed
3. `BrowserAdapter.alarms.onAlarm` lifecycle tick — stage transitions may have occurred

`StorageManager.saveState()` (immediate, non-debounced) is called after:
- `RESTORE_TAB` message handler — saved entry removed, state must be persisted before new tab opens

## SESS-02 Reconciliation: _savedState After initializeRegistry()

After `initializeRegistry()` completes, `globalThis._savedState` contains:
```javascript
{
  savedEntries: SavedTabEntry[],  // from last session, or [] on fresh start
  groups: TabGroup[],             // from last session (Phase 3+ customizations preserved), or DEFAULT_GROUPS
  timestamp: number               // when state was last saved
}
```

Normalization applied:
- If `savedState.groups` is not an array → replaced with `CONSTANTS.DEFAULT_GROUPS`
- If `savedState.savedEntries` is not an array → replaced with `[]`
- If `StorageManager.loadState()` throws → `_savedState` set to `null` (fresh start)

## buildSessionState() Output Shape

```javascript
{
  savedEntries: savedState.savedEntries || [],          // current saved/archived entries
  groups: savedState.groups || CONSTANTS.DEFAULT_GROUPS, // group metadata with customizations
  timestamp: Date.now()                                  // written at save time
}
```

## Phase 2 Requirements Completed

All Phase 2 requirements are now satisfied:

| Requirement | Description | Status |
|-------------|-------------|--------|
| UI-06 | RAM savings indicator in sidebar header | Complete — RamIndicator.update() in fullRender() |
| UI-08 | Real-time footer tab count | Complete — updateFooterCount() in fullRender() (02-04) |
| RESTORE-01 | Single-tab restore from sidebar | Complete — RESTORE_TAB handler (02-02) + StorageManager.saveState() confirmed present |
| SESS-01 | Auto-save after lifecycle events | Complete — scheduleSave() after onCreated, onRemoved, alarm tick |
| SESS-02 | Startup reconciliation from saved state | Complete — initializeRegistry() loads and normalizes _savedState |

## Deviations from Plan

None — plan executed exactly as written. All SESS-02 normalization and buildSessionState() helper were already present in both background files from the prior session commit. Verification confirmed all task criteria were met.

## Issues Encountered

None. All 4 existing test suites pass without modification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 (Sidebar MVP) is complete. All 6 Phase 2 success criteria are satisfied:
1. Group cards rendering with domain-classified tab groups
2. RAM savings indicator updating in real time
3. Footer tab count (active / discarded / saved / archived)
4. Single-tab restore (RESTORE-01) end-to-end
5. Session auto-save after every lifecycle event (SESS-01)
6. Startup reconciliation preserving saved entries and group customizations (SESS-02)

Phase 3 (Tab Lifecycle) can proceed. Key dependencies for Phase 3:
- `StorageManager.saveState()` and `scheduleSave()` are ready for lifecycle-triggered saves
- `pushToSidebar(MSG_TYPES.TAB_SAVED_AND_CLOSED, ...)` stub is in place in both background files
- `_savedState.savedEntries` is the authoritative store for saved tabs; Phase 3 will mutate it on Stage 2→3 transitions

---
*Phase: 02-sidebar-mvp*
*Completed: 2026-03-01*
