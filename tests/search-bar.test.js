/**
 * Tests for sidebar/search-bar.js
 * Plan 03-05: UI-04 real-time search filter (< 100ms for 200 entries)
 *
 * Run with: node tests/search-bar.test.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Load the module under test ───────────────────────────────────────────────
// search-bar.js exports via globalThis.SearchBar (IIFE pattern)
require('../sidebar/search-bar.js');

const SearchBar = global.SearchBar;

// ─── Test fixtures ────────────────────────────────────────────────────────────

const groups = [
  { id: 'dev',   name: 'Dev',     color: '#1B6B93', order: 0, isCollapsed: false },
  { id: 'work',  name: 'Work',    color: '#E67E22', order: 1, isCollapsed: false },
  { id: 'other', name: 'Other',   color: '#95A5A6', order: 9, isCollapsed: false },
];

const tabs = [
  { tabId: 1, url: 'https://github.com/tabNest',  title: 'GitHub TabNest', groupId: 'dev',   stage: 'active' },
  { tabId: 2, url: 'https://github.com/issues',   title: 'GitHub Issues',  groupId: 'dev',   stage: 'active' },
  { tabId: 3, url: 'https://google.com/search',   title: 'Google Search',  groupId: 'other', stage: 'active' },
  { tabId: 4, url: 'https://slack.com',            title: 'Slack',          groupId: 'work',  stage: 'discarded' },
  { tabId: 5, url: 'https://example.com',          title: 'Example Page',   groupId: 'other', stage: 'active' },
];

const savedEntries = [
  { savedId: 'a1', url: 'https://github.com/pr/1', title: 'GitHub PR #1', groupId: 'dev',   stage: 'saved' },
  { savedId: 'a2', url: 'https://notion.so/docs',  title: 'Notion Docs',   groupId: 'work',  stage: 'archived' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n=== SearchBar.filter() — UI-04 real-time search ===');

// Test 1: filter by URL substring — 'github' matches 2 live tabs + 1 saved entry
{
  const result = SearchBar.filter('github', tabs, savedEntries, groups);
  assertEqual(result.tabs.length, 2, 'Test 1: filter("github") — 2 live tabs match');
  assertEqual(result.savedEntries.length, 1, 'Test 1: filter("github") — 1 saved entry matches');
  assertEqual(result.matchCount, 3, 'Test 1: matchCount is 3');
}

// Test 2: filter by group name — 'Dev' matches all tabs/entries in the "dev" group
{
  const result = SearchBar.filter('Dev', tabs, savedEntries, groups);
  const devTabs = result.tabs.filter(t => t.groupId === 'dev');
  assertEqual(devTabs.length, 2, 'Test 2: filter("Dev") — 2 dev-group tabs returned');
  // Group "dev" should also appear in filteredGroups
  assert(result.groups.some(g => g.id === 'dev'), 'Test 2: "dev" group included in filteredGroups');
}

// Test 3: empty query — returns all entries unchanged
{
  const result = SearchBar.filter('', tabs, savedEntries, groups);
  assertEqual(result.tabs.length, tabs.length, 'Test 3: empty query returns all tabs');
  assertEqual(result.savedEntries.length, savedEntries.length, 'Test 3: empty query returns all savedEntries');
  assertEqual(result.matchCount, tabs.length + savedEntries.length, 'Test 3: matchCount equals total');
}

// Test 4: query with no matches — returns empty arrays
{
  const result = SearchBar.filter('xyz-no-match-999', tabs, savedEntries, groups);
  assertEqual(result.tabs.length, 0, 'Test 4: no-match query returns 0 tabs');
  assertEqual(result.savedEntries.length, 0, 'Test 4: no-match query returns 0 saved entries');
  assertEqual(result.matchCount, 0, 'Test 4: matchCount is 0');
}

// Test 5: case-insensitive — 'GITHUB' matches 'github.com' URLs
{
  const lower = SearchBar.filter('github', tabs, savedEntries, groups);
  const upper = SearchBar.filter('GITHUB', tabs, savedEntries, groups);
  assertEqual(upper.tabs.length, lower.tabs.length, 'Test 5: "GITHUB" matches same count as "github"');
  assertEqual(upper.matchCount, lower.matchCount, 'Test 5: matchCount is the same regardless of case');
}

// Test 6: title search — 'Google' matches the Google Search tab
{
  const result = SearchBar.filter('Google', tabs, savedEntries, groups);
  assertEqual(result.tabs.length, 1, 'Test 6: filter("Google") matches 1 tab by title');
  assertEqual(result.tabs[0].tabId, 3, 'Test 6: correct tab matched by title');
}

// Test 7: performance gate — 200 entries, filter completes in < 100ms
{
  const bigTabs = [];
  for (let i = 0; i < 200; i++) {
    bigTabs.push({
      tabId: i,
      url:   `https://site${i}.example.com/page`,
      title: `Test Page ${i}`,
      groupId: (i % 3 === 0) ? 'dev' : (i % 3 === 1) ? 'work' : 'other',
      stage: 'active',
    });
  }
  const start = Date.now();
  const result = SearchBar.filter('test', bigTabs, [], groups);
  const duration = Date.now() - start;
  assert(duration < 100, `Test 7: filter() on 200 entries completed in ${duration}ms (< 100ms)`);
  assert(result.tabs.length > 0, 'Test 7: filter returned matches from 200-entry dataset');
}

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
