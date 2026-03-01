---
phase: 02-sidebar-mvp
plan: "03"
subsystem: ui
tags: [html, css, sidebar, flexbox, css-custom-properties, accessibility, browser-extension]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: background.js tab registry, grouping engine, and constants that sidebar.js will consume via message protocol

provides:
  - sidebar/sidebar.html — complete semantic HTML5 structure with all DOM IDs and ARIA attributes
  - sidebar/sidebar.css — full responsive CSS with flexbox layout, group card, tab entry, stage indicators, collapse behavior
  - DOM contract (IDs, class names, data-* attributes) that sidebar.js (02-04) must target
  - CSS variable --group-color driving dynamic color theming without JS

affects:
  - 02-04 (sidebar.js controller — depends on DOM IDs and class names defined here)
  - 02-05 (RAM indicator component — targets .tn-ram-badge and #tn-ram-indicator)
  - 02-06 (group-card.js — builds .tn-group-card elements per DOM contract)
  - 02-07 (tab-entry.js — builds .tn-tab-entry elements per DOM contract)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CSS data-attribute state pattern (data-stage, data-collapsed instead of class toggling)
    - CSS custom property color theming (--group-color per card, --group-color-* palette root vars)
    - Opacity-based hover reveal (cheaper than display:none toggling on hover)
    - min-width:0 on flex children to enable text-overflow:ellipsis inside flex containers
    - Extension CSP compliance — no inline scripts, no inline event handlers, all scripts via src=""

key-files:
  created: []
  modified:
    - sidebar/sidebar.html
    - sidebar/sidebar.css

key-decisions:
  - "CSS data-collapsed attribute drives collapse state — no inline styles; classList sets data-collapsed=true/false"
  - "CSS data-stage attribute (active/discarded/saved/archived) selects stage indicator appearance — decouples JS from visual logic"
  - "bookmark and clock stage indicators use CSS ::before content with Unicode codepoints (\\1F516, \\1F554) — no extra DOM elements"
  - "--group-color CSS custom property on each .tn-group-card drives both border-left color and color bar — JS sets style attribute once"
  - "opacity: 0 / opacity: 1 for action button hover-reveal (GPU-composited, avoids layout recalc vs display:none)"
  - "min-width: 0 on .tn-tab-info enables text-overflow:ellipsis inside a flex container — required pattern"
  - "message-protocol.js loaded before sidebar.js — enforces dependency order without bundler"

patterns-established:
  - "DOM contract pattern: HTML defines IDs/classes as stable API surface; JS targets them without creating its own"
  - "Stage-driven CSS: data-stage attribute on .tn-tab-entry controls all visual variants — add new stage by adding CSS rule only"
  - "Collapse toggle: set data-collapsed=true on .tn-group-card — CSS hides .tn-tab-list automatically"

requirements-completed: [UI-02, UI-03, UI-11]

# Metrics
duration: 3min
completed: "2026-03-01"
---

# Phase 2 Plan 03: Sidebar HTML + CSS Summary

**Complete flexbox sidebar skeleton with semantic HTML5 structure, 4-stage CSS indicators, CSS-variable group color theming, and responsive 300-500px layout — zero inline scripts (CSP compliant)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-01T13:25:12Z
- **Completed:** 2026-03-01T13:27:37Z
- **Tasks:** 2 / 2
- **Files modified:** 2

## Accomplishments

- Rewrote sidebar.html stub into a complete HTML5 document with all 9 required DOM IDs, full ARIA attributes (aria-live, aria-expanded, aria-controls, aria-label), and CSP-safe script loading order (message-protocol.js then sidebar.js)
- Implemented sidebar.css from scratch (570+ lines): CSS custom properties for 10 group color variables, fixed-header/scrolling-main/fixed-footer flexbox column, group card with CSS-variable left border, tab entry with title ellipsis, all 4 stage indicator variants, hover-reveal action buttons via opacity transition, archive section, and responsive breakpoint at 340px
- Established the DOM contract that all subsequent sidebar JS plans (02-04 through 02-07) must target — IDs, class names, and data-* attribute conventions are now frozen

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite sidebar.html with complete semantic structure** - `daf043d` (feat)
2. **Task 2: Implement complete sidebar.css layout and component styles** - `b49b208` (feat)

## Files Created/Modified

- `sidebar/sidebar.html` — Complete HTML5 structure: header (logo, RAM badge, settings, search), main group list mount, archive section with toggle, footer with tab count and save-all button; script tags for message-protocol.js and sidebar.js
- `sidebar/sidebar.css` — Full responsive CSS: 13 sections covering root variables, reset, header, main list, group card, tab list, tab entry, stage indicators, action buttons, archive section, footer, responsive 300px+ behavior, and utilities

## DOM Contract — API for sidebar.js (02-04)

These IDs are the stable interface between HTML and JS:

| Element ID | Type | Purpose |
|---|---|---|
| `#tn-header` | header | Banner container |
| `#tn-search` | input[type=search] | Tab search field |
| `#tn-ram-indicator` | span.tn-ram-badge | RAM savings display |
| `#tn-settings-btn` | button | Settings panel trigger |
| `#tn-group-list` | main | Group card mount point |
| `#tn-archive` | section | Archive section container |
| `#tn-archive-toggle` | button | Archive collapse toggle |
| `#tn-archive-list` | ul | Archive entry mount point |
| `#tn-archive-count` | span | Archive entry count |
| `#tn-footer` | footer | Footer container |
| `#tn-tab-count` | span[aria-live=polite] | Live tab count display |
| `#tn-save-all-btn` | button | Save and close all inactive |

## CSS Class Names — API for group-card.js and tab-entry.js

Group card classes:
- `.tn-group-card` — container; `data-group-id` attribute; `data-collapsed="true|false"`; `style="--group-color: #hex"`
- `.tn-group-header` — clickable row
- `.tn-group-color-bar` — 4px wide color indicator
- `.tn-group-name` — group title (flex-grow)
- `.tn-group-count` — "N open · M saved" badge
- `.tn-collapse-btn` — chevron toggle button
- `.tn-collapse-icon` — rotated arrow span
- `.tn-tab-list` — ul inside group card

Tab entry classes:
- `.tn-tab-entry` — li element; `data-tab-id`; `data-stage="active|discarded|saved|archived"`
- `.tn-favicon` — 16x16 img
- `.tn-tab-info` — flex column wrapper (min-width: 0 for ellipsis)
- `.tn-tab-title` — truncated title span
- `.tn-tab-domain` — domain subtitle span
- `.tn-stage-indicator` — colored dot / icon span
- `.tn-tab-actions` — action button wrapper (opacity:0, reveals on hover)
- `.tn-action-btn` — base action button
- `.tn-action-discard` — discard tab button
- `.tn-action-close` — save and close button
- `.tn-action-restore` — restore saved/archived tab button

## data-* Attribute Conventions

| Attribute | Values | Element | Effect |
|---|---|---|---|
| `data-stage` | `active`, `discarded`, `saved`, `archived` | `.tn-tab-entry` | CSS selects stage indicator color/icon |
| `data-collapsed` | `"true"`, `"false"` | `.tn-group-card` | CSS shows/hides `.tn-tab-list` |
| `data-group-id` | group key string (e.g., `"dev"`) | `.tn-group-card` | JS lookup reference |
| `data-tab-id` | numeric string tab ID | `.tn-tab-entry` | JS event handler lookup |

## Stage Indicator Rendering

| Stage | CSS Approach | Color/Icon |
|---|---|---|
| `active` | background-color on `.tn-stage-indicator` | #27AE60 green circle (border-radius:50%) |
| `discarded` | background-color on `.tn-stage-indicator` | #2196F3 blue rounded square (border-radius:2px) |
| `saved` | `::before` pseudo-element with Unicode | `\1F516` bookmark emoji |
| `archived` | `::before` pseudo-element with Unicode | `\1F554` clock emoji |

## Decisions Made

- CSS `data-collapsed` attribute chosen over JS-managed class toggle — cleaner CSS selector `[data-collapsed="true"]`, no className string manipulation in JS
- `--group-color` CSS custom property on each card driven by JS `style="--group-color: #hex"` — single style write updates border and color bar simultaneously
- `opacity: 0` / `opacity: 1` for action button hover-reveal — GPU-composited property avoids layout recalculation; transition only `opacity` (not `all`)
- `min-width: 0` on `.tn-tab-info` — required for `text-overflow: ellipsis` to work on flex children; without it, flex item expands past container
- `message-protocol.js` loaded before `sidebar.js` via explicit `<script src>` ordering — establishes message type constants before the controller initializes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- sidebar.html and sidebar.css are frozen as the DOM contract
- Plan 02-04 (sidebar.js controller) can immediately target all IDs and class names defined here
- Plans 02-05 (RAM indicator), 02-06 (group-card.js), 02-07 (tab-entry.js) have clear CSS classes to generate
- No blockers

## Self-Check: PASSED

- sidebar/sidebar.html: FOUND
- sidebar/sidebar.css: FOUND
- .planning/phases/02-sidebar-mvp/02-03-SUMMARY.md: FOUND
- Commit daf043d (Task 1): FOUND
- Commit b49b208 (Task 2): FOUND

---
*Phase: 02-sidebar-mvp*
*Completed: 2026-03-01*
