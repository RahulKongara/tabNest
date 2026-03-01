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

    // Data management
    EXPORT_DATA:          'EXPORT_DATA',
    IMPORT_DATA:          'IMPORT_DATA',
    CLEAR_DATA:           'CLEAR_DATA',

    // UI
    OPEN_SETTINGS_PANEL:  'OPEN_SETTINGS_PANEL',

    // ── Background → Sidebar (9 push types) ────────────────────────────────────

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
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MSG_TYPES };
  }
  globalThis.MSG_TYPES = MSG_TYPES;
})();
