/**
 * TabNest Browser Adapter
 * Abstracts all browser API differences between Chrome (MV3) and Firefox (MV2).
 * ALL browser API calls from other modules MUST go through this adapter.
 * No raw chrome.* or browser.* calls are permitted outside this file.
 *
 * Handles:
 *   - chrome.* vs browser.* namespace (Firefox uses browser.*)
 *   - sidePanel (Chrome) vs sidebar_action (Firefox)
 *   - tabs.discard() availability detection
 *   - MV3 service_worker vs MV2 persistent background differences
 *
 * Full implementation: Phase 1, plan 01-02
 */

// STUB — implementation in 01-02
const BrowserAdapter = {};

if (typeof module !== 'undefined') {
  module.exports = { BrowserAdapter };
} else {
  globalThis.BrowserAdapter = BrowserAdapter;
}
