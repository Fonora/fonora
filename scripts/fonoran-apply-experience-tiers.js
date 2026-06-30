#!/usr/bin/env node
/**
 * Apply human-experience metadata to the Fonoran inventory and roots.
 *
 * Adds `experience_tier`, `language_tier`, `campfire_pass`, and `campfire_reason` to:
 *   - data/fonoran-concept-inventory.json  (primitives)
 *   - data/fonoran-approved-roots.json     (roots)
 *   - data/fonoran-root-candidates.json    (candidates)
 *
 * Also seeds the gap-fill concepts (emotion / social / body / space) that the
 * communicative core was missing. Spellings are NOT touched — the next
 * `npm run fonoran:build` assigns CV/CVC forms to any new concept.
 *
 * Idempotent: re-running only refreshes the metadata.
 *
 * Run: node scripts/fonoran-apply-experience-tiers.js
 */

import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import {
  experienceMetaFor,
  GAP_FILL_CONCEPTS,
  gapFillPrimitive,
} from '../tools/fonoran-experience-tiers.js';

function applyMeta(entry) {
  const meta = experienceMetaFor(entry.id);
  entry.experience_tier = meta.experience_tier;
  entry.language_tier = meta.language_tier;
  entry.campfire_pass = meta.campfire.pass;
  entry.campfire_reason = meta.campfire.reason;
  return entry;
}

async function migrateInventory() {
  const inv = await readDoc('concept_inventory');
  if (!inv?.primitives) throw new Error('concept inventory missing primitives');

  const existing = new Set(inv.primitives.map(p => p.id));
  for (const p of inv.primitives) applyMeta(p);

  let added = 0;
  for (const def of GAP_FILL_CONCEPTS) {
    if (existing.has(def.id)) continue;
    inv.primitives.push(gapFillPrimitive(def));
    existing.add(def.id);
    added += 1;
  }

  inv.primitive_count = inv.primitives.length;
  inv.organized_by = 'human_experience';
  inv.experience_note = 'Roots carry experience_tier + language_tier + campfire_pass. See docs/fonoran-constitution.md.';
  await writeDoc('concept_inventory', inv);
  return { total: inv.primitives.length, added };
}

async function migrateApprovedRoots() {
  const doc = await readDoc('approved_roots');
  if (!doc?.roots) return { total: 0 };
  for (const r of doc.roots) applyMeta(r);
  await writeDoc('approved_roots', doc);
  return { total: doc.roots.length };
}

async function migrateCandidates() {
  const doc = await readDoc('root_candidates');
  if (!doc?.candidates) return { total: 0 };
  for (const c of doc.candidates) applyMeta(c);
  await writeDoc('root_candidates', doc);
  return { total: doc.candidates.length };
}

async function main() {
  const inv = await migrateInventory();
  const approved = await migrateApprovedRoots();
  const candidates = await migrateCandidates();
  console.log('Applied experience tiers + campfire metadata.');
  console.log(`  Inventory:  ${inv.total} primitives (${inv.added} gap-fill added)`);
  console.log(`  Approved:   ${approved.total} roots tagged`);
  console.log(`  Candidates: ${candidates.total} candidates tagged`);
  console.log('Next: npm run fonoran:build  (assigns spellings to new concepts)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
