/**
 * TabNest Content Script — Form Detector
 * Detects unsaved form input and reports dirty state to background.
 * Blocks Stage 2/3 lifecycle transitions for tabs with active forms.
 * Full implementation: Phase 4, plan 04-03
 *
 * Message sent to background: { type: 'FORM_STATE_REPORT', payload: { isDirty: boolean } }
 */

// STUB
