#!/usr/bin/env node
/**
 * Verify every docs/research-notes/RN-*.md file builds valid published metadata.
 * Run in CI and locally before deploy.
 */
import { buildPublishedNotesFromMarkdown } from '../tools/research-notes-md-sync.js';

const notes = await buildPublishedNotesFromMarkdown();

// Research notes must NOT carry a "TL;DR" (or similar) summary blockquote — they
// open straight into `## Research Question` per docs/research-notes-authoring.md.
// Fail the build if the deprecated style creeps back in.
const TLDR_RE = /^>\s*\*\*TL;?DR/im;
const offenders = notes.filter((n) => TLDR_RE.test(n.body || ''));
if (offenders.length) {
  console.error('Research notes MD verify FAILED — TL;DR blockquote not allowed:');
  for (const note of offenders) {
    console.error(`  ${note.metadata.code} ${note.slug}: remove the "TL;DR" summary line`);
  }
  process.exit(1);
}

const codes = notes.map((n) => n.metadata.code).sort();
console.log(`Research notes MD verify: ${notes.length} note(s) OK`);
for (const code of codes) {
  const note = notes.find((n) => n.metadata.code === code);
  console.log(`  ${code} ${note.slug}`);
}
