/**
 * English reference lexicon for manual Fonoran naming.
 * Not assigned to phonetic bases — browse-only vocabulary.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LEXICON_PATH = join(ROOT, 'data/fonoran-english-lexicon.json');
const ROOTS_PATH = join(ROOT, 'data/fonoran-english-roots.json');
const GEN31_PATH = join(ROOT, 'data/fonoran-gen3-1-roots.json');
const CONCEPTS_PATH = join(ROOT, 'data/fonoran-stress-test-concepts.json');

const DOMAIN_LABELS = {
  interface: 'interface',
  index: 'index',
  emanation: 'emanation',
  junction: 'junction',
  cavity: 'cavity',
  stream: 'stream',
};

/** @returns {Promise<{ version: string, generated_at: string, categories: string[], words: { word: string, gloss: string, category: string, source: string }[] }>} */
export async function buildEnglishLexicon() {
  const words = [];
  const seen = new Set();

  const add = (word, gloss, category, source) => {
    const w = String(word ?? '').trim().toLowerCase();
    if (!w || seen.has(w)) return;
    seen.add(w);
    words.push({
      word: w,
      gloss: String(gloss ?? '').trim(),
      category: String(category ?? 'other').trim(),
      source,
    });
  };

  try {
    const rootsFile = JSON.parse(await readFile(ROOTS_PATH, 'utf8'));
    for (const item of rootsFile.words ?? []) {
      add(item.word, item.gloss, item.category, 'roots');
    }
  } catch {
    // roots file built via npm run fonoran:roots
  }

  const gen31 = JSON.parse(await readFile(GEN31_PATH, 'utf8'));
  for (const item of gen31.inventory ?? []) {
    const gloss = item.gloss?.split(';')[0]?.trim() ?? '';
    const domain = item.coordinates?.D ?? 'primitive';
    const category = DOMAIN_LABELS[domain] ?? domain;
    add(item.id, gloss, category, 'primitive');
  }

  const concepts = JSON.parse(await readFile(CONCEPTS_PATH, 'utf8'));
  for (const c of concepts.concepts ?? []) {
    add(c.concept, c.gloss, 'everyday', 'concept');
  }

  words.sort((a, b) => a.word.localeCompare(b.word));
  const categories = [...new Set(words.map(w => w.category))].sort();

  return {
    version: '1.0',
    description: 'English words for manual naming. Not linked to Fonoran spellings.',
    generated_at: new Date().toISOString(),
    word_count: words.length,
    categories,
    words,
  };
}

export async function writeEnglishLexicon() {
  const lexicon = await buildEnglishLexicon();
  await writeFile(LEXICON_PATH, JSON.stringify(lexicon, null, 2) + '\n');
  return lexicon;
}

export async function loadEnglishLexicon() {
  try {
    return JSON.parse(await readFile(LEXICON_PATH, 'utf8'));
  } catch {
    return writeEnglishLexicon();
  }
}
