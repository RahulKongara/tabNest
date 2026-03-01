/**
 * TabNest Grouping Engine — core/grouping-engine.js
 *
 * Classifies tabs into context groups using a 3-step priority chain:
 *   1. User override rules (highest priority)
 *   2. Built-in domain dictionary (CONSTANTS.DOMAIN_DICT)
 *   3. Keyword heuristic scoring (CONSTANTS.KEYWORD_SETS)
 *   4. Fallback: 'other'
 *
 * GROUP-01: Domain dictionary classification
 * GROUP-02: Keyword heuristic scoring
 *
 * All operations are synchronous. No storage access — rules passed as parameter.
 * Classification must complete in < 50ms per tab (SRS §4.1).
 */

(function () {
  'use strict';

  /**
   * Extract and normalize hostname from a URL.
   * Strips www. prefix. Returns empty string for invalid/internal URLs.
   * @param {string} url
   * @returns {string}
   */
  function extractHostname(url) {
    if (!url) return '';
    try {
      const { hostname } = new URL(url);
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
      return '';
    }
  }

  /**
   * Step 3: Score tab text content against keyword sets.
   * Scans the combined text (URL path + title) for each category's keywords.
   * Returns the category with the highest score, or 'other' on tie/zero.
   *
   * @param {string} urlPath - URL path + search string (not hostname)
   * @param {string} title - Tab title
   * @returns {string} groupId
   */
  function classifyByKeywords(urlPath, title) {
    const text = (urlPath + ' ' + (title || '')).toLowerCase();
    if (!text.trim()) return 'other';

    const scores = {};
    let maxScore = 0;

    for (const [groupId, keywords] of Object.entries(CONSTANTS.KEYWORD_SETS)) {
      if (groupId === 'other') continue; // skip the fallback category
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          score += 1;
        }
      }
      scores[groupId] = score;
      if (score > maxScore) maxScore = score;
    }

    if (maxScore === 0) return 'other';

    // Find all categories that share the max score
    const winners = Object.entries(scores).filter(([, s]) => s === maxScore);
    if (winners.length === 1) return winners[0][0];

    // Tie → 'other'
    return 'other';
  }

  /**
   * Classify a tab into a context group.
   *
   * Priority chain:
   *   1. User override rules — exact domain match, highest priority
   *   2. Domain dictionary — CONSTANTS.DOMAIN_DICT exact match
   *   3. Keyword heuristics — score-based on URL path + title
   *   4. Fallback: 'other'
   *
   * @param {string} url - Full tab URL
   * @param {string} title - Tab title
   * @param {Array<{domain: string, groupId: string}>} userRules - User override rules from storage.sync
   * @returns {string} groupId
   */
  function classify(url, title, userRules) {
    if (!url) return 'other';

    const hostname = extractHostname(url);
    if (!hostname) return 'other';

    // Step 1: User override rules (highest priority)
    const rules = Array.isArray(userRules) ? userRules : [];
    for (const rule of rules) {
      if (rule.domain && rule.domain.toLowerCase() === hostname.toLowerCase()) {
        return rule.groupId;
      }
    }

    // Step 2: Built-in domain dictionary
    const dictMatch = CONSTANTS.DOMAIN_DICT[hostname];
    if (dictMatch) return dictMatch;

    // Step 3: Keyword heuristics on URL path + title
    let urlPath = '';
    try {
      const parsed = new URL(url);
      urlPath = parsed.pathname + parsed.search;
    } catch {
      urlPath = url;
    }

    return classifyByKeywords(urlPath, title);
  }

  const GroupingEngine = {
    classify,
    // Exposed for testing
    _extractHostname: extractHostname,
    _classifyByKeywords: classifyByKeywords,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GroupingEngine };
  }
  globalThis.GroupingEngine = GroupingEngine;

})();
