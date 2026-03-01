# Requirements: TabNest

**Defined:** 2026-03-01
**Core Value:** Zero-effort tab hygiene — the browser workspace automatically stays organized, RAM-efficient, and session-persistent without the user doing anything.

---

## v1 Requirements

### Lifecycle Engine

- [ ] **LIFE-01**: System tracks all open tabs in real-time (onCreated, onUpdated, onRemoved, onActivated, onMoved events)
- [ ] **LIFE-02**: System tracks `lastActiveTimestamp` per tab and persists it every 60 seconds
- [ ] **LIFE-03**: A 30-second repeating alarm evaluates all tabs for lifecycle transitions (Stage 1→2→3→4)
- [ ] **LIFE-04**: System transitions idle tabs to Stage 2 (Discarded) via `tabs.discard()` after T1 (default 5 min)
- [ ] **LIFE-05**: System transitions idle tabs to Stage 3 (Saved & Closed) after T2 (default 15 min) — captures snapshot, closes tab
- [ ] **LIFE-06**: System transitions Stage 3 entries to Stage 4 (Archived) after T3 (default 7 days)
- [ ] **LIFE-07**: System enforces lifecycle exceptions: pinned tabs (max Stage 2), audible tabs (stay Stage 1), whitelisted domains (max Stage 2), active form input (stay Stage 1), browser-internal pages (never managed), currently active tab (always Stage 1)
- [ ] **LIFE-08**: On browsers without `tabs.discard()`, Stage 2 is skipped — T1 timer extends to T2 value and tabs move directly to Stage 3

### Auto-Grouping

- [x] **GROUP-01**: System classifies new tabs into context groups using a built-in domain dictionary (100+ domains, 10 categories: Dev, Work, Social, Shopping, Entertainment, News, Research, Finance, Lifestyle, Other)
- [x] **GROUP-02**: For unmatched domains, system scores tab title and URL path against per-category keyword sets; highest score wins (ties → Other)
- [ ] **GROUP-03**: User domain override rules take highest priority in classification chain and persist to `storage.sync`
- [ ] **GROUP-04**: User can create, rename, change color, delete, merge, and archive groups via sidebar

### Sidebar UI

- [ ] **UI-01**: Sidebar displays a unified view of all lifecycle stages (active, discarded, saved, archived) blended within group cards
- [ ] **UI-02**: Each group card shows: color bar, group name (editable on double-click), stage count badge (e.g., "3 open · 8 saved"), expand/collapse toggle
- [ ] **UI-03**: Each tab entry shows: favicon, truncated title (full on hover), domain, lifecycle stage indicator (green dot / blue dot / bookmark / clock), stateful URL ⚠️ badge, action icons
- [ ] **UI-04**: Search input filters all entries (active + saved + archived) by title, URL, and group name in real-time (< 100ms for 200 entries)
- [ ] **UI-05**: Drag-and-drop moves tab entries between groups; first drag for a domain creates a persistent user rule
- [ ] **UI-06**: RAM savings indicator in header (Stage 2 × 150MB + Stage 3/4 × 200MB), updates in real-time
- [ ] **UI-07**: Archive section (collapsible) at bottom of sidebar for Stage 4 entries
- [ ] **UI-08**: Footer shows total breakdown ("47 tabs: 5 active · 8 discarded · 27 saved · 7 archived") and "Save & Close All Inactive" button
- [ ] **UI-09**: Right-click context menu on tab entries and group headers with full action set
- [ ] **UI-10**: Group color picker: 12 preset colors + custom hex input
- [ ] **UI-11**: Sidebar renders fully in < 200ms (p95) with 200 total entries
- [ ] **UI-12**: Full keyboard navigation (Tab, Enter, Escape, Arrow keys) and ARIA labels on all interactive elements (WCAG 2.1 AA)

### Smart Restore

- [ ] **RESTORE-01**: Clicking a saved/archived link creates a new tab and removes the saved entry
- [ ] **RESTORE-02**: Hovering a saved link for 500ms+ pre-creates the tab in the background; click activates it, moving away closes the pre-created tab
- [ ] **RESTORE-03**: Workspace restore opens tabs in batches of `batchSize` (default 3) with 500ms delays between batches
- [ ] **RESTORE-04**: Lazy restore on Chromium: create tab with `{ discarded: true }` — appears in bar but loads only on click

### Session Persistence

- [ ] **SESS-01**: Full session state (groups, active tabs, saved links, archived entries, settings) auto-saves to `storage.local` every 30 seconds (debounced) and on every lifecycle/group change event
- [ ] **SESS-02**: On browser startup, system reconciles open tabs with last saved state, rebuilds groups, and restores saved links to sidebar
- [ ] **SESS-03**: User can save and restore named workspace snapshots (max 20); restore uses staggered batch restore

### Stateful URL & History

- [ ] **DATA-01**: Before Stage 3 closure, system analyzes URL for SPA hash fragments, session tokens, POST-backed pages, and known dynamic domains; sets `isStatefulUrl` flag
- [ ] **DATA-02**: Before Stage 3 closure, content script captures tab's navigation history (max 20 URLs) and stores alongside saved entry
- [ ] **DATA-03**: Content script detects unsaved form input (`dirty` state on input/textarea/select/contenteditable); reports to background worker before Stage 2/3 transition

### Settings & Shortcuts

- [ ] **CONF-01**: Settings panel with: T1/T2/T3 timer sliders, behavior toggles (auto-group, persist sessions, hover pre-render, manage pinned), whitelist domain manager, custom rule manager, batch size slider
- [ ] **CONF-02**: Keyboard shortcuts via `chrome.commands`: toggle-sidebar (Ctrl+Shift+T), save-close-current (Ctrl+Shift+S), restore-last (Ctrl+Shift+R), next/prev-group (Ctrl+Shift+]/[), save-close-all (Ctrl+Shift+X), search-tabs (Ctrl+Shift+F), discard-current (Ctrl+Shift+D)
- [ ] **CONF-03**: Export/import settings and saved tabs as JSON; clear all data option
- [ ] **CONF-04**: All settings saved to `storage.sync` immediately on change

### Cross-Browser

- [ ] **XBROWSER-01**: Chrome, Edge, Brave share identical Manifest V3 package; Firefox uses Manifest V2 package with adapter layer
- [ ] **XBROWSER-02**: `core/browser-adapter.js` abstracts all API differences (`sidePanel` vs `sidebar_action`, `chrome.*` vs `browser.*`, `tabs.discard()` availability)
- [ ] **XBROWSER-03**: Extension installs and full lifecycle functions on Chrome 114+, Edge 114+, Brave latest, Firefox 109+

---

## v2 Requirements

### AI & Cloud

- **AI-01**: ML-based tab grouping using page content/embeddings
- **AI-02**: Smart suggestions for group merging based on usage patterns

### Cloud Sync

- **CLOUD-01**: Cross-device sync of saved tabs and workspace snapshots
- **CLOUD-02**: Optional encrypted cloud backup

### Collaboration

- **COLLAB-01**: Share workspace snapshot via link
- **COLLAB-02**: Collaborative tab groups (team workspaces)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Safari extension | WebKit Xcode wrapper required, out of scope for v1.0 |
| AI/ML grouping | High complexity, planned v2.0 |
| Cloud sync | Privacy scope creep, planned v2.0 |
| External tool integrations | Notion, Slack, etc. — deferred |
| Mobile browser support | Desktop-first for v1.0 |
| Full page screenshot capture | Storage and complexity cost |
| Tab sharing / collaboration | Not core v1 value |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIFE-01 | Phase 1 | Pending |
| LIFE-02 | Phase 1 | Pending |
| LIFE-03 | Phase 1 | Pending |
| LIFE-04 | Phase 3 | Pending |
| LIFE-05 | Phase 3 | Pending |
| LIFE-06 | Phase 3 | Pending |
| LIFE-07 | Phase 1 | Pending |
| LIFE-08 | Phase 6 | Pending |
| GROUP-01 | Phase 1 | Complete |
| GROUP-02 | Phase 1 | Complete |
| GROUP-03 | Phase 3 | Pending |
| GROUP-04 | Phase 3 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 2 | Pending |
| UI-07 | Phase 3 | Pending |
| UI-08 | Phase 2 | Pending |
| UI-09 | Phase 3 | Pending |
| UI-10 | Phase 3 | Pending |
| UI-11 | Phase 2 | Pending |
| UI-12 | Phase 5 | Pending |
| RESTORE-01 | Phase 2 | Pending |
| RESTORE-02 | Phase 4 | Pending |
| RESTORE-03 | Phase 4 | Pending |
| RESTORE-04 | Phase 4 | Pending |
| SESS-01 | Phase 2 | Pending |
| SESS-02 | Phase 2 | Pending |
| SESS-03 | Phase 5 | Pending |
| DATA-01 | Phase 4 | Pending |
| DATA-02 | Phase 4 | Pending |
| DATA-03 | Phase 4 | Pending |
| CONF-01 | Phase 5 | Pending |
| CONF-02 | Phase 5 | Pending |
| CONF-03 | Phase 5 | Pending |
| CONF-04 | Phase 5 | Pending |
| XBROWSER-01 | Phase 6 | Pending |
| XBROWSER-02 | Phase 1 | Pending |
| XBROWSER-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0 ✓

**Phase distribution:**
- Phase 1 (Foundation): LIFE-01, LIFE-02, LIFE-03, LIFE-07, GROUP-01, GROUP-02, XBROWSER-02 — 7 requirements
- Phase 2 (Sidebar MVP): UI-01, UI-02, UI-03, UI-06, UI-08, UI-11, RESTORE-01, SESS-01, SESS-02 — 9 requirements
- Phase 3 (Full Lifecycle): LIFE-04, LIFE-05, LIFE-06, GROUP-03, GROUP-04, UI-04, UI-05, UI-07, UI-09, UI-10 — 10 requirements
- Phase 4 (Intelligence Layer): DATA-01, DATA-02, DATA-03, RESTORE-02, RESTORE-03, RESTORE-04 — 6 requirements
- Phase 5 (Settings, Shortcuts, and Workspaces): CONF-01, CONF-02, CONF-03, CONF-04, SESS-03, UI-12 — 6 requirements
- Phase 6 (Cross-Browser): LIFE-08, XBROWSER-01, XBROWSER-03 — 3 requirements

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 — Traceability updated after roadmap creation (6-phase structure)*
