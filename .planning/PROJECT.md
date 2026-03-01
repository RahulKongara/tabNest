# TabNest

## What This Is

TabNest is a cross-browser extension (Chrome, Edge, Brave, Firefox) that automatically organizes browser tabs into intelligent, color-coded context groups and manages them through a four-stage lifecycle pipeline: Active → Discarded → Saved & Closed → Archived. The extension provides a persistent unified sidebar that blends live open tabs and saved links into one seamless workspace view, so users never need to manually organize, close, or remember tabs.

## Core Value

Zero-effort tab hygiene — the browser workspace automatically stays organized, RAM-efficient, and session-persistent without the user doing anything.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Auto-classify new tabs into 10 default context groups (Dev, Work, Social, Shopping, Entertainment, News, Research, Finance, Lifestyle, Other) using domain dictionary + keyword heuristics
- [ ] 4-stage hybrid lifecycle: Active (T1=5min) → Discarded via tabs.discard() (T2=15min) → Saved & Closed → Archived (T3=7days)
- [ ] Persistent sidebar panel blending all lifecycle stages in grouped cards
- [ ] Session persistence: restore groups and saved links on browser restart
- [ ] Smart restore: hover pre-render (500ms), staggered batch restore, lazy restore on Chromium
- [ ] Lifecycle exceptions: pinned, audible, whitelisted domains, active form input, browser-internal pages
- [ ] User group management: create, rename, color, delete, merge, archive groups
- [ ] Drag-and-drop tab reassignment with persistent domain → group rule creation
- [ ] Named workspace snapshots (save/restore full sessions, max 20)
- [ ] Stateful URL detection (SPA hash, session tokens, POST-backed pages) with ⚠️ indicator
- [ ] Configurable settings: T1/T2/T3 timers, whitelist, batch size, keyboard shortcuts
- [ ] Cross-browser support: Chrome/Edge/Brave (MV3) + Firefox 109+ (MV2) with graceful Stage 2 fallback
- [ ] Navigation history capture before Stage 3 closure (max 20 URLs/tab)
- [ ] Form state detection (blocks Stage 2/3 for tabs with unsaved input)
- [ ] RAM savings indicator in sidebar header
- [ ] Full keyboard navigation + ARIA accessibility (WCAG 2.1 AA)

### Out of Scope

- AI/ML-based tab grouping — planned for v2.0
- Cloud sync of saved tabs/workspaces across devices — planned for v2.0
- Safari extension wrapper — WebKit Xcode wrapper out of scope for v1.0
- Tab sharing / collaborative group features — not part of v1 vision
- Integration with external tools (Notion, Slack, etc.) — deferred
- Mobile browser support — desktop-first
- Full page screenshot capture for saved links — storage/complexity cost

## Context

The extension targets power users, developers, researchers, and knowledge workers who routinely have 20–100+ tabs open. Three primary personas:
- **Research Rachel:** 30–60 tabs across research sessions, needs separate research threads, expects resume-exactly behavior
- **Dev Darren:** 20–40 tabs (GitHub, Stack Overflow, docs, Jira), RAM-constrained due to IDE/Docker
- **Multitask Maya:** Social/analytics/content dashboards, uses workspace snapshots for recurring weekly setups

No existing tool combines all three: auto-grouping + graduated lifecycle management + unified live+saved sidebar. Chrome Tab Groups offers only visual organization (no RAM savings). Memory Saver discards but no sidebar or grouping. OneTab saves all tabs but loses live awareness and has no auto-grouping.

## Constraints

- **Browser API:** MV3 for Chromium (service worker, non-persistent — must reinitialize from storage on wake). MV2 for Firefox.
- **Storage:** `storage.sync` capped at 100KB total / 8KB per item. `storage.local` 10MB default.
- **Sidebar width:** Browser-controlled, responsive 300px–500px.
- **tabs.discard():** On unsupported browsers Stage 2 is skipped — T1 extends to T2 value.
- **Performance:** Sidebar < 200ms with 200 entries, classification < 50ms, background worker < 10MB RSS.
- **Privacy:** Zero network requests, no analytics, no third-party scripts, local-only processing.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid lifecycle (discard first, then close) | Discard preserves page state for recent tabs; close frees RAM for long-idle tabs — best of both | — Pending |
| Sidebar as primary UI (not popup) | Power users need persistent workspace view, not a temporary popup | — Pending |
| storage.sync for preferences + storage.local for data | Sync keeps settings across devices within 100KB; local handles large tab data | — Pending |
| No cloud dependency | Privacy differentiator; no auth complexity; works offline | — Pending |
| Vanilla JS (no framework) | Extension performance, minimal bundle size, no framework churn | — Pending |
| Cross-browser adapter pattern | Single shared codebase with thin adapter vs. two separate codebases | — Pending |

---
*Last updated: 2026-03-01 after initialization*
