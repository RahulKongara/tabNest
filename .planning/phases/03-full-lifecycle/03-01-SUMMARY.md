---
phase: 03-full-lifecycle
plan: 01
status: complete
completed: "2026-03-02"
---

# Plan 03-01 Summary: Stage 2 Discard Transition

## What Was Built

Extended `LifecycleManager.tick()` to accept a `pushCallback` parameter and push `TAB_DISCARDED` to the sidebar on successful discard. Both background files pass `pushToSidebar` as the third argument.

## Files Modified

- `core/lifecycle-manager.js` — tick() signature extended to `tick(tabRegistry, settings, pushCallback, saveAndCloseCallback)`; `_push` helper added; `TAB_DISCARDED` pushed inside discard try block
- `background.js` — alarm handler passes `pushToSidebar` as third arg to tick()
- `background-firefox.js` — same wiring inside IIFE alarm handler
- `tests/lifecycle-manager.test.js` — 4 new Stage 2 push tests added (P1–P4)

## Requirements Satisfied

- LIFE-04: Idle tabs automatically enter Stage 2; sidebar receives TAB_DISCARDED push with entry.stage='discarded'

## Key Decisions

- `pushCallback` is optional; a no-op fallback ensures backward compatibility with existing tests
- `TYPE_DISCARDED` constant resolved at runtime using MSG_TYPES if defined, else string literal — enables Node.js test execution without browser globals
- Both background files already had this implementation when Phase 3 began (pre-wired during Phase 2 planning)
