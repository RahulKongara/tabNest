---
phase: 03-full-lifecycle
plan: 04
status: complete
completed: "2026-03-02"
---

# Plan 03-04 Summary: Drag-and-Drop + Context Menus

## What Was Built

Full HTML5 drag-and-drop between groups with domain rule persistence, plus right-click context menus for tab entries and group headers:

**Drag-and-Drop:**
- `sidebar/tab-entry.js` — `li.draggable = true`; dragstart encodes `{ tabId, savedId, domain, sourceGroupId }` into `dataTransfer`; visual `.tn-drag-source` class toggled
- `sidebar/group-card.js` — dragover/dragleave/drop on tabList; sends `MOVE_TO_GROUP` with `isFirstDrag: true`; same-group drops are no-ops
- `background.js` MOVE_TO_GROUP handler — handles `savedId` for saved/archived entries; upserts domain rule in `storage.sync USER_RULES` when `isFirstDrag=true` and domain is non-empty

**Context Menus:**
- `sidebar/sidebar.js` — `ContextMenu` singleton (IIFE) with `show(x, y, items)` and `close()`; closes on outside click and Escape key
- Tab entry context menu: Discard, Save & Close (live tabs only), Restore (saved entries only), Move to Group submenu
- Group header context menu: Rename, Change Color, Merge Into submenu, Archive Group, Delete Group (with confirmation dialog)
- Context menu listeners added to `groupList` and `archiveSection` via event delegation

**CSS:**
- `.tn-drag-source`, `.tn-drag-over` — drag visual styles
- `.tn-context-menu`, `.tn-context-item`, `.tn-context-item--disabled`, `.tn-context-separator` — context menu styles

## Files Modified

- `sidebar/tab-entry.js` — draggable + dragstart/dragend
- `sidebar/group-card.js` — dragover/dragleave/drop on tabList (already included in 03-03 implementation)
- `sidebar/sidebar.js` — ContextMenu singleton, handleContextMenu(), wired on groupList and archiveSection
- `sidebar/sidebar.css` — drag and context menu styles appended
- `background.js` — MOVE_TO_GROUP extended for savedId and domain rule upsert (pre-wired)
- `background-firefox.js` — same (pre-wired)

## Requirements Satisfied

- UI-05: Drag-and-drop moves tab between groups; first drag for a domain creates a persistent user override rule in storage.sync
- UI-09: Right-click context menus on tab entries (Discard/Save&Close/Restore/Move to Group) and group headers (Rename/Color/Merge/Archive/Delete)

## Key Decisions

- `isFirstDrag: true` always sent from sidebar on drop — background checks if rule exists and upserts; no pre-flight needed from sidebar
- Context menu closes on `document.addEventListener('click', close, {once: true})` deferred via setTimeout to avoid immediate self-close
- Escape closes context menu via document keydown listener on ContextMenu IIFE init
- Group Rename and Change Color from context menu reuse the existing dblclick/colorBtn click handlers via dispatchEvent/click
