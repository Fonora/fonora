#!/usr/bin/env node
/**
 * One-time migration: replace legacy research-note slugs with canonical filename slugs.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLUG_MAP = {
  'articulation-grid': 'writing-sound-instead-of-spelling',
  'ipa-pipeline': 'teaching-the-machine-to-hear',
  'vowel-mergers-v2': 'how-few-vowels-can-english-tolerate',
  'vowel-grammar-v3': 'vowels-as-grammar-the-v3-rebuild',
  'multilingual-script': 'one-script-for-every-language',
  'collision-audit': 'hunting-ambiguity-in-the-script',
  'roots-from-grammar': 'can-words-grow-from-a-grid-gen-1-and-gen-2',
  'dda-coordinates': 'meaning-from-coordinates-the-gen-3-dda-experiment',
  'distinctiveness-gen31': 'making-invented-words-memorable-gen-3-1',
  'huffman-roots': 'optimal-sounds-wrong-premise',
  'semantic-foundation': 'the-irreducible-dimensions-of-meaning',
  'editorial-pipeline': 'the-campfire-test-communication-over-correctness',
  'interpretive-translator': 'concepts-are-canonical-sounds-are-editorial-proposals',
  'grammar-particles': 'grammar-as-particles-not-words',
  'the-constitution': 'compiling-english-into-meaning',
  'typing-and-keyboard': 'typing-an-invented-script',
  'puzzle-conversation': 'can-strangers-recover-meaning',
  'compound-reconstruction': 'reconstructing-compounds-under-the-constitution',
  'phase-iv-first-learner-signal': 'first-learner-signal-from-phase-iv-regen',
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git']);

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (SKIP.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) await walk(p, files);
    else if (/\.(md|js|json|html)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function migrateText(text) {
  let out = text;
  for (const [oldSlug, newSlug] of Object.entries(SLUG_MAP)) {
    out = out.replaceAll(`/research/notes/${oldSlug}`, `/research/notes/${newSlug}`);
    out = out.replaceAll(`researchHref('${oldSlug}')`, `researchHref('${newSlug}')`);
    out = out.replaceAll(`researchHref("${oldSlug}")`, `researchHref("${newSlug}")`);
    out = out.replaceAll(`"slug": "${oldSlug}"`, `"slug": "${newSlug}"`);
    out = out.replaceAll(`"${oldSlug}"`, `"${newSlug}"`);
  }
  return out;
}

const files = (await walk(ROOT)).filter((f) => !f.includes('.cursor/plans/') && !f.endsWith('migrate-research-note-slugs.js'));
let changed = 0;
for (const file of files) {
  const before = await readFile(file, 'utf8');
  const after = migrateText(before);
  if (after !== before) {
    await writeFile(file, after);
    changed += 1;
    console.log('updated:', relative(ROOT, file));
  }
}
console.log(`total changed: ${changed}`);
