/**
 * DEPRECATED — use npm run fonoran:build (converged pipeline).
 * See tools/legacy/README.md and docs/fonoran.md.
 *
 * Import experimental primitive-roots vocabulary into the Fonoran lab bucket.
 * Populates Dictionary with roots + compounds mapped to English meanings.
 *
 * Run: npm run fonoran:primitive-roots:import
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBucketRaw } from '../fonoran-store.js';
import { emptyDda, migrateBucket, normalizeCompoundRecord, normalizeSoundRecord } from '../fonoran-derivation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VOCAB_PATH = join(ROOT, 'data/fonoran-primitive-roots.json');

function englishLabel(entry) {
  return String(entry.english).replace(/_/g, ' ');
}

/**
 * @param {{ force?: boolean, vocabularyPath?: string }} opts
 */
export async function importPrimitiveRootsVocabulary(opts = {}) {
  const path = opts.vocabularyPath ?? VOCAB_PATH;
  const data = JSON.parse(await readFile(path, 'utf8'));
  const vocabulary = data.vocabulary ?? [];
  if (!vocabulary.length) {
    throw new Error(`No vocabulary in ${path}. Run: npm run fonoran:primitive-roots`);
  }

  const idToSpelling = Object.fromEntries(
    vocabulary
      .filter(v => v.kind === 'primitive' && v.fonoran)
      .map(v => [v.english, v.fonoran]),
  );

  const now = new Date().toISOString();
  const soundBySpelling = new Map();

  for (const v of vocabulary) {
    if (v.kind !== 'primitive' || !v.fonoran) continue;
    if (soundBySpelling.has(v.fonoran)) continue;
    const entry = {
      id: `snd-gen-${v.fonoran}`,
      spelling: v.fonoran,
      meaning: englishLabel(v),
      state: 'needs_review',
      generator_hint: `${v.english}, primitive root · priority ${v.priority ?? '—'}`,
      created_by: 'generator',
      named_at: now,
      dda: emptyDda(),
    };
    normalizeSoundRecord(entry);
    soundBySpelling.set(v.fonoran, entry);
  }

  const sounds = [...soundBySpelling.values()].sort((a, b) => a.spelling.localeCompare(b.spelling));
  const compounds = [];
  const unresolved = [];

  for (const v of vocabulary) {
    if (v.kind !== 'compound') continue;
    if (!v.fonoran || v.unresolved?.length) {
      unresolved.push({ english: v.english, missing: v.unresolved ?? ['fonoran'] });
      continue;
    }

    const components = [];
    for (const conceptId of v.composition ?? []) {
      const ref = idToSpelling[conceptId];
      if (!ref) {
        unresolved.push({ english: v.english, missing: [conceptId] });
        components.length = 0;
        break;
      }
      components.push({ type: 'root', ref });
    }
    if (!components.length) continue;

    const entry = {
      id: `cmp-${v.fonoran}`,
      spelling: v.fonoran,
      components,
      meaning: englishLabel(v),
      state: 'needs_review',
      generator_hint: `${v.english}, ${v.composition_readable ?? v.composition?.join(' + ')}`,
      created_by: 'generator',
      named_at: now,
      dda: emptyDda(),
    };

    const scratch = { sounds, compounds: [] };
    normalizeCompoundRecord(entry, scratch);
    if (entry.spelling !== v.fonoran) {
      entry.spelling = v.fonoran;
      entry.id = `cmp-${v.fonoran}`;
      entry.parts = (v.composition_roots ?? v.composition.map(id => idToSpelling[id])).filter(Boolean);
      entry.phonetic = { form: v.fonoran };
    }
    compounds.push(entry);
  }

  compounds.sort((a, b) => a.spelling.localeCompare(b.spelling));

  const bucket = migrateBucket({
    version: '2.1-primitive-roots-vocabulary',
    philosophy: 'Experimental vocabulary: algorithmic roots + transparent compounds (docs/fonoran-grammar.md).',
    seeded_from: 'fonoran-primitive-roots.json',
    updated_at: now,
    sounds,
    compounds,
    history: [{
      at: now,
      action: 'import_primitive_roots_vocabulary',
      sounds: sounds.length,
      compounds: compounds.length,
    }],
    events: [{
      at: now,
      type: 'import',
      kind: 'vocabulary',
      detail: `${sounds.length} roots, ${compounds.length} compounds`,
    }],
  });

  await writeBucketRaw(bucket);

  return {
    sounds: sounds.length,
    compounds: compounds.length,
    vocabulary_count: vocabulary.length,
    unresolved,
    seeded_from: bucket.seeded_from,
  };
}

async function main() {
  const result = await importPrimitiveRootsVocabulary();
  console.log(`Imported ${result.sounds} roots + ${result.compounds} compounds (${result.vocabulary_count} vocabulary entries)`);
  if (result.unresolved.length) {
    console.warn(`Unresolved: ${result.unresolved.map(u => u.english).join(', ')}`);
  }
  console.log('Dictionary will show these after reload at /language/#dictionary');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
