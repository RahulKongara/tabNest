/**
 * TabNest URL Analyzer — core/url-analyzer.js
 * Detects stateful URLs before Stage 3 closure. (DATA-01 / SRS FR-20)
 *
 * Detection signals:
 *   1. SPA hash fragments  (#/ or #!/)
 *   2. Session token query params  (session=, token=, auth=, sid=, UUID)
 *   3. POST-backed pages  (transitionType === 'form_submit')
 *   4. Known dynamic domains  (Figma, Notion, Google Docs, etc.)
 */
(function () {
  'use strict';

  const SPA_HASH_RE      = /#!?\//;
  const SESSION_PARAM_RE = /[?&](session|token|auth|sid)=/i;
  const UUID_RE          = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function getHostname(url) {
    if (!url) return '';
    try {
      const h = new URL(url).hostname;
      return h.startsWith('www.') ? h.slice(4) : h;
    } catch { return ''; }
  }

  /**
   * Determine whether a URL (and its navigation context) signals potential state loss on restore.
   * @param {string|null} url
   * @param {string} transitionType  — chrome.webNavigation transitionType value
   * @returns {boolean}
   */
  function isStateful(url, transitionType) {
    if (!url) return false;

    // 1. POST-backed page (checked first — no URL parse needed)
    if (transitionType === 'form_submit') return true;

    // 2. SPA hash fragment
    if (SPA_HASH_RE.test(url)) return true;

    // 3. Session token or UUID in query string
    const qi = url.indexOf('?');
    if (qi !== -1) {
      const q = url.slice(qi);
      if (SESSION_PARAM_RE.test(q) || UUID_RE.test(q)) return true;
    }

    // 4. Known dynamic domain
    const hostname = getHostname(url);
    if (hostname) {
      const domains = (typeof CONSTANTS !== 'undefined' && Array.isArray(CONSTANTS.DYNAMIC_DOMAINS))
        ? CONSTANTS.DYNAMIC_DOMAINS
        : ['docs.google.com','sheets.google.com','slides.google.com','figma.com',
           'notion.so','airtable.com','miro.com','app.diagrams.net',
           'codepen.io','codesandbox.io','replit.com','stackblitz.com'];
      if (domains.some(d => hostname === d || hostname.endsWith('.' + d))) return true;
    }

    return false;
  }

  const UrlAnalyzer = { isStateful };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UrlAnalyzer };
  }
  globalThis.UrlAnalyzer = UrlAnalyzer;
})();
