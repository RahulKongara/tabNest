/**
 * Tests for ARIA attributes and keyboard accessibility (Plan 05-05, UI-12)
 * Run with: node tests/accessibility.test.js
 */
'use strict';

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log('  PASS:', message); passed++; }
  else           { console.error('  FAIL:', message); failed++; }
}

// ── Minimal DOM stub (same pattern as settings-panel.test.js) ─────────────────
function makeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    id: '', className: '', type: '', checked: false,
    textContent: '', innerHTML: '', value: '',
    children: [], _listeners: {}, _attrs: {}, style: {}, dataset: {},
    setAttribute:    function (k, v) { this._attrs[k] = v; },
    getAttribute:    function (k)    { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
    appendChild:     function (c)    { this.children.push(c); return c; },
    addEventListener: function (ev, fn) {
      if (!this._listeners[ev]) this._listeners[ev] = [];
      this._listeners[ev].push(fn);
    },
    dispatchEvent:   function (ev) { (this._listeners[ev.type] || []).forEach(h => h(ev)); },
    remove:          function () {},
    focus:           function () {},
    click:           function () { (this._listeners['click'] || []).forEach(h => h({})); },
    querySelector:   function (sel) { return _findBySelector(this, sel); },
    querySelectorAll: function (sel) { return _findAllBySelector(this, sel); },
    classList: {
      _list: new Set(),
      add:    function (c) { this._list.add(c); },
      remove: function (c) { this._list.delete(c); },
      contains: function (c) { return this._list.has(c); },
      toggle: function (c) { this._list.has(c) ? this._list.delete(c) : this._list.add(c); },
    },
  };
  return el;
}

function _findBySelector(el, sel) {
  for (const c of el.children || []) {
    if ((sel.startsWith('#') && c.id === sel.slice(1)) ||
        (sel.startsWith('.') && c.className && c.className.includes(sel.slice(1)))) {
      return c;
    }
    const found = _findBySelector(c, sel);
    if (found) return found;
  }
  return null;
}

function _findAllBySelector(el, sel) {
  const results = [];
  for (const c of el.children || []) {
    if ((sel.startsWith('#') && c.id === sel.slice(1)) ||
        (sel.startsWith('.') && c.className && c.className.includes(sel.slice(1)))) {
      results.push(c);
    }
    for (const r of _findAllBySelector(c, sel)) results.push(r);
  }
  return results;
}

global.document = { createElement: (tag) => makeEl(tag) };

// Stub chrome.runtime.getURL for tab-entry.js
global.chrome = {
  runtime: { getURL: () => 'icons/icon16.png' },
};

// ── Load modules ──────────────────────────────────────────────────────────────
require('../sidebar/message-protocol.js');
require('../sidebar/tab-entry.js');
require('../sidebar/group-card.js');

const TE = global.TabEntry;
const GC = global.GroupCard;

// ── Helper: find attribute on element or descendants ─────────────────────────
function findAttr(el, attr) {
  if (el._attrs && el._attrs[attr] !== undefined) return el._attrs[attr];
  for (const c of el.children || []) {
    const found = findAttr(c, attr);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findByClass(el, cls) {
  const results = [];
  if (el.className && el.className.split(' ').some(c => c === cls)) results.push(el);
  for (const c of el.children || []) for (const r of findByClass(c, cls)) results.push(r);
  return results;
}

// ── TabEntry ARIA tests ───────────────────────────────────────────────────────
console.log('\n── TabEntry ARIA ──');

const activeEntry = {
  tabId: 1, url: 'https://github.com', title: 'GitHub', favicon: '',
  stage: 'active', groupId: 'dev', isStatefulUrl: false, savedId: null,
};
const savedEntry = {
  savedId: 'sv1', url: 'https://stackoverflow.com', title: 'Stack Overflow',
  favicon: '', stage: 'saved', groupId: 'dev', isStatefulUrl: false,
};
const archivedEntry = {
  savedId: 'ar1', url: 'https://example.com', title: 'Example',
  favicon: '', stage: 'archived', groupId: 'dev', isStatefulUrl: false,
};

// Active tab entry
const activeLi = TE.create(activeEntry);
assert(activeLi._attrs && activeLi._attrs['role'] === 'listitem',
  'tab entry <li> has role="listitem"');

// Check for .tn-sr-only element with stage text
const srElems = findByClass(activeLi, 'tn-sr-only');
assert(srElems.length > 0, 'tab entry has at least one .tn-sr-only element');
assert(srElems.some(el => el.textContent === 'Active'),
  'active tab entry tn-sr-only contains text "Active"');

// Saved entry
const savedLi = TE.create(savedEntry);
const savedSrElems = findByClass(savedLi, 'tn-sr-only');
assert(savedSrElems.some(el => el.textContent === 'Saved'),
  'saved tab entry tn-sr-only contains text "Saved"');

// Archived entry
const archivedLi = TE.create(archivedEntry);
const archivedSrElems = findByClass(archivedLi, 'tn-sr-only');
assert(archivedSrElems.some(el => el.textContent === 'Archived'),
  'archived tab entry tn-sr-only contains text "Archived"');

// Action buttons must have aria-label including the tab title
function hasAriaLabelWith(el, substring) {
  if (el._attrs && el._attrs['aria-label'] &&
      el._attrs['aria-label'].includes(substring)) return true;
  for (const c of el.children || []) {
    if (hasAriaLabelWith(c, substring)) return true;
  }
  return false;
}

assert(hasAriaLabelWith(activeLi, 'GitHub'),
  'active tab entry buttons have aria-label referencing the tab title "GitHub"');
assert(hasAriaLabelWith(savedLi, 'Stack Overflow'),
  'saved tab entry buttons have aria-label referencing the tab title "Stack Overflow"');

// Tabindex on li for roving tabindex
const tabindex = activeLi._attrs && activeLi._attrs['tabindex'];
assert(tabindex !== undefined && tabindex !== null,
  'tab entry <li> has tabindex attribute for keyboard navigation');

// ── GroupCard ARIA tests ──────────────────────────────────────────────────────
console.log('\n── GroupCard ARIA ──');

const group = {
  id: 'dev', name: 'Dev', color: '#1B6B93',
  order: 0, isCollapsed: false, isCustom: false,
};
const entries = [activeEntry];
const savedEntries = [savedEntry];

const card = GC.build(group, entries, savedEntries);

// role="group" on card
assert(card._attrs && card._attrs['role'] === 'group',
  'group card has role="group"');

// aria-label on card includes group name
const cardLabel = card._attrs && card._attrs['aria-label'];
assert(cardLabel && cardLabel.includes('Dev'),
  'group card aria-label includes group name "Dev"');

// Collapse toggle has aria-expanded
function findAriaExpanded(el) {
  if (el._attrs && el._attrs['aria-expanded'] !== undefined) return el;
  for (const c of el.children || []) {
    const found = findAriaExpanded(c);
    if (found) return found;
  }
  return null;
}
const expandedEl = findAriaExpanded(card);
assert(expandedEl !== null, 'group card has an element with aria-expanded attribute');
assert(expandedEl._attrs['aria-expanded'] === 'true' || expandedEl._attrs['aria-expanded'] === 'false',
  'aria-expanded is "true" or "false" (string)');

// Toggle aria-label includes group name
const toggleLabel = findAttr(card, 'aria-label');
assert(toggleLabel && toggleLabel.includes('Dev'),
  'group card toggle/header aria-label includes group name "Dev"');

// ── sidebar.html ARIA spot-checks ─────────────────────────────────────────────
console.log('\n── sidebar.html ARIA spot-checks ──');
const fs = require('fs');
const html = fs.readFileSync('./sidebar/sidebar.html', 'utf8');

assert(html.includes('role="search"'),
  'sidebar.html search wrapper has role="search"');
assert(html.includes('aria-label="Open settings"') || html.includes("aria-label='Open settings'"),
  'sidebar.html settings button has aria-label="Open settings"');
assert(html.includes('aria-label="Save and close all inactive tabs"') ||
       html.includes("aria-label='Save and close all inactive tabs'"),
  'sidebar.html save-all button has aria-label describing its action');

console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
