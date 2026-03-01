/**
 * TabNest Grouping Engine
 * Classifies tabs into context groups using:
 *   1. User override rules (from storage.sync) — highest priority
 *   2. Built-in domain dictionary (100+ domains, defined in constants.js)
 *   3. Keyword heuristics on URL path + tab title (score-based, defined in constants.js)
 *   4. Fallback: Other
 *
 * Classification must complete in < 50ms per tab (SRS 4.1).
 *
 * Full implementation: Phase 1, plan 01-05
 */

// STUB — implementation in 01-05
const GroupingEngine = {
  classify(url, title, userRules = []) { return 'other'; },
};

if (typeof module !== 'undefined') {
  module.exports = { GroupingEngine };
} else {
  globalThis.GroupingEngine = GroupingEngine;
}
