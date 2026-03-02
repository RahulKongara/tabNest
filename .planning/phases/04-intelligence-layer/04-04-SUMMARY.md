---
phase: 04-intelligence-layer
plan: 04
status: complete
completed: "2026-03-02"
duration: ~15m
---

# Plan 04-04 Summary: Smart Restore

## What Was Built

Replaced the Phase 1 stub in `core/restore-manager.js` with the full implementation of all three smart restore strategies. Wired all three into `background.js` and `background-firefox.js`. Added hover pre-render event wiring to `sidebar/sidebar.js`. Replaced the RESTORE_WORKSPACE Phase 5 stub with the real batch restore implementation.

## Files Modified

| File | Change |
|------|--------|
| `core/restore-manager.js` | Full implementation — hoverPreRender, cancelPreRender, activatePreRendered, batchRestore, lazyRestore |
| `sidebar/message-protocol.js` | Added HOVER_PRE_RENDER, CANCEL_PRE_RENDER, ACTIVATE_PRE_RENDERED message types |
| `background.js` | importScripts + preWarmMap + HOVER_PRE_RENDER / CANCEL_PRE_RENDER / ACTIVATE_PRE_RENDERED handlers + RESTORE_WORKSPACE (real batch impl) |
| `background-firefox.js` | Same inside IIFE scope |
| `manifest-firefox.json` | Added `core/restore-manager.js` to background.scripts |
| `sidebar/sidebar.js` | wireHoverPreRender() function + call at end of fullRender() |
| `tests/restore-manager.test.js` | 20 tests covering all 5 RestoreManager functions |

## Smart Restore Strategies

**RESTORE-02: Hover Pre-Render**
- `mouseenter` on `.tn-tab-entry--saved` starts 500ms timer → sends `HOVER_PRE_RENDER` to background
- Background calls `RestoreManager.hoverPreRender()` → creates inactive tab, stores `savedId → preWarmTabId` in `preWarmMap`
- `mouseleave` clears timer and sends `CANCEL_PRE_RENDER` → `RestoreManager.cancelPreRender()` removes the tab
- `click` (capture phase) sends `ACTIVATE_PRE_RENDERED` → background activates pre-warmed tab; if not ready, falls back to `lazyRestore()`

**RESTORE-03: Staggered Batch Restore**
- `RESTORE_WORKSPACE` handler uses `RestoreManager.batchRestore(urls, batchSize, 500)`
- Opens `batchSize` tabs concurrently per batch, 500ms between batches
- `batchSize` from `settings.batchRestoreSize` (default 3)

**RESTORE-04: Lazy Restore (Chromium only)**
- `RestoreManager.lazyRestore()` creates tab with `{ discarded: true }` on Chromium
- Tab appears in tab bar but does not load until clicked (renderer not started)
- Falls back to `{ active: false }` on Firefox where `discarded: true` is not supported

## Test Results

- `node tests/restore-manager.test.js` — 20 passed, 0 failed
- `node tests/url-analyzer.test.js` — 19 passed, 0 failed
- `node tests/lifecycle-manager.test.js` — 46 passed, 0 failed
- Total: 85 tests, 0 failures, 0 regressions
