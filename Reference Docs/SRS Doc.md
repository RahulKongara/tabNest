# Software Requirements Specification — TabNest: Smart Tab Groups

**Version 1.0 | March 2026 | IEEE 830 Compliant**
**Architecture: Hybrid Lifecycle Pipeline**
**Prepared for implementation via Claude Code**

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the complete functional and non-functional requirements for TabNest, a cross-browser tab management extension built on a hybrid lifecycle architecture. This document is intended to serve as the primary implementation reference for Claude Code or any developer building the extension.

### 1.2 Scope

TabNest is a browser extension that manages tabs through a four-stage lifecycle pipeline (Active → Discarded → Saved & Closed → Archived), provides automatic context-based grouping with color-coded visual organization, and persists session state across browser restarts. The extension targets Chromium-based browsers (Chrome, Edge, Brave, Opera) and Firefox via the WebExtensions API.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|-----------|
| Tab Group | A named, color-coded collection of related browser tabs and saved links |
| Context | The inferred category/topic of a tab (e.g., Dev, Work, Social) |
| Active Tab | A tab with its web page fully loaded in memory (Stage 1) |
| Discarded Tab | A tab whose renderer process has been unloaded by the browser but still appears in the tab bar with preserved state (Stage 2) |
| Saved Tab | A tab that has been fully closed; its URL and metadata are stored in the sidebar as a clickable link (Stage 3) |
| Archived Tab | A saved link that has been inactive for 7+ days and moved to the archive section (Stage 4) |
| Lifecycle Pipeline | The four-stage automatic progression: Active → Discarded → Saved & Closed → Archived |
| Session Snapshot | A serialized record of all groups, tabs, and their states at a point in time |
| Workspace | A named session snapshot that can be saved and restored on demand |
| Service Worker | The background script in Manifest V3 that handles events without a persistent page |
| Sidebar Panel | A browser-native side panel that hosts the TabNest UI |
| Whitelist | A user-defined list of domains exempt from Stage 3 (never auto-closed) |
| Stateful URL | A URL that may not fully reproduce the page state when reopened (SPAs, session tokens, POST-backed pages) |
| WebExtensions API | Cross-browser extension API standard supported by Chrome, Firefox, Edge, and others |
| T1 | Configurable timer threshold for Active → Discarded transition (default: 5 min) |
| T2 | Configurable timer threshold for Discarded → Saved & Closed transition (default: 15 min) |

### 1.4 References

- TabNest Product Requirements Document (PRD) v1.0
- Chrome Extensions Manifest V3 Documentation (developer.chrome.com)
- Firefox WebExtensions API (developer.mozilla.org)
- Chrome Side Panel API (developer.chrome.com/docs/extensions/reference/api/sidePanel)
- Chrome tabs.discard() API (developer.chrome.com/docs/extensions/reference/api/tabs#method-discard)
- IEEE 830-1998: Recommended Practice for Software Requirements Specifications

---

## 2. Overall Description

### 2.1 Product Perspective

TabNest operates as a standalone browser extension with no server-side dependencies. All data processing and storage is local to the user's browser instance. The extension integrates with the browser's native APIs for tab management, tab discarding, storage, alarms, and side panel rendering.

The key architectural innovation is the **hybrid lifecycle pipeline** that combines browser-native tab discarding (for recent tabs that need state preservation) with close-and-save (for long-idle tabs that need to free RAM and tab bar space). This graduated approach provides the benefits of both strategies while mitigating the downsides of each.

### 2.2 System Architecture

| Module | Technology | Responsibility |
|--------|-----------|---------------|
| Background Service Worker | JavaScript (`background.js`) | Tab event handling, lifecycle timer manager, grouping engine, storage manager, cross-browser adapter |
| Sidebar UI | HTML + CSS + JavaScript (`sidebar/`) | Renders unified group list (open tabs + saved links), drag-and-drop, search, settings panel |
| Content Script | JavaScript (`content.js`) | Captures navigation history and form state before Stage 3 closure |
| Storage Layer | `chrome.storage.local` + `chrome.storage.sync` | Persists session state, saved links, user preferences, group configurations, navigation history |

### 2.3 Communication Architecture

Inter-module communication uses the `chrome.runtime` messaging API:

- **Sidebar → Background:** Requests (get state, discard tab, save & close tab, restore tab, update group, search).
- **Background → Sidebar:** Push updates (tab created, tab removed, tab discarded, tab saved, group changed, lifecycle transition).
- **Content Script → Background:** Navigation history data, form state detection results.

All messages follow a typed schema:

```typescript
interface Message {
  type: string;       // e.g., "DISCARD_TAB", "SAVE_AND_CLOSE_TAB"
  payload: object;    // type-specific data
  timestamp: number;  // Date.now() at send time
}
```

### 2.4 User Characteristics

Primary users are technically comfortable browser power users who regularly have 20–100+ tabs open. They understand the concept of browser extensions and are comfortable adjusting settings. No prior tab management tool experience is assumed.

### 2.5 Constraints

- Manifest V3 service workers are non-persistent; the background script must be designed to reinitialize state from storage on wake.
- The `chrome.tabGroups` API is only available on Chrome 89+, Edge 89+, and Brave. Firefox requires a pure-sidebar grouping approach.
- `tabs.discard()` is available on Chrome 54+, Edge 79+, and Firefox 58+. On browsers without support, Stage 2 is skipped.
- `storage.sync` is limited to 100 KB total and 8 KB per item. Large datasets (saved tab snapshots, navigation history) must use `storage.local`.
- `storage.local` has a 10 MB default limit (can request `unlimitedStorage` permission for more).
- Side panel dimensions are controlled by the browser; the UI must be fully responsive from 300px to 500px width.

### 2.6 Assumptions & Dependencies

- The user's browser supports either Chrome's sidePanel API (Chrome 114+) or Firefox's sidebar_action API.
- The user grants the extension the required permissions (tabs, storage, alarms, sidePanel, webNavigation).
- JavaScript is enabled in the browser.
- No external network connectivity is required for any feature.

---

## 3. Functional Requirements

### 3.1 Tab Detection & Monitoring

#### FR-01: Tab Lifecycle Monitoring
- **Description:** The system shall listen to all tab lifecycle events and maintain a real-time in-memory registry of all open tabs.
- **Events:** `onCreated`, `onUpdated`, `onRemoved`, `onActivated`, `onMoved`, `onAttached`, `onDetached`, `onReplaced`.
- **Data Captured per Tab:** Tab ID, URL, title, favicon URL, window ID, index, pinned status, audible status, active status, discarded status, creation timestamp, last active timestamp, current lifecycle stage.
- **Priority:** P0 — Critical

#### FR-02: Tab Activity Tracking
- **Description:** The system shall track the last time each tab was actively focused by the user.
- **Mechanism:** On `chrome.tabs.onActivated`, update the tab's `lastActiveTimestamp` in the registry. On `chrome.windows.onFocusChanged`, update the active tab of the focused window.
- **Storage:** `lastActiveTimestamp` is persisted to `storage.local` every 60 seconds (batch write).
- **Priority:** P0 — Critical

### 3.2 Hybrid Lifecycle Engine

#### FR-03: Lifecycle Timer Manager
- **Description:** The system shall manage the lifecycle progression of every tab using the `chrome.alarms` API.
- **Mechanism:** A single repeating alarm fires every 30 seconds. On each tick, the system iterates all tracked tabs and evaluates:
  - If `(now - lastActiveTimestamp) %3E T1` AND tab is in Stage 1 → transition to Stage 2.
  - If `(now - lastActiveTimestamp) > T2` AND tab is in Stage 2 → transition to Stage 3.
  - If tab has been in Stage 3 for > T3 (default 7 days) → transition to Stage 4.
- **Timer Defaults:** T1 = 5 minutes, T2 = 15 minutes, T3 = 7 days. All configurable.
- **Priority:** P0 — Critical

#### FR-04: Stage 2 Transition — Discard
- **Description:** To transition a tab from Stage 1 to Stage 2, the system shall:
  1. Verify the tab is not exempt (see FR-09).
  2. Call `chrome.tabs.discard(tabId)`.
  3. Update the tab's lifecycle stage in the registry to "discarded".
  4. Notify the sidebar UI via runtime message (`TAB_DISCARDED`).
- **Fallback:** If `tabs.discard()` is unavailable or fails, the tab remains in Stage 1 and the T2 timer is used directly for Stage 3 transition (skip Stage 2 entirely).
- **Error Handling:** If the discard call fails (e.g., tab is active), retry on the next alarm tick.
- **Priority:** P0 — Critical

#### FR-05: Stage 3 Transition — Save & Close
- **Description:** To transition a tab from Stage 2 (or Stage 1 on fallback) to Stage 3, the system shall:
  1. Verify the tab is not exempt (see FR-09).
  2. **Capture snapshot:**
     - URL, title, favIconUrl from the tab object.
     - Group assignment from the registry.
     - Navigation history from the content script (if available).
     - Timestamp of closure.
  3. **Detect stateful URL:** Analyze the URL for SPA hash fragments, session tokens, POST-backed indicators, or known dynamic domains. Set a `isStatefulUrl` boolean flag on the snapshot.
  4. **Save snapshot** to `storage.local` under the tab's group.
  5. **Close the tab** via `chrome.tabs.remove(tabId)`.
  6. Update the registry: remove the tab entry, add a SavedTabEntry.
  7. Notify the sidebar UI via runtime message (`TAB_SAVED_AND_CLOSED`).
- **Priority:** P0 — Critical

#### FR-06: Stage 4 Transition — Archive
- **Description:** Saved links (Stage 3) that have not been restored for longer than T3 (default: 7 days) shall be automatically moved to the Archive section.
- **Mechanism:** On each alarm tick, check all Stage 3 entries. If `(now - savedAt) > T3`, update the entry's stage to "archived".
- **User Trigger:** Users can also manually archive individual tabs or entire groups via the sidebar context menu.
- **Priority:** P2 — Medium

#### FR-07: Tab Restoration
- **Description:** When a user clicks a saved or archived link in the sidebar, the system shall:
  1. Create a new tab: `chrome.tabs.create({ url: savedUrl, active: true })`.
  2. If the original group still exists, assign the new tab to that group.
  3. Remove the SavedTabEntry from storage.
  4. Add the new tab to the in-memory registry as Stage 1 (Active).
  5. Update `lastActiveTimestamp` to now.
  6. Notify the sidebar UI via runtime message (`TAB_RESTORED`).
- **Priority:** P0 — Critical

#### FR-08: Smart Restore Strategies
- **Description:** The system shall implement the following restore optimizations:
  - **Hover pre-render:** When the user hovers over a saved link for 500ms+, create the tab in the background (`chrome.tabs.create({ active: false })`). If the user clicks, activate the pre-created tab. If the user moves away, close the pre-created tab.
  - **Staggered batch restore:** When restoring a workspace with N tabs, open them in batches of `batchSize` (default: 3) with a 500ms delay between batches.
  - **Lazy restore (Chromium only):** Use `chrome.tabs.create({ active: false, discarded: true, url: savedUrl })` to create tabs that appear in the tab bar with title and favicon but don't load until clicked.
- **Priority:** P1 — High

#### FR-09: Lifecycle Exceptions
- **Description:** The system shall enforce the following exception rules:
  - **Pinned tabs:** Max Stage 2. Never auto-closed (Stage 3).
  - **Audible tabs:** Stay in Stage 1 while `tab.audible === true`. Resume lifecycle timer when audio stops.
  - **Whitelisted domains:** Max Stage 2. User-configured list of domains that are never auto-closed.
  - **Active form input:** Tabs where the content script detects unsaved form data stay in Stage 1 until the form is submitted or navigated away. (Detected via content script monitoring `input`, `textarea`, `select` elements with `dirty` state.)
  - **Browser internal pages:** `chrome://`, `about:`, `edge://`, `moz-extension://` pages are never managed.
  - **Currently active tab:** The focused tab in the focused window is always Stage 1.
  - **Already saved tabs:** Tabs that are already in Stage 3+ are not processed again.
- **Priority:** P0 — Critical

### 3.3 Auto-Grouping Engine

#### FR-10: Domain-Based Classification
- **Description:** The system shall classify tabs into context groups based on their domain using a built-in domain-to-context dictionary.
- **Dictionary Size:** Minimum 100 domains across 10 default context categories (Dev, Work, Social, Shopping, Entertainment, News, Research, Finance, Lifestyle, Other).
- **Matching Logic:**
  1. Extract the hostname from the URL.
  2. Strip `www.` prefix.
  3. Check user override rules first (FR-12). If match, use that.
  4. Check built-in dictionary. If match, use that.
  5. Fall through to FR-11.
- **Priority:** P0 — Critical

#### FR-11: Keyword & Heuristic Classification
- **Description:** For tabs whose domains do not match any rule, the system shall analyze the URL path and tab title for contextual keywords.
- **Keyword Sets:** Each context category defines a list of signal keywords. Examples:
  - Dev: `["api", "docs", "sdk", "deploy", "debug", "code", "repo", "commit", "pull request", "merge", "build", "pipeline"]`
  - Shopping: `["cart", "checkout", "product", "buy", "price", "shop", "order", "deal", "coupon", "shipping"]`
  - Research: `["paper", "journal", "study", "thesis", "abstract", "citation", "doi", "arxiv", "pubmed"]`
- **Scoring:** Each keyword match adds 1 point to the matching context. The context with the highest score wins. Ties default to "Other".
- **Priority:** P1 — High

#### FR-12: User Override Learning
- **Description:** When a user manually moves a tab to a different group (via drag-and-drop or context menu), the system shall record the domain → group mapping as a persistent user rule.
- **Persistence:** User rules are stored in `storage.sync` (synced across devices) and take highest priority in the classification chain.
- **Scope:** A single override creates a rule for the entire domain (not the specific URL path).
- **Management:** Users can view, edit, and delete custom rules in the settings panel.
- **Priority:** P1 — High

#### FR-13: Group Management
- **Description:** The system shall support the following group operations:
  - **Create** a new named group with a user-selected color.
  - **Rename** an existing group (double-click group name in sidebar).
  - **Change color** of an existing group (color picker popover).
  - **Delete** a group (active tabs and saved links move to "Other").
  - **Merge** two groups (all entries from source move to target, source is deleted).
  - **Archive** a group (all active tabs are saved & closed, all entries move to archive section).
  - **Pin** a saved link within a group (prevents auto-archiving).
- **Sync:** Group metadata (name, color, order) is stored in `storage.sync`. Tab/link assignments are stored in `storage.local`.
- **Priority:** P0 — Critical

### 3.4 Sidebar User Interface

#### FR-14: Unified Sidebar Layout
- **Description:** The sidebar shall display a unified view that blends open tabs, discarded tabs, saved links, and archived links within their context groups. Layout from top to bottom:
  1. **Header:** Logo ("TabNest"), search input, RAM savings indicator (e.g., "Saving ~2.4 GB"), settings gear icon.
  2. **Group List:** Scrollable vertical list of collapsible group cards. Each card:
     - Left edge: color indicator bar.
     - Group name (editable on double-click).
     - State breakdown badge (e.g., "3 open · 8 saved").
     - Expand/collapse toggle.
  3. **Tab Entries (within expanded group):** Each entry:
     - Favicon (16×16).
     - Truncated title (full on hover tooltip).
     - Domain text (smaller, muted).
     - Lifecycle stage indicator icon:
       - 🟢 Green dot = Active (Stage 1)
       - 🔵 Blue dot = Discarded (Stage 2)
       - 🔖 Bookmark icon = Saved & Closed (Stage 3)
       - 🕐 Clock icon = Archived (Stage 4)
     - ⚠️ Stateful URL warning (if `isStatefulUrl === true`).
     - Action icons: close/remove, save & close / restore, move-to-group.
  4. **Archive Section:** Collapsible section at bottom for Stage 4 entries.
  5. **Footer:** Total count breakdown, "Save & Close All Inactive" button.
- **Priority:** P0 — Critical

#### FR-15: Tab Search & Filter
- **Description:** The search input shall filter all visible entries (open tabs + saved links + archived) in real-time. Matching is case-insensitive substring against title, URL, and group name. Non-matching entries are hidden. Matching groups auto-expand.
- **Performance:** Filter must complete within 100ms for 200 entries.
- **Priority:** P1 — High

#### FR-16: Drag-and-Drop Reordering
- **Description:** Users shall be able to drag any tab entry (regardless of lifecycle stage) from one group and drop it into another. On drop:
  1. Update the entry's `groupId`.
  2. If the entry is an active/discarded tab, update the browser's native tab group (on supported browsers).
  3. If the entry is a saved/archived link, update the stored group assignment.
  4. Persist the change.
  5. If this is the first manual override for this domain, create a user rule (FR-12).
  6. Send a runtime message to sync state.
- **Visual Feedback:** Ghost preview of the entry during drag, highlighted drop target.
- **Priority:** P1 — High

#### FR-17: Group Color Picker
- **Description:** Each group card includes a clickable color swatch. Clicking opens a popover with 12 preset colors + custom hex input. Color changes update: sidebar card, browser native tab group color (where supported), and storage.
- **Priority:** P2 — Medium

#### FR-18: Context Menu
- **Description:** Right-clicking a tab entry or group header shows a context menu:
  - **Tab entry menu:** Discard, Save & Close, Restore, Close/Remove, Move to Group (submenu), Open in New Window, Copy URL, Pin/Unpin.
  - **Group header menu:** Rename, Change Color, Archive Group, Delete Group, Merge With (submenu), Save as Workspace, Restore All.
- **Priority:** P2 — Medium

#### FR-19: RAM Savings Indicator
- **Description:** The sidebar header shall display an estimated RAM savings figure calculated as: `(number of Stage 2 tabs × 150 MB) + (number of Stage 3/4 entries × 200 MB)`. Values are rough estimates using average tab memory consumption. Updates in real-time as tabs transition through lifecycle stages.
- **Priority:** P2 — Medium

### 3.5 Stateful URL Detection

#### FR-20: URL State Analysis
- **Description:** Before closing a tab in Stage 3 (FR-05 step 3), the system shall analyze the URL and navigation context to detect potential state loss:
  - **SPA hash fragments:** URL contains `#/` or `#!/` path patterns.
  - **Session tokens:** URL query parameters matching patterns like `session=`, `token=`, `auth=`, `sid=`, or UUIDs.
  - **POST-backed pages:** Tab was loaded via form submission (detected via `chrome.webNavigation.onCompleted` with `transitionType === "form_submit"`).
  - **Known dynamic domains:** Curated list (e.g., `docs.google.com/spreadsheets`, `figma.com`, `notion.so`, `airtable.com`).
- **Output:** Boolean `isStatefulUrl` flag stored on the SavedTabEntry.
- **Priority:** P1 — High

### 3.6 Navigation History Capture

#### FR-21: History Capture Before Closure
- **Description:** Before closing a tab in Stage 3, the system shall attempt to capture the tab's navigation history:
  - Inject a content script that reads `window.history.length`.
  - Use `chrome.webNavigation.getFrame()` or session-tracking to record the sequence of URLs visited in that tab.
  - Store the history stack (array of URLs, max 20 entries) alongside the SavedTabEntry.
- **Display:** In the sidebar, saved links with captured history show an expandable "History" section or tooltip listing previous URLs.
- **Limitation:** Full history capture is best-effort. Some SPAs and same-origin navigations may not be capturable.
- **Priority:** P2 — Medium

### 3.7 Session Persistence

#### FR-22: Auto-Save State
- **Description:** The system shall automatically save the complete session state to `storage.local` at the following triggers:
  - Every 30 seconds (debounced; only if state has changed since last save).
  - On any lifecycle stage transition (discard, save & close, archive).
  - On any group change (create, rename, delete, merge).
  - On browser shutdown (via `chrome.runtime.onSuspend` for MV3).
- **State Schema:**
  ```json
  {
    "groups": [
      {
        "id": "uuid",
        "name": "Dev",
        "color": "#1B6B93",
        "order": 0,
        "collapsed": false,
        "isCustom": false
      }
    ],
    "activeTabs": [
      {
        "tabId": 123,
        "url": "https://github.com",
        "title": "GitHub",
        "favIconUrl": "...",
        "groupId": "uuid",
        "stage": "active",
        "lastActiveTimestamp": 1709312400000
      }
    ],
    "savedTabs": [
      {
        "id": "uuid",
        "url": "https://stackoverflow.com/q/12345",
        "title": "How to...",
        "favIconUrl": "...",
        "groupId": "uuid",
        "stage": "saved",
        "isStatefulUrl": false,
        "isPinned": false,
        "navHistory": ["https://google.com", "https://stackoverflow.com/q/12345"],
        "savedAt": 1709312400000
      }
    ],
    "archivedTabs": [
      { "...same as savedTabs with stage: archived..." }
    ],
    "settings": { "...see FR-24..." },
    "savedAt": 1709312400000
  }
  ```
- **Priority:** P0 — Critical

#### FR-23: Session Restore on Startup
- **Description:** On browser startup (`chrome.runtime.onStartup`) or extension install/update (`chrome.runtime.onInstalled`), the system shall:
  1. Load the last saved state from `storage.local`.
  2. Query all currently open tabs.
  3. Reconcile: match open tabs to saved active tab entries by URL. Re-assign groups for matched tabs. Tabs in saved state that are not currently open remain as saved links in the sidebar.
  4. Re-create browser-native tab groups for matched tabs (on supported browsers).
  5. Rebuild the sidebar state.
- **Priority:** P0 — Critical

#### FR-24: Named Workspace Snapshots
- **Description:** Users shall be able to manually save the current session as a named workspace (e.g., "Monday Morning", "Thesis Research"). Saving captures all groups, active tab URLs, and saved links. Restoring a workspace opens all URLs (using staggered batch restore) and recreates groups.
- **Storage:** Array of workspace objects in `storage.local`. Maximum 20 workspaces.
- **UI:** Accessible via sidebar settings → "Workspaces" section. List of saved workspaces with Restore and Delete actions.
- **Priority:** P2 — Medium

### 3.8 Settings & Configuration

#### FR-25: Settings Panel
- **Description:** The sidebar shall include a settings panel accessible via the gear icon. Organized into sections:
  - **Lifecycle Timers:** T1 slider, T2 slider, T3 slider.
  - **Behavior:** Auto-group toggle, persist sessions toggle, manage pinned tabs toggle, hover pre-render toggle.
  - **Whitelist:** Domain whitelist manager (add/remove domains).
  - **Custom Rules:** View/edit/delete domain → group mapping rules.
  - **Restore:** Batch size slider.
  - **Keyboard Shortcuts:** Customizable key bindings.
  - **Data:** Export/import settings and saved tabs as JSON. Clear all data button.
- **Persistence:** All settings saved to `storage.sync` immediately on change.
- **Priority:** P1 — High

#### FR-26: Keyboard Shortcuts
- **Description:** Configurable shortcuts via `chrome.commands` API:

| Command ID | Default Binding | Action |
|-----------|----------------|--------|
| `toggle-sidebar` | `Ctrl+Shift+T` | Open/close the sidebar panel |
| `save-close-current` | `Ctrl+Shift+S` | Save & close the currently active tab |
| `restore-last` | `Ctrl+Shift+R` | Restore the most recently saved tab |
| `next-group` | `Ctrl+Shift+]` | Switch focus to the next tab group |
| `prev-group` | `Ctrl+Shift+[` | Switch focus to the previous tab group |
| `save-close-all` | `Ctrl+Shift+X` | Save & close all tabs meeting lifecycle criteria |
| `search-tabs` | `Ctrl+Shift+F` | Focus the sidebar search input |
| `discard-current` | `Ctrl+Shift+D` | Discard the currently active tab |

- **Priority:** P1 — High

### 3.9 Content Script: Form State Detection

#### FR-27: Unsaved Form Detection
- **Description:** A lightweight content script shall be injected into managed tabs to detect unsaved form input:
  - Monitor `input`, `textarea`, `select`, and `[contenteditable]` elements.
  - Track whether any field has been modified since page load (`dirty` state).
  - On query from the background worker (before Stage 2/3 transition), report whether the tab has unsaved form data.
- **Implementation:** Use `MutationObserver` and `input` event listeners. Minimize performance impact by using passive listeners and debouncing.
- **Permission:** Requires `%3Call_urls>` host permission or `activeTab`.
- **Priority:** P1 — High

---

## 4. Non-Functional Requirements

### 4.1 Performance Requirements

| ID | Requirement | Target | Measurement |
|----|------------|--------|-------------|
| NFR-01 | Sidebar initial render | < 200ms for 200 entries | `Performance.now()` in sidebar.js |
| NFR-02 | Tab classification | < 50ms per tab | Benchmark `classifyTab()` |
| NFR-03 | Discard operation | < 100ms | Measure `tabs.discard()` call |
| NFR-04 | Save & close operation | < 500ms (snapshot + close) | End-to-end timing |
| NFR-05 | Restore operation (single) | < 200ms to tab creation | `tabs.create()` timing |
| NFR-06 | Hover pre-render trigger | < 500ms from hover start | Event timing |
| NFR-07 | Search filter | < 100ms for 200 entries | Debounced input measurement |
| NFR-08 | Drag-and-drop frame rate | > 30 fps | `requestAnimationFrame` counter |
| NFR-09 | Background worker memory | < 10 MB resident | Chrome Task Manager |
| NFR-10 | Storage write (full state) | < 100ms | `Performance.now()` around `storage.local.set()` |
| NFR-11 | Lifecycle alarm tick | < 200ms to evaluate all tabs | Alarm callback timing |
| NFR-12 | Batch restore (15 tabs) | < 10 seconds total | End-to-end with staggering |

### 4.2 Reliability Requirements

- **NFR-13:** Session restore shall succeed for 99%+ of saved links across normal browser restarts.
- **NFR-14:** The extension shall gracefully handle `storage.local` quota exceeded errors by pruning the oldest archived entries first, then oldest workspaces.
- **NFR-15:** If the background service worker is terminated and restarted, full state shall be recoverable from storage within 500ms.
- **NFR-16:** The extension shall not crash or become unresponsive when managing up to 200 total entries (active + discarded + saved + archived).
- **NFR-17:** If `tabs.discard()` fails for a specific tab, the system shall log the error and retry on the next alarm tick, without affecting other tabs.
- **NFR-18:** If a content script cannot be injected (restricted page), the system shall proceed with the lifecycle transition without form state data (fail open).

### 4.3 Accessibility Requirements

- **NFR-19:** All interactive elements shall be keyboard-navigable using Tab, Enter, Escape, and Arrow keys.
- **NFR-20:** All interactive elements shall have descriptive ARIA labels (e.g., `aria-label="Restore saved tab: GitHub Pull Requests"`).
- **NFR-21:** Color contrast ratios shall meet WCAG 2.1 AA (4.5:1 normal text, 3:1 large text).
- **NFR-22:** Screen readers shall announce group names, tab counts by stage, and lifecycle transitions.
- **NFR-23:** Lifecycle stage indicators shall use both icons and text labels, never color alone.

### 4.4 Security & Privacy Requirements

- **NFR-24:** No data shall be transmitted to any external server. All processing and storage is local.
- **NFR-25:** The extension shall request only the minimum required permissions.
- **NFR-26:** No third-party scripts, analytics, or tracking libraries shall be included.
- **NFR-27:** Saved tab data shall not be accessible to other extensions or web pages.
- **NFR-28:** Content Security Policy headers shall be set on all extension pages (sidebar, placeholder).
- **NFR-29:** The content script for form detection shall not read or transmit form field values — only detect whether fields are dirty.

### 4.5 Portability & Compatibility

- **NFR-30:** The codebase shall use a cross-browser adapter pattern to abstract API differences.
- **NFR-31:** Chrome, Edge, and Brave shall share the identical Manifest V3 package.
- **NFR-32:** Firefox shall use a Manifest V2 package with adapter layer (`sidebar_action` vs `sidePanel`, `browser.*` vs `chrome.*`).
- **NFR-33:** On browsers without `tabs.discard()`, Stage 2 shall be skipped gracefully (T1 timer extends to T2 value, tabs go directly to Stage 3).
- **NFR-34:** The extension shall function correctly on Windows 10+, macOS 12+, and Ubuntu 22.04+.

### 4.6 Maintainability

- **NFR-35:** Code shall follow a modular architecture with clear separation of concerns.
- **NFR-36:** All public functions shall include JSDoc documentation.
- **NFR-37:** Unit tests for grouping engine, lifecycle manager, and storage manager with 80%+ coverage.
- **NFR-38:** A build script shall generate browser-specific packages from the shared codebase.
- **NFR-39:** All lifecycle stage transitions shall emit structured log entries for debugging.

---

## 5. Data Model

### 5.1 TabEntry (Active & Discarded Tabs — Stages 1 & 2)

| Field | Type | Description |
|-------|------|-------------|
| `tabId` | `number` | Browser-assigned tab ID |
| `url` | `string` | Full URL of the tab |
| `title` | `string` | Page title |
| `favIconUrl` | `string \| null` | URL of the tab's favicon |
| `groupId` | `string` | UUID of the assigned TabGroup |
| `stage` | `"active" \| "discarded"` | Current lifecycle stage |
| `pinned` | `boolean` | Whether the tab is pinned |
| `audible` | `boolean` | Whether the tab is playing audio |
| `windowId` | `number` | Browser window ID |
| `lastActiveTimestamp` | `number` | Unix ms timestamp of last focus |
| `createdAt` | `number` | Unix ms timestamp of tab creation |
| `hasDirtyForm` | `boolean` | Whether content script detected unsaved form data |

### 5.2 SavedTabEntry (Saved & Archived Tabs — Stages 3 & 4)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID for this saved entry |
| `url` | `string` | The URL to restore |
| `title` | `string` | Page title at time of save |
| `favIconUrl` | `string \| null` | Favicon URL |
| `groupId` | `string` | Group assignment at time of save |
| `stage` | `"saved" \| "archived"` | Current lifecycle stage |
| `isStatefulUrl` | `boolean` | Whether URL may not fully reproduce page state |
| `isPinned` | `boolean` | Whether user pinned this to prevent auto-archiving |
| `navHistory` | `string[]` | Array of URLs from tab's navigation history (max 20) |
| `savedAt` | `number` | Unix ms timestamp of when the tab was saved & closed |
| `archivedAt` | `number \| null` | Unix ms timestamp of when moved to archive (null if Stage 3) |
| `originalTabId` | `number` | The browser tab ID at time of closure (for logging/debugging) |

### 5.3 TabGroup

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID for the group |
| `name` | `string` | Display name (e.g., "Dev", "Work") |
| `color` | `string` | Hex color code (e.g., `"#1B6B93"`) |
| `browserGroupId` | `number \| null` | Chrome `tabGroups` API ID (null on Firefox or if no active tabs in group) |
| `collapsed` | `boolean` | Whether the group is collapsed in the sidebar |
| `order` | `number` | Sort order in the sidebar (0-indexed) |
| `createdAt` | `number` | Unix ms timestamp |
| `isCustom` | `boolean` | True if user-created, false if auto-generated from context category |

### 5.4 WorkspaceSnapshot

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `name` | `string` | User-assigned name (e.g., "Monday Morning") |
| `groups` | `TabGroup[]` | Array of group objects |
| `tabs` | `{ url, title, favIconUrl, groupId }[]` | Simplified tab entries (URLs only, no runtime state) |
| `createdAt` | `number` | Unix ms timestamp |

### 5.5 UserSettings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `t1Minutes` | `number` | `5` | Stage 1 → 2 timer (minutes) |
| `t2Minutes` | `number` | `15` | Stage 2 → 3 timer (minutes) |
| `t3Days` | `number` | `7` | Stage 3 → 4 timer (days) |
| `autoGroupEnabled` | `boolean` | `true` | Whether auto-grouping is active |
| `persistSessionEnabled` | `boolean` | `true` | Whether session state persists on restart |
| `managePinnedTabs` | `boolean` | `false` | Whether pinned tabs can be discarded |
| `hoverPreRenderEnabled` | `boolean` | `true` | Pre-load pages on hover |
| `batchRestoreSize` | `number` | `3` | Tabs per batch during workspace restore |
| `whitelistDomains` | `string[]` | `[]` | Domains that never go past Stage 2 |
| `showRamSavings` | `boolean` | `true` | Show RAM savings indicator |
| `customDomainRules` | `Record<string, string>` | `{}` | User domain → groupId mappings |
| `keyboardShortcuts` | `Record<string, string>` | See FR-26 | Custom shortcut bindings |

### 5.6 DomainRule (User Override)

| Field | Type | Description |
|-------|------|-------------|
| `domain` | `string` | The domain (e.g., `"github.com"`) |
| `groupId` | `string` | UUID of the assigned group |
| `createdAt` | `number` | Unix ms timestamp of when the rule was created |
| `source` | `"manual" \| "drag"` | How the rule was created (settings panel vs drag-and-drop) |

---

## 6. Project File Structure

```
tabnest/
├── manifest.json                  # Chrome/Edge/Brave/Opera (Manifest V3)
├── manifest-firefox.json          # Firefox (Manifest V2)
├── background.js                  # Service worker entry (Chromium)
├── background-firefox.js          # Background script entry (Firefox)
├── core/
│   ├── browser-adapter.js         # Cross-browser API abstraction
│   ├── lifecycle-manager.js       # Hybrid lifecycle pipeline (Stages 1-4)
│   ├── grouping-engine.js         # Domain dictionary + keyword classifier
│   ├── storage-manager.js         # Persistence, snapshots, workspaces
│   ├── restore-manager.js         # Smart restore (hover, batch, lazy)
│   ├── url-analyzer.js            # Stateful URL detection
│   └── constants.js               # Default settings, domain dictionary, keyword sets
├── content/
│   ├── form-detector.js           # Lightweight unsaved form detection
│   └── history-capture.js         # Navigation history capture before closure
├── sidebar/
│   ├── sidebar.html               # Sidebar panel markup
│   ├── sidebar.css                # Sidebar styles
│   ├── sidebar.js                 # Main sidebar controller
│   └── components/
│       ├── group-card.js          # Group card component
│       ├── tab-entry.js           # Tab/saved-link entry component
│       ├── color-picker.js        # Color picker popover
│       ├── settings-panel.js      # Settings UI
│       ├── search-bar.js          # Search/filter component
│       ├── workspace-manager.js   # Workspace save/restore UI
│       ├── archive-section.js     # Archive section component
│       └── ram-indicator.js       # RAM savings display
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   ├── lifecycle-manager.test.js
│   ├── grouping-engine.test.js
│   ├── storage-manager.test.js
│   ├── restore-manager.test.js
│   ├── url-analyzer.test.js
│   └── form-detector.test.js
└── build/
    └── build.sh                   # Generates browser-specific packages
```

---

## 7. Internal API Contracts (Message Types)

### 7.1 Sidebar → Background (Request/Response)

| Message Type | Payload | Response |
|-------------|---------|----------|
| `GET_FULL_STATE` | none | `{ groups, activeTabs, savedTabs, archivedTabs, settings }` |
| `DISCARD_TAB` | `{ tabId: number }` | `{ success: boolean, error?: string }` |
| `SAVE_AND_CLOSE_TAB` | `{ tabId: number }` | `{ success: boolean, savedEntry?: SavedTabEntry }` |
| `RESTORE_TAB` | `{ savedId: string }` | `{ success: boolean, newTabId?: number }` |
| `RESTORE_WORKSPACE` | `{ workspaceId: string }` | `{ success: boolean, tabsCreated: number }` |
| `CLOSE_TAB` | `{ tabId: number }` | `{ success: boolean }` |
| `REMOVE_SAVED_TAB` | `{ savedId: string }` | `{ success: boolean }` |
| `MOVE_TO_GROUP` | `{ entryId: string \| number, groupId: string, entryType: "tab" \| "saved" }` | `{ success: boolean }` |
| `CREATE_GROUP` | `{ name: string, color: string }` | `{ group: TabGroup }` |
| `RENAME_GROUP` | `{ groupId: string, name: string }` | `{ success: boolean }` |
| `CHANGE_GROUP_COLOR` | `{ groupId: string, color: string }` | `{ success: boolean }` |
| `DELETE_GROUP` | `{ groupId: string }` | `{ success: boolean }` |
| `MERGE_GROUPS` | `{ sourceId: string, targetId: string }` | `{ success: boolean }` |
| `ARCHIVE_GROUP` | `{ groupId: string }` | `{ success: boolean, savedCount: number }` |
| `SAVE_AND_CLOSE_ALL_INACTIVE` | none | `{ savedCount: number }` |
| `SEARCH` | `{ query: string }` | `{ results: (TabEntry \| SavedTabEntry)[] }` |
| `SAVE_WORKSPACE` | `{ name: string }` | `{ workspace: WorkspaceSnapshot }` |
| `DELETE_WORKSPACE` | `{ workspaceId: string }` | `{ success: boolean }` |
| `GET_WORKSPACES` | none | `{ workspaces: WorkspaceSnapshot[] }` |
| `GET_SETTINGS` | none | `{ settings: UserSettings }` |
| `UPDATE_SETTINGS` | `{ changes: Partial<UserSettings> }` | `{ success: boolean }` |
| `PIN_SAVED_TAB` | `{ savedId: string, pinned: boolean }` | `{ success: boolean }` |
| `EXPORT_DATA` | none | `{ json: string }` |
| `IMPORT_DATA` | `{ json: string }` | `{ success: boolean, error?: string }` |

### 7.2 Background → Sidebar (Push Notifications)

| Message Type | Payload | Trigger |
|-------------|---------|---------|
| `TAB_CREATED` | `{ tab: TabEntry, groupId: string }` | New tab opened and classified |
| `TAB_UPDATED` | `{ tabId: number, changes: Partial<TabEntry> }` | Tab URL or title changed |
| `TAB_REMOVED` | `{ tabId: number }` | Tab closed (by user, not by lifecycle) |
| `TAB_DISCARDED` | `{ tabId: number }` | Tab transitioned to Stage 2 |
| `TAB_SAVED_AND_CLOSED` | `{ savedEntry: SavedTabEntry }` | Tab transitioned to Stage 3 |
| `TAB_ARCHIVED` | `{ savedId: string }` | Saved link transitioned to Stage 4 |
| `TAB_RESTORED` | `{ savedId: string, newTabId: number }` | Saved link restored to active tab |
| `GROUP_UPDATED` | `{ group: TabGroup }` | Group renamed, recolored, or reordered |
| `GROUP_DELETED` | `{ groupId: string }` | Group removed |
| `SETTINGS_CHANGED` | `{ settings: UserSettings }` | Settings updated |

### 7.3 Content Script → Background

| Message Type | Payload | Response |
|-------------|---------|----------|
| `FORM_STATE_REPORT` | `{ tabId: number, hasDirtyForm: boolean }` | none |
| `NAV_HISTORY_REPORT` | `{ tabId: number, history: string[] }` | none |

---

## 8. Testing Requirements

### 8.1 Unit Tests

- **Lifecycle manager:** Verify Stage 1→2, 2→3, 3→4 transitions with correct timer thresholds. Verify exception rules block transitions. Verify fallback behavior when `tabs.discard()` is unavailable.
- **Grouping engine:** Verify domain dictionary lookup, keyword scoring, fallback to "Other", user override priority chain.
- **Storage manager:** Verify save/load cycle integrity, quota handling, workspace CRUD, state reconciliation on startup.
- **URL analyzer:** Verify SPA detection, session token detection, POST-backed page detection, known dynamic domain matching.
- **Restore manager:** Verify single restore, batch restore staggering, hover pre-render creation and cleanup.

### 8.2 Integration Tests

- Background ↔ Sidebar message passing for all message types in Section 7.
- Full lifecycle: open tab → auto-group → discard → save & close → archive → restore.
- Workspace save → browser restart → workspace restore.
- Drag-and-drop group reassignment creating a user domain rule.
- Form state detection blocking Stage 2/3 transition.

### 8.3 Cross-Browser Tests

- Core lifecycle on Chrome 114+, Edge 114+, Brave latest, Firefox 109+.
- Stage 2 (discard) on each browser that supports `tabs.discard()`.
- Graceful fallback (skip Stage 2) on browsers without `tabs.discard()`.
- Sidebar rendering at 300px, 400px, and 500px widths.
- Session persistence across browser restart on each target browser.

### 8.4 Performance Tests

- Load test with 50, 100, and 200 total entries: measure sidebar render time, memory usage, and lifecycle tick processing time.
- Stress test the lifecycle manager alarm tick with 100+ tabs eligible for transition simultaneously.
- Measure batch restore of 15-tab workspace: total time, peak RAM spike, time to first interactive tab.

---

## 9. Acceptance Criteria Summary

| Feature | Acceptance Criteria |
|---------|-------------------|
| Hybrid Lifecycle | Tabs progress through Stages 1→2→3→4 based on configured timers. Stage 2 preserves page state. Stage 3 frees RAM and clears tab bar. Exceptions (pinned, audible, whitelisted, form input) are enforced. |
| Auto-Grouping | New tabs classified into correct context group within 50ms. 85%+ accuracy for top-100 domains. User overrides create persistent rules. |
| Unified Sidebar | All entries (active + discarded + saved + archived) displayed in grouped view. Lifecycle stage indicators are visible. Search filters across all stages. |
| Smart Restore | Hover pre-render triggers within 500ms. Batch restore staggers tabs. Restored tabs are assigned to correct group. |
| Session Persistence | Browser restart restores groups and saved links. Named workspaces can be saved and restored. |
| Stateful URL Detection | URLs with SPA fragments, session tokens, or POST history are flagged with ⚠️ icon. |
| Cross-Browser | Extension installs and full lifecycle functions on Chrome, Edge, Brave, and Firefox. Stage 2 gracefully skipped where unsupported. |
| Privacy | Zero network requests. No data leaves device. Form detector reads dirty state only, never field values. |

---

## 10. Glossary

Refer to Section 1.3 (Definitions & Acronyms) for all terminology used in this document.

---

## Appendix A: Default Domain Dictionary (Excerpt)

The full dictionary shall contain 100+ mappings. Representative sample:

| Domain | Context | Domain | Context |
|--------|---------|--------|---------|
| `github.com` | Dev | `youtube.com` | Entertainment |
| `stackoverflow.com` | Dev | `netflix.com` | Entertainment |
| `docs.google.com` | Work | `twitter.com` / `x.com` | Social |
| `notion.so` | Work | `reddit.com` | Social |
| `figma.com` | Work | `amazon.com` | Shopping |
| `slack.com` | Work | `bbc.com` | News |
| `linear.app` | Work | `arxiv.org` | Research |
| `wikipedia.org` | Research | `spotify.com` | Entertainment |

## Appendix B: Default Keyword Sets (Excerpt)

| Context | Keywords |
|---------|---------|
| Dev | api, docs, sdk, deploy, debug, code, repo, commit, pull request, merge, build, pipeline, npm, docker, kubernetes |
| Work | meeting, calendar, invoice, project, task, kanban, sprint, roadmap, okr, budget, payroll |
| Shopping | cart, checkout, product, buy, price, shop, order, deal, coupon, shipping, wishlist, review |
| Research | paper, journal, study, thesis, abstract, citation, doi, arxiv, pubmed, peer-review, methodology |
| Entertainment | watch, stream, playlist, episode, movie, game, play, trailer, album, podcast |
| News | breaking, headline, opinion, editorial, politics, election, report, correspondent |
| Finance | stock, portfolio, trading, crypto, market, invest, dividend, mutual fund, etf, banking |
| Social | post, feed, story, reel, tweet, follow, dm, message, community, forum |
| Lifestyle | recipe, fitness, workout, travel, hotel, booking, health, nutrition, meditation, yoga |>)