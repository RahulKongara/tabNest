/**
 * TabNest Lifecycle Manager
 * Manages the 4-stage tab lifecycle pipeline via chrome.alarms API.
 * Alarm name: 'tabnest-lifecycle-tick', period: 30 seconds.
 *
 * Pipeline: Stage1 (Active) -> Stage2 (Discarded) -> Stage3 (Saved) -> Stage4 (Archived)
 * Thresholds: T1=5min, T2=15min, T3=7days (configurable via constants.js)
 *
 * Full implementation: Phase 1, plan 01-04
 */

// STUB — implementation in 01-04
const LifecycleManager = {
  start() {},
  async tick(tabRegistry, settings) {},
  isExempt(tab) { return { exempt: false, reason: '' }; },
};

if (typeof module !== 'undefined') {
  module.exports = { LifecycleManager };
} else {
  globalThis.LifecycleManager = LifecycleManager;
}
