/** GitHub blob URLs and in-app docs viewer routing. */

export const GITHUB_REPO = 'https://github.com/jamesc137/fonora';
export const GITHUB_BLOB_BASE = `${GITHUB_REPO}/blob/main/`;

/** @param {string} sha */
export function githubCommitUrl(sha) {
  const clean = String(sha || '').trim();
  if (!clean) return GITHUB_REPO;
  return `${GITHUB_REPO}/commit/${clean}`;
}

/**
 * @param {string} repoPath e.g. docs/language-rules.md
 * @param {string} [ref] branch or commit SHA (default main)
 */
export function githubBlobUrl(repoPath, ref = 'main') {
  const path = String(repoPath || '').replace(/^\//, '');
  const r = String(ref || 'main').trim() || 'main';
  return `${GITHUB_REPO}/blob/${r}/${path}`;
}

export function githubDocUrl(repoPath, ref = 'main') {
  return githubBlobUrl(repoPath, ref);
}

export const DEFAULT_DOC_PATH = 'docs/platform-overview.md';

/** Base path for the public research notebook (path-routed for SEO). */
export const RESEARCH_BASE = '/research';

const ALLOWED_EXACT = new Set(['CONTRIBUTING.md', 'README.md', 'SECURITY.md']);
const ALLOWED_PREFIX = 'docs/';

const ROOT_DOC_SLUGS = {
  'README.md': 'project-readme',
  'CONTRIBUTING.md': 'contributing',
  'SECURITY.md': 'security',
};

/** @type {Record<string, string>} */
const SLUG_TO_ROOT_DOC = Object.fromEntries(
  Object.entries(ROOT_DOC_SLUGS).map(([path, slug]) => [slug, path]),
);

/** Display order for grouped docs sidebar. */
export const DOC_LAYER_ORDER = [
  { id: 'essential', label: 'Essential' },
  { id: 'script', label: 'Script layer' },
  { id: 'language', label: 'Language layer' },
  { id: 'research', label: 'Research notebook' },
  { id: 'archive', label: 'Archive' },
];

/** Populated at runtime from /api/research/notes when docs viewer loads. */
export let RESEARCH_DOC_ENTRIES = [];

/** @param {Array<{ path: string, label: string, layer: string }>} entries */
export function setResearchDocEntries(entries) {
  RESEARCH_DOC_ENTRIES = entries;
}

function buildDocCatalog() {
  return [
    { path: 'docs/platform-overview.md', label: 'Platform overview', layer: 'essential' },
    { path: 'docs/README.md', label: 'Documentation index', layer: 'essential' },
    { path: 'README.md', label: 'Project README', layer: 'essential' },
    { path: 'docs/third-party.md', label: 'Third-party licenses', layer: 'essential' },
    { path: 'docs/deploy.md', label: 'Deploy & PostgreSQL', layer: 'essential' },
    { path: 'docs/fonoran-auth-and-release.md', label: 'Fonoran auth & release', layer: 'essential' },
    { path: 'SECURITY.md', label: 'Security', layer: 'essential' },
    { path: 'CONTRIBUTING.md', label: 'Contributing', layer: 'essential' },

    { path: 'docs/language-rules.md', label: 'Encoding rules', layer: 'script' },
    { path: 'docs/multilingual-support.md', label: 'Multilingual support', layer: 'script' },
    { path: 'docs/IPA-PIPELINE-REPORT.md', label: 'IPA pipeline report', layer: 'script' },
    { path: 'docs/espeak-integration.md', label: 'eSpeak integration', layer: 'script' },
    { path: 'docs/pronunciation-validation.md', label: 'Pronunciation validation', layer: 'script' },
    { path: 'docs/ipa-normalize.md', label: 'IPA normalization', layer: 'script' },

    { path: 'docs/fonoran-constitution.md', label: 'Fonoran constitution', layer: 'language' },
    { path: 'docs/fonoran.md', label: 'Fonoran guide', layer: 'language' },
    { path: 'docs/fonoran-grammar.md', label: 'Fonoran grammar', layer: 'language' },
    { path: 'docs/fonoran-interpretive-translator.md', label: 'Interpretive translator', layer: 'language' },

    ...RESEARCH_DOC_ENTRIES,

    { path: 'docs/fonoran-gen3.md', label: 'DDA Gen 3 (archive)', layer: 'archive' },
    { path: 'docs/fonoran-gen3-1.md', label: 'Gen 3.1 phonetic layer', layer: 'archive' },
    { path: 'docs/fonoran-generator-archive.md', label: 'Generator archive', layer: 'archive' },
    { path: 'docs/fonoran-semantic-foundation.md', label: 'Semantic foundation', layer: 'archive' },
    { path: 'docs/fonoran-primitive-roots-report.md', label: 'Primitive roots report', layer: 'archive' },
    { path: 'docs/FONORA_CLEANUP_AUDIT.md', label: 'Cleanup audit (2026)', layer: 'archive' },
    { path: 'docs/FONORA_COLLISION_AUDIT.md', label: 'Collision audit', layer: 'archive' },
    { path: 'docs/IPA_VOWEL_NORMALIZATION_AUDIT.md', label: 'Vowel normalization audit', layer: 'archive' },
    { path: 'docs/FONORA_VOWEL_DECISION_REPORT.md', label: 'Vowel decision report (v2)', layer: 'archive' },
  ];
}

/** Curated doc list for the viewer sidebar (includes runtime research entries). */
export function getDocCatalog() {
  return buildDocCatalog();
}

/** Docs the viewer can fetch and render (excludes runtime research notebook routes). */
export function getNavigableDocCatalog() {
  return getDocCatalog().filter(
    (entry) =>
      entry.path.startsWith('docs/') ||
      entry.path === 'README.md' ||
      entry.path === 'CONTRIBUTING.md' ||
      entry.path === 'SECURITY.md',
  );
}

/**
 * @param {string} repoPath e.g. docs/language-rules.md
 */
export function normalizeDocPath(repoPath) {
  const clean = String(repoPath || '')
    .replace(/^\//, '')
    .split(/[?#]/)[0];
  if (!clean || clean.includes('..')) {
    throw new Error('Invalid document path');
  }
  if (ALLOWED_EXACT.has(clean) || clean.startsWith(ALLOWED_PREFIX)) {
    return clean;
  }
  throw new Error('Document path not allowed');
}

/**
 * @param {string} repoPath e.g. docs/language-rules.md or docs/foo.md#section
 */
export function splitDocRef(repoPath) {
  const raw = String(repoPath || '').replace(/^\//, '');
  const hashIdx = raw.indexOf('#');
  const pathPart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const anchor = hashIdx >= 0 ? raw.slice(hashIdx + 1) : '';
  return { path: normalizeDocPath(pathPart), anchor };
}

/**
 * @param {string} repoPath
 */
export function repoPathToSlug(repoPath) {
  const { path } = splitDocRef(repoPath);
  if (ROOT_DOC_SLUGS[path]) return ROOT_DOC_SLUGS[path];
  if (path.startsWith('docs/')) {
    return path.slice('docs/'.length).replace(/\.md$/i, '');
  }
  return path.replace(/\.md$/i, '');
}

/**
 * @param {string} slug
 */
export function slugToRepoPath(slug) {
  const clean = String(slug || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return DEFAULT_DOC_PATH;
  if (SLUG_TO_ROOT_DOC[clean]) return SLUG_TO_ROOT_DOC[clean];
  const candidate = clean.endsWith('.md') ? clean : `docs/${clean}.md`;
  return normalizeDocPath(candidate);
}

/**
 * @param {string} repoPath
 */
export function docViewerHref(repoPath) {
  const { path, anchor } = splitDocRef(repoPath);
  if (path === DEFAULT_DOC_PATH && !anchor) {
    return '/#docs';
  }
  const params = new URLSearchParams({ path });
  const base = `/?${params.toString()}`;
  return anchor ? `${base}#${anchor}` : base;
}

/**
 * @param {string} href
 */
export function repoPathFromViewerHref(href) {
  if (!href) return null;
  try {
    const normalized = String(href).replace(/^\.\.\//, '/').replace(/^\.\//, '/');
    if (normalized.startsWith('/?') || normalized.startsWith('?')) {
      const parsed = parseDocFromLocation({
        pathname: '/',
        search: normalized.startsWith('?') ? normalized : normalized.slice(1),
        hash: normalized.includes('#') ? normalized.slice(normalized.indexOf('#')) : '',
      });
      return parsed?.path ?? null;
    }
    if (normalized === '/#docs' || normalized.endsWith('#docs')) {
      return DEFAULT_DOC_PATH;
    }
    if (normalized.startsWith('/docs')) {
      const pathname = normalized.split('#')[0];
      const hash = normalized.includes('#') ? normalized.slice(normalized.indexOf('#')) : '';
      const parsed = parseDocFromLocation({ pathname, hash, search: '' });
      return parsed?.path ?? null;
    }
    const pathMatch = href.match(/[?&]path=([^&#]+)/);
    if (pathMatch) return normalizeDocPath(decodeURIComponent(pathMatch[1]));
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {Pick<Location, 'pathname' | 'search' | 'hash'>} [loc]
 * @returns {{ path: string, anchor: string } | null}
 */
export function parseDocFromLocation(loc = window.location) {
  const pathname = loc.pathname.replace(/\/$/, '') || '/';
  const params = new URLSearchParams(loc.search);

  if (params.has('path')) {
    const path = normalizeDocPath(params.get('path'));
    const hash = loc.hash.replace(/^#/, '');
    const anchor = params.get('anchor') || (hash && hash !== 'docs' ? hash : '');
    return { path, anchor };
  }

  if (loc.hash.replace(/^#/, '') === 'docs') {
    return { path: DEFAULT_DOC_PATH, anchor: '' };
  }

  // Legacy /docs/* paths: still parsed so old links can redirect client-side.
  if (pathname === '/docs') {
    return { path: DEFAULT_DOC_PATH, anchor: loc.hash.replace(/^#/, '') };
  }

  if (pathname.startsWith('/docs/')) {
    const slug = decodeURIComponent(pathname.slice('/docs/'.length));
    const path = slugToRepoPath(slug);
    return { path, anchor: loc.hash.replace(/^#/, '') };
  }

  return null;
}

/**
 * @param {Pick<Location, 'pathname' | 'search' | 'hash'>} [loc]
 */
export function isDocsRoute(loc = window.location) {
  const pathname = loc.pathname.replace(/\/$/, '') || '/';
  return (
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    new URLSearchParams(loc.search).has('path') ||
    loc.hash.replace(/^#/, '') === 'docs'
  );
}

/**
 * Resolve a markdown link relative to the current doc.
 * @param {string} href
 * @param {string} docPath
 */
export function resolveMarkdownHref(href, docPath) {
  if (!href || href.startsWith('#') || /^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
    return href;
  }
  if (!href.includes('.md')) {
    return href;
  }
  const baseDir = docPath.includes('/') ? docPath.replace(/\/[^/]+$/, '/') : '';
  const joined = href.startsWith('/') ? href.slice(1) : `${baseDir}/${href}`.replace(/\/+/g, '/');
  try {
    return docViewerHref(joined);
  } catch {
    return href;
  }
}

export function openDocViewer(repoPath) {
  const { path } = splitDocRef(repoPath);
  history.pushState(null, '', docViewerHref(repoPath));
  if (typeof window.showTab === 'function') {
    window.showTab('docs');
  }
  return path;
}

/* ------------------------------------------------------------------ *
 * Research notebook routing (/research, /research/timeline, notes)
 * ------------------------------------------------------------------ */

/** Repo path for a research note's markdown source. */
export function researchNoteRepoPath(slug) {
  return `docs/research/${String(slug || '').replace(/[^a-z0-9-]/gi, '')}.md`;
}

/**
 * Canonical href for a research view.
 * @param {string} [slug] omit for the index, 'timeline' for the timeline, otherwise a note slug
 */
export function researchHref(slug) {
  if (!slug) return RESEARCH_BASE;
  if (slug === 'timeline') return `${RESEARCH_BASE}/timeline`;
  if (slug === 'open') return `${RESEARCH_BASE}#open`;
  return `${RESEARCH_BASE}/notes/${slug}`;
}

/** Absolute canonical URL for a research view (for SEO tags / sitemap). */
export function researchCanonical(slug, origin = 'https://fonora.org') {
  return `${origin}${researchHref(slug)}`;
}

/**
 * @param {Pick<Location, 'pathname' | 'hash'>} [loc]
 * @returns {{ view: 'index' | 'open' | 'timeline' | 'note', slug?: string } | null}
 */
export function parseResearchLocation(loc = window.location) {
  const path = loc.pathname.replace(/\/+$/, '') || '/';
  if (path === RESEARCH_BASE) {
    return { view: loc.hash.replace(/^#/, '') === 'open' ? 'open' : 'index' };
  }
  if (path === `${RESEARCH_BASE}/timeline`) {
    return { view: 'timeline' };
  }
  if (path.startsWith(`${RESEARCH_BASE}/notes/`)) {
    const slug = decodeURIComponent(path.slice(`${RESEARCH_BASE}/notes/`.length).replace(/\/+$/, ''));
    return { view: 'note', slug };
  }
  return null;
}

/** @param {Pick<Location, 'pathname'>} [loc] */
export function isResearchRoute(loc = window.location) {
  const path = loc.pathname.replace(/\/+$/, '') || '/';
  return path === RESEARCH_BASE || path.startsWith(`${RESEARCH_BASE}/`);
}
