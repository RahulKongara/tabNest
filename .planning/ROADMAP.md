# Roadmap: TabNest

## Overview

TabNest is built in six phases that follow the natural dependency graph of a browser extension: the background engine must exist before the UI can talk to it, the UI must exist before lifecycle transitions can be surfaced, and cross-browser packaging comes last once the Chromium core is proven. Each phase delivers a coherent, verifiable capability — from a working background worker (Phase 1) through a polished, cross-browser extension ready for store submission (Phase 6). The PRD release plan (Alpha v0.1, Beta v0.5, RC v0.9, GA v1.0) maps to phases 1-2, 3, 4-5, and 6 respectively.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Extension scaffold, browser adapter, tab event tracking, activity timestamps, 30s alarm, lifecycle exception rules, and domain/keyword auto-grouping engine
- [x] **Phase 2: Sidebar MVP** - Unified sidebar rendering all lifecycle stages in group cards with RAM indicator, session auto-save, startup reconciliation, and single-tab restore (completed 2026-03-01)
- [ ] **Phase 3: Full Lifecycle** - Stage 2 discard and Stage 4 archive transitions, user group management (create/rename/color/delete/merge), drag-and-drop with domain rule persistence, context menus, and search
- [ ] **Phase 4: Intelligence Layer** - Stateful URL detection, navigation history capture, form state detection, and all three smart restore strategies (hover pre-render, staggered batch, lazy)
- [ ] **Phase 5: Settings, Shortcuts, and Workspaces** - Full settings panel, configurable keyboard shortcuts, export/import/clear data, named workspace snapshots, and WCAG 2.1 AA keyboard accessibility
- [ ] **Phase 6: Cross-Browser** - Firefox MV2 package build, Stage 2 graceful fallback on discard-unsupported browsers, and full lifecycle validation on Chrome, Edge, Brave, and Firefox

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
- [ ] 03-01-PLAN.md — Stage 2 discard transition: extend lifecycle-manager.js tick() with pushCallback, TAB_DISCARDED push, retry on failure (LIFE-04)
- [ ] 03-02-PLAN.md — Stage 3 save-and-close + Stage 4 archive: saveAndCloseTab() helper, LIFE-05 snapshot/close/push, LIFE-06 archive timer loop, TAB_ARCHIVED push, UI-07 archive section
- [ ] 03-03-PLAN.md — Group management: color-picker.js (UI-10), double-click rename, CREATE/RENAME/COLOR/DELETE/MERGE/ARCHIVE handlers, GROUP-03 domain rules in storage.sync (GROUP-04)
- [ ] 03-04-PLAN.md — Drag-and-drop + context menus: draggable tab entries, drop on group cards, domain rule persistence on first drag (UI-05), right-click context menus (UI-09)
- [ ] 03-05-PLAN.md — Search and filter: search-bar.js, real-time filter by title/URL/group name, result count, under 100ms for 200 entries (UI-04)

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
**Plans**: TBD

Plans:
- [ ] 04-01: Stateful URL detection — `url-analyzer.js` (SPA hash, session tokens, POST-backed via webNavigation, known dynamic domains), set `isStatefulUrl` flag, show ⚠️ in `tab-entry.js`
- [ ] 04-02: Navigation history capture — `content/history-capture.js` content script, `NAV_HISTORY_REPORT` message, store `navHistory[]` on SavedTabEntry, display in sidebar
- [ ] 04-03: Form state detection — `content/form-detector.js` content script, dirty-state tracking with passive listeners, `FORM_STATE_REPORT` message, lifecycle block in `lifecycle-manager.js`
- [ ] 04-04: Smart restore — `restore-manager.js` (RESTORE-02 hover pre-render with 500ms delay + cleanup, RESTORE-03 staggered batch restore, RESTORE-04 lazy restore with `discarded: true` on Chromium)

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
**Plans**: TBD

Plans:
- [ ] 05-01: Settings panel — `settings-panel.js` with all sections (lifecycle timers, behavior toggles, whitelist, custom rules, batch size), CONF-04 immediate sync write
- [ ] 05-02: Keyboard shortcuts — `chrome.commands` registration for all 8 shortcuts, settings UI for rebinding (CONF-02), background handler wiring
- [ ] 05-03: Export/import + clear data — CONF-03 JSON export/import, clear all data with confirmation, `EXPORT_DATA` / `IMPORT_DATA` message handlers
- [ ] 05-04: Workspace snapshots — `workspace-manager.js`, SESS-03 save/restore named workspaces (max 20), staggered batch restore, workspace list UI
- [ ] 05-05: Keyboard navigation + ARIA accessibility — UI-12 full keyboard nav (Tab/Enter/Escape/Arrow), ARIA labels on all interactive elements, WCAG 2.1 AA color contrast audit

### Phase 6: Cross-Browser
**Goal**: TabNest installs, runs the full lifecycle, and passes all acceptance tests on Chrome 114+, Edge 114+, Brave latest, and Firefox 109+; on browsers without `tabs.discard()` the extension degrades gracefully by skipping Stage 2 and extending the T1 timer
**Depends on**: Phase 5
**Requirements**: LIFE-08, XBROWSER-01, XBROWSER-03
**Success Criteria** (what must be TRUE):
  1. Running the build script produces two distinct packages: one Manifest V3 package (Chrome/Edge/Brave) and one Manifest V2 package (Firefox), each installing cleanly without errors in the respective browser's developer mode
  2. On Firefox 109+ (which supports `tabs.discard()`), the full four-stage lifecycle runs correctly including Stage 2 discard, with the `browser.*` API namespace working through the adapter
  3. On a simulated no-discard browser environment, Stage 2 is skipped entirely, the T1 timer adopts the T2 value, and tabs move directly from Stage 1 to Stage 3 (Saved & Closed) — verified by inspecting the lifecycle log
  4. Session persistence, group management, search, restore, and settings all function identically across Chrome, Edge, Brave, and Firefox
**Plans**: TBD

Plans:
- [ ] 06-01: Firefox MV2 package — `manifest-firefox.json`, `background-firefox.js`, `sidebar_action` vs `sidePanel` adapter wiring, `browser.*` namespace compatibility
- [ ] 06-02: Stage 2 graceful fallback — LIFE-08 no-discard detection in `browser-adapter.js`, T1 extends to T2 value, direct Stage 1→3 transition path, lifecycle log entries
- [ ] 06-03: Cross-browser acceptance testing — XBROWSER-01 identical Chromium package validation, XBROWSER-03 install + full lifecycle smoke test on all four target browsers

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete   | 2026-03-01 |
| 2. Sidebar MVP | 5/5 | Complete   | 2026-03-01 |
| 3. Full Lifecycle | 0/5 | Planned    | - |
| 4. Intelligence Layer | 0/4 | Not started | - |
| 5. Settings, Shortcuts, and Workspaces | 0/5 | Not started | - |
| 6. Cross-Browser | 0/3 | Not started | - |
