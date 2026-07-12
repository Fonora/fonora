/**
 * Research note metadata extraction, validation, and markdown export.
 * Shared by the editor (client) and store/API (server).
 */

import { githubCommitUrl } from './doc-urls.js';

/** @param {string} markdown @returns {string|null} First H1, or null if none */
export function extractMarkdownH1(markdown) {
  const match = String(markdown).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Title for a research note page: metadata is canonical; H1 in body overrides when present.
 * @param {string} markdown
 * @param {string} [metadataTitle]
 */
export function resolveResearchNoteTitle(markdown, metadataTitle = '') {
  return extractMarkdownH1(markdown) || String(metadataTitle || '').trim() || 'Research note';
}

export const NOTE_STATUSES = ['Foundational', 'Active', 'Superseded', 'Open'];

/**
 * Canonical long-form body structure — matches RN-01 and expanded notes in docs/research-notes/.
 * See docs/research-notes-authoring.md for the full expansion prompt and workflow.
 */
export const RESEARCH_NOTE_SECTIONS = [
  'Research Question',
  'Hypothesis',
  'Approach',
  'Evaluation',
  'Findings',
  'What Changed',
  'Open Questions',
  'References',
];

/** @returns {string} Markdown with all canonical section headers (RN-01 style). */
export function researchNoteBodyTemplate(title = '[Title]') {
  return `# ${title}

## Research Question

Connect to the open question(s) left by the previous research note where applicable.

## Hypothesis

State as a hypothesis at the time — not a proven result.

## Approach

What was actually built. Reference real files, docs, and commits; do not invent implementation details.

## Evaluation

How the idea was tested — tools, reports, audits, or informal questions if no formal evaluation yet.

## Findings

What was learned, including what worked and what did not. Note partial or provisional results.

## What Changed

How this work influenced later iterations — what survived and what was superseded. Reference real RN codes that follow.

## Open Questions

Unresolved questions that should flow into the next note's Research Question.

## References

**Related commits**

**Documentation:**

**Interactive demo:**

**Future research notes:**
`;
}

/** Default template for new editor drafts — long-form structure (publish-ready target). */
export const NEW_NOTE_TEMPLATE = researchNoteBodyTemplate('[Title]');

/**
 * Short seed stub for a note before expansion (question → hypothesis → … → next question).
 * Use when capturing scope first; expand with docs/research-notes-authoring.md.
 */
export const NEW_NOTE_STUB_TEMPLATE = `# [Title]

## The question

## The hypothesis

## The constraints

## What we built

## What happened

## The question that followed
`;

/** @param {string} title */
export function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** @param {string} text */
export function firstSentence(text, maxLen = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const match = clean.match(/^[^.!?]+[.!?]?/);
  const sentence = (match ? match[0] : clean).trim();
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Description = the first real paragraph after the H1.
 *
 * Research notes intentionally have NO "TL;DR" (or any other) summary line.
 * They open straight into `## Research Question` in the lab-notebook voice
 * described in docs/research-notes-authoring.md. Do not reintroduce a TL;DR
 * blockquote or special-case it here; `research:verify-md` rejects notes that
 * contain one. Notes must also avoid em dashes (U+2014); see the same doc.
 * @param {string} markdown
 */
export function extractDescription(markdown) {
  const lines = String(markdown).split('\n');
  let pastTitle = false;
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      pastTitle = true;
      continue;
    }
    if (!pastTitle) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#')) continue;
    return trimmed.replace(/\*\*/g, '').replace(/`/g, '');
  }
  return '';
}

/** @param {string} markdown */
export function extractRelatedSlugs(markdown) {
  const slugs = new Set();
  const re = /\/research\/notes\/([a-z0-9-]+)/gi;
  let m;
  while ((m = re.exec(String(markdown))) !== null) {
    slugs.add(m[1].toLowerCase());
  }
  return [...slugs];
}

const REPO_PATH_RE =
  /(?:^|[\s('"`<])(?:\.\.\/)?(docs\/[^\s'"`<>)]+\.md|js\/[^\s'"`<>)]+\.js|tools\/[^\s'"`<>)]+\.js|data\/[^\s'"`<>)]+\.json)/gi;

/** @param {string} markdown */
export function extractSourcePaths(markdown) {
  const paths = new Set();
  let m;
  while ((m = REPO_PATH_RE.exec(String(markdown))) !== null) {
    const path = m[1].replace(/^\.\.\//, '');
    paths.add(path);
  }
  return [...paths].map((path) => ({
    label: path.split('/').pop() || path,
    path,
  }));
}

/**
 * @param {string} markdown
 * @param {object} [existing]
 * @param {string[]} [knownSlugs]
 */
export function deriveMetadataFromBody(markdown, existing = {}, knownSlugs = []) {
  const h1 = extractMarkdownH1(markdown);
  const description = extractDescription(markdown);
  const derivedSlug = slugifyTitle(h1 || existing.title || '');
  const related = extractRelatedSlugs(markdown).filter((s) => s !== existing.slug);
  const source = extractSourcePaths(markdown);

  return {
    title: h1 || existing.title || '',
    description: description || existing.description || '',
    abstract: firstSentence(description || existing.description || '') || existing.abstract || '',
    slug: existing.slug || derivedSlug,
    related: related.length ? related : existing.related || [],
    source: source.length ? source : existing.source || [],
  };
}

/**
 * @param {string[]} codes e.g. ['RN-01', 'RN-17']
 */
export function nextResearchCode(codes) {
  let max = 0;
  for (const code of codes) {
    const m = String(code).match(/^RN-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `RN-${String(max + 1).padStart(2, '0')}`;
}

/** @param {string} markdown @returns {{ meta: Record<string, string>, body: string }} */
export function parseResearchNoteFrontmatter(markdown) {
  const raw = String(markdown);
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const kv = trimmed.match(/^([a-z_]+):\s*(.+)$/i);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: match[2] };
}

/**
 * @param {object} metadata
 * @param {object} [opts]
 */
export function validateNoteMetadata(metadata, opts = {}) {
  const errors = [];
  const slug = String(metadata.slug || '').trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    errors.push('slug must be lowercase letters, numbers, and hyphens');
  }
  if (!metadata.title?.trim()) errors.push('title is required');
  if (!metadata.code?.trim()) errors.push('code is required');
  if (!metadata.phase?.trim() && !metadata.act?.trim()) errors.push('phase is required');
  if (!metadata.date?.trim()) errors.push('date is required');
  if (!metadata.description?.trim()) errors.push('description is required');
  if (!metadata.abstract?.trim()) errors.push('abstract is required');
  if (!NOTE_STATUSES.includes(metadata.status)) {
    errors.push(`status must be one of: ${NOTE_STATUSES.join(', ')}`);
  }
  if (opts.existingSlugs && opts.existingSlugs.includes(slug) && slug !== opts.currentSlug) {
    errors.push('slug already in use');
  }
  return errors;
}

function yamlEscape(value) {
  const s = String(value ?? '');
  if (!s) return '""';
  if (/[:#\n\r]/.test(s) || s.startsWith(' ') || s.endsWith(' ')) {
    return JSON.stringify(s);
  }
  return s;
}

function yamlList(key, items) {
  if (!items?.length) return `${key}: []`;
  return `${key}:\n${items.map((item) => `  - ${yamlEscape(item)}`).join('\n')}`;
}

/**
 * @param {object} row { metadata, body, published_at?, updated_at? }
 */
export function formatNoteMarkdownExport(row) {
  const meta = row.metadata || {};
  const lines = ['---'];
  lines.push(`slug: ${yamlEscape(meta.slug)}`);
  lines.push(`code: ${yamlEscape(meta.code)}`);
  lines.push(`title: ${yamlEscape(meta.title)}`);
  lines.push(`status: ${yamlEscape(meta.status)}`);
  lines.push(`phase: ${yamlEscape(meta.phase || meta.act?.replace(/^act-/, 'phase-'))}`);
  lines.push(`date: ${yamlEscape(meta.date)}`);
  lines.push(`description: ${yamlEscape(meta.description)}`);
  lines.push(`abstract: ${yamlEscape(meta.abstract)}`);
  lines.push(yamlList('related', meta.related));
  if (row.published_at) lines.push(`published_at: ${yamlEscape(row.published_at)}`);
  if (meta.git_commit) {
    lines.push(`git_commit: ${yamlEscape(meta.git_commit)}`);
    lines.push(`git_commit_url: ${yamlEscape(githubCommitUrl(meta.git_commit))}`);
  }
  lines.push('---', '', String(row.body || '').trimEnd(), '');
  return lines.join('\n');
}

/** @returns {Promise<string|null>} */
export async function resolveGitCommit() {
  if (process.env.HEROKU_SLUG_COMMIT?.trim()) {
    return process.env.HEROKU_SLUG_COMMIT.trim();
  }
  try {
    const { execSync } = await import('node:child_process');
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
