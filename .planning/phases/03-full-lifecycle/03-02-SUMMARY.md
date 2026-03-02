---
phase: 03-full-lifecycle
plan: 02
status: complete
completed: "2026-03-02"
---

# Plan 03-02 Summary: Stage 3 Save-and-Close + Stage 4 Archive

## What Was Built

Implemented the full Stage 2→3 and Stage 3→4 lifecycle transitions:
- `saveAndCloseTab()` helper creates a `SavedTabEntry`, closes the browser tab, persists to `_savedState`, and pushes `TAB_SAVED_AND_CLOSED`
- `saveAndCloseCallback` parameter added to `tick()` (4th arg) — Stage 2→3 candidates are processed through it; entry is deleted from `tabRegistry` after callback
- Stage 3→4 archive promotion loop in the alarm handler iterates `savedEntries` and promotes entries older than `t3Days` to `archived`, pushing `TAB_ARCHIVED` per entry
- `SAVE_AND_CLOSE_TAB` and `SAVE_ALL_INACTIVE` message handlers fully implemented (no stubs)
- `findGroup()` helper added to both background files

## Files Modified

- `core/lifecycle-manager.js` — 4th parameter `saveAndCloseCallback`; `_saveAndClose` no-op fallback; Stage 2→3 processing loop
- `background.js` — `saveAndCloseTab()` function; alarm handler updated to 4-arg tick(); Stage 3→4 archive loop; `findGroup()` helper
- `background-firefox.js` — identical changes inside IIFE scope
- `tests/lifecycle-manager.test.js` — 4 new Stage 2→3 save-and-close tests (S1–S4)

## Requirements Satisfied

- LIFE-05: Stage 2→3 save-and-close with snapshot, tab closure, and TAB_SAVED_AND_CLOSED push
- LIFE-06: Stage 3→4 archive promotion on T3 days threshold with TAB_ARCHIVED push
- UI-07: Archive section appears in sidebar when TAB_ARCHIVED received (handled by existing renderArchive())

## Key Decisions

- `BrowserAdapter.tabs.remove()` already existed in browser-adapter.js; no additions needed
- Stage 3→4 loop runs in background alarm handler (not lifecycle-manager) since savedEntries live on `_savedState`, not in `tabRegistry`
- Both background files were pre-wired before Phase 3 formally began
