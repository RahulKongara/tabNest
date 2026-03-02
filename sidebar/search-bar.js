/**
 * TabNest Search Bar — sidebar/search-bar.js
 *
 * Real-time search filtering for all lifecycle stages.
 * UI-04: < 100ms for 200 entries per keystroke.
 *
 * Pattern: IIFE + globalThis.SearchBar export.
 * Pure filter() function — no DOM side effects; wiring is in sidebar.js.
 */

(function () {
  'use strict';

  /**
   * Filter tabs, savedEntries, and groups by a search query.
   * Matching is case-insensitive. Matches on title, URL, or group name.
   * Empty query returns everything unchanged (no allocation — fast path).
   *
   * @param {string} query - The search string typed by the user
   * @param {TabEntry[]} tabs - Active and discarded live tabs
   * @param {SavedTabEntry[]} savedEntries - Saved and archived entries
   * @param {TabGroup[]} groups - All groups (for group-name matching)
   * @returns {{ tabs: TabEntry[], savedEntries: SavedTabEntry[], groups: TabGroup[], matchCount: number }}
   */
  function filter(query, tabs, savedEntries, groups) {
    // Fast path: empty query — return originals, zero allocation
    if (!query || !query.trim()) {
      return {
        tabs,
        savedEntries,
        groups,
        matchCount: tabs.length + savedEntries.length,
      };
    }

    const q = query.trim().toLowerCase();

    // Build a set of group IDs whose name matches the query
    // This allows "filter by group name" to surface all entries in that group
    const matchingGroupIds = new Set();
    for (const g of groups) {
      if (g.name && g.name.toLowerCase().includes(q)) {
        matchingGroupIds.add(g.id);
      }
    }

    // Filter live tabs
    const filteredTabs = tabs.filter(t =>
      (t.title  && t.title.toLowerCase().includes(q)) ||
      (t.url    && t.url.toLowerCase().includes(q))   ||
      matchingGroupIds.has(t.groupId)
    );

    // Filter saved/archived entries
    const filteredSaved = savedEntries.filter(s =>
      (s.title  && s.title.toLowerCase().includes(q)) ||
      (s.url    && s.url.toLowerCase().includes(q))   ||
      matchingGroupIds.has(s.groupId)
    );

    // Only include groups that have at least one matching entry visible
    const usedGroupIds = new Set([
      ...filteredTabs.map(t => t.groupId),
      ...filteredSaved.map(s => s.groupId),
    ]);
    const filteredGroups = groups.filter(g => usedGroupIds.has(g.id));

    return {
      tabs:         filteredTabs,
      savedEntries: filteredSaved,
      groups:       filteredGroups,
      matchCount:   filteredTabs.length + filteredSaved.length,
    };
  }

  globalThis.SearchBar = { filter };
})();
