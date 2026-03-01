/**
 * TabNest Browser Adapter — core/browser-adapter.js
 *
 * Abstracts all API differences between:
 *   Chrome MV3 (chrome.* namespace, Promise-based)
 *   Firefox MV2 (browser.* namespace, Promise-based)
 *
 * RULE: All other modules MUST use BrowserAdapter.* — No raw chrome.* or browser.* elsewhere.
 *
 * Coverage:
 *   - tabs: query, get, create, update, remove, discard, onCreated, onUpdated,
 *           onRemoved, onActivated, onMoved, onAttached, onDetached, onReplaced
 *   - storage: local.get, local.set, local.remove, local.clear,
 *              sync.get, sync.set, sync.remove
 *   - alarms: create, get, clear, clearAll, onAlarm
 *   - runtime: sendMessage, onMessage, onInstalled, onStartup, onSuspend
 *   - windows: getAll, onFocusChanged
 *   - sidePanel / sidebar_action: open (Chrome sidePanel vs Firefox no-op)
 *   - webNavigation: onCompleted (for POST-back detection in Phase 4)
 *   - Feature flags: canDiscard, isFirefox, isMV3
 */

(function () {
  'use strict';

  const _api = (typeof browser !== 'undefined') ? browser : chrome;
  const _isFirefox = typeof browser !== 'undefined';
  const _isMV3 = _api.runtime.getManifest().manifest_version === 3;
  const _canDiscard = typeof _api.tabs.discard === 'function';

  const BrowserAdapter = {

    /** Feature detection flags */
    features: {
      canDiscard: _canDiscard,
      isFirefox: _isFirefox,
      isMV3: _isMV3,
    },

    /** tabs namespace */
    tabs: {
      query(queryInfo) {
        return _api.tabs.query(queryInfo);
      },
      get(tabId) {
        return _api.tabs.get(tabId);
      },
      create(createProperties) {
        return _api.tabs.create(createProperties);
      },
      update(tabId, updateProperties) {
        return _api.tabs.update(tabId, updateProperties);
      },
      remove(tabIds) {
        return _api.tabs.remove(tabIds);
      },
      /**
       * Discard a tab to free its renderer memory.
       * No-op (resolves with null) on browsers without tabs.discard().
       */
      discard(tabId) {
        if (!_canDiscard) return Promise.resolve(null);
        return _api.tabs.discard(tabId);
      },

      /* Event listeners — pass through directly */
      get onCreated()   { return _api.tabs.onCreated; },
      get onUpdated()   { return _api.tabs.onUpdated; },
      get onRemoved()   { return _api.tabs.onRemoved; },
      get onActivated() { return _api.tabs.onActivated; },
      get onMoved()     { return _api.tabs.onMoved; },
      get onAttached()  { return _api.tabs.onAttached; },
      get onDetached()  { return _api.tabs.onDetached; },
      get onReplaced()  { return _api.tabs.onReplaced; },
    },

    /** storage namespace */
    storage: {
      local: {
        get(keys)    { return _api.storage.local.get(keys); },
        set(items)   { return _api.storage.local.set(items); },
        remove(keys) { return _api.storage.local.remove(keys); },
        clear()      { return _api.storage.local.clear(); },
      },
      sync: {
        get(keys)    { return _api.storage.sync.get(keys); },
        set(items)   { return _api.storage.sync.set(items); },
        remove(keys) { return _api.storage.sync.remove(keys); },
      },
    },

    /** alarms namespace */
    alarms: {
      create(name, alarmInfo) {
        return _api.alarms.create(name, alarmInfo);
      },
      get(name) {
        return _api.alarms.get(name);
      },
      clear(name) {
        return _api.alarms.clear(name);
      },
      clearAll() {
        return _api.alarms.clearAll();
      },
      get onAlarm() { return _api.alarms.onAlarm; },
    },

    /** runtime namespace */
    runtime: {
      sendMessage(message) {
        return _api.runtime.sendMessage(message);
      },
      get onMessage()   { return _api.runtime.onMessage; },
      get onInstalled() { return _api.runtime.onInstalled; },
      get onStartup()   { return _api.runtime.onStartup; },
      get onSuspend()   { return _api.runtime.onSuspend; },
      get onConnect()   { return _api.runtime.onConnect; },
      getURL(path) { return _api.runtime.getURL(path); },
    },

    /** windows namespace */
    windows: {
      getAll(getInfo) { return _api.windows.getAll(getInfo); },
      get onFocusChanged() { return _api.windows.onFocusChanged; },
    },

    /**
     * sidePanel — Chrome only.
     * On Firefox, sidebar_action is controlled by the user; no programmatic open.
     * open() is a safe no-op on Firefox.
     */
    sidePanel: {
      open(options) {
        if (_isFirefox || !_api.sidePanel) return Promise.resolve();
        return _api.sidePanel.open(options);
      },
      setOptions(options) {
        if (_isFirefox || !_api.sidePanel) return Promise.resolve();
        return _api.sidePanel.setOptions(options);
      },
    },

    /** webNavigation — used in Phase 4 for stateful URL detection */
    webNavigation: {
      get onCompleted() { return _api.webNavigation.onCompleted; },
    },
  };

  // Export: CommonJS (Node.js test environment) and globalThis (sidebar, content scripts)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BrowserAdapter };
  }
  // Always attach to globalThis for non-module contexts (sidebar, content scripts, background via globalThis)
  globalThis.BrowserAdapter = BrowserAdapter;

})();
