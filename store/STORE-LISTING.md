# TabNest — Chrome Web Store Listing Copy

**Version:** 1.0.0
**Category:** Productivity
**Primary Language:** English (US)
**Target Stores:** Chrome Web Store (primary), Firefox Add-ons (AMO, secondary)

---

## Extension Name

TabNest

*(45 character max. Current: 7 characters.)*

---

## Short Description

*(132 character max — shown in search results and the extension details header.)*

TabNest automatically organizes tabs into smart groups and manages them through a 4-stage lifecycle to save RAM and reduce clutter.

*(Current: 131 characters — within limit.)*

---

## Long Description

*(16000 character max. Plain text with line breaks; avoid HTML.)*

TabNest is a cross-browser tab manager that keeps your browser workspace automatically organized, RAM-efficient, and session-persistent — without you doing anything.

**The Problem**

Modern browsing leads to three compounding problems: tab overload (too many tabs, no structure), memory exhaustion (40 tabs can consume 4–12 GB of RAM), and session loss (accidental closures destroy your working context). Existing tools solve only one piece: browser-native tab groups organize visually but waste RAM; Chrome Memory Saver discards tabs but leaves clutter; OneTab saves tabs but loses all state instantly.

**TabNest Does All Three**

TabNest combines automatic context intelligence, graduated lifecycle management, and a unified sidebar into one seamless experience.

Smart Auto-Grouping
New tabs are instantly classified into color-coded context groups (Dev, Work, Social, Research, etc.) using a domain dictionary and keyword heuristics. Drag a tab to a different group and TabNest remembers that rule for all future tabs from that domain.

4-Stage Lifecycle (The Core Feature)
TabNest manages every tab through four automatic stages based on inactivity:
- Stage 1 Active: Tab is open and loaded. No change.
- Stage 2 Discarded: After 5 minutes idle, the tab is silently unloaded from RAM while staying in the tab bar. Clicking it restores instantly.
- Stage 3 Saved & Closed: After 15 minutes idle, the tab is closed and saved as a link in the sidebar. Zero RAM, zero tab bar clutter.
- Stage 4 Archived: After 7 days saved, the link moves to a collapsible Archive section.

All timers are configurable. Pinned tabs, audio tabs, and whitelisted domains are never auto-closed.

Unified Sidebar
The sidebar blends all lifecycle stages into one view. You see every active tab, discarded tab, saved link, and archived link in their context groups — all in one place.

Smart Restore
- Hover pre-render: Hover over a saved link for 500ms and TabNest starts pre-loading the page.
- Batch restore: Restoring a workspace opens tabs 3 at a time with small delays.
- Lazy restore (Chromium): Tabs appear in the bar but don't load until clicked.

Complete Privacy
TabNest stores everything locally in your browser. No data ever leaves your device. No analytics, no telemetry, no third-party services.

Fully Configurable
- Lifecycle timer sliders (T1, T2, T3)
- Behavior toggles (auto-group, hover pre-render, manage pinned tabs)
- Domain whitelist and custom grouping rules
- Keyboard shortcuts (8 default, all remappable)
- Export/import your full data as JSON
- Named workspace snapshots (save and restore sessions with one click)

Accessible
Full keyboard navigation. ARIA labels on all interactive elements. WCAG 2.1 AA color contrast.

Cross-Browser
Works on Chrome 114+, Microsoft Edge 114+, Brave (latest), and Firefox 109+.

---

## Promotional Tile Text

*(80 character max — optional, shown on featured placements.)*

Auto-group tabs. Free RAM. Never lose a session.

*(Current: 47 characters.)*

---

## Version Notes (for 1.0.0 submission)

Initial GA release. Includes full 4-stage lifecycle, cross-browser support (Chrome, Edge, Brave, Firefox), smart restore, settings panel, keyboard shortcuts, workspace snapshots, and WCAG 2.1 AA accessibility.

---

## Tags / Keywords

*(Chrome Web Store allows up to 5 tags)*

1. tab manager
2. tab organizer
3. productivity
4. RAM saver
5. session manager

---

## Store Submission Checklist

- [ ] Short description is <= 132 characters
- [ ] Long description is <= 16000 characters and does not contain HTML
- [ ] At least 1 screenshot uploaded (target: 5 — see SCREENSHOTS-SPEC.md)
- [ ] Privacy policy URL provided (see PRIVACY-POLICY.md)
- [ ] Icon files present: icon16.png (16x16), icon48.png (48x48), icon128.png (128x128)
- [ ] manifest.json version field is "1.0.0"
- [ ] manifest.json description field is <= 132 characters
- [ ] Extension category set to "Productivity"
- [ ] Justification text written for sensitive permissions (tabs, webNavigation, <all_urls>)
