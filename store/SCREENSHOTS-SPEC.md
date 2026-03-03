# TabNest — Screenshot Specification

**Required:** 1280x800 pixels (preferred) or 640x400 pixels
**Format:** PNG or JPEG
**Count:** 5 screenshots
**Capture context:** Chrome 114+ with TabNest sidebar open at 380px width

---

## Screenshot 1: Unified Sidebar Overview

**Filename:** `screenshot-01-sidebar-overview.png`
**Dimensions:** 1280x800
**Caption:** "All your tabs, organized automatically — open, saved, and archived in one view"

**What to show:**
- Browser window with 6-8 browser tabs in the tab bar
- TabNest sidebar open (380px wide) on the right side
- 3 group cards visible: Dev (blue), Work (orange), Social (pink)
- Dev group expanded: 2 active tabs (green dot), 1 discarded tab (blue dot), 3 saved links
- Work group expanded: 1 active tab, 2 saved links
- Social group collapsed (showing count badge only)
- Sidebar header showing "Saving ~1.4 GB" RAM indicator
- Footer showing tab count (e.g., "22 tabs: 4 active · 2 discarded · 12 saved · 4 archived")

**Notes:** Use real-looking tab content (GitHub, Stack Overflow, Google Docs, Twitter, Amazon).

---

## Screenshot 2: Lifecycle Stage Indicators

**Filename:** `screenshot-02-lifecycle-stages.png`
**Dimensions:** 1280x800
**Caption:** "4 automatic stages: Active, Discarded, Saved, Archived — fully configurable"

**What to show:**
- Close-up of a single group card (Dev group) with 4 tab entries, one per lifecycle stage:
  1. Green dot — "GitHub: Pull Requests" (Stage 1 Active)
  2. Blue dot (dimmed favicon) — "Stack Overflow: How to..." (Stage 2 Discarded)
  3. Bookmark icon — "MDN Web Docs: Array.prototype" (Stage 3 Saved)
  4. Clock icon — "W3Schools: CSS Grid" (Stage 4 Archived)
- The stateful URL warning badge on one saved link

**Notes:** The 4-stage lifecycle is the core differentiator.

---

## Screenshot 3: Settings Panel

**Filename:** `screenshot-03-settings-panel.png`
**Dimensions:** 1280x800
**Caption:** "Configure every detail: lifecycle timers, behavior toggles, whitelist, keyboard shortcuts"

**What to show:**
- Settings overlay open (full sidebar width)
- Lifecycle Timers section: T1 slider at 5 min, T2 at 15 min, T3 at 7 days
- Behavior section: Auto-group ON, Hover pre-render ON
- One or two domains in the Whitelist section (e.g., gmail.com, slack.com)

---

## Screenshot 4: Workspace Snapshots

**Filename:** `screenshot-04-workspaces.png`
**Dimensions:** 1280x800
**Caption:** "Save named workspace snapshots and restore them with one click"

**What to show:**
- Workspaces section in the sidebar
- 3 saved workspaces: "Monday Morning", "Thesis Research", "Client Pitch Prep"
- Each workspace showing creation date and tab count
- One workspace with Restore button highlighted

---

## Screenshot 5: Search and Filter

**Filename:** `screenshot-05-search.png`
**Dimensions:** 1280x800
**Caption:** "Instant search across all tabs — open, saved, and archived — in real time"

**What to show:**
- Search input with "github" typed
- Filtered results: 2 active tabs, 1 saved link (all in Dev group)
- Result count shown (e.g., "3 results")
- Search input has keyboard focus indicator ring

**Notes:** Emphasize cross-stage search — show both an active tab AND a saved link.

---

## Production Notes

- Capture at 2x resolution (2560x1600), scale down to 1280x800 for submission.
- Use a dark browser theme to match TabNest's dark sidebar color scheme.
- Avoid showing any personal account information in browser tabs.
- All screenshots should use the same browser window size for consistency.
