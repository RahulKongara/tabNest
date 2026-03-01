---
phase: 02-sidebar-mvp
plan: 02
subsystem: ui
tags: [message-protocol, runtime-messaging, chrome-runtime, push-port, background-script]

# Dependency graph
requires:
  - phase: 02-01
    provides: StorageManager (getSettings, saveSettings, loadState, saveState) and globalThis._savedState wired in initializeRegistry
  - phase: 01-03
    provides: tabRegistry (Map<tabId, TabEntry>), tab event handlers (onCreated, onUpdated, onRemoved)
  - phase: 01-05
    provides: GroupingEngine.classify(), background.js importScripts pattern
provides:
  - "sidebar/message-protocol.js: MSG_TYPES object with all 32 message type string constants"
  - "background.js: onMessage handler dispatching all 23 sidebar-to-background types"
  - "background.js: runtime.onConnect push port for background-to-sidebar push messages"
  - "background.js: pushToSidebar() null-safe push utility"
  - "background-firefox.js: identical message protocol wiring inside IIFE"
  - "core/browser-adapter.js: BrowserAdapter.runtime.onConnect getter"
affects: [02-04, 02-05, 03-lifecycle-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IIFE + globalThis + module.exports dual export on message-protocol.js — browser and Node.js test compatible"
    - "runtime.onConnect port pattern for background-to-sidebar push (port name: tabnest-sidebar)"
    - "onMessage returns true for all async handlers — keeps channel open for sendResponse"
    - "handleMessage async function + .then(sendResponse) — clean async dispatch without nested callbacks"
    - "Phase-labelled stubs (Phase 3, Phase 5) in switch cases — explicit roadmap for future wiring"

key-files:
  created:
    - sidebar/message-protocol.js
  modified:
    - background.js
    - background-firefox.js
    - core/browser-adapter.js
    - manifest-firefox.json

key-decisions:
  - "MSG_TYPES values are identical to their key names (e.g., GET_FULL_STATE: 'GET_FULL_STATE') — no mapping table needed, string values are self-documenting in DevTools"
  - "pushToSidebar clears sidebarPort on catch — prevents accumulation of dead port references across sidebar reloads"
  - "handleMessage is a named async function separate from the onMessage listener — allows direct unit testing without mocking the message channel"
  - "RESTORE_TAB implemented fully in Phase 2 (RESTORE-01) — mutates globalThis._savedState.savedEntries in place and calls StorageManager.saveState for persistence"
  - "DISCARD_TAB fully wired to BrowserAdapter.tabs.discard() — Stage 2 transition available immediately"
  - "MOVE_TO_GROUP updates tabRegistry entry.groupId in memory and pushes TAB_UPDATED — no storage write needed (timestamps persist separately)"

patterns-established:
  - "Sidebar connects via chrome.runtime.connect({ name: 'tabnest-sidebar' }) — fixed port name used by all sidebar code"
  - "Response shape: { success: true, data: {...} } on success; { success: false, error: '...' } on failure"
  - "Stub pattern: { success: true, _stub: true } — allows sidebar to succeed silently while Phase 3/5 is not yet wired"

requirements-completed: [UI-01]

# Metrics
duration: 10min
completed: 2026-03-01
---

# Phase 2 Plan 02: Message Protocol and Background Handler Summary

**Full chrome.runtime message protocol — 32 MSG_TYPES constants, 23-type onMessage dispatcher with GET_FULL_STATE/RESTORE_TAB fully implemented, and runtime.connect push port for sidebar push messages**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-01T13:25:46Z
- **Completed:** 2026-03-01T13:35:02Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 created)

## Accomplishments

- Created `sidebar/message-protocol.js` with all 32 MSG_TYPES constants (23 sidebar-to-background + 9 background-to-sidebar) using IIFE + globalThis export pattern
- Wired `chrome.runtime.onConnect` push port in background.js and background-firefox.js; `pushToSidebar()` delivers push messages null-safely
- Implemented `handleMessage()` dispatcher for all 23 message types: 6 fully implemented (GET_FULL_STATE, GET_SETTINGS, SAVE_SETTINGS, RESTORE_TAB, DISCARD_TAB, MOVE_TO_GROUP), 9 Phase-3 stubs, 8 Phase-5 stubs
- Tab event handlers (onCreated, onUpdated, onRemoved) now push TAB_CREATED/TAB_UPDATED/TAB_REMOVED to the sidebar port
- Added `BrowserAdapter.runtime.onConnect` getter to browser-adapter.js
- Added message-protocol.js to background.js importScripts() and manifest-firefox.json background.scripts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sidebar/message-protocol.js with all 32 message type constants** - `534de4f` (feat)
2. **Task 2: Wire message handler and push port in background.js** - `3bbd53a` (feat)

## Files Created/Modified

- `sidebar/message-protocol.js` — All 32 MSG_TYPES constants; IIFE + globalThis + module.exports export
- `background.js` — Push port (sidebarPort, onConnect, pushToSidebar), onMessage handler with 23-type dispatch, TAB_CREATED/TAB_UPDATED/TAB_REMOVED push in event handlers
- `background-firefox.js` — Identical changes inside IIFE scope; mirrors background.js fully
- `core/browser-adapter.js` — Added `get onConnect()` getter to runtime namespace
- `manifest-firefox.json` — Added `sidebar/message-protocol.js` to background.scripts before background-firefox.js

## MSG_TYPES Constants Reference

```javascript
const MSG_TYPES = {
  // Sidebar → Background (23 types)
  GET_FULL_STATE:       'GET_FULL_STATE',   // Fully implemented
  GET_SETTINGS:         'GET_SETTINGS',     // Fully implemented
  DISCARD_TAB:          'DISCARD_TAB',      // Fully implemented
  SAVE_AND_CLOSE_TAB:   'SAVE_AND_CLOSE_TAB', // Phase 3 stub
  RESTORE_TAB:          'RESTORE_TAB',      // Fully implemented (RESTORE-01)
  SAVE_ALL_INACTIVE:    'SAVE_ALL_INACTIVE', // Phase 3 stub
  DISCARD_ALL_INACTIVE: 'DISCARD_ALL_INACTIVE', // Phase 3 stub
  MOVE_TO_GROUP:        'MOVE_TO_GROUP',    // Fully implemented
  CREATE_GROUP:         'CREATE_GROUP',     // Phase 3 stub
  RENAME_GROUP:         'RENAME_GROUP',     // Phase 3 stub
  SET_GROUP_COLOR:      'SET_GROUP_COLOR',  // Phase 3 stub
  DELETE_GROUP:         'DELETE_GROUP',     // Phase 3 stub
  MERGE_GROUPS:         'MERGE_GROUPS',     // Phase 3 stub
  ARCHIVE_GROUP:        'ARCHIVE_GROUP',    // Phase 3 stub
  SAVE_SETTINGS:        'SAVE_SETTINGS',    // Fully implemented
  RESTORE_WORKSPACE:    'RESTORE_WORKSPACE', // Phase 5 stub
  SAVE_WORKSPACE:       'SAVE_WORKSPACE',   // Phase 5 stub
  LIST_WORKSPACES:      'LIST_WORKSPACES',  // Phase 5 stub
  DELETE_WORKSPACE:     'DELETE_WORKSPACE', // Phase 5 stub
  EXPORT_DATA:          'EXPORT_DATA',      // Phase 5 stub
  IMPORT_DATA:          'IMPORT_DATA',      // Phase 5 stub
  CLEAR_DATA:           'CLEAR_DATA',       // Phase 5 stub
  OPEN_SETTINGS_PANEL:  'OPEN_SETTINGS_PANEL', // Phase 5 stub

  // Background → Sidebar (9 push types, via port.postMessage)
  TAB_CREATED:          'TAB_CREATED',
  TAB_UPDATED:          'TAB_UPDATED',
  TAB_REMOVED:          'TAB_REMOVED',
  TAB_DISCARDED:        'TAB_DISCARDED',
  TAB_SAVED_AND_CLOSED: 'TAB_SAVED_AND_CLOSED',
  TAB_ARCHIVED:         'TAB_ARCHIVED',
  TAB_RESTORED:         'TAB_RESTORED',
  GROUP_UPDATED:        'GROUP_UPDATED',
  SETTINGS_CHANGED:     'SETTINGS_CHANGED',
};
```

## GET_FULL_STATE Response Schema

```javascript
// Request: chrome.runtime.sendMessage({ type: MSG_TYPES.GET_FULL_STATE })
// Response:
{
  success: true,
  data: {
    tabs: TabEntry[],          // [...tabRegistry.values()].filter(e => !e.isInternal)
    savedEntries: SavedTabEntry[], // globalThis._savedState?.savedEntries || []
    groups: TabGroup[],        // globalThis._savedState?.groups || CONSTANTS.DEFAULT_GROUPS
    settings: Settings,        // await StorageManager.getSettings()
  }
}
// On error: { success: false, error: 'message string' }
```

## pushToSidebar() Signature and Behavior

```javascript
function pushToSidebar(type, data) {
  if (sidebarPort) {
    try {
      sidebarPort.postMessage({ type, data });
    } catch (err) {
      sidebarPort = null; // clear dead port reference on disconnect
    }
  }
  // No-op if sidebarPort is null (sidebar not connected)
}
```

- **Port name:** `'tabnest-sidebar'`
- **Sidebar connects:** `chrome.runtime.connect({ name: 'tabnest-sidebar' })`
- **Push message shape:** `{ type: MSG_TYPES.TAB_CREATED, data: { entry: TabEntry } }`
- **Null-safe:** Does not throw if sidebar is not open

## Decisions Made

- MSG_TYPES values are identical to their key names — no mapping table needed, string values are self-documenting in DevTools
- pushToSidebar clears sidebarPort on catch — prevents accumulation of dead port references across sidebar reloads
- handleMessage is a named async function separate from the onMessage listener — allows direct unit testing without mocking the message channel
- RESTORE_TAB implemented fully in Phase 2 (RESTORE-01): mutates globalThis._savedState.savedEntries in place and calls StorageManager.saveState for persistence
- DISCARD_TAB fully wired to BrowserAdapter.tabs.discard() — Stage 2 transition available immediately
- MOVE_TO_GROUP updates tabRegistry entry.groupId in memory and pushes TAB_UPDATED — no storage write needed (timestamps persist separately)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Message protocol fully defined: Plan 02-04 (sidebar controller) can use MSG_TYPES constants directly
- GET_FULL_STATE powers sidebar initial render — returns tabs, savedEntries, groups, settings in one call
- Push port established: sidebar will receive real-time tab events as soon as it connects
- Stub handlers return { success: true } so sidebar action buttons won't break before Phase 3 wiring

## Self-Check: PASSED

- FOUND: sidebar/message-protocol.js
- FOUND: background.js (with sidebarPort, pushToSidebar, onMessage handler, onConnect)
- FOUND: background-firefox.js (IIFE-scoped identical changes)
- FOUND: core/browser-adapter.js (onConnect getter added)
- FOUND: .planning/phases/02-sidebar-mvp/02-02-SUMMARY.md
- FOUND commit: 534de4f (feat(02-02): create sidebar/message-protocol.js with all 32 MSG_TYPES constants)
- FOUND commit: 3bbd53a (feat(02-02): wire message handler and push port in background.js)

---
*Phase: 02-sidebar-mvp*
*Completed: 2026-03-01*
