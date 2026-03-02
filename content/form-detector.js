/**
 * TabNest Content Script — Form State Detector (content/form-detector.js)
 *
 * Detects unsaved form input and reports dirty state to the background worker.
 * Blocks Stage 2/3 lifecycle transitions for tabs with active dirty forms.
 *
 * DATA-03 — SRS FR-27 / NFR-29
 * IMPORTANT: Never reads or transmits form field values. Only reports boolean dirty state.
 *
 * Runs at document_idle, main frame only (all_frames: false in manifests).
 */
(function () {
  'use strict';

  const MSG_FORM = 'FORM_STATE_REPORT';

  let isDirty = false;

  /** Send dirty state to background. Only sends on state transitions to avoid message flood. */
  function report(dirty) {
    if (dirty === isDirty) return; // no state change — skip
    isDirty = dirty;
    try {
      chrome.runtime.sendMessage({ type: MSG_FORM, payload: { hasDirtyForm: isDirty } });
    } catch {
      // Extension context may have been invalidated (e.g. extension reload) — ignore
    }
  }

  // ── Dirty detection — event delegation on document ─────────────────────────
  // A single 'input' event listener covers: text inputs, textareas, contenteditable.
  // Passive: we never call preventDefault() or stopPropagation().

  document.addEventListener('input', function (e) {
    const target = e.target;
    if (!target) return;
    const tag = target.tagName;
    // Only track actual form input elements and contenteditable
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
      report(true);
    }
  }, { passive: true, capture: true });

  // 'change' event covers <select> elements (and checkboxes/radios) — 'input' may not fire on these
  document.addEventListener('change', function (e) {
    const target = e.target;
    if (!target) return;
    const tag = target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') {
      report(true);
    }
  }, { passive: true, capture: true });

  // ── Reset on form submit ───────────────────────────────────────────────────
  // User submitted the form — data is no longer "unsaved"
  document.addEventListener('submit', function () {
    report(false);
  }, { passive: true, capture: true });

  // ── Reset on navigation away ───────────────────────────────────────────────
  // beforeunload fires before the page unloads (back, forward, close, navigation)
  // Send synchronously — no async allowed in beforeunload
  window.addEventListener('beforeunload', function () {
    report(false);
  });

  // pagehide fires on bfcache navigation (some browsers skip beforeunload)
  window.addEventListener('pagehide', function () {
    report(false);
  }, { passive: true });

})();
