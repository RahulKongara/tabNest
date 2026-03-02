'use strict';
// tests/settings-panel.test.js
// Tests for sidebar/settings-panel.js
// Run: node tests/settings-panel.test.js

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  PASS:', message);
    passed++;
  } else {
    console.error('  FAIL:', message);
    failed++;
  }
}

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
// Matches the subset of DOM APIs used by settings-panel.js
function makeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    id: '', className: '', type: '', checked: false,
    textContent: '', value: '', min: '', max: '', step: '',
    placeholder: '', hidden: false,
    children: [], _listeners: {},
    style: {},
    dataset: {},
    _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k)    { return this._attrs[k]; },
    appendChild:  function (child){ this.children.push(child); return child; },
    addEventListener: function (ev, fn) {
      if (!this._listeners[ev]) this._listeners[ev] = [];
      this._listeners[ev].push(fn);
    },
    dispatchEvent: function (ev) {
      const handlers = this._listeners[ev.type] || [];
      for (const h of handlers) h(ev);
    },
    remove: function () {
      if (this._parent) {
        this._parent.children = this._parent.children.filter(function (c) { return c !== this; }, this);
        _bodyMap.delete(this.id);
      }
    },
    focus: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    _parent: null,
  };
  el.innerHTML = '';  // write-only in tests
  return el;
}

const _bodyMap = new Map();
const _bodyChildren = [];
const _bodyEl = {
  id: 'body',
  children: _bodyChildren,
  appendChild: function (el) {
    el._parent = _bodyEl;
    _bodyChildren.push(el);
    if (el.id) _bodyMap.set(el.id, el);
    return el;
  },
  removeChild: function (el) {
    const idx = _bodyChildren.indexOf(el);
    if (idx !== -1) _bodyChildren.splice(idx, 1);
    if (el.id) _bodyMap.delete(el.id);
  },
};

global.document = {
  createElement: function (tag) { return makeEl(tag); },
  getElementById: function (id) { return _bodyMap.get(id) || null; },
  body: _bodyEl,
};

// ── Load module ───────────────────────────────────────────────────────────────
require('../sidebar/settings-panel.js');
const SP = global.SettingsPanel;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const BASE_SETTINGS = {
  t1Minutes: 5, t2Minutes: 15, t3Days: 7,
  autoGroup: true, persistSessions: true,
  managePinned: false, hoverPreRender: true,
  showRamSavings: true, batchSize: 3,
  whitelist: ['github.com'],
};
const BASE_GROUPS    = [{ id: 'dev', name: 'Dev', color: '#1B6B93', order: 0, isCollapsed: false, isCustom: false }];
const BASE_USER_RULES = [{ domain: 'github.com', groupId: 'dev' }];

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('\n── SettingsPanel tests (Plan 05-01) ──');

// 1. open() appends overlay to body
SP.open(BASE_SETTINGS, BASE_GROUPS, BASE_USER_RULES, function () {});
assert(document.getElementById('tn-settings-overlay') !== null, 'open() appends #tn-settings-overlay to body');

// 2. close() removes overlay
SP.close();
assert(document.getElementById('tn-settings-overlay') === null, 'close() removes #tn-settings-overlay from body');

// 3. open() is idempotent — calling twice does not create two overlays
let saves = [];
SP.open(BASE_SETTINGS, BASE_GROUPS, BASE_USER_RULES, function (p) { saves.push(p); });
SP.open(BASE_SETTINGS, BASE_GROUPS, BASE_USER_RULES, function (p) { saves.push(p); });
const allOverlays = _bodyChildren.filter(function (c) { return c.id === 'tn-settings-overlay'; });
assert(allOverlays.length === 1, 'open() called twice results in exactly one overlay');

// 4. Overlay contains a slider with id 'tn-setting-t1Minutes'
function findById(el, id) {
  if (el.id === id) return el;
  for (const c of el.children || []) {
    const found = findById(c, id);
    if (found) return found;
  }
  return null;
}
const overlay = document.getElementById('tn-settings-overlay');
const t1Slider = findById(overlay, 'tn-setting-t1Minutes');
assert(t1Slider !== null, 'overlay contains element with id tn-setting-t1Minutes');

// 5. Overlay contains a toggle with id 'tn-setting-autoGroup'
const autoGroupToggle = findById(overlay, 'tn-setting-autoGroup');
assert(autoGroupToggle !== null, 'overlay contains element with id tn-setting-autoGroup');

// 6. Simulating input on T1 slider calls onSave with t1Minutes
saves = [];
SP.close();
SP.open(BASE_SETTINGS, BASE_GROUPS, BASE_USER_RULES, function (p) { saves.push(p); });
const t1 = findById(document.getElementById('tn-settings-overlay'), 'tn-setting-t1Minutes');
t1.value = '10';
t1.dispatchEvent({ type: 'input' });
assert(saves.length === 1 && saves[0].t1Minutes === 10, 'T1 slider input calls onSave with t1Minutes: 10');

// 7. Simulating change on autoGroup toggle calls onSave with autoGroup
saves = [];
SP.close();
const settings2 = Object.assign({}, BASE_SETTINGS, { autoGroup: true });
SP.open(settings2, BASE_GROUPS, BASE_USER_RULES, function (p) { saves.push(p); });
const agToggle = findById(document.getElementById('tn-settings-overlay'), 'tn-setting-autoGroup');
agToggle.checked = false;
agToggle.dispatchEvent({ type: 'change' });
assert(saves.length === 1 && saves[0].autoGroup === false, 'autoGroup toggle fires onSave with autoGroup: false');

// 8. Whitelist section renders one item per domain in settings.whitelist
SP.close();
SP.open(Object.assign({}, BASE_SETTINGS, { whitelist: ['github.com', 'stackoverflow.com'] }), BASE_GROUPS, [], function () {});
function findAllByClass(el, cls) {
  const results = [];
  if (el.className && el.className.split(' ').includes(cls)) results.push(el);
  for (const c of el.children || []) {
    for (const r of findAllByClass(c, cls)) results.push(r);
  }
  return results;
}
assert(findAllByClass(document.getElementById('tn-settings-overlay'), 'tn-settings-domain-item').length >= 2, 'whitelist renders at least one item per domain');

// 9. Custom rules section renders one item per rule in userRules
SP.close();
SP.open(BASE_SETTINGS, BASE_GROUPS, [{ domain: 'github.com', groupId: 'dev' }, { domain: 'twitter.com', groupId: 'social' }], function () {});
const ruleItems = findAllByClass(document.getElementById('tn-settings-overlay'), 'tn-settings-domain-item');
assert(ruleItems.length >= 2, 'custom rules section renders items for each user rule');

// 10. Remove-button for a whitelist domain calls onSave with domain absent
saves = [];
SP.close();
SP.open(Object.assign({}, BASE_SETTINGS, { whitelist: ['github.com', 'example.com'] }), BASE_GROUPS, [], function (p) { saves.push(p); });
const removeBtns = findAllByClass(document.getElementById('tn-settings-overlay'), 'tn-settings-remove-btn');
if (removeBtns.length > 0) {
  removeBtns[0].dispatchEvent({ type: 'click' });
  assert(saves.length > 0 && Array.isArray(saves[0].whitelist) && !saves[0].whitelist.includes('github.com'),
    'remove whitelist domain calls onSave with domain absent from whitelist');
} else {
  assert(false, 'remove whitelist domain calls onSave with domain absent from whitelist (no remove buttons found)');
}

SP.close();

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
