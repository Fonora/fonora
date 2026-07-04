/** Fonora eyebrow tag colors: gold (brand), green (canonical/active), red (frontier/archive). */

/** @typedef {'gold' | 'green' | 'red'} TagTone */

const TONE_SUFFIXES = ['--gold', '--green', '--red'];

/**
 * @param {HTMLElement | null | undefined} el
 * @param {TagTone | '' | null | undefined} tone
 * @param {string} [baseClass='page-toolbar__tag']
 */
export function applyTagTone(el, tone, baseClass = 'page-toolbar__tag') {
  if (!el) return;
  TONE_SUFFIXES.forEach((suffix) => el.classList.remove(`${baseClass}${suffix}`));
  if (tone) el.classList.add(`${baseClass}--${tone}`);
}

/**
 * @param {string} baseClass
 * @param {TagTone | '' | null | undefined} tone
 */
export function tagToneClass(baseClass, tone) {
  return tone ? `${baseClass} ${baseClass}--${tone}` : baseClass;
}

/** Tools admin pages */
export const TOOLS_TAG_TONE = 'gold';

/** Living specification / canonical language docs */
export const SPEC_TAG_TONE = 'green';

/**
 * @param {string} layerId
 * @returns {TagTone}
 */
export function docLayerTagTone(layerId) {
  switch (layerId) {
    case 'script':
    case 'language':
      return 'green';
    case 'archive':
      return 'red';
    case 'essential':
    case 'research':
    default:
      return 'gold';
  }
}

/**
 * @param {{ status?: string }} note
 * @returns {TagTone}
 */
export function researchNoteTagTone(note) {
  switch (String(note?.status || '').toLowerCase()) {
    case 'open':
      return 'red';
    case 'active':
    case 'foundational':
      return 'green';
    default:
      return 'gold';
  }
}

/**
 * @param {'index' | 'timeline' | 'open' | string} view
 * @returns {TagTone}
 */
export function researchHeroTagTone(view) {
  if (view === 'open') return 'red';
  if (view === 'timeline') return 'green';
  return 'gold';
}
