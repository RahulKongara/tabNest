# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TabNest** is a cross-browser extension (Chrome, Edge, Brave, Firefox) that automatically manages tabs through a 4-stage lifecycle pipeline. The project is currently in the **specification/scaffold phase** — no source code exists yet. All requirements are defined in `Reference Docs/PRD.md` and `Reference Docs/SRS Doc.md`.

## Planned Commands

Once implemented, the build system will use:

```bash
bash build/build.sh        # Generate browser-specific packages (Chrome/Edge/Brave vs. Firefox)
```

Testing framework is TBD (80%+ coverage target per SRS §4.6).

## Architecture

### 4-Layer Architecture

```
Background Service Worker  ←→  Sidebar UI
         ↑↓                        ↑↓
   Content Scripts           Storage Layer
```

**1. Background Layer** (`background.js` / `background-firefox.js`)
- Listens to all tab lifecycle events (`onCreated`, `onUpdated`, `onRemoved`, `onActivated`, `onMoved`, etc.)
- Runs a 30-second alarm tick to advance tabs through the lifecycle pipeline
- Orchestrates: grouping engine, storage, discard/close operations, cross-browser adapter

**2. Sidebar UI Layer** (`sidebar/`)
- Communicates with background exclusively via `chrome.runtime` messages
- Renders a unified view blending all lifecycle stages into group cards
- Uses lazy/virtualized rendering for performance (p95 < 200ms with 200 entries)
- Modular components: `group-card.js`, `tab-entry.js`, `color-picker.js`, `workspace-manager.js`, etc.

**3. Content Script Layer** (`content/`)
- `form-detector.js` — lightweight unsaved form detection (blocks premature tab closure)
- `history-capture.js` — captures navigation history before closure
- Must be minimal to avoid performance impact on managed pages

**4. Storage Layer**
- `storage.sync` (100KB total, 8KB/item): user preferences, group metadata (names/colors/order), domain rules, keyboard shortcuts
- `storage.local` (10MB default): tab snapshots, saved tab entries, navigation history (max 20 URLs/tab), workspace snapshots (max 20), 30s session checkpoint

### Core Modules (`core/`)

| Module | Responsibility |
|--------|---------------|
| `browser-adapter.js` | Abstracts Chrome vs. Firefox API differences |
| `lifecycle-manager.js` | 4-stage pipeline with 30s alarm ticks |
| `grouping-engine.js` | Domain dictionary + keyword heuristics classifier |
| `storage-manager.js` | Read/write to sync & local, quota handling |
| `restore-manager.js` | Hover pre-render, batch restore, lazy restore |
| `url-analyzer.js` | Detects stateful URLs (SPA, session tokens, POST-backed) |
| `constants.js` | Default settings, domain dictionary, keyword sets |

### Hybrid Lifecycle Pipeline (Central Logic)

Tabs advance based on `(now - lastActiveTimestamp)` checked every 30 seconds:

```
Stage 1 (Active)  →[T1 minutes inactive]→  Stage 2 (Discarded)
                                              ↓ [T2 minutes inactive]
                                           Stage 3 (Saved & Closed)
                                              ↓ [T3 days saved]
                                           Stage 4 (Archived)
```

- **Stage 2**: `tabs.discard()` unloads renderer (~150MB saved), tab stays in bar, instant restore on click
- **Stage 3**: Snapshot captured, tab closed, appears as saved link in sidebar (~200MB saved)
- **Stage 4**: Saved link moved to collapsible Archive section after T3 days (default: 7)

**Lifecycle exemptions** (tabs never automatically discarded/closed): pinned, audible, has unsaved form data, currently active, whitelisted domain, already saved/internal pages

### Message Protocol

**Sidebar → Background** (23 message types including): `GET_FULL_STATE`, `DISCARD_TAB`, `SAVE_AND_CLOSE_TAB`, `RESTORE_TAB`, `MOVE_TO_GROUP`, `CREATE_GROUP`, `RENAME_GROUP`, `SET_GROUP_COLOR`, `SAVE_WORKSPACE`, `RESTORE_WORKSPACE`

**Background → Sidebar** (9 push types including): `TAB_CREATED`, `TAB_DISCARDED`, `TAB_SAVED_AND_CLOSED`, `GROUP_UPDATED`, `SETTINGS_CHANGED`

**Content → Background** (2 types): `FORM_STATE_REPORT`, `NAV_HISTORY_REPORT`

### Cross-Browser Strategy

- **Chromium (Chrome/Edge/Brave)**: Manifest V3, Service Worker background, `tabs.discard()` available
- **Firefox 109+**: Manifest V2, persistent background script, Stage 2 gracefully skipped if `tabs.discard()` unavailable
- **Opera**: Limited `sidebar_action` support (P1 target)
- All browser differences abstracted through `core/browser-adapter.js`

### Smart Restore Strategies

- **Hover pre-render**: Create tab in background after 500ms hover; activate on click, close if user moves away
- **Staggered batch restore**: Open 3 tabs at a time with 500ms delays between batches
- **Lazy restore** (Chromium only): Create tab with `discarded: true` — appears in bar but doesn't load until clicked

## Key Specifications

Full details live in the reference docs:
- `Reference Docs/PRD.md` — product vision, personas, competitive analysis, 8-week release plan, success metrics
- `Reference Docs/SRS Doc.md` — IEEE 830-compliant functional/non-functional requirements, full data schemas, API contracts, acceptance criteria

### Performance Targets (SRS §4.1)

- Sidebar initial render: < 200ms (p95 with 200 entries)
- Tab classification: < 50ms
- Discard operation: < 100ms
- Save & Close: < 500ms
- Background memory footprint: < 50MB

### Data Schemas

**TabEntry** (active/discarded): `tabId`, `url`, `title`, `favicon`, `groupId`, `stage`, `lastActiveTimestamp`, `createdAt`, `isStateful`, `isPinned`, `isAudible`

**SavedTabEntry** (saved/archived): `savedId`, `url`, `title`, `favicon`, `groupId`, `stage` (3 or 4), `savedAt`, `navigationHistory[]`, `isStateful`

**TabGroup**: `groupId`, `name`, `color`, `order`, `isCollapsed`, `domainRules[]`

**WorkspaceSnapshot**: `workspaceId`, `name`, `createdAt`, `groups[]`, `tabEntries[]`, `savedEntries[]`

## Release Plan

| Phase | Version | Scope |
|-------|---------|-------|
| Alpha | v0.1 | Core grouping + sidebar UI + Stage 1/3 lifecycle (Chrome only) |
| Beta  | v0.5 | Stage 2 (discard) + Stage 4 (archive) + persistence + Edge/Brave |
| RC    | v0.9 | Firefox support, smart restore, keyboard shortcuts, settings |
| GA    | v1.0 | Polish, workspace snapshots, store submission |
