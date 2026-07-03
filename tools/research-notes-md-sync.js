/**
 * Build published research notes from docs/research-notes/RN-*.md (main repo).
 * Markdown is the only source — optional YAML frontmatter for status/date/phase.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveMetadataFromBody,
  extractMarkdownH1,
  parseResearchNoteFrontmatter,
  validateNoteMetadata,
} from '../js/research-note-meta.js';
import { inferPhaseFromCode, normalizeNoteMetadata } from '../js/research-notes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RESEARCH_NOTES_MD_DIR = join(ROOT, 'docs/research-notes');

export const RESEARCH_NOTE_FILENAME_RE = /^RN-(\d+)-([a-z0-9-]+)\.md$/i;

/** @param {string} filename */
export function parseResearchNoteFilename(filename) {
  const match = String(filename).match(RESEARCH_NOTE_FILENAME_RE);
  if (!match) return null;
  const num = match[1].padStart(2, '0');
  return {
    code: `RN-${num}`,
    slug: match[2].toLowerCase(),
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** @param {string} absPath */
async function fileDateIso(absPath) {
  try {
    const out = execSync(`git log -1 --format=%ci -- ${shellQuote(absPath)}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out.slice(0, 10);
  } catch {
    // Shallow clone or file outside git — fall back to mtime.
  }
  const st = await stat(absPath);
  return st.mtime.toISOString().slice(0, 10);
}

/**
 * @param {{ mdDir?: string }} [options]
 * @returns {Promise<object[]>} published note records
 */
export async function buildPublishedNotesFromMarkdown(options = {}) {
  const mdDir = options.mdDir || RESEARCH_NOTES_MD_DIR;

  const files = (await readdir(mdDir))
    .filter((name) => RESEARCH_NOTE_FILENAME_RE.test(name))
    .sort((a, b) => a.localeCompare(b));

  if (!files.length) {
    throw new Error(`No research notes found in ${mdDir} (expected RN-XX-slug.md)`);
  }

  /** @type {object[]} */
  const notes = [];
  const slugs = [];

  for (const file of files) {
    const parsed = parseResearchNoteFilename(file);
    if (!parsed) continue;

    const absPath = join(mdDir, file);
    const raw = await readFile(absPath, 'utf8');
    const { meta: frontmatter, body } = parseResearchNoteFrontmatter(raw);

    const derived = deriveMetadataFromBody(body, {
      slug: parsed.slug,
      code: parsed.code,
      title: frontmatter.title,
      status: frontmatter.status,
      date: frontmatter.date,
      phase: frontmatter.phase,
    });

    const title = derived.title || frontmatter.title || extractMarkdownH1(body) || parsed.slug;
    const description = derived.description || frontmatter.description || title;
    const metadata = normalizeNoteMetadata({
      slug: parsed.slug,
      code: parsed.code,
      title,
      status: frontmatter.status || 'Active',
      phase: frontmatter.phase || inferPhaseFromCode(parsed.code),
      date: frontmatter.date || (await fileDateIso(absPath)),
      description,
      abstract: derived.abstract || frontmatter.abstract || description.slice(0, 160),
      related: derived.related?.length ? derived.related : [],
      docs: [],
      tools: [],
      source: derived.source?.length ? derived.source : [],
    });

    const errors = validateNoteMetadata(metadata, {
      existingSlugs: slugs,
      currentSlug: parsed.slug,
    });
    if (errors.length) {
      throw new Error(`${file}: ${errors.join('; ')}`);
    }

    slugs.push(parsed.slug);
    const now = new Date().toISOString();
    notes.push({
      slug: parsed.slug,
      workflow: 'published',
      metadata,
      body: `${body.trimEnd()}\n`,
      updated_at: now,
      published_at: frontmatter.published_at || now,
      updated_by: 'markdown',
    });
  }

  return notes;
}
