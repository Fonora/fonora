#!/usr/bin/env node
/**
 * Apply root ring assignments to editorial seeds.
 *
 * - Assigns language_tier (ring) to every primitive in concept-inventory
 * - Adds NEW_ROOT_CONCEPTS + pending root candidates
 * - Removes primitives not in any ring (compound-only going forward)
 * - Tags approved roots and candidates
 *
 * Run: npm run fonoran:root-rings:apply
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { romanToIpa } from '../tools/fonoran-pronunciation.js';
import {
  RING_1_IDS,
  RING_2_IDS,
  RING_3_IDS,
  NEW_ROOT_CONCEPTS,
  buildPrimitiveRecord,
  experienceMetaFor,
  isAllowedPrimitive,
  ringSummary,
  ROOT_RING_CAPS,
} from '../tools/fonoran-experience-tiers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function assertRingIntegrity() {
  if (RING_1_IDS.length !== ROOT_RING_CAPS.communicative_core) {
    throw new Error(`Ring 1 must have exactly ${ROOT_RING_CAPS.communicative_core} concepts (has ${RING_1_IDS.length})`);
  }
  if (RING_2_IDS.length !== 50) {
    throw new Error(`Ring 2 must have exactly 50 concepts (has ${RING_2_IDS.length})`);
  }
  const all = [...RING_1_IDS, ...RING_2_IDS, ...RING_3_IDS];
  const seen = new Set();
  for (const id of all) {
    if (seen.has(id)) throw new Error(`Duplicate concept in rings: ${id}`);
    seen.add(id);
  }
  if (all.length > ROOT_RING_CAPS.fluent_core) {
    throw new Error(`Total assigned roots ${all.length} exceeds cap ${ROOT_RING_CAPS.fluent_core}`);
  }
}

function applyMeta(entry) {
  const meta = experienceMetaFor(entry.id);
  if (!meta) return null;
  entry.experience_tier = meta.experience_tier;
  entry.language_tier = meta.language_tier;
  entry.campfire_pass = meta.campfire.pass;
  entry.campfire_reason = meta.campfire.reason;
  entry.suggested_status = 'primitive';
  delete entry.compound_note;
  return entry;
}

function makeCandidate(def) {
  return {
    id: def.id,
    spelling: null,
    ipa: null,
    concept: def.description,
    domain: def.domain,
    reason: `Ring primitive: ${def.description.split(';')[0].trim()}.`,
    pronunciation_ease: null,
    pronunciation_ease_label: null,
    semantic_usefulness: null,
    semantic_usefulness_label: null,
    priority: 0,
    status: 'pending',
    review: { approved_at: null, rejected_at: null, edited_at: new Date().toISOString(), note: 'root ring seed' },
    generation: { phonetic_cost: null, template: null, tier: 'root-rings' },
    ...experienceMetaFor(def.id),
    campfire_pass: experienceMetaFor(def.id)?.campfire.pass,
    campfire_reason: experienceMetaFor(def.id)?.campfire.reason,
  };
}

async function migrateInventory() {
  const inv = await readDoc('concept_inventory');
  if (!inv?.primitives) throw new Error('concept inventory missing primitives');

  const allowed = new Set([...RING_1_IDS, ...RING_2_IDS, ...RING_3_IDS]);
  const existing = new Map(inv.primitives.map(p => [p.id, p]));
  const next = [];

  for (const id of allowed) {
    const row = existing.get(id) ?? buildPrimitiveRecord(
      NEW_ROOT_CONCEPTS.find(c => c.id === id) ?? { id, domain: 'abstract', description: id, language_tier: 'fluent_core' },
    );
    applyMeta(row);
    next.push(row);
    existing.delete(id);
  }

  const removed = [...existing.keys()];
  inv.primitives = next.sort((a, b) => a.id.localeCompare(b.id));
  inv.primitive_count = inv.primitives.length;
  inv.core_count = inv.primitives.length;
  inv.root_rings = {
    version: '1.0-root-rings',
    caps: ROOT_RING_CAPS,
    summary: ringSummary(),
    spec: 'data/fonoran-root-rings.json',
  };
  inv.organized_by = 'root_rings';
  inv.experience_note = 'Primitives capped at 150 across three rings. See data/fonoran-root-rings.json.';
  await writeDoc('concept_inventory', inv);
  return { total: inv.primitives.length, removed };
}

async function migrateCandidates() {
  const doc = await readDoc('root_candidates');
  if (!doc?.candidates) throw new Error('root candidates missing');

  const byId = new Map(doc.candidates.map(c => [c.id, c]));
  let added = 0;

  for (const def of NEW_ROOT_CONCEPTS) {
    if (byId.has(def.id)) {
      applyMeta(byId.get(def.id));
      continue;
    }
    doc.candidates.push(makeCandidate(def));
    byId.set(def.id, doc.candidates.at(-1));
    added += 1;
  }

  for (const c of doc.candidates) {
    if (!isAllowedPrimitive(c.id)) continue;
    applyMeta(c);
  }

  doc.summary = {
    total: doc.candidates.length,
    pending: doc.candidates.filter(c => c.status === 'pending').length,
    approved: doc.candidates.filter(c => c.status === 'approved').length,
    rejected: doc.candidates.filter(c => c.status === 'rejected').length,
  };
  await writeDoc('root_candidates', doc);
  return { total: doc.candidates.length, added };
}

async function migrateApprovedRoots() {
  const doc = await readDoc('approved_roots');
  if (!doc?.roots) return { total: 0, demoted: [] };
  const kept = [];
  const demoted = [];
  for (const r of doc.roots) {
    if (!isAllowedPrimitive(r.id)) {
      demoted.push(r.id);
      continue;
    }
    applyMeta(r);
    kept.push(r);
  }
  doc.roots = kept.sort((a, b) => a.id.localeCompare(b.id));
  doc.root_count = doc.roots.length;
  await writeDoc('approved_roots', doc);
  return { total: doc.roots.length, demoted };
}

async function syncRingsJsonTimestamp() {
  const path = join(ROOT, 'data/fonoran-root-rings.json');
  const rings = JSON.parse(readFileSync(path, 'utf8'));
  rings.updated_at = new Date().toISOString();
  rings.summary = ringSummary();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, `${JSON.stringify(rings, null, 2)}\n`, 'utf8');
}

async function main() {
  assertRingIntegrity();
  const inv = await migrateInventory();
  const candidates = await migrateCandidates();
  const approved = await migrateApprovedRoots();
  await syncRingsJsonTimestamp();

  console.log('Root rings applied.');
  console.log(`  Ring 1: ${RING_1_IDS.length} | Ring 2: ${RING_2_IDS.length} | Ring 3: ${RING_3_IDS.length} | Cap: ${ROOT_RING_CAPS.fluent_core}`);
  console.log(`  Inventory:  ${inv.total} primitives (${inv.removed.length} removed from ring — compound-only now)`);
  if (inv.removed.length) console.log(`    removed: ${inv.removed.join(', ')}`);
  console.log(`  Candidates: ${candidates.total} (${candidates.added} new pending)`);
  console.log(`  Approved:   ${approved.total} roots`);
  if (approved.demoted.length) console.log(`    demoted from approved (not in rings): ${approved.demoted.join(', ')}`);
  console.log('\nNext: npm run fonoran:build — assign spellings for new pending roots');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
