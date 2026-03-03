# Roadmap: TabNest

## Overview

TabNest is built in seven phases that follow the natural dependency graph of a browser extension: the background engine must exist before the UI can talk to it, the UI must exist before lifecycle transitions can be surfaced, cross-browser packaging comes after all features are proven, and GA polish + store submission is the final gate. Each phase delivers a coherent, verifiable capability — from a working background worker (Phase 1) through a polished, store-submitted extension at GA v1.0 (Phase 7). The PRD release plan (Alpha v0.1, Beta v0.5, RC v0.9, GA v1.0) maps to phases 1-2, 3, 4-5, 6, and 7 respectively.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Extension scaffold, browser adapter, tab event tracking, activity timestamps, 30s alarm, lifecycle exception rules, and domain/keyword auto-grouping engine
- [x] **Phase 2: Sidebar MVP** - Unified sidebar rendering all lifecycle stages in group cards with RAM indicator, session auto-save, startup reconciliation, and single-tab restore (completed 2026-03-01)
- [x] **Phase 3: Full Lifecycle** - Stage 2 discard and Stage 4 archive transitions, user group management (create/rename/color/delete/merge), drag-and-drop with domain rule persistence, context menus, and search (completed 2026-03-02)
- [x] **Phase 4: Intelligence Layer** - Stateful URL detection, navigation history capture, form state detection, and all three smart restore strategies (hover pre-render, staggered batch, lazy) (completed 2026-03-02)
- [ ] **Phase 5: Settings, Shortcuts, and Workspaces** - Full settings panel, configurable keyboard shortcuts, export/import/clear data, named workspace snapshots, and WCAG 2.1 AA keyboard accessibility
- [ ] **Phase 6: Cross-Browser** - Firefox MV2 package build, Stage 2 graceful fallback on discard-unsupported browsers, and full lifecycle validation on Chrome, Edge, Brave, and Firefox
- [ ] **Phase 7: GA Polish and Store Submission** - Performance audit and optimization against all SRS §4.1 NFR targets, error handling hardening, empty/loading states, QUOTA_EXCEEDED resilience, and Chrome Web Store submission asset package (listing copy, screenshots spec, privacy policy, manifest validation)

## Phase Details

### Phase 1: Foundation
**Goal**: The background engine is live — it tracks every tab event, maintains accurate activity timestamps, fires the 30-second lifecycle alarm, enforces all exception rules, and auto-classifies every new tab into the correct context group using domain lookup and keyword scoring
**Depends on**: Nothing (first phase)
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-07, GROUP-01, GROUP-02, XBROWSER-02
**Success Criteria** (what must be TRUE):
  1. Opening a new tab causes the background worker to register it in its in-memory registry within one alarm tick (30 seconds), classified into the correct context group (Dev, Work, Social, etc.) based on the URL domain
  2. Switching to a different tab updates that tab's `lastActiveTimestamp` in the background registry; the idle tab's timestamp is not updated
  3. A 30-second repeating alarm fires continuously and evaluates every tracked tab against the lifecycle timer thresholds without crashing or memory leaks
  4. Pinned tabs, audible tabs, the currently active tab, and browser-internal pages (`chrome://`, `about:`) are flagged as exempt and will not be advanced by the lifecycle engine
  5. The browser adapter abstraction is in place: all browser API calls go through `core/browser-adapter.js`, with no raw `chrome.*` calls scattered across other modules
**Plans**: 5 plans

Plans:
- [x] 01-01: Project scaffold — manifests (MV3 + MV2), file structure, build script skeleton, icons
- [x] 01-02: Browser adapter + core constants — `browser-adapter.js`, `constants.js` (domain dictionary, keyword sets, default settings)
- [x] 01-03: Tab tracking + activity timestamps — `background.js` event listeners (onCreated, onUpdated, onRemoved, onActivated, onMoved), `lastActiveTimestamp` persistence every 60s
- [x] 01-04: Lifecycle alarm + exception rules — `lifecycle-manager.js` with 30s alarm, exception enforcement (pinned, audible, active, whitelisted, internal)
- [x] 01-05: Grouping engine — `grouping-engine.js` domain dictionary lookup, keyword heuristic scoring, "Other" fallback

### Phase 2: Sidebar MVP
**Goal**: Users can open the sidebar and see all their tabs organized into context group cards, with lifecycle stage indicators, a RAM savings estimate, and a footer count — and the sidebar survives a browser restart with saved links intact
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03, UI-06, UI-08, UI-11, RESTORE-01, SESS-01, SESS-02
**Success Criteria** (what must be TRUE):
  1. Opening the sidebar shows all open tabs organized into color-coded group cards; each tab entry displays its favicon, truncated title, domain, and a lifecycle stage indicator (green dot, blue dot, bookmark, or clock)
  2. The sidebar header displays an estimated RAM savings figure (Stage 2 count x 150MB + Stage 3/4 count x 200MB) that updates when tabs change state
  3. The footer shows a count breakdown ("47 tabs: 5 active · 8 discarded · 27 saved · 7 archived") and a "Save & Close All Inactive" button
  4. Clicking a saved link in the sidebar opens a new tab to that URL and removes the saved entry from the sidebar
  5. After a browser restart, the sidebar repopulates saved links and group structure from the last saved state within the first alarm tick
  6. The sidebar renders fully in under 200ms with 200 total entries (p95)
**Plans**: 5 plans

Plans:
- [x] 02-01-PLAN.md — StorageManager: read/write to sync + local, 30s debounced autosave, schema definitions, SESS-01/SESS-02
- [ ] 02-02-PLAN.md — Message protocol: 32 message type constants, chrome.runtime.onMessage handler, push port for real-time sidebar updates
- [x] 02-03-PLAN.md — Sidebar HTML/CSS: sidebar.html semantic structure, sidebar.css responsive layout (300–500px), group card and tab entry component styles
- [ ] 02-04-PLAN.md — Sidebar controller + components: sidebar.js controller, group-card.js, tab-entry.js, DocumentFragment rendering, push message handling
- [ ] 02-05-PLAN.md — RAM indicator + footer + restore: ram-indicator.js (UI-06), footer count (UI-08), RESTORE-01 restore flow, SESS-01 scheduleSave triggers, SESS-02 startup reconciliation

### Phase 3: Full Lifecycle
**Goal**: All four lifecycle stages function end-to-end — idle tabs are automatically discarded (Stage 2) then saved and closed (Stage 3), long-idle saved links move to the archive (Stage 4), and users can fully manage groups and reassign tabs via drag-and-drop and context menus
**Depends on**: Phase 2
**Requirements**: LIFE-04, LIFE-05, LIFE-06, GROUP-03, GROUP-04, UI-04, UI-05, UI-07, UI-09, UI-10
**Success Criteria** (what must be TRUE):
  1. An idle tab (not pinned, not audible, not active, not whitelisted) is automatically discarded via `tabs.discard()` after T1 (default 5 minutes) and a blue dot appears next to it in the sidebar within the next alarm tick
  2. After T2 (default 15 minutes) of inactivity, the discarded tab disappears from the tab bar and reappears as a saved link (bookmark icon) in its group card in the sidebar
  3. A saved link that has been in Stage 3 for more than T3 (default 7 days) moves into the collapsible Archive section at the bottom of the sidebar
  4. User can double-click a group name to rename it, open a color picker to change its color (12 presets + custom hex), and right-click to access merge, delete, and archive group actions
  5. Dragging a tab entry from one group and dropping it into another moves the entry persistently, and creates a domain-level user override rule that applies to future tabs from that domain
  6. The search input filters all entries (active, saved, archived) by title, URL, and group name in real-time, completing within 100ms for 200 entries
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md — Stage 2 discard transition: extend lifecycle-manager.js tick() with pushCallback, TAB_DISCARDED push, retry on failure (LIFE-04)
- [x] 03-02-PLAN.md — Stage 3 save-and-close + Stage 4 archive: saveAndCloseTab() helper, LIFE-05 snapshot/close/push, LIFE-06 archive timer loop, TAB_ARCHIVED push, UI-07 archive section
- [x] 03-03-PLAN.md — Group management: color-picker.js (UI-10), double-click rename, CREATE/RENAME/COLOR/DELETE/MERGE/ARCHIVE handlers, GROUP-03 domain rules in storage.sync (GROUP-04)
- [x] 03-04-PLAN.md — Drag-and-drop + context menus: draggable tab entries, drop on group cards, domain rule persistence on first drag (UI-05), right-click context menus (UI-09)
- [x] 03-05-PLAN.md — Search and filter: search-bar.js, real-time filter by title/URL/group name, result count, under 100ms for 200 entries (UI-04)

### Phase 4: Intelligence Layer
**Goal**: The extension detects when a URL may lose state on restore and warns the user, captures each tab's navigation history before closing it, blocks lifecycle transitions for tabs with unsaved form data, and pre-warms tabs so restore feels instant
**Depends on**: Phase 3
**Requirements**: DATA-01, DATA-02, DATA-03, RESTORE-02, RESTORE-03, RESTORE-04
**Success Criteria** (what must be TRUE):
  1. A saved link whose URL contains a SPA hash fragment, session token query parameter, or POST-backed navigation shows a ⚠️ warning icon in the sidebar entry
  2. After restoring a saved link, the sidebar entry's detail view (tooltip or expandable section) shows the navigation history captured before that tab was closed (up to 20 URLs)
  3. A tab with a dirty form field (any modified `input`, `textarea`, `select`, or `contenteditable`) does not get discarded or saved-and-closed — the lifecycle timer is blocked until the form is submitted or navigated away
  4. Hovering over a saved link in the sidebar for 500ms+ causes the tab to begin loading in the background; clicking it activates that pre-loaded tab immediately without a fresh page load
  5. Restoring a workspace opens tabs in configurable batches (default 3) with 500ms delays between batches, avoiding a RAM spike and keeping the browser responsive
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Stateful URL detection: `url-analyzer.js` (SPA hash, session tokens, POST-backed via webNavigation, known dynamic domains), set `isStatefulUrl` flag, show ⚠️ in `tab-entry.js` (Wave 1)
- [x] 04-02-PLAN.md — Navigation history capture: `content/history-capture.js` content script, `CAPTURE_NAV_HISTORY` request + `NAV_HISTORY_REPORT` push, store `navigationHistory[]` on SavedTabEntry, collapsible history section in sidebar (Wave 1)
- [x] 04-03-PLAN.md — Form state detection: `content/form-detector.js` content script, dirty-state tracking with passive listeners, `FORM_STATE_REPORT` message, lifecycle block in `lifecycle-manager.js` (Wave 1)
- [x] 04-04-PLAN.md — Smart restore: `restore-manager.js` (RESTORE-02 hover pre-render 500ms + cleanup, RESTORE-03 staggered batch restore, RESTORE-04 lazy restore `discarded:true` Chromium), sidebar hover wiring, RESTORE_WORKSPACE handler (Wave 2)

### Phase 5: Settings, Shortcuts, and Workspaces
**Goal**: Users can configure every aspect of TabNest's behavior through a settings panel, trigger core actions via keyboard shortcuts, export and import their data, save named workspace snapshots for recurring sessions, and navigate the entire sidebar with keyboard and screen reader support
**Depends on**: Phase 4
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, SESS-03, UI-12
**Success Criteria** (what must be TRUE):
  1. Opening the settings panel (gear icon) exposes sliders for T1/T2/T3 timers, behavior toggles (auto-group, persist sessions, hover pre-render, manage pinned), a whitelist domain manager, custom rule manager, and batch size slider; changes save to `storage.sync` immediately
  2. Pressing `Ctrl+Shift+S` saves and closes the currently active tab; pressing `Ctrl+Shift+T` toggles the sidebar; all 8 default shortcuts work and can be remapped via settings
  3. Clicking "Export" in settings downloads a JSON file containing all settings and saved tabs; importing a valid JSON file restores that state; "Clear All Data" wipes storage after confirmation
  4. User can save the current session as a named workspace (e.g., "Monday Morning"), see it listed in the Workspaces section, and restore it with one click — opening tabs in staggered batches and recreating groups
  5. Every interactive element in the sidebar is reachable by Tab key, activatable by Enter, dismissable by Escape, and announces its purpose and state to a screen reader via ARIA labels (WCAG 2.1 AA)
**Plans**: 5 plans (defined 2026-03-02)

Plans:
- [ ] 05-01-PLAN.md — Settings panel: `settings-panel.js` IIFE with all five sections (Lifecycle Timers, Behavior, Whitelist, Custom Rules, Restore), CONF-04 immediate sync write, SAVE_SETTINGS background handler upgraded from stub (Wave 1)
- [ ] 05-02-PLAN.md — Keyboard shortcuts: `chrome.commands` in both manifests, `onCommand` dispatcher in background.js for all 8 shortcuts, `_buildShortcutsSection()` with Record UI, FOCUS_SEARCH/FOCUS_NEXT_GROUP/FOCUS_PREV_GROUP push types (Wave 2, depends 05-01)
- [ ] 05-03-PLAN.md — Export/import + clear data: StorageManager exportData/importData/clearAllData, EXPORT_DATA/IMPORT_DATA/CLEAR_DATA handlers upgraded from stubs, `_buildDataSection()` with file picker and inline confirmation (Wave 2, depends 05-01)
- [ ] 05-04-PLAN.md — Workspace snapshots: StorageManager saveWorkspace/loadWorkspaces/deleteWorkspace, `sidebar/components/workspace-manager.js` component, SAVE_WORKSPACE/RESTORE_WORKSPACE/DELETE_WORKSPACE/LIST_WORKSPACES handlers, WORKSPACE_SAVED/DELETED push types, max 20 enforced (Wave 2, depends 05-01, 05-03)
- [ ] 05-05-PLAN.md — Keyboard navigation + ARIA: `.tn-sr-only` utility, `:focus-visible` rings, Arrow key roving tabindex, Escape with focus restoration, WCAG 2.1 AA contrast corrections, role=group/listitem/search, aria-expanded, title-referencing aria-labels (Wave 3, depends 05-01 through 05-04)

### Phase 6: Cross-Browser
**Goal**: TabNest installs, runs the full lifecycle, and passes all acceptance tests on Chrome 114+, Edge 114+, Brave latest, and Firefox 109+; on browsers without `tabs.discard()` the extension degrades gracefully by skipping Stage 2 and extending the T1 timer
**Depends on**: Phase 5
**Requirements**: LIFE-08, XBROWSER-01, XBROWSER-03
**Success Criteria** (what must be TRUE):
  1. Running the build script produces two distinct packages: one Manifest V3 package (Chrome/Edge/Brave) and one Manifest V2 package (Firefox), each installing cleanly without errors in the respective browser's developer mode
  2. On Firefox 109+ (which supports `tabs.discard()`), the full four-stage lifecycle runs correctly including Stage 2 discard, with the `browser.*` API namespace working through the adapter
  3. On a simulated no-discard browser environment, Stage 2 is skipped entirely, the T1 timer adopts the T2 value, and tabs move directly from Stage 1 to Stage 3 (Saved & Closed) — verified by inspecting the lifecycle log
  4. Session persistence, group management, search, restore, and settings all function identically across Chrome, Edge, Brave, and Firefox
**Plans**: 3 plans (defined 2026-03-02)

Plans:
- [ ] 06-01-PLAN.md — Build script packaging + Firefox file audit: `build.sh` full implementation producing `dist/tabnest-chromium.zip` (MV3) and `dist/tabnest-firefox.zip` (MV2); `BrowserAdapter.tabs.sendMessage` added; `background-firefox.js` fixed (webNavigation via adapter, sendMessage via adapter, FORM_STATE_REPORT handler); `manifest-firefox.json` scripts array synced with `importScripts()`; `tests/cross-browser.test.js` created (Wave 1)
- [ ] 06-02-PLAN.md — Stage 2 graceful fallback: LIFE-08 no-discard path in `lifecycle-manager.js` tick() — when `canDiscard=false`, tabs idle beyond T2 move directly Stage 1→3 via `_saveAndClose`; tabs idle only T1→T2 stay Stage 1; exemption check applied; structured log entry emitted; 5 new tests in `tests/lifecycle-manager.test.js` (Wave 1)
- [ ] 06-03-PLAN.md — Cross-browser acceptance testing: `tests/build-output.test.js` validates both ZIP structures and manifest schemas; `tests/cross-browser.test.js` extended with Phase 4/5 parity checks; `tests/SMOKE-TEST-CHECKLIST.md` manual browser verification checklist for all four target browsers (Wave 2, depends 06-01, 06-02)

### Phase 7: GA Polish and Store Submission
**Goal**: TabNest v1.0 is release-ready — all SRS §4.1 performance targets are measured and confirmed, every error path in the background message handler returns a structured response, the sidebar handles empty and loading states gracefully, storage quota errors are handled by pruning and retrying, and the Chrome Web Store submission package (listing copy, screenshots spec, privacy policy, validated manifests) is ready for upload
**Depends on**: Phase 6
**Requirements**: NFR-01, NFR-02, NFR-09, NFR-10, NFR-11, NFR-13, NFR-14, NFR-15, NFR-16, NFR-17, NFR-18, NFR-24, NFR-25, NFR-26, NFR-28, NFR-35, NFR-37, NFR-38
**Success Criteria** (what must be TRUE):
  1. `node tests/performance.test.js` exits 0 — all four benchmarks (sidebar render, tab classification, storage write, lifecycle tick) report averages below their SRS §4.1 thresholds across 10 iterations each
  2. `node tests/manifest-validation.test.js` exits 0 — both `manifest.json` (MV3) and `manifest-firefox.json` (MV2) pass all required-field, permission-minimality, CSP format, icon existence, and description-length assertions
  3. The sidebar shows a loading overlay during the initial GET_FULL_STATE request and an empty state when there are no tabs — neither state is blank or broken
  4. `StorageManager.saveState()` handles a `QUOTA_EXCEEDED` error by pruning the oldest archived entries and retrying — the extension never crashes or becomes unresponsive due to a storage quota error (NFR-14, NFR-16)
  5. Every `handleMessage()` case in `background.js` and `background-firefox.js` returns `{ success: false, error: string }` on failure — no uncaught exceptions propagate to the runtime messaging layer (NFR-13, NFR-17)
  6. `store/STORE-LISTING.md`, `store/SCREENSHOTS-SPEC.md`, and `store/PRIVACY-POLICY.md` all exist and are complete — the listing has a description <= 132 chars; the screenshots spec defines 5 entries at 1280x800; the privacy policy covers zero data collection, local storage disclosure, and all permission justifications
**Plans**: 3 plans (defined 2026-03-03)

Plans:
- [ ] 07-01-PLAN.md — Performance audit and optimization: `tests/performance.test.js` benchmarks (NFR-01/02/10/11); `fullRender()` optimized with collapsed-group skipping and `replaceChildren()`; `saveState()` dirty-flag diff guard; `tick()` Array.from snapshot; sidebar.css layout containment hints (Wave 1)
- [ ] 07-02-PLAN.md — Polish pass: loading overlay + empty state in sidebar.js; Untitled/URL title fallback in tab-entry.js; NaN-proof count badge in group-card.js; QUOTA_EXCEEDED prune+retry in storage-manager.js; try/catch error responses in all handleMessage() cases; `tests/polish.test.js` (Wave 1)
- [ ] 07-03-PLAN.md — Store submission assets: `store/STORE-LISTING.md` (full CWS listing copy); `store/SCREENSHOTS-SPEC.md` (5-screenshot brief); `store/PRIVACY-POLICY.md` (9-section all-local policy); `tests/manifest-validation.test.js` (32+ assertions on both manifests) (Wave 2, depends 07-01, 07-02)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete   | 2026-03-01 |
| 2. Sidebar MVP | 5/5 | Complete   | 2026-03-01 |
| 3. Full Lifecycle | 5/5 | Complete   | 2026-03-02 |
| 4. Intelligence Layer | 4/4 | Complete    | 2026-03-02 |
| 5. Settings, Shortcuts, and Workspaces | 0/5 | Planned (2026-03-02) | - |
| 6. Cross-Browser | 0/3 | Planned (2026-03-02) | - |
| 7. GA Polish and Store Submission | 0/3 | Planned (2026-03-03) | - |
