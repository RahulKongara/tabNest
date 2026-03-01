---
phase: 01-foundation
plan: 05
subsystem: grouping
tags: [grouping-engine, classification, keyword-heuristics, domain-dictionary, background-script]

# Dependency graph
requires:
  - phase: 01-02
    provides: "CONSTANTS.DOMAIN_DICT and CONSTANTS.KEYWORD_SETS used by GroupingEngine"
  - phase: 01-03
    provides: "background.js tab registry and createTabEntry() that GroupingEngine wires into"
provides:
  - "GroupingEngine.classify(url, title, userRules) — 3-step priority chain classification"
  - "GROUP-01: Exact hostname lookup via CONSTANTS.DOMAIN_DICT (www. stripped)"
  - "GROUP-02: Keyword heuristic scoring on URL path + tab title"
  - "userRulesCache pattern in background.js and background-firefox.js"
  - "onUpdated URL-change re-classification in both background files"
affects:
  - "Phase 2 sidebar — group cards will use classify()-assigned groupIds"
  - "Phase 3 lifecycle — tabs are bucketed by groupId from first creation"
  - "Phase 5 settings — must call refreshUserRulesCache() after user saves rules"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-step priority chain: user override rules → domain dict → keyword scoring → fallback"
    - "Module-level cache (userRulesCache) loaded at init to avoid async in hot event paths"
    - "IIFE + globalThis export pattern for cross-context compatibility (Node.js + browser)"
    - "Tie-breaking in keyword scoring: equal max scores across categories returns 'other'"

key-files:
  created:
    - "core/grouping-engine.js"
    - "tests/grouping-engine.test.js"
  modified:
    - "background.js"
    - "background-firefox.js"

key-decisions:
  - "userRulesCache is loaded once during initializeRegistry() and cached as a module-level variable — avoids async storage reads in the hot onCreated event path"
  - "Keyword ties (two categories with equal max score) resolve to 'other' — no arbitrary winner, user gets clear signal to set an override rule"
  - "GroupingEngine accepts rules as a parameter, not reading storage directly — clean separation of concerns; background.js owns the cache lifecycle"
  - "Re-classification on onUpdated URL change: tab navigates from github.com to amazon.com gets re-grouped automatically"
  - "TODO(Phase 5) comment left in both background files: settings panel must call refreshUserRulesCache() after saving new user rules"

patterns-established:
  - "GroupingEngine.classify(url, title, userRules): always synchronous, no async, no side effects"
  - "extractHostname() strips www. prefix before dict lookup — consistent with DOMAIN_DICT key format"
  - "Internal functions exposed as _extractHostname and _classifyByKeywords for unit testing without public API pollution"

requirements-completed: [GROUP-01, GROUP-02]

# Metrics
duration: 20min
completed: 2026-03-01
---

# Phase 1 Plan 05: GroupingEngine — Auto-Classification Summary

**3-step priority chain classifier (user overrides → 179-entry domain dict → keyword heuristics) wired into both background.js and background-firefox.js tab creation**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-01T12:00:00Z
- **Completed:** 2026-03-01T12:16:07Z
- **Tasks:** 2 completed
- **Files modified:** 4 (core/grouping-engine.js, tests/grouping-engine.test.js, background.js, background-firefox.js)

## Accomplishments

- GroupingEngine.classify() implements full 3-step priority chain: user override rules (exact domain match) → DOMAIN_DICT lookup → KEYWORD_SETS heuristic scoring → fallback 'other'
- 33/33 unit tests pass covering all classification paths, tie-breaking, edge cases, and performance
- 100 classifications complete in under 1ms (target: 50ms per SRS §4.1) — 50x faster than requirement
- background.js createTabEntry() and onUpdated handler both use GroupingEngine.classify() with cached user rules
- background-firefox.js mirrors all background.js changes: refreshUserRulesCache(), createTabEntry() wiring, onUpdated URL re-classification

## Classification Accuracy Notes

All 10 end-to-end domain tests pass without issue. The domain dictionary covers 179 known domains with no ambiguous entries. Notable cases:

- `github.com` → 'dev' (domain dict exact match, www. stripped correctly)
- `mail.google.com` → 'work' (subdomain preserved in dict key)
- `unknown-ci.com/api/deploy/pipeline` + 'Deploy Pipeline Dashboard' → 'dev' (3 keyword hits: api, deploy, pipeline)
- `random-store.com/cart/checkout` + 'Shopping Cart - Checkout' → 'shopping' (2 keyword hits: cart, checkout)
- `totally-unknown.xyz` + 'Random Page' → 'other' (no keyword matches, correct fallback)
- `chrome://newtab/` → 'other' (URL(chrome://newtab/) returns hostname 'newtab', not in dict, no keyword signal)

The tie-breaking case works correctly: 'analysis' appears in both 'research' and 'news' keyword sets, so a URL containing only that word scores 1 for both categories and resolves to 'other'.

## Performance Measurement

100 classifications (all against known domain `github.com`) averaged 0.2ms across 5 trials (0ms-1ms range). The URL(url).hostname extraction is the main cost but Node.js's URL parser is well-optimized. Real-world mixed URLs (some in dict, some keyword-scored) would be similar.

## userRulesCache Refresh Strategy

The `userRulesCache` array is loaded once during `initializeRegistry()` via `refreshUserRulesCache()`. This means:
- On extension install/startup: rules loaded from storage.sync immediately
- During normal operation: cache stays in memory (no repeated storage reads)
- On settings change: Phase 5 settings panel MUST call `refreshUserRulesCache()` after saving rules

Both background.js and background-firefox.js have `TODO(Phase 5)` comments marking this requirement. The `refreshUserRulesCache()` function is exported in Node.js test context for direct testing.

## GroupingEngine globalThis Accessibility

`GroupingEngine` is attached to `globalThis` at module end, making it available to:
- `background.js` — uses it via `GroupingEngine.classify()`
- Future sidebar.js — can call classify() for display hints
- Node.js unit tests — `global.GroupingEngine` after `require('./core/grouping-engine.js')`

The dual export pattern (`module.exports` + `globalThis`) established in 01-01 is consistent here.

## Task Commits

1. **Task 1: Implement core/grouping-engine.js** — `235bf27` (test: failing tests), `4a6b8d6` (feat: full implementation)
2. **Task 2: Wire GroupingEngine into background.js and background-firefox.js** — `3b994cc` (feat: wiring both files)

## Files Created/Modified

- `core/grouping-engine.js` — Full GroupingEngine with classify(), extractHostname(), classifyByKeywords()
- `tests/grouping-engine.test.js` — 33 tests covering all 3 classification steps, tie-breaking, edge cases, performance
- `background.js` — createTabEntry() uses GroupingEngine.classify(); onUpdated re-classifies on URL change; refreshUserRulesCache() added; userRulesCache module-level variable
- `background-firefox.js` — Same changes mirrored: createTabEntry() GroupingEngine wiring, refreshUserRulesCache(), onUpdated URL re-classification

## Decisions Made

- **userRulesCache pattern:** Loaded at init, cached in module-level variable. Avoids async storage reads in the hot onCreated/onUpdated event paths. Phase 5 must invalidate on settings save.
- **Keyword tie-breaking → 'other':** When two categories score the same maximum, 'other' is returned rather than an arbitrary winner. This gives users a clear signal that auto-classification is uncertain and encourages manual override rule creation.
- **Parameter-based rules:** GroupingEngine receives rules as a parameter, never reads storage. Background owns the cache; engine stays pure and synchronous.
- **Re-classify on URL change:** onUpdated handler re-runs classify() when changeInfo.url is set. This handles navigations within a tab (e.g., github.com → amazon.com) without requiring tab close/create.

## Deviations from Plan

None — plan executed exactly as written. The GroupingEngine implementation was already partially done from a prior session (235bf27, 4a6b8d6), and background-firefox.js placeholder was updated as planned.

## Issues Encountered

None. All tests passed on first run. background-firefox.js still had the 'other' placeholder groupId from plan 01-03 and required the Task 2 wiring — this was the primary work of this execution.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- GroupingEngine.classify() is the canonical classification API for all future phases
- Phase 2 (sidebar) can display tabs pre-grouped by classify()-assigned groupIds
- Phase 3 (lifecycle) can apply group-specific lifecycle rules (whitelist by groupId)
- Phase 5 (settings) must call refreshUserRulesCache() in background.js and background-firefox.js after saving user override rules — TODO comments mark both locations

---
*Phase: 01-foundation*
*Completed: 2026-03-01*

## Self-Check: PASSED

- core/grouping-engine.js: FOUND
- tests/grouping-engine.test.js: FOUND
- background.js: FOUND
- background-firefox.js: FOUND
- .planning/phases/01-foundation/01-05-SUMMARY.md: FOUND
- Commit 235bf27 (test: failing tests): FOUND
- Commit 4a6b8d6 (feat: GroupingEngine): FOUND
- Commit 3b994cc (feat: background wiring): FOUND
