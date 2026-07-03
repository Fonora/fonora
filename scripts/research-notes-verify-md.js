#!/usr/bin/env node
/**
 * Verify every docs/research-notes/RN-*.md file builds valid published metadata.
 * Run in CI and locally before deploy.
 */
import { buildPublishedNotesFromMarkdown } from '../tools/research-notes-md-sync.js';

const notes = await buildPublishedNotesFromMarkdown();
const codes = notes.map((n) => n.metadata.code).sort();
console.log(`Research notes MD verify: ${notes.length} note(s) OK`);
for (const code of codes) {
  const note = notes.find((n) => n.metadata.code === code);
  console.log(`  ${code} ${note.slug}`);
}
