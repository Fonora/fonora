/** GitHub blob URLs and in-app docs viewer routing. */

export const GITHUB_REPO = 'https://github.com/Fonora/fonora';
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

export const DEFAULT_DOC_PATH = 'docs/fonoran-rulebook.md';

/** Default doc when opening Docs from the Tools section. */
export const TOOLS_DOCS_DEFAULT = 'docs/fonoran-cli-tools.md';

/** @param {Pick<Location, 'pathname'>} [loc] */
export function isToolsPath(loc = window.location) {
  const path = loc.pathname.replace(/\/$/, '') || '/';
  return path === '/tools';
}

/**
 * @param {string} repoPath
 */
export function toolsDocViewerHref(repoPath) {
  const { path, anchor } = splitDocRef(repoPath);
  const params = new URLSearchParams({ path });
  const base = `/tools?${params.toString()}`;
  return anchor ? `${base}#${anchor}` : `${base}#docs`;
}

/**
 * @param {string} repoPath
 * @param {Pick<Location, 'pathname'>} [loc]
 */
export function docViewerHrefForContext(repoPath, loc = window.location) {
  if (isToolsPath(loc)) return toolsDocViewerHref(repoPath);
  return docViewerHref(repoPath);
}

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

/**
 * Docs moved into docs/archive/. Old flat paths (from stored links, legacy
 * /docs/<slug> URLs, and markdown cross-links) resolve to their new location
 * so nothing 404s after the physical move.
 * @type {Record<string, string>}
 */
const DOC_PATH_ALIASES = {
  'docs/fonoran-gen3.md': 'docs/archive/fonoran-gen3.md',
  'docs/fonoran-gen3-1.md': 'docs/archive/fonoran-gen3-1.md',
  'docs/fonoran-generator-archive.md': 'docs/archive/fonoran-generator-archive.md',
  'docs/fonoran-semantic-foundation.md': 'docs/archive/fonoran-semantic-foundation.md',
  'docs/fonoran-primitive-roots-report.md': 'docs/archive/fonoran-primitive-roots-report.md',
  'docs/FONORA_CLEANUP_AUDIT.md': 'docs/archive/FONORA_CLEANUP_AUDIT.md',
  'docs/FONORA_COLLISION_AUDIT.md': 'docs/archive/FONORA_COLLISION_AUDIT.md',
  'docs/IPA_VOWEL_NORMALIZATION_AUDIT.md': 'docs/archive/IPA_VOWEL_NORMALIZATION_AUDIT.md',
  'docs/FONORA_VOWEL_DECISION_REPORT.md': 'docs/archive/FONORA_VOWEL_DECISION_REPORT.md',
  'docs/fonoran-gap-assessment.md': 'docs/archive/fonoran-gap-assessment.md',
  'docs/fonoran-generation-2.md': 'docs/archive/fonoran-generation-2.md',
  'docs/fonoran-grammar-constitutional-audit.md': 'docs/archive/fonoran-grammar-constitutional-audit.md',
  'docs/fonoran-grammar-redesign-proposal.md': 'docs/archive/fonoran-grammar-redesign-proposal.md',
  'docs/fonoran-learning-sessions-log.md': 'docs/archive/fonoran-learning-sessions-log.md',
  'docs/fonoran-llm-playtest-experiment.md': 'docs/archive/fonoran-llm-playtest-experiment.md',
  'docs/fonoran-constitution.md': 'docs/archive/fonoran-constitution.md',
  'docs/fonoran-philosophy.md': 'docs/archive/fonoran-philosophy.md',
};

/** @param {string} path */
function resolveDocRepoPath(path) {
  return DOC_PATH_ALIASES[path] ?? path;
}

/** Display order for grouped docs sidebar. */
export const DOC_LAYER_ORDER = [
  { id: 'script', label: 'Script' },
  { id: 'language', label: 'Language' },
];

/**
 * Language docs only. Technical, workflow, and archive docs stay in the repo
 * (and remain fetchable via direct links) but are not listed in the viewer.
 */
function buildDocCatalog() {
  return [
    { path: 'docs/language-rules.md', label: 'Language rules', layer: 'script' },

    { path: 'docs/fonoran-overview.md', label: 'Overview', layer: 'language' },
    { path: 'docs/fonoran-rulebook.md', label: 'Fonoran rulebook', layer: 'language' },
    { path: 'docs/fonoran-grammar.md', label: 'Fonoran grammar', layer: 'language' },
    { path: 'docs/fonoran-algorithm-roots.md', label: 'Algorithm: root sounds', layer: 'language' },
    { path: 'docs/fonoran-algorithm-compounds.md', label: 'Algorithm: compounds', layer: 'language' },
    { path: 'docs/fonoran-algorithm-translation.md', label: 'Algorithm: translation', layer: 'language' },
    { path: 'docs/fonoran-numerals.md', label: 'Fonoran numerals', layer: 'language' },
  ];
}

/** Curated doc list for the viewer sidebar. */
export function getDocCatalog() {
  return buildDocCatalog();
}

/**
 * Layer eyebrow label for a doc path (toolbar tag).
 * @param {string} repoPath
 */
export function getDocLayerLabel(repoPath) {
  const entry = getDocCatalog().find((item) => item.path === repoPath);
  if (!entry) return 'Documentation';
  const layer = DOC_LAYER_ORDER.find((item) => item.id === entry.layer);
  return layer?.label || 'Documentation';
}

/**
 * @param {string} repoPath
 */
export function getDocLayerId(repoPath) {
  const entry = getDocCatalog().find((item) => item.path === repoPath);
  return entry?.layer || 'essential';
}

/** Docs the viewer can fetch and render. */
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
  return { path: resolveDocRepoPath(normalizeDocPath(pathPart)), anchor };
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
  return resolveDocRepoPath(normalizeDocPath(candidate));
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
  history.pushState(null, '', docViewerHrefForContext(repoPath));
  const docsPanel = document.getElementById('tab-docs');
  if (docsPanel && !docsPanel.hidden && typeof window.loadDocViewer === 'function') {
    window.loadDocViewer(repoPath).catch(() => {});
    return path;
  }
  if (typeof window.showTab === 'function') {
    window.showTab('docs');
  }
  return path;
}
