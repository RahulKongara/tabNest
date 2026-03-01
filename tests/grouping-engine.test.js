/**
 * Tests for core/grouping-engine.js
 * Run with: node tests/grouping-engine.test.js
 *
 * Tests the 3-step priority chain:
 *   1. User override rules (highest priority)
 *   2. Built-in domain dictionary (CONSTANTS.DOMAIN_DICT)
 *   3. Keyword heuristic scoring (CONSTANTS.KEYWORD_SETS)
 *   4. Fallback: 'other'
 *
 * GROUP-01: Domain dictionary classification
 * GROUP-02: Keyword heuristic scoring
 */

// Load dependencies via globalThis pattern (no bundler needed)
require('../core/constants.js');
require('../core/grouping-engine.js');

const GE = global.GroupingEngine;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  PASS:', message);
  } else {
    failed++;
    console.error('  FAIL:', message);
  }
}

function assertEqual(actual, expected, message) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log('  PASS:', message, `(got "${actual}")`);
  } else {
    failed++;
    console.error('  FAIL:', message, `— expected "${expected}", got "${actual}"`);
  }
}

// ─── Step 1: User Override Rules ──────────────────────────────────────────────
console.log('\nStep 1: User override rules (highest priority)');

assertEqual(
  GE.classify('https://github.com', 'GitHub', [{ domain: 'github.com', groupId: 'work' }]),
  'work',
  'User override for github.com → work (beats domain dict)'
);

assertEqual(
  GE.classify('https://youtube.com', 'YouTube', [{ domain: 'youtube.com', groupId: 'research' }]),
  'research',
  'User override for youtube.com → research (beats domain dict entertainment)'
);

assertEqual(
  GE.classify('https://totally-unknown.xyz', 'Random', [{ domain: 'totally-unknown.xyz', groupId: 'work' }]),
  'work',
  'User override for unknown domain → work'
);

// ─── Step 2: Domain Dictionary ────────────────────────────────────────────────
console.log('\nStep 2: Domain dictionary classification (GROUP-01)');

assertEqual(
  GE.classify('https://github.com/user/repo', 'My Repo - GitHub', []),
  'dev',
  'github.com → dev (domain dict)'
);

assertEqual(
  GE.classify('https://www.github.com/org/repo', 'My Repo', []),
  'dev',
  'www.github.com → dev (www. stripped)'
);

assertEqual(
  GE.classify('https://mail.google.com/mail/u/0/', 'Inbox - Gmail', []),
  'work',
  'mail.google.com → work (domain dict)'
);

assertEqual(
  GE.classify('https://twitter.com/home', 'Twitter Home', []),
  'social',
  'twitter.com → social (domain dict)'
);

assertEqual(
  GE.classify('https://amazon.com/cart', 'Cart - Amazon', []),
  'shopping',
  'amazon.com → shopping (domain dict)'
);

assertEqual(
  GE.classify('https://netflix.com/browse', 'Netflix', []),
  'entertainment',
  'netflix.com → entertainment (domain dict)'
);

assertEqual(
  GE.classify('https://bbc.com/news', 'BBC News', []),
  'news',
  'bbc.com → news (domain dict)'
);

assertEqual(
  GE.classify('https://arxiv.org/abs/1234', 'Paper Abstract', []),
  'research',
  'arxiv.org → research (domain dict)'
);

assertEqual(
  GE.classify('https://robinhood.com/stocks', 'Portfolio', []),
  'finance',
  'robinhood.com → finance (domain dict)'
);

assertEqual(
  GE.classify('https://allrecipes.com/recipe', 'Recipe', []),
  'lifestyle',
  'allrecipes.com → lifestyle (domain dict)'
);

assertEqual(
  GE.classify('https://notion.so/workspace', 'Workspace', []),
  'work',
  'notion.so → work (domain dict)'
);

// ─── Step 3: Keyword Heuristics ───────────────────────────────────────────────
console.log('\nStep 3: Keyword heuristic scoring (GROUP-02)');

assertEqual(
  GE.classify('https://unknown-ci.com/api/deploy/pipeline', 'Deploy Pipeline Dashboard', []),
  'dev',
  'Unknown domain with api+deploy+pipeline → dev (keyword scoring)'
);

assertEqual(
  GE.classify('https://unknown-random-domain.com/api/deploy', 'Deploy Pipeline Dashboard', []),
  'dev',
  'Unknown domain with deploy+api+pipeline keywords → dev'
);

assertEqual(
  GE.classify('https://random-store.com/cart/checkout', 'Shopping Cart - Checkout', []),
  'shopping',
  'Unknown domain with cart+checkout → shopping (keyword scoring)'
);

assertEqual(
  GE.classify('https://internal-tool.company.com/dashboard/kanban', 'Kanban Dashboard - Project', []),
  'work',
  'Unknown domain with kanban+dashboard+project → work (keyword scoring)'
);

// ─── Fallback ─────────────────────────────────────────────────────────────────
console.log('\nStep 4: Fallback to "other"');

assertEqual(
  GE.classify('https://totally-unknown.xyz', 'Random Page', []),
  'other',
  'Unknown domain, no keyword match → other'
);

assertEqual(
  GE.classify('https://totally-unknown.xyz/zzz', 'Random Unmatched Page', []),
  'other',
  'Unknown domain, generic title → other'
);

assertEqual(
  GE.classify('', 'New Tab', []),
  'other',
  'Empty URL → other'
);

assertEqual(
  GE.classify('chrome://newtab/', 'New Tab', []),
  'other',
  'chrome:// internal URL → other (no hostname match)'
);

// ─── Tie-breaking ─────────────────────────────────────────────────────────────
console.log('\nTie-breaking (tied scores → other)');

// "review" appears in both shopping and lifestyle keyword sets
// "health" appears in both news and lifestyle
// Find a URL that scores equally for two categories
assertEqual(
  GE.classify('https://unknown.example.com/review/health', 'Health Review', []),
  'other',
  'Keywords matching multiple categories equally → other (tie)'
);

// ─── Edge cases ───────────────────────────────────────────────────────────────
console.log('\nEdge cases');

assertEqual(
  GE.classify(null, 'Title', []),
  'other',
  'null URL → other'
);

assertEqual(
  GE.classify(undefined, 'Title', []),
  'other',
  'undefined URL → other'
);

assertEqual(
  GE.classify('not-a-url', 'Title', []),
  'other',
  'Invalid URL with no hostname → other'
);

// ─── Performance ──────────────────────────────────────────────────────────────
console.log('\nPerformance (SRS §4.1: < 50ms for 100 classifications)');

const urls = Array.from({ length: 100 }, (_, i) => 'https://github.com/repo' + i);
const t0 = Date.now();
urls.forEach(u => GE.classify(u, 'Title ' + Math.random(), []));
const elapsed = Date.now() - t0;

assert(elapsed < 50, `100 classifications in ${elapsed}ms < 50ms`);

// ─── Internal API exposure ────────────────────────────────────────────────────
console.log('\nInternal API');

assert(typeof GE._extractHostname === 'function', '_extractHostname exposed');
assert(typeof GE._classifyByKeywords === 'function', '_classifyByKeywords exposed');

assertEqual(GE._extractHostname('https://www.github.com/path'), 'github.com', '_extractHostname strips www.');
assertEqual(GE._extractHostname('https://mail.google.com/mail/'), 'mail.google.com', '_extractHostname preserves subdomain');
assertEqual(GE._extractHostname(''), '', '_extractHostname handles empty string');
assertEqual(GE._extractHostname('chrome://newtab/'), 'newtab', '_extractHostname handles chrome:// (returns newtab — no match in dict)');

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
