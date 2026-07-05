/**
 * Learn UI icon set — line-style inline SVGs (no emoji), theme via currentColor.
 */

/** @type {Record<string, string>} raw inner SVG markup (24x24 viewBox) */
const ICON_PATHS = {
  // Skills
  pencil:
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  waveform:
    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'book-open':
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  book:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  volume:
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  message:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  mic:
    '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',

  // Stats
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  award:
    '<circle cx="12" cy="8" r="6"/><polyline points="8.21 13.5 7 22 12 19 17 22 15.79 13.5"/>',
  zap:
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',

  // Controls
  'arrow-left':
    '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'arrow-right':
    '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  check:
    '<polyline points="20 6 9 17 4 12"/>',
  x:
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  play:
    '<polygon points="6 4 20 12 6 20 6 4"/>',
  turtle:
    '<path d="M2.5 14.2c1-6.2 5.8-10 11.8-9 2.5.4 4.3 1.8 5.3 3.6"/><path d="M2.5 14.2c5.7.6 12.5-.4 17.1-5.4"/><path d="M19.6 8.8c.9-2.4 2.6-4.6 4.6-3.6 1.5.8 1.5 2.4.6 3.7-1.4 2.1-3.7 4.4-6.5 5.5"/><path d="M7.1 14.4l-1.4 4.8h4.6l.4-3.4"/><path d="M16.3 14.4l.4 4.8h4.5l-1.4-4.8"/><path d="M2.5 14.2c-1.2-.1-1.6-1.2-.5-1.9"/><circle class="learn-icon__dot" cx="22.5" cy="7.2" r="0.7"/>',
  'slow-play':
    '<path d="M2.5 14.2c1-6.2 5.8-10 11.8-9 2.5.4 4.3 1.8 5.3 3.6"/><path d="M2.5 14.2c5.7.6 12.5-.4 17.1-5.4"/><path d="M19.6 8.8c.9-2.4 2.6-4.6 4.6-3.6 1.5.8 1.5 2.4.6 3.7-1.4 2.1-3.7 4.4-6.5 5.5"/><path d="M7.1 14.4l-1.4 4.8h4.6l.4-3.4"/><path d="M16.3 14.4l.4 4.8h4.5l-1.4-4.8"/><path d="M2.5 14.2c-1.2-.1-1.6-1.2-.5-1.9"/><circle class="learn-icon__dot" cx="22.5" cy="7.2" r="0.7"/>',
  'chevron-right':
    '<polyline points="9 18 15 12 9 6"/>',
  lock:
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

/** Icons that read better filled rather than stroked. */
const FILLED = new Set(['play', 'flame', 'zap']);

/** Icons with mixed fill + stroke paths (raw inner markup). */
const MIXED_ICONS = new Set(['turtle', 'slow-play']);

/**
 * Return an inline SVG icon string.
 * @param {keyof typeof ICON_PATHS} name
 * @param {string} [className]
 * @returns {string}
 */
export function icon(name, className = '') {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  const filled = FILLED.has(name);
  const mixed = MIXED_ICONS.has(name);
  const cls = `learn-icon${className ? ` ${className}` : ''}`;
  const paint = mixed
    ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    : filled
      ? 'fill="currentColor" stroke="none"'
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg class="${cls}" viewBox="0 0 24 24" ${paint} aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** Skill id → medallion icon name. */
export const SKILL_ICON = {
  'script-writing': 'pencil',
  'script-sounds': 'waveform',
  'script-words': 'book-open',
  'fonoran-reading': 'book',
  'fonoran-writing': 'pencil',
  'fonoran-hearing': 'volume',
  'fonoran-grammar': 'message',
  'fonoran-speaking': 'mic',
};
