/**
 * Tests for core/url-analyzer.js
 * Plan 04-01: DATA-01 — stateful URL detection
 * Run with: node tests/url-analyzer.test.js
 */
'use strict';

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  PASS: ${message}`); passed++; }
  else           { console.error(`  FAIL: ${message}`); failed++; }
}

// No CONSTANTS global needed — UrlAnalyzer uses inline fallback list in test env.
require('../core/url-analyzer.js');
const { UrlAnalyzer } = globalThis;

console.log('\n── SPA hash fragment ──');
assert(UrlAnalyzer.isStateful('https://app.com/#/dashboard', '')  === true,  '#/ hash → stateful');
assert(UrlAnalyzer.isStateful('https://app.com/#!/home', '')      === true,  '#!/ hash → stateful');
assert(UrlAnalyzer.isStateful('https://app.com/page#section', '') === false, 'plain anchor → not stateful');

console.log('\n── Session token query params ──');
assert(UrlAnalyzer.isStateful('https://app.com?session=abc123', '') === true, 'session= → stateful');
assert(UrlAnalyzer.isStateful('https://app.com?token=xyz', '')      === true, 'token= → stateful');
assert(UrlAnalyzer.isStateful('https://app.com?auth=bearer', '')    === true, 'auth= → stateful');
assert(UrlAnalyzer.isStateful('https://app.com?sid=12345', '')      === true, 'sid= → stateful');
assert(UrlAnalyzer.isStateful('https://app.com?id=550e8400-e29b-41d4-a716-446655440000', '') === true, 'UUID → stateful');
assert(UrlAnalyzer.isStateful('https://app.com?page=2&sort=asc', '') === false, 'innocent params → not stateful');

console.log('\n── POST-backed page ──');
assert(UrlAnalyzer.isStateful('https://example.com', 'form_submit') === true,  'form_submit → stateful');
assert(UrlAnalyzer.isStateful('https://example.com', 'link')        === false, 'link → not stateful');
assert(UrlAnalyzer.isStateful('https://example.com', '')            === false, 'empty type → not stateful');

console.log('\n── Known dynamic domains ──');
assert(UrlAnalyzer.isStateful('https://figma.com/file/abc', '')               === true, 'figma.com → stateful');
assert(UrlAnalyzer.isStateful('https://notion.so/page', '')                   === true, 'notion.so → stateful');
assert(UrlAnalyzer.isStateful('https://docs.google.com/spreadsheets/d/abc','') === true, 'docs.google.com → stateful');

console.log('\n── Plain URLs ──');
assert(UrlAnalyzer.isStateful('https://news.ycombinator.com', '') === false, 'HN → not stateful');
assert(UrlAnalyzer.isStateful('https://github.com/user/repo', '') === false, 'GitHub plain → not stateful');

console.log('\n── Edge cases ──');
assert(UrlAnalyzer.isStateful('', '')   === false, 'empty string → false (no crash)');
assert(UrlAnalyzer.isStateful(null, '') === false, 'null → false (no crash)');

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
