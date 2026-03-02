# TabNest Cross-Browser Smoke Test Checklist
## XBROWSER-03 Manual Acceptance Tests

Generated: 2026-03-03
Prerequisites: `bash build/build.sh && node tests/build-output.test.js` must pass before running manual tests.

---

## Browser Matrix

| Browser | Version | Manifest | Package |
|---------|---------|----------|---------|
| Chrome | 114+ | MV3 | dist/tabnest-chromium.zip |
| Edge | 114+ | MV3 | dist/tabnest-chromium.zip |
| Brave | Latest | MV3 | dist/tabnest-chromium.zip |
| Firefox | 109+ | MV2 | dist/tabnest-firefox.zip |

---

## Installation

**Chromium (Chrome/Edge/Brave):**
1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
2. Enable Developer mode
3. Click "Load unpacked" — navigate to the unzipped `tabnest-chromium/` directory
   OR drag `dist/tabnest-chromium.zip` onto the page if your browser supports zip install

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `dist/tabnest-firefox.zip` (Firefox accepts ZIP directly) or navigate to the
   unzipped directory and select `manifest.json`

---

## Test Suite A: Installation & Startup

| # | Test | Chrome | Edge | Brave | Firefox |
|---|------|--------|------|-------|---------|
| A-01 | Extension installs without errors in developer mode | [ ] | [ ] | [ ] | [ ] |
| A-02 | No errors appear in the browser console immediately after install | [ ] | [ ] | [ ] | [ ] |
| A-03 | Extension icon appears in the toolbar | [ ] | [ ] | [ ] | [ ] |
| A-04 | Clicking toolbar icon opens the TabNest sidebar | [ ] | [ ] | [ ] | [ ] |
| A-05 | Sidebar renders all currently open tabs in group cards within 200ms | [ ] | [ ] | [ ] | [ ] |
| A-06 | Background script console shows "[TabNest] Registry initialized: N tabs" | [ ] | [ ] | [ ] | [ ] |

---

## Test Suite B: Full Lifecycle Pipeline (XBROWSER-03 Core)

| # | Test | Chrome | Edge | Brave | Firefox |
|---|------|--------|------|-------|---------|
| B-01 | Open a non-pinned tab (e.g., https://example.com). Sidebar shows it in a group with green dot (Stage 1) | [ ] | [ ] | [ ] | [ ] |
| B-02 | Wait T1 minutes (default 5min, or lower T1 in settings). Tab shows blue dot (Stage 2 Discarded) on Chromium | [ ] | [ ] | [ ] | N/A (Firefox may skip to Stage 3 if canDiscard=false) |
| B-03 | Wait T2 minutes total (default 15min). Tab disappears from tab bar and appears as saved link (bookmark icon) in sidebar | [ ] | [ ] | [ ] | [ ] |
| B-04 | Wait T3 days total (or manually advance in testing). Saved link moves to Archive section (clock icon) | [ ] | [ ] | [ ] | [ ] |
| B-05 | Click a saved link in sidebar — new tab opens to that URL, saved entry removed from sidebar | [ ] | [ ] | [ ] | [ ] |

---

## Test Suite C: Stage 2 Graceful Fallback (LIFE-08, Firefox focus)

| # | Test | Notes | Firefox |
|---|------|-------|---------|
| C-01 | Open `about:debugging` → Inspect the TabNest background page → In console, run `BrowserAdapter.features.canDiscard` | Expected: `true` on Firefox 109+ (tabs.discard() is available) | [ ] |
| C-02 | To simulate no-discard: in browser console, run `BrowserAdapter.features._canDiscard = false` (if accessible) OR use a custom test build | Expected: Stage 2 skipped, tab moves directly to Stage 3 after T2 idle | [ ] |
| C-03 | Inspect lifecycle console logs — on no-discard fallback, look for log line containing "Stage 1->3 (no-discard path)" | [ ] |
| C-04 | Confirm a tab idle only between T1 and T2 (not yet T2) stays in Stage 1 when discard is unavailable | [ ] |

---

## Test Suite D: Session Persistence

| # | Test | Chrome | Edge | Brave | Firefox |
|---|------|--------|------|-------|---------|
| D-01 | Save a tab to Stage 3 (via lifecycle or right-click Save & Close). Restart browser. Sidebar repopulates saved link on startup. | [ ] | [ ] | [ ] | [ ] |
| D-02 | Create a custom group, rename it, set a color. Restart browser. Group name and color persist. | [ ] | [ ] | [ ] | [ ] |
| D-03 | Drag a tab from one group to another. Restart browser. Tab is still in the correct group. | [ ] | [ ] | [ ] | [ ] |

---

## Test Suite E: Group Management

| # | Test | Chrome | Edge | Brave | Firefox |
|---|------|--------|------|-------|---------|
| E-01 | Double-click a group name — inline editor appears; rename saves on blur/Enter | [ ] | [ ] | [ ] | [ ] |
| E-02 | Click group color swatch — color picker opens; selecting a preset color updates the group card immediately | [ ] | [ ] | [ ] | [ ] |
| E-03 | Right-click a tab entry — context menu appears with Save & Close, Move to Group, and Discard options | [ ] | [ ] | [ ] | [ ] |
| E-04 | Search input filters entries in real-time — type a URL fragment and only matching entries show | [ ] | [ ] | [ ] | [ ] |

---

## Test Suite F: Settings Panel (Phase 5 Integration)

| # | Test | Chrome | Edge | Brave | Firefox |
|---|------|--------|------|-------|---------|
| F-01 | Click gear icon — settings overlay opens with five sections (Lifecycle Timers, Behavior, Whitelist, Custom Rules, Restore) | [ ] | [ ] | [ ] | [ ] |
| F-02 | Adjust T1 slider — value persists after closing and reopening settings | [ ] | [ ] | [ ] | [ ] |
| F-03 | Add a domain to whitelist — that domain no longer auto-closes after lifecycle timer | [ ] | [ ] | [ ] | [ ] |
| F-04 | Press Escape key — settings panel closes | [ ] | [ ] | [ ] | [ ] |

---

## Test Suite G: Smart Restore (Phase 4 Integration)

| # | Test | Chrome | Edge | Brave | Firefox |
|---|------|--------|------|-------|---------|
| G-01 | Hover over a saved link for 500ms+ — tab begins loading in background (check background console for pre-render log) | [ ] | [ ] | [ ] | [ ] |
| G-02 | Click the pre-rendered saved link — existing background tab activates immediately (no reload) | [ ] | [ ] | [ ] | [ ] |
| G-03 | Move mouse away before clicking — pre-rendered tab is closed | [ ] | [ ] | [ ] | [ ] |

---

## Pass/Fail Summary

| Suite | Chrome | Edge | Brave | Firefox |
|-------|--------|------|-------|---------|
| A: Installation | /6 | /6 | /6 | /6 |
| B: Lifecycle | /5 | /5 | /5 | /4 |
| C: Fallback | N/A | N/A | N/A | /4 |
| D: Persistence | /3 | /3 | /3 | /3 |
| E: Groups | /4 | /4 | /4 | /4 |
| F: Settings | /4 | /4 | /4 | /4 |
| G: Restore | /3 | /3 | /3 | /3 |

**Definition of Done:** All tests in suites A, B, D, and E must pass on all four browsers.
Suite C must pass on Firefox. Suites F and G are P1 targets.
