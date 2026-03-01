/**
 * TabNest Constants
 * Default settings, group definitions, domain dictionary, keyword sets.
 * Full implementation: Phase 1, plan 01-02
 */

// STUB — full content in 01-02
const CONSTANTS = {
  DEFAULT_T1_MS: 5 * 60 * 1000,
  DEFAULT_T2_MS: 15 * 60 * 1000,
  DEFAULT_T3_MS: 7 * 24 * 60 * 60 * 1000,
  ALARM_NAME: 'tabnest-lifecycle-tick',
  ALARM_PERIOD_MINUTES: 0.5,
  DEFAULT_GROUPS: [],
  DOMAIN_DICT: {},
  KEYWORD_SETS: {},
};

if (typeof module !== 'undefined') {
  module.exports = { CONSTANTS };
} else {
  globalThis.CONSTANTS = CONSTANTS;
}
