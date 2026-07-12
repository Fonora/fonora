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
const tldrOffenders = notes.filter((n) => TLDR_RE.test(n.body || ''));
if (tldrOffenders.length) {
  console.error('Research notes MD verify FAILED: TL;DR blockquote not allowed:');
  for (const note of tldrOffenders) {
    console.error(`  ${note.metadata.code} ${note.slug}: remove the "TL;DR" summary line`);
  }
  process.exit(1);
}

const EM_DASH = '\u2014';
/** Enforced from this RN onward; older notes are grandfathered until edited. */
const EM_DASH_MIN_RN = 31;

function rnNumber(code) {
  const m = /^RN-(\d+)$/i.exec(String(code || ''));
  return m ? Number(m[1]) : 0;
}

const emDashOffenders = notes.filter((n) =>
  rnNumber(n.metadata.code) >= EM_DASH_MIN_RN && (n.body || '').includes(EM_DASH));
if (emDashOffenders.length) {
  console.error('Research notes MD verify FAILED: em dash (—) not allowed:');
  for (const note of emDashOffenders) {
    console.error(`  ${note.metadata.code} ${note.slug}: replace em dashes with commas, colons, or separate sentences`);
  }
  process.exit(1);
}

const codes = notes.map((n) => n.metadata.code).sort();
console.log(`Research notes MD verify: ${notes.length} note(s) OK`);
for (const code of codes) {
  const note = notes.find((n) => n.metadata.code === code);
  console.log(`  ${code} ${note.slug}`);
}
