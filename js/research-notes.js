/**
 * Research notebook phase definitions and shared types.
 * Published note metadata and bodies live in API storage (/api/research/notes).
 */

/** Display order + labels for the research notebook eras. */
export const RESEARCH_PHASES = [
  {
    id: 'phase-1',
    label: 'Phase I: Writing sound, not spelling',
    blurb: 'Fonora the script: encoding how speech is produced instead of how it is spelled.',
  },
  {
    id: 'phase-2',
    label: 'Phase II: Inventing a language from first principles',
    blurb: 'Fonoran the language: six generations of trying to grow a vocabulary from a grid.',
  },
  {
    id: 'phase-3',
    label: 'Phase III: A language people can actually use',
    blurb: 'The pivot from algorithmic correctness to recoverable, human communication.',
  },
  {
    id: 'phase-4',
    label: 'Phase IV: Reconstructing compounds',
    blurb: 'Teaching trees, meaning-attempts, and playtest-driven preferred forms under the constitution.',
  },
];

/**
 * @typedef {Object} ResearchLink
 * @property {string} label
 * @property {string} [path] Repo path (for docs / source links)
 * @property {string} [href] Absolute href (for tool links)
 */

/**
 * @typedef {Object} ResearchNote
 * @property {string} slug
 * @property {string} code Short notebook code, e.g. RN-01
 * @property {string} title
 * @property {string} status Foundational | Active | Superseded | Open
 * @property {string} phase Phase id
 * @property {string} date ISO date
 * @property {string} description Meta description (SEO)
 * @property {string} abstract One-line summary for the notebook index
 * @property {string[]} related Slugs of thematically linked notes
 * @property {ResearchLink[]} docs Reference docs this note links to
 * @property {ResearchLink[]} tools Interactive tools this note links to
 * @property {ResearchLink[]} source Source files on GitHub
 * @property {string} [git_commit] Publish commit SHA for pinned source links
 */

/** Normalize legacy act ids/fields from older stored notes. */
export function normalizePhaseId(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  if (raw.startsWith('phase-')) return raw;
  if (raw.startsWith('act-')) return raw.replace(/^act-/, 'phase-');
  return raw;
}

/** Infer phase from notebook code when metadata is missing (RN-01–06 → I, etc.). */
export function inferPhaseFromCode(code) {
  const match = String(code || '').match(/^RN-(\d+)/i);
  if (!match) return '';
  const num = Number.parseInt(match[1], 10);
  if (num <= 6) return 'phase-1';
  if (num <= 11) return 'phase-2';
  if (num <= 17) return 'phase-3';
  return 'phase-4';
}

/** Resolve a note's phase id from metadata or notebook code. */
export function resolveNotePhase(note) {
  if (!note || typeof note !== 'object') return '';
  return normalizePhaseId(note.phase || note.act) || inferPhaseFromCode(note.code);
}

/** @param {object} metadata */
export function normalizeNoteMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const phase = resolveNotePhase(metadata);
  const { act: _legacy, ...rest } = metadata;
  return phase ? { ...rest, phase } : rest;
}
