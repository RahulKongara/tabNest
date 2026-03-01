# Product Requirements Document — TabNest: Smart Tab Groups

**Version 1.0 | March 2026 | Cross-Browser Tab Management Extension**
**Architecture: Hybrid Lifecycle Pipeline**

---

## 1. Executive Summary

TabNest is a cross-browser extension that intelligently groups open browser tabs into color-coded context clusters and manages them through an automatic four-stage lifecycle pipeline: Active → Discarded → Saved & Closed → Archived. This graduated approach maximizes RAM savings and eliminates tab bar clutter while preserving page state for recently used tabs — something no existing tool or browser-native feature achieves.

The core value proposition: visual clarity through automatic context grouping, maximum RAM savings through graduated tab lifecycle management, zero tab bar clutter through intelligent close-and-save, and session continuity through persistent storage — all surfaced in a unified sidebar that blends live tabs and saved links seamlessly.

---

## 2. Problem Statement

Modern browser usage patterns lead to three compounding problems:

- **Tab overload:** Users accumulate dozens of tabs with no organizational structure, making it difficult to find or switch between contexts.
- **Memory exhaustion:** Each active tab consumes 50–300 MB of RAM. With 40+ tabs open, browsers can consume 4–12 GB of memory, degrading overall system performance.
- **Session loss:** Accidental browser closures, crashes, or updates destroy the user's working context with no easy way to recover.

### Why Existing Solutions Fall Short

- **Browser-native tab groups (Chrome, Edge):** Visual organization only. No RAM savings. No clutter reduction. Every tab stays fully loaded.
- **Chrome Memory Saver / Tab Discard:** Discards inactive tabs to free RAM, but tabs remain in the tab bar. No organization, no grouping, no sidebar overview.
- **OneTab:** Manually saves all tabs into a flat chronological link dump. No auto-grouping, no awareness of open tabs, no graduated lifecycle, no sidebar. A filing cabinet, not a workspace manager.
- **The Great Suspender (discontinued):** Replaced tabs with placeholder pages. No grouping, no close-and-save, no sidebar. Removed from Chrome Web Store over security concerns — trust vacuum in this space.

**TabNest is the first tool to combine automatic context intelligence, graduated lifecycle management, and a unified sidebar that blends live and saved tabs.** No existing solution does all three.

---

## 3. Product Vision

**For** power users, developers, researchers, and knowledge workers who struggle with browser tab chaos,

**TabNest** is a cross-browser extension that automatically organizes tabs into intelligent, color-coded groups and manages them through a smart lifecycle — discarding recently inactive tabs to preserve state, then closing and saving long-idle tabs to fully free RAM and declutter the tab bar.

**Unlike** manual tab managers (OneTab), simple suspenders (The Great Suspender), or browser-native features (Chrome tab groups, Memory Saver) that each solve only one piece of the problem,

**TabNest** unifies auto-detection, graduated lifecycle management, and a persistent sidebar into one seamless experience where the user never has to organize, close, or remember anything.

---

## 4. Target Browsers & Compatibility

| Browser | Engine | Manifest | Sidebar API | Discard API | Priority |
|---------|--------|----------|-------------|-------------|----------|
| Chrome | Chromium / Blink | V3 | sidePanel API | `tabs.discard()` ✅ | P0 — Primary |
| Edge | Chromium / Blink | V3 | sidePanel API | `tabs.discard()` ✅ | P0 — Primary |
| Brave | Chromium / Blink | V3 | sidePanel API | `tabs.discard()` ✅ | P0 — Primary |
| Opera | Chromium / Blink | V3 | sidebar_action (limited) | `tabs.discard()` ✅ | P1 — Secondary |
| Firefox | Gecko | V2 (with V3 compat) | sidebar_action | `tabs.discard()` ✅ | P1 — Secondary |
| Safari | WebKit | Xcode wrapper required | Native sidebar | No API | P2 — Future |

A shared core codebase with browser-specific adapter layers will be used. Safari is out of scope for v1.0. On browsers without `tabs.discard()` support, Stage 2 is skipped and tabs move directly from Active to Saved & Closed with an extended timer.

---

## 5. User Personas

### 5.1 "Research Rachel" — Academic Researcher
- Opens 30–60 tabs per research session across Google Scholar, PDFs, Wikipedia, and journal sites.
- Needs to maintain separate research threads (e.g., Literature Review, Methodology, Data Sources).
- Frequently closes browser and expects to resume exactly where she left off.
- **Hybrid benefit:** Recently opened papers stay discarded (fast restore), while last week's research threads are saved as organized links in the sidebar.

### 5.2 "Dev Darren" — Full-Stack Developer
- Has 20–40 tabs open: GitHub repos, Stack Overflow, documentation, Jira, Slack.
- Wants dev-related tabs grouped separately from personal browsing.
- RAM usage is critical since IDE and Docker are already consuming significant memory.
- **Hybrid benefit:** Slack and Jira stay whitelisted (always discarded, never closed to preserve sessions). Old Stack Overflow tabs get saved and closed automatically.

### 5.3 "Multitask Maya" — Digital Marketing Manager
- Juggles social media dashboards, analytics tools, content calendars, and research.
- Needs quick visual identification of which tabs belong to which campaign or client.
- Values the ability to "park" a set of tabs and restore them for recurring weekly tasks.
- **Hybrid benefit:** Saves her "Campaign Q2" workspace as a named session. Restores 12 tabs with one click on Monday mornings.

---

## 6. Core Architecture: The Hybrid Lifecycle Pipeline

This is the heart of TabNest. Every open tab automatically progresses through four stages based on inactivity duration. The user never needs to manually manage this — it just happens.

### 6.1 Stage 1 — Active (0 to T1 minutes inactive)

- **Default T1:** 5 minutes (configurable: 1–30 min)
- **What happens:** Tab is fully loaded, normal browsing. TabNest's only job is classifying it into the correct context group and reflecting that in the sidebar.
- **RAM impact:** None — standard browser behavior.
- **User experience:** No visible change. The tab just appears in the right group in the sidebar.

### 6.2 Stage 2 — Discarded (T1 to T2 minutes inactive)

- **Default T2:** 15 minutes (configurable: 5–60 min)
- **What happens:** The browser's native `tabs.discard()` API unloads the tab's renderer process. The tab stays in the tab bar with its favicon, title, and position intact. Page state, scroll position, form data, and login sessions are preserved by the browser.
- **RAM impact:** Significant — renderer process freed. Tab consumes near-zero memory.
- **User experience:** Tab looks identical in the tab bar. Clicking it restores almost instantly. In the sidebar, a subtle "discarded" indicator (dimmed icon) shows the tab's state.
- **Fallback:** On browsers without `tabs.discard()`, this stage is skipped. The T1 timer threshold is extended to T2, and tabs move directly to Stage 3.

### 6.3 Stage 3 — Saved & Closed (T2+ minutes inactive)

- **What happens:** TabNest captures a full snapshot of the tab (URL, title, favicon, group assignment, navigation history, timestamp), stores it in the sidebar, and **closes the real browser tab**. The tab disappears from the tab bar entirely but lives on as a clickable entry in its context group within the sidebar.
- **RAM impact:** Maximum — zero memory usage. Zero tab bar clutter.
- **User experience:** The tab vanishes from the tab bar but appears in the sidebar with a "saved" indicator (bookmark icon). One click opens a fresh tab to that URL.
- **What's preserved:** URL, title, favicon, group membership, navigation history stack, timestamp.
- **What's lost:** Scroll position, form data, login sessions (mitigated by the fact that 15+ minutes have passed).

### 6.4 Stage 4 — Archived (user-triggered or 7+ days saved)

- **What happens:** Saved links that haven't been restored for 7+ days (configurable) are moved to a collapsible "Archive" section at the bottom of the sidebar. Users can also manually archive individual tabs or entire groups.
- **RAM impact:** None (already at zero from Stage 3).
- **User experience:** Archived entries are tucked away to keep the active workspace clean. Still fully searchable and restorable. Users can pin saved links to prevent auto-archiving.

### 6.5 Lifecycle Exceptions (Never Leave Stage 1 or 2)

Certain tabs should never be automatically closed. The system enforces these exceptions:

- **Pinned tabs:** Never leave Stage 2 (discarded at most, never closed).
- **Audio/video tabs:** Never leave Stage 1 while media is playing.
- **Whitelisted domains:** User-configured domains (e.g., `gmail.com`, `slack.com`, `jira.atlassian.com`) that never leave Stage 2. This preserves login sessions for apps the user needs always accessible.
- **Active form detection:** Tabs with detected unsaved form input stay in Stage 1 until the form is submitted or abandoned.
- **Browser internal pages:** `chrome://`, `about:`, `edge://` pages are never managed.

### 6.6 Lifecycle Diagram

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    USER CLICKS TAB                          │
  │              (from sidebar or tab bar)                      │
  └──────────────────────┬──────────────────────────────────────┘
                         │ restores to Stage 1
                         ▼
  ┌──────────┐    T1     ┌──────────┐    T2     ┌──────────┐    7d    ┌──────────┐
  │  STAGE 1 │ ───────►  │  STAGE 2 │ ───────►  │  STAGE 3 │ ──────► │  STAGE 4 │
  │  Active  │  (5 min)  │ Discarded│ (15 min)  │  Saved & │ (7 day) │ Archived │
  │          │           │          │           │  Closed  │         │          │
  │ Full RAM │           │ Near-zero│           │ Zero RAM │         │ Zero RAM │
  │ In tab   │           │ In tab   │           │ Sidebar  │         │ Sidebar  │
  │ bar      │           │ bar      │           │ only     │         │ archive  │
  └──────────┘           └──────────┘           └──────────┘         └──────────┘
       ▲                      ▲                      ▲                    ▲
       │                      │                      │                    │
       └──────────────────────┴──────────────────────┴────────────────────┘
                         User clicks to restore at any stage
```

---

## 7. Feature Specifications

### 7.1 Smart Auto-Grouping Engine

The auto-grouping engine classifies tabs into context groups using a multi-signal approach:

1. **Domain-based mapping:** A curated dictionary maps 100+ known domains to context categories (e.g., `github.com` → Dev, `youtube.com` → Entertainment, `docs.google.com` → Work).
2. **Subdomain and path analysis:** For unknown domains, the engine extracts meaningful signals from the URL structure (e.g., `docs.*` → Work, `shop.*` → Shopping).
3. **Keyword heuristics:** Tab titles and URLs are scanned for contextual keywords (e.g., "recipe" → Lifestyle, "API" → Dev). Each keyword match scores +1 for its context. Highest score wins. Ties fall to "Other".
4. **User overrides with learning:** Users can manually reassign any tab to a different group. This creates a persistent domain → group rule that applies to all future tabs from that domain.

**Default context categories:** Dev, Work, Social, Shopping, Entertainment, News, Research, Finance, Lifestyle, Other.

### 7.2 Color-Coded Visual System

Each context group is assigned a distinct color from a carefully designed palette:

| Context | Default Color | Hex Code |
|---------|--------------|----------|
| Dev | Blue | `#1B6B93` |
| Work | Orange | `#E67E22` |
| Social | Pink | `#E91E8C` |
| Shopping | Green | `#27AE60` |
| Entertainment | Purple | `#8E44AD` |
| News | Red | `#E74C3C` |
| Research | Cyan | `#00ACC1` |
| Finance | Amber | `#F39C12` |
| Lifestyle | Teal | `#009688` |
| Other | Gray | `#95A5A6` |

Colors are auto-assigned on group creation and can be overridden by the user via a color picker with 12 presets + custom hex input.

### 7.3 Unified Sidebar Interface

The primary UI is a persistent sidebar panel that **blends open tabs and saved links in one unified view.** This is a key differentiator — the user sees their entire workspace regardless of whether a tab is active, discarded, saved, or archived.

**Layout (top to bottom):**

- **Header bar:** Extension logo ("TabNest"), search/filter input, settings gear icon, and a compact RAM savings indicator (e.g., "Saving ~2.4 GB").
- **Group list:** Vertically stacked, collapsible group cards. Each card shows:
  - Color indicator bar (left edge).
  - Group name (editable on double-click).
  - Tab count badge broken down by state (e.g., "3 open · 8 saved").
  - Expand/collapse toggle.
- **Tab entries within each group:** Each entry shows:
  - Favicon (16x16).
  - Truncated title (full title on hover tooltip).
  - Domain text (subtle, smaller).
  - **Lifecycle stage indicator:**
    - Green dot = Active (Stage 1)
    - Blue dot = Discarded (Stage 2)
    - Bookmark icon = Saved & Closed (Stage 3)
    - Clock icon = Archived (Stage 4)
  - Action icons: close/remove, suspend/restore, move-to-group dropdown.
  - ⚠️ Stateful URL warning icon for saved links where the URL may not fully rebuild the page state.
- **Archive section:** Collapsible section at the bottom for Stage 4 entries.
- **Footer:** Total workspace size (e.g., "47 tabs: 5 active · 8 discarded · 27 saved · 7 archived"), "Suspend All Inactive" quick action.

**Sidebar requirements:**
- Responsive from 300px to 500px width.
- Performant rendering with 200+ total entries (open + saved + archived).
- Drag-and-drop reordering of tabs between groups.
- Full keyboard navigation (Tab, Enter, Escape, Arrow keys).

### 7.4 Smart Restore System

To counter the restore friction of Stage 3 (full page load), TabNest implements intelligent restore strategies:

- **Hover pre-render:** When the user hovers over a saved link in the sidebar for 500ms+, TabNest begins pre-creating the tab in the background (`chrome.tabs.create({ active: false })`). By the time they click, the page is already loading.
- **Staggered batch restore:** When restoring a full workspace (e.g., a named session with 15 tabs), TabNest opens tabs in batches of 3 with a 500ms delay between batches to avoid a RAM spike.
- **Lazy restore:** On Chromium browsers, TabNest can use `chrome.tabs.create({ active: false, discarded: true })` to create tabs that appear in the tab bar with title and favicon but don't actually load until clicked.
- **Navigation history injection:** Before closing a tab in Stage 3, TabNest captures the tab's back/forward navigation history via content script. When restored, the history is stored alongside the saved link so the user can see what pages preceded it (displayed as a tooltip or expandable list in the sidebar).

### 7.5 Session Persistence & Workspaces

All group configurations, tab assignments, lifecycle states, and user preferences are persisted:

- **storage.sync:** User preferences, group names, color assignments, domain rules, whitelist (synced across devices via browser account).
- **storage.local:** Tab state snapshots, saved link data, archived entries, navigation history, named sessions (device-local for performance and size).

**Persistence behaviors:**
- On browser startup, TabNest restores the last known session state. Saved links reappear in the sidebar. Groups are rebuilt. Previously discarded tabs are re-matched by URL.
- Users can save and name "workspace snapshots" (e.g., "Monday Morning", "Thesis Research", "Client Pitch Prep"). Restoring a snapshot opens all saved URLs and recreates groups. Maximum 20 saved workspaces.
- Auto-save triggers: every 30 seconds (debounced, only if state changed), on any group change, on any lifecycle transition, on browser shutdown.

### 7.6 Manual Override & Customization

- Rename any group by double-clicking the group name in the sidebar.
- Change group colors via color picker dropdown.
- Create custom groups manually (e.g., "Q2 Campaign", "Thesis Chapter 3").
- Drag and drop tabs between groups.
- Add custom domain → group mapping rules in settings.
- Merge two groups into one.
- Archive a group (closes all tabs, preserves URLs in archive).
- Pin individual saved links to prevent auto-archiving.
- Manually trigger "Save & Close" or "Discard" on any tab regardless of timers.
- Whitelist domains to prevent Stage 3 (never auto-closed).

### 7.7 Stateful URL Detection

Before closing a tab in Stage 3, TabNest analyzes the URL to detect potential state loss:

- **SPA detection:** URLs with hash fragments (`#/route/path`) that may represent in-app navigation state.
- **Session tokens:** URLs containing query parameters that look like session identifiers, auth tokens, or temporary state.
- **POST-backed pages:** Pages that were loaded via form submission (detected via `webNavigation` API) where the URL alone won't reproduce the same content.
- **Known dynamic domains:** A curated list of domains known to have stateful UIs (e.g., Google Sheets, Figma, Notion) where the URL captures most but not all state.

Flagged tabs get a ⚠️ icon in the sidebar so the user knows the restored page may differ from what they originally saw.

---

## 8. Settings & Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Stage 2 timer (T1) | Slider (1–30 min) | 5 minutes | Time before an inactive tab is discarded |
| Stage 3 timer (T2) | Slider (5–60 min) | 15 minutes | Time before a discarded tab is saved & closed |
| Stage 4 timer | Slider (1–30 days) | 7 days | Time before a saved link is auto-archived |
| Auto-group new tabs | Toggle | ON | Automatically assign new tabs to a context group |
| Persist sessions | Toggle | ON | Restore tab groups and saved links on browser restart |
| Manage pinned tabs | Toggle | OFF | Whether pinned tabs can be discarded (never closed) |
| Whitelist domains | Text list | Empty | Domains that are never auto-closed (Stage 2 max) |
| Show RAM savings | Toggle | ON | Display estimated RAM savings in sidebar header |
| Hover pre-render | Toggle | ON | Pre-load pages when hovering over saved links |
| Staggered restore batch size | Slider (1–10) | 3 | How many tabs to open simultaneously during batch restore |
| Keyboard shortcuts | Key bindings | See Section 9 | Customizable hotkeys for common actions |

---

## 9. Keyboard Shortcuts

| Action | Default Shortcut | Customizable |
|--------|-----------------|--------------|
| Toggle sidebar | `Ctrl+Shift+T` | Yes |
| Save & close current tab | `Ctrl+Shift+S` | Yes |
| Restore last saved tab | `Ctrl+Shift+R` | Yes |
| Next group | `Ctrl+Shift+]` | Yes |
| Previous group | `Ctrl+Shift+[` | Yes |
| Save & close all inactive | `Ctrl+Shift+X` | Yes |
| Search tabs | `Ctrl+Shift+F` | Yes |
| Discard current tab | `Ctrl+Shift+D` | Yes |

---

## 10. Non-Functional Requirements

### 10.1 Performance
- Sidebar must render fully in under 200ms with up to 200 total entries (open + saved + archived).
- Auto-grouping classification must complete in under 50ms per tab.
- Discard operation must complete in under 100ms.
- Save & close operation (snapshot capture + tab close) must complete in under 500ms.
- Hover pre-render must begin tab creation within 500ms of hover start.
- Background service worker memory footprint must remain under 10 MB.

### 10.2 Accessibility
- Full keyboard navigation support in the sidebar.
- ARIA labels on all interactive elements.
- Sufficient color contrast ratios (WCAG 2.1 AA).
- Screen reader compatible group and tab announcements.
- Lifecycle stage indicators must use icons/text in addition to color (never color-only).

### 10.3 Privacy & Security
- No data leaves the user's device. All processing is local.
- No analytics, telemetry, or third-party tracking.
- Minimal permissions requested.
- Content Security Policy headers on all extension pages.
- Open-source codebase for auditability.

---

## 11. Technical Architecture Overview

The extension follows a modular architecture with four layers:

1. **Background Layer (Service Worker):** Tab event listeners, lifecycle timer manager (alarms API), grouping engine, storage manager, cross-browser adapter, navigation history capture.
2. **Sidebar UI Layer:** HTML/CSS/JS sidebar panel. Communicates with the background layer via `chrome.runtime` messaging. Renders the unified group list (blending open tabs and saved links), handles drag-and-drop, search, and settings.
3. **Content Script Layer:** Injected to capture navigation history and detect form state before Stage 3 closure. Also handles click-to-restore on suspended placeholder pages (if used as fallback on non-Chromium browsers).
4. **Storage Layer:** `storage.sync` for preferences and rules, `storage.local` for tab snapshots, saved links, navigation history, and workspace data.

**Key design principles:**
- **Cross-browser adapter pattern:** Thin abstraction normalizing API differences between Chrome (MV3, sidePanel, `tabs.discard()`) and Firefox (MV2, sidebar_action, `browser.tabs.discard()`).
- **Event-driven architecture:** Background worker reacts to tab events rather than polling.
- **Lazy rendering:** Sidebar only renders visible entries; collapsed groups and archive section are virtualized.
- **Graceful degradation:** If `tabs.discard()` is unavailable, Stage 2 is skipped and timers adjust accordingly.

---

## 12. Competitive Differentiation Summary

| Capability | TabNest | Chrome Tab Groups | Chrome Memory Saver | OneTab |
|-----------|---------|------------------|-------------------|--------|
| Auto-context grouping | ✅ Smart, multi-signal | ❌ Manual only | ❌ None | ❌ Chronological only |
| RAM savings | ✅ Graduated (discard → close) | ❌ None | ✅ Discard only | ✅ Close only |
| Tab bar declutter | ✅ Saves & closes idle tabs | ❌ All tabs remain | ❌ All tabs remain | ✅ But loses all tabs at once |
| Persistent sidebar | ✅ Unified open + saved view | ❌ No sidebar | ❌ No sidebar | ❌ Separate page |
| Page state preservation | ✅ Graduated (discard first) | ✅ (tabs stay loaded) | ✅ Discard preserves state | ❌ All state lost |
| Session persistence | ✅ Auto-save + named workspaces | ❌ Lost on restart | ❌ Lost on restart | ✅ Basic link lists |
| Smart restore | ✅ Hover pre-render, staggered | N/A | ✅ Instant (discard) | ❌ Full page load |
| Cross-browser | ✅ Chrome, Edge, Brave, Firefox | ❌ Chrome/Edge only | ❌ Chrome only | ✅ Chrome, Firefox |
| Awareness of open tabs | ✅ Real-time blended view | ✅ (they are the tabs) | ❌ No UI | ❌ No awareness |

---

## 13. Release Plan

| Phase | Scope | Timeline |
|-------|-------|----------|
| Alpha (v0.1) | Core grouping engine + sidebar UI + Stage 1/3 lifecycle on Chrome | Week 1–2 |
| Beta (v0.5) | Stage 2 (discard) + Stage 4 (archive) + persistence + Edge/Brave | Week 3–4 |
| RC (v0.9) | Firefox support, smart restore, keyboard shortcuts, settings panel | Week 5–6 |
| GA (v1.0) | Polish, performance optimization, workspace snapshots, store submission | Week 7–8 |

---

## 14. Success Metrics

- **RAM reduction:** 60%+ average RAM savings with 40 tabs and default lifecycle timers.
- **Tab bar reduction:** 70%+ of tabs moved to sidebar (Stages 3+4) after 1 hour of normal browsing.
- **Grouping accuracy:** 85%+ of auto-assigned groups match user expectations (measured by override rate).
- **Session restore reliability:** 99%+ of saved links restore successfully to the correct URL.
- **Sidebar performance:** p95 render time under 200ms with 200 total entries.
- **User retention:** 60%+ weekly active retention after first install.

---

## 15. Out of Scope (v1.0)

- AI/ML-based tab grouping (planned for v2.0).
- Cloud sync of saved tabs and workspaces across devices (planned for v2.0).
- Safari extension wrapper.
- Tab sharing or collaborative group features.
- Integration with external tools (Notion, Slack, etc.).
- Mobile browser support.
- Full page snapshot/screenshot capture for saved links.>)