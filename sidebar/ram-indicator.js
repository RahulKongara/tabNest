/**
 * TabNest RAM Indicator — sidebar/ram-indicator.js
 *
 * Computes estimated RAM savings from discarded (Stage 2) and saved/archived (Stage 3/4) tabs.
 * UI-06: Stage 2 × 150MB + Stage 3/4 × 200MB
 */
(function () {
  'use strict';

  /**
   * Compute total estimated RAM savings in MB.
   * @param {TabEntry[]} tabs — active + discarded entries from tabRegistry
   * @param {SavedTabEntry[]} savedEntries — saved + archived entries
   * @returns {number} MB saved
   */
  function computeRamMB(tabs, savedEntries) {
    const discardedCount = (tabs || []).filter(t => t.stage === 'discarded').length;
    const savedCount = (savedEntries || []).filter(e => e.stage === 'saved' || e.stage === 'archived').length;
    return (discardedCount * 150) + (savedCount * 200);
  }

  /**
   * Format MB as human-readable string.
   * @param {number} mb
   * @returns {string} e.g. "~750MB RAM saved" or "~1.5GB RAM saved" or ""
   */
  function formatRam(mb) {
    if (mb <= 0) return '';
    if (mb >= 1024) return `~${(mb / 1024).toFixed(1)}GB RAM saved`;
    return `~${mb}MB RAM saved`;
  }

  /**
   * Update the RAM badge in the sidebar header.
   * @param {TabEntry[]} tabs
   * @param {SavedTabEntry[]} savedEntries
   */
  function update(tabs, savedEntries) {
    const el = document.getElementById('tn-ram-indicator');
    if (!el) return;
    const mb = computeRamMB(tabs, savedEntries);
    el.textContent = formatRam(mb);
    el.title = mb > 0 ? `${mb}MB estimated RAM freed` : 'No RAM savings yet';
    el.style.display = mb > 0 ? '' : 'none';
  }

  globalThis.RamIndicator = { computeRamMB, formatRam, update };
})();
