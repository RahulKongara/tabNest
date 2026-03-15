/**
 * TabNest Message Protocol — sidebar/message-protocol.js
 *
 * Defines all message types for chrome.runtime communication.
 * Sidebar-to-Background: 23 request types (sendMessage)
 * Background-to-Sidebar: 9 push types (port.postMessage via runtime.connect)
 *
 * Usage in sidebar:   chrome.runtime.sendMessage({ type: MSG_TYPES.GET_FULL_STATE })
 * Usage in background: BrowserAdapter.runtime.onMessage, pushToSidebar(MSG_TYPES.TAB_CREATED, data)
 *
 * Port name for push channel: 'tabnest-sidebar'
 *   Sidebar connects:    chrome.runtime.connect({ name: 'tabnest-sidebar' })
 *   Background listens:  BrowserAdapter.runtime.onConnect.addListener(...)
 */
(function () {
  'use strict';

  const MSG_TYPES = {
    // ── Sidebar → Background (23 types) ────────────────────────────────────────

    // State queries
    GET_FULL_STATE:       'GET_FULL_STATE',
    GET_SETTINGS:         'GET_SETTINGS',

    // Tab lifecycle operations
    DISCARD_TAB:          'DISCARD_TAB',
    CLOSE_TAB:            'CLOSE_TAB',       // close without saving (regular browser close)
    SAVE_AND_CLOSE_TAB:   'SAVE_AND_CLOSE_TAB',
    RESTORE_TAB:          'RESTORE_TAB',
    SAVE_ALL_INACTIVE:    'SAVE_ALL_INACTIVE',
    DISCARD_ALL_INACTIVE: 'DISCARD_ALL_INACTIVE',

    // Group management
    MOVE_TO_GROUP:        'MOVE_TO_GROUP',
    CREATE_GROUP:         'CREATE_GROUP',
    RENAME_GROUP:         'RENAME_GROUP',
    SET_GROUP_COLOR:      'SET_GROUP_COLOR',
    DELETE_GROUP:         'DELETE_GROUP',
    MERGE_GROUPS:         'MERGE_GROUPS',
    ARCHIVE_GROUP:        'ARCHIVE_GROUP',

    // Settings
    SAVE_SETTINGS:        'SAVE_SETTINGS',

    // Workspace management
    RESTORE_WORKSPACE:    'RESTORE_WORKSPACE',
    SAVE_WORKSPACE:       'SAVE_WORKSPACE',
    LIST_WORKSPACES:      'LIST_WORKSPACES',
    DELETE_WORKSPACE:     'DELETE_WORKSPACE',

    // Smart restore (RESTORE-02, 04-04)
    HOVER_PRE_RENDER:      'HOVER_PRE_RENDER',
    CANCEL_PRE_RENDER:     'CANCEL_PRE_RENDER',
    ACTIVATE_PRE_RENDERED: 'ACTIVATE_PRE_RENDERED',

    // Data management
    EXPORT_DATA:          'EXPORT_DATA',
    IMPORT_DATA:          'IMPORT_DATA',
    CLEAR_DATA:           'CLEAR_DATA',

    // UI
    OPEN_SETTINGS_PANEL:  'OPEN_SETTINGS_PANEL',

    // ── Background → Sidebar (9 push types) ────────────────────────────────────

    // Content Script → Background (one-way, no response)
    NAV_HISTORY_REPORT:   'NAV_HISTORY_REPORT',  // DATA-02: content → background push

    // Tab state changes
    TAB_CREATED:          'TAB_CREATED',
    TAB_UPDATED:          'TAB_UPDATED',
    TAB_REMOVED:          'TAB_REMOVED',
    TAB_DISCARDED:        'TAB_DISCARDED',
    TAB_SAVED_AND_CLOSED: 'TAB_SAVED_AND_CLOSED',
    TAB_ARCHIVED:         'TAB_ARCHIVED',
    TAB_RESTORED:         'TAB_RESTORED',

    // Structural changes
    GROUP_UPDATED:        'GROUP_UPDATED',
    SETTINGS_CHANGED:     'SETTINGS_CHANGED',

    // Keyboard shortcut triggered UI actions (CONF-02)
    FOCUS_SEARCH:         'FOCUS_SEARCH',      // focus the search input
    FOCUS_NEXT_GROUP:     'FOCUS_NEXT_GROUP',  // move keyboard focus to next group header
    FOCUS_PREV_GROUP:     'FOCUS_PREV_GROUP',  // move keyboard focus to previous group header

    // Workspace push events (05-04)
    WORKSPACE_SAVED:      'WORKSPACE_SAVED',
    WORKSPACE_DELETED:    'WORKSPACE_DELETED',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MSG_TYPES };
  }
  globalThis.MSG_TYPES = MSG_TYPES;
})();
