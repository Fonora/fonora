/** GitHub blob URLs and in-app docs viewer routing. */

export const GITHUB_BLOB_BASE = 'https://github.com/jamesc137/fonora/blob/main/';

export const DEFAULT_DOC_PATH = 'docs/platform-overview.md';

const ALLOWED_EXACT = new Set(['CONTRIBUTING.md', 'README.md']);
const ALLOWED_PREFIX = 'docs/';

const ROOT_DOC_SLUGS = {
  'README.md': 'project-readme',
  'CONTRIBUTING.md': 'contributing',
};

/** @type {Record<string, string>} */
const SLUG_TO_ROOT_DOC = Object.fromEntries(
  Object.entries(ROOT_DOC_SLUGS).map(([path, slug]) => [slug, path]),
);

/** Display order for grouped docs sidebar. */
export const DOC_LAYER_ORDER = [
  { id: 'platform', label: 'Platform' },
  { id: 'script', label: 'Script Layer' },
  { id: 'language', label: 'Language Layer' },
  { id: 'ops', label: 'Operations' },
];

/**
 * Curated doc list for the viewer sidebar.
 * @type {Array<{ path: string, label: string, layer: string }>}
 */
export const DOC_CATALOG = [
  { path: 'docs/platform-overview.md', label: 'Platform overview', layer: 'platform' },
  { path: 'docs/README.md', label: 'Documentation index', layer: 'platform' },
  { path: 'README.md', label: 'Project README', layer: 'platform' },

  { path: 'docs/language-rules.md', label: 'Encoding rules', layer: 'script' },
  { path: 'docs/IPA-PIPELINE-REPORT.md', label: 'IPA pipeline report', layer: 'script' },
  { path: 'docs/ipa-normalize.md', label: 'IPA normalization', layer: 'script' },
  { path: 'docs/multilingual-support.md', label: 'Multilingual support', layer: 'script' },
  { path: 'docs/espeak-integration.md', label: 'eSpeak integration', layer: 'script' },
  { path: 'docs/pronunciation-validation.md', label: 'Pronunciation validation', layer: 'script' },
  { path: 'docs/FONORA_COLLISION_AUDIT.md', label: 'Collision audit', layer: 'script' },
  { path: 'docs/IPA_VOWEL_NORMALIZATION_AUDIT.md', label: 'Vowel normalization audit', layer: 'script' },
  { path: 'docs/FONORA_VOWEL_DECISION_REPORT.md', label: 'Vowel decision report (v2)', layer: 'script' },

  { path: 'docs/fonoran.md', label: 'Fonoran language', layer: 'language' },
  { path: 'docs/fonoran-gen3.md', label: 'DDA semantics (Gen 3)', layer: 'language' },
  { path: 'docs/fonoran-gen3-1.md', label: 'DDA phonetic layer (Gen 3.1)', layer: 'language' },
  { path: 'docs/fonoran-generator-archive.md', label: 'Generator archive', layer: 'language' },

  { path: 'docs/open-problems.md', label: 'Open problems', layer: 'ops' },
  { path: 'docs/deploy.md', label: 'Deploy', layer: 'ops' },
  { path: 'docs/FONORA_CLEANUP_AUDIT.md', label: 'Cleanup audit', layer: 'ops' },
  { path: 'CONTRIBUTING.md', label: 'Contributing', layer: 'ops' },
];

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

export function githubDocUrl(repoPath) {
  const { path } = splitDocRef(repoPath);
  return `${GITHUB_BLOB_BASE}${path}`;
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
  const slug = repoPathToSlug(path);
  const base = slug === repoPathToSlug(DEFAULT_DOC_PATH) ? '/docs' : `/docs/${encodeURIComponent(slug)}`;
  return anchor ? `${base}#${anchor}` : base;
}

/**
 * @param {string} href
 */
export function repoPathFromViewerHref(href) {
  if (!href) return null;
  try {
    const normalized = String(href).replace(/^\.\.\//, '/').replace(/^\.\//, '/');
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

  if (pathname === '/docs') {
    return { path: DEFAULT_DOC_PATH, anchor: loc.hash.replace(/^#/, '') };
  }

  if (pathname.startsWith('/docs/')) {
    const slug = decodeURIComponent(pathname.slice('/docs/'.length));
    const path = slugToRepoPath(slug);
    return { path, anchor: loc.hash.replace(/^#/, '') };
  }

  const params = new URLSearchParams(loc.search);
  if (params.has('path')) {
    const path = normalizeDocPath(params.get('path'));
    const anchor = params.get('anchor') || loc.hash.replace(/^#/, '');
    return { path, anchor: anchor === 'docs' ? '' : anchor };
  }

  if (loc.hash.replace(/^#/, '') === 'docs') {
    return { path: DEFAULT_DOC_PATH, anchor: '' };
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
