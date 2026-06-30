#!/usr/bin/env node
/**
 * Seed English word-bank aliases for the gap-fill concepts (emotion / social / body / space)
 * added to the communicative core. Without these, the new roots only match their bare id;
 * with them, the translator and dictionary recover natural synonyms.
 *
 * Idempotent: only fills entries that are missing.
 *
 * Run: node scripts/fonoran-seed-gapfill-localization.js
 */

import { readDoc, writeDoc } from '../tools/fonoran-store.js';

const ENTRIES = {
  happy: { label: 'happy', aliases: ['glad', 'joyful', 'content', 'cheerful'] },
  angry: { label: 'angry', aliases: ['mad', 'furious', 'cross', 'enraged'] },
  calm: { label: 'calm', aliases: ['peaceful', 'serene', 'relaxed', 'settled'] },
  trust: { label: 'trust', aliases: ['rely', 'believe in', 'depend on'] },
  hope: { label: 'hope', aliases: ['hopeful', 'wish for', 'long for'] },
  drink: { label: 'drink', aliases: ['drinking', 'sip', 'swallow'] },
  tree: { label: 'tree', aliases: ['trees', 'wood'] },
  sky: { label: 'sky', aliases: ['heavens', 'overhead'] },
  left: { label: 'left', aliases: ['left side', 'leftward'] },
  right: { label: 'right', aliases: ['right side', 'rightward'] },
};

async function main() {
  const doc = await readDoc('localization_en');
  if (!doc?.entries) throw new Error('localization doc missing entries');
  let added = 0;
  for (const [id, entry] of Object.entries(ENTRIES)) {
    if (doc.entries[id]) continue;
    doc.entries[id] = entry;
    added += 1;
  }
  await writeDoc('localization_en', doc);
  console.log(`Seeded ${added} gap-fill localization entries (${Object.keys(doc.entries).length} total).`);
}

main().catch(err => { console.error(err); process.exit(1); });
