/**
 * TabNest URL Analyzer
 * Detects stateful URLs before Stage 3 closure.
 * Sets isStatefulUrl flag on SavedTabEntry.
 *
 * Detects:
 *   - SPA hash fragments (#/ or #!/)
 *   - Session token query params (session=, token=, auth=, sid=, UUIDs)
 *   - POST-backed pages (via webNavigation transitionType tracking)
 *   - Known dynamic domains (Google Sheets, Figma, Notion, Airtable, etc.)
 *
 * Full implementation: Phase 4, plan 04-01
 */

// STUB — implementation in Phase 4
const UrlAnalyzer = {
  isStateful(url, transitionType = '') { return false; },
};

if (typeof module !== 'undefined') {
  module.exports = { UrlAnalyzer };
} else {
  globalThis.UrlAnalyzer = UrlAnalyzer;
}
