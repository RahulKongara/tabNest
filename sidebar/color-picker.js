/**
 * TabNest Color Picker Component — sidebar/color-picker.js
 *
 * Provides a color picker with 12 preset swatches and a custom hex input.
 * Used by group-card.js to allow users to change group colors (UI-10).
 *
 * Pattern: IIFE + globalThis.ColorPicker export.
 */

(function () {
  'use strict';

  const PRESET_COLORS = [
    '#1B6B93', '#E67E22', '#E91E8C', '#27AE60', '#8E44AD',
    '#E74C3C', '#00ACC1', '#F39C12', '#009688', '#95A5A6',
    '#2C3E50', '#F1C40F',
  ];

  /**
   * Create a color picker element with 12 preset swatches and a hex input.
   * @param {string} currentColor - Current hex color (e.g. '#1B6B93')
   * @param {function(string): void} onChange - Called with selected hex color string
   * @returns {HTMLDivElement}
   */
  function create(currentColor, onChange) {
    const container = document.createElement('div');
    container.className = 'tn-color-picker';

    // 12 preset swatches
    const swatches = document.createElement('div');
    swatches.className = 'tn-color-swatches';

    // hexInput is referenced inside swatch click handlers — declare before loop
    const hexInput = document.createElement('input');

    for (const color of PRESET_COLORS) {
      const swatch = document.createElement('button');
      swatch.className = 'tn-color-swatch';
      swatch.style.backgroundColor = color;
      swatch.setAttribute('aria-label', `Color ${color}`);
      swatch.title = color;
      if (color === currentColor) swatch.classList.add('tn-color-swatch--active');

      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        container.querySelectorAll('.tn-color-swatch--active').forEach(s => s.classList.remove('tn-color-swatch--active'));
        swatch.classList.add('tn-color-swatch--active');
        hexInput.value = color;
        onChange(color);
      });

      swatches.appendChild(swatch);
    }

    // Custom hex input
    hexInput.type = 'text';
    hexInput.className = 'tn-color-hex-input';
    hexInput.placeholder = '#RRGGBB';
    hexInput.maxLength = 7;
    hexInput.value = currentColor || '';
    hexInput.setAttribute('aria-label', 'Custom hex color');

    hexInput.addEventListener('change', () => {
      const val = hexInput.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        onChange(val);
      }
    });

    container.appendChild(swatches);
    container.appendChild(hexInput);
    return container;
  }

  globalThis.ColorPicker = { create, PRESET_COLORS };
})();
