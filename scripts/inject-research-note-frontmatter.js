#!/usr/bin/env node
/**
 * Add YAML frontmatter to docs/research-notes/RN-*.md from static seed metadata.
 * One-time / idempotent — skips files that already have frontmatter.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResearchNoteFilename, RESEARCH_NOTE_FILENAME_RE } from '../tools/research-notes-md-sync.js';
import { parseResearchNoteFrontmatter } from '../js/research-note-meta.js';
import { inferPhaseFromCode } from '../js/research-notes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MD_DIR = join(ROOT, 'docs/research-notes');
const SEED_PATH = join(ROOT, 'data/research-notes-static-seed.json');

/** @type {Map<string, object>} */
const byCode = new Map();

const seed = JSON.parse(await readFile(SEED_PATH, 'utf8'));
for (const note of seed.notes || []) {
  const meta = note.metadata || note;
  if (meta.code) byCode.set(meta.code, meta);
}

// RN-21+ not in static seed
byCode.set('RN-21', { code: 'RN-21', status: 'Active', date: '2026-07-03', phase: 'phase-4' });
byCode.set('RN-22', { code: 'RN-22', status: 'Foundational', date: '2026-07-03', phase: 'phase-1' });
byCode.set('RN-23', { code: 'RN-23', status: 'Active', date: '2026-07-03', phase: 'phase-1' });

const files = (await readdir(MD_DIR)).filter((f) => RESEARCH_NOTE_FILENAME_RE.test(f)).sort();
let updated = 0;

for (const file of files) {
  const parsed = parseResearchNoteFilename(file);
  if (!parsed) continue;
  const absPath = join(MD_DIR, file);
  const raw = await readFile(absPath, 'utf8');
  if (parseResearchNoteFrontmatter(raw).meta.status) continue;

  const overlay = byCode.get(parsed.code) || {
    status: 'Active',
    date: '2026-07-03',
    phase: inferPhaseFromCode(parsed.code),
  };
  const phase = overlay.phase || inferPhaseFromCode(parsed.code);
  const frontmatter = `---\nstatus: ${overlay.status}\ndate: ${overlay.date}\nphase: ${phase}\n---\n\n`;
  await writeFile(absPath, frontmatter + raw.replace(/^\n+/, ''));
  updated += 1;
  console.log('frontmatter:', file);
}

console.log(`done: ${updated} file(s) updated`);
