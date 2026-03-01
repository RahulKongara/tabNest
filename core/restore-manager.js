/**
 * TabNest Restore Manager
 * Implements all three smart restore strategies:
 *   - Hover pre-render (500ms delay, RESTORE-02)
 *   - Staggered batch restore (batchSize=3, 500ms gaps, RESTORE-03)
 *   - Lazy restore on Chromium (discarded: true, RESTORE-04)
 *
 * Full implementation: Phase 4, plan 04-04
 */

// STUB — implementation in Phase 4
const RestoreManager = {
  async restoreTab(savedTabEntry) {},
  async restoreWorkspace(workspaceSnapshot, batchSize = 3) {},
};

if (typeof module !== 'undefined') {
  module.exports = { RestoreManager };
} else {
  globalThis.RestoreManager = RestoreManager;
}
