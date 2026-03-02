/**
 * TabNest Lifecycle Manager — core/lifecycle-manager.js
 *
 * Manages the 4-stage tab lifecycle pipeline.
 * Called by background.js on every 30-second alarm tick.
 *
 * LIFE-03: 30-second alarm evaluation of all tabs
 * LIFE-07: Exception rules (pinned, audible, active, whitelisted, internal, form)
 *
 * Phase 1 scope:
 *   - Stage 1→2 (Discard): Calls BrowserAdapter.tabs.discard() — ACTIVE in Phase 1
 *   - Stage 2→3 (Save & Close): Identified and logged — WIRED in Phase 3
 *   - Stage 3→4 (Archive): Identified and logged — WIRED in Phase 3
 */

(function () {
  'use strict';

  /**
   * Get the hostname from a URL, without www. prefix.
   * @param {string} url
   * @returns {string} hostname or empty string
   */
  function getHostname(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
      return '';
    }
  }

  /**
   * Check if a tab entry is exempt from lifecycle transitions.
   *
   * Called synchronously inside the tick() loop.
   *
   * @param {TabEntry} entry - Tab registry entry
   * @param {object} settings - Current user settings (t1Minutes, t2Minutes, whitelist, etc.)
   * @param {number[]} activeTabIds - Tab IDs currently active (one per window)
   * @param {'stage1to2'|'stage2to3'|'stage3to4'} transitionType - Which transition to check
   * @returns {{ exempt: boolean, reason: string }}
   */
  function isExempt(entry, settings, activeTabIds, transitionType) {
    transitionType = transitionType || 'stage1to2';

    // 1. Internal pages — never managed
    if (entry.isInternal) {
      return { exempt: true, reason: 'internal' };
    }

    // 2. Currently active tab — always Stage 1
    if (activeTabIds.includes(entry.tabId)) {
      return { exempt: true, reason: 'active' };
    }

    // 3. Already saved or archived — not re-processed
    if (entry.stage === CONSTANTS.STAGE.SAVED || entry.stage === CONSTANTS.STAGE.ARCHIVED) {
      return { exempt: true, reason: 'already-saved' };
    }

    // 4. Audible tabs — stay Stage 1 while audio is playing
    if (entry.isAudible) {
      return { exempt: true, reason: 'audible' };
    }

    // 5. Tabs with unsaved form data (set by content script in Phase 4)
    if (entry.hasUnsavedForm) {
      return { exempt: true, reason: 'form-data' };
    }

    // 6. Pinned tabs — can reach Stage 2 (discard) but NEVER Stage 3 (close)
    if (entry.isPinned && transitionType === 'stage2to3') {
      return { exempt: true, reason: 'pinned-no-close' };
    }

    // 7. Whitelisted domains — max Stage 2 (same rule as pinned for Stage 3)
    const hostname = getHostname(entry.url);
    const whitelist = settings.whitelist || [];
    if (whitelist.includes(hostname) && transitionType === 'stage2to3') {
      return { exempt: true, reason: 'whitelisted' };
    }
    // Whitelisted tabs can still be discarded (Stage 2 is fine)

    return { exempt: false, reason: '' };
  }

  /**
   * Query the browser for currently active tab IDs (one per window).
   * Must be called at the START of each tick to get accurate active state.
   * @returns {Promise<number[]>}
   */
  async function getActiveTabIds() {
    try {
      const activeTabs = await BrowserAdapter.tabs.query({ active: true });
      return activeTabs.map(t => t.id);
    } catch {
      return [];
    }
  }

  /**
   * Process a single tick of the lifecycle engine.
   * Evaluates all tabs in the registry against T1/T2/T3 thresholds.
   *
   * Phase 1 behavior:
   *   Stage 1→2: Calls BrowserAdapter.tabs.discard(tabId) if T1 exceeded and not exempt
   *   Stage 2→3: Logs candidates (actual close/snapshot in Phase 3)
   *   Stage 3→4: Logs candidates (actual archive update in Phase 3)
   *
   * @param {Map} tabRegistry - The in-memory tab registry from background.js
   * @param {object} settings - Current settings object (t1Minutes, t2Minutes, t3Days, whitelist)
   */
  async function tick(tabRegistry, settings, pushCallback, saveAndCloseCallback) {
    const now = Date.now();
    const t1Ms = (settings.t1Minutes || CONSTANTS.DEFAULT_SETTINGS.t1Minutes) * 60 * 1000;
    const t2Ms = (settings.t2Minutes || CONSTANTS.DEFAULT_SETTINGS.t2Minutes) * 60 * 1000;

    const _push = (typeof pushCallback === 'function') ? pushCallback : function() {};
    const _saveAndClose = (typeof saveAndCloseCallback === 'function') ? saveAndCloseCallback : function() {};

    const activeTabIds = await getActiveTabIds();

    const stage1to2Candidates = [];
    const stage2to3Candidates = [];

    for (const [tabId, entry] of tabRegistry) {
      const idleMs = now - entry.lastActiveTimestamp;

      // ── Stage 1 → 2 (Discard) ──────────────────────────────────────────────
      if (entry.stage === CONSTANTS.STAGE.ACTIVE && idleMs > t1Ms) {
        const { exempt } = isExempt(entry, settings, activeTabIds, 'stage1to2');
        if (!exempt) {
          stage1to2Candidates.push({ tabId, entry, idleMs });
        }
      }

      // ── Stage 2 → 3 (Save & Close) ─────────────────────────────────────────
      if (entry.stage === CONSTANTS.STAGE.DISCARDED && idleMs > t2Ms) {
        const { exempt } = isExempt(entry, settings, activeTabIds, 'stage2to3');
        if (!exempt) {
          stage2to3Candidates.push({ tabId, entry, idleMs });
        }
      }

      // ── Stage 3 → 4 (Archive) ──────────────────────────────────────────────
      // Handled via savedEntries in Phase 3. No tabRegistry entries for Stage 3+.
    }

    // ── Process Stage 1→2 transitions ──────────────────────────────────────────
    for (const { tabId, entry, idleMs } of stage1to2Candidates) {
      if (BrowserAdapter.features.canDiscard) {
        try {
          await BrowserAdapter.tabs.discard(tabId);
          entry.stage = CONSTANTS.STAGE.DISCARDED;
          console.log(`[TabNest] Tab discarded (Stage 2): tabId=${tabId} url=${entry.url}`);
          const TYPE_DISCARDED = (typeof MSG_TYPES !== 'undefined') ? MSG_TYPES.TAB_DISCARDED : 'TAB_DISCARDED';
          _push(TYPE_DISCARDED, { entry });
        } catch (err) {
          console.warn(`[TabNest] Failed to discard tabId=${tabId}:`, err.message);
          // Leave in Stage 1; retry on next tick
        }
      } else {
        // No discard API — tab can advance directly to Stage 3 when T2 threshold reached
        if (idleMs > t2Ms) {
          const { exempt: exempt3 } = isExempt(entry, settings, activeTabIds, 'stage2to3');
          if (!exempt3) {
            console.log(`[TabNest] Stage 1→3 (no-discard path) candidate: tabId=${tabId}`);
            // Phase 3 wires actual save+close here
          }
        }
      }
    }

    // ── Process Stage 2→3 transitions ──────────────────────────────────────────
    for (const { tabId, entry } of stage2to3Candidates) {
      await _saveAndClose(tabId, entry);
      tabRegistry.delete(tabId);
      console.log(`[TabNest] Stage 2→3 (Save & Close): tabId=${tabId} url=${entry.url}`);
    }

    if (stage1to2Candidates.length > 0 || stage2to3Candidates.length > 0) {
      console.log(`[TabNest] Tick complete: ${stage1to2Candidates.length} discard candidates, ` +
                  `${stage2to3Candidates.length} save candidates, ` +
                  `${tabRegistry.size} total tabs tracked`);
    }
  }

  const LifecycleManager = {
    tick,
    isExempt,
    getActiveTabIds,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LifecycleManager };
  }
  globalThis.LifecycleManager = LifecycleManager;

})();
