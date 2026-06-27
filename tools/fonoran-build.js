#!/usr/bin/env node
/**
 * Fonoran unified build — the single converged language pipeline.
 *
 * One command replaces the old split workflow (root-candidates + primitive-roots + import):
 *   1. Generate root candidates from data/fonoran-concept-inventory.json,
 *      LOCKING every spelling you have already approved (preserves the language "feel").
 *   2. Build curated compounds from data/fonoran-compounds.json out of those roots,
 *      validating that every compound segments back to its parts UNIQUELY
 *      (drops ambiguous ones so Parseability stays clean).
 *   3. Import roots + compounds into the lab bucket so Concept Editor, Dictionary
 *      and Health all read one consistent inventory.
 *   4. Print the resulting language-health scores.
 *
 * Run: npm run fonoran:build
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRootCandidates } from './fonoran-root-candidates.js';
import { writeBucketRaw } from './fonoran-store.js';
import { emptyDda, migrateBucket, normalizeCompoundRecord, normalizeSoundRecord } from './fonoran-derivation.js';
import { analyzeAmbiguity, auditScores, segmentCompound } from './fonoran-gen3-readability.js';
import { aliasesForConcept } from './fonoran-concepts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOUNDS_PATH = join(ROOT, 'data/fonoran-compounds.json');
const CANDIDATES_PATH = join(ROOT, 'data/fonoran-root-candidates.json');
const CANONICAL_PATH = join(ROOT, 'data/fonoran-approved-roots.json');

/** Mark every candidate approved in the review layer + canonical export (testing). */
async function approveReviewLayer(now) {
  const store = JSON.parse(await readFile(CANDIDATES_PATH, 'utf8'));
  for (const c of store.candidates ?? []) {
    if (c.status === 'rejected') continue;
    c.status = 'approved';
    c.review = { ...(c.review ?? {}), approved_at: c.review?.approved_at ?? now };
  }
  store.summary = {
    total: store.candidates.length,
    pending: store.candidates.filter(c => c.status === 'pending').length,
    approved: store.candidates.filter(c => c.status === 'approved').length,
    rejected: store.candidates.filter(c => c.status === 'rejected').length,
  };
  await writeFile(CANDIDATES_PATH, JSON.stringify(store, null, 2) + '\n');

  const approved = store.candidates.filter(c => c.status === 'approved');
  const canonical = {
    version: '1.0-approved-roots',
    updated_at: now,
    philosophy: 'Only human-approved roots from Root Review are canonical.',
    root_count: approved.length,
    roots: approved.map(c => ({
      id: c.id,
      spelling: c.spelling,
      ipa: c.ipa,
      concept: c.concept,
      domain: c.domain,
      reason: c.reason,
      approved_at: c.review?.approved_at,
    })),
  };
  await writeFile(CANONICAL_PATH, JSON.stringify(canonical, null, 2) + '\n');
}

function labelFromId(id) {
  return String(id).replace(/_/g, ' ');
}

/**
 * Resolve and validate the curated compounds against the assigned roots.
 * Returns { resolved, dropped } where resolved compounds parse uniquely.
 */
function resolveCompounds(compoundDefs, rootById, rootSpellings) {
  const conceptIds = new Set(Object.keys(rootById));
  const segInventory = rootSpellings.map(root => ({ root, id: root }));
  const resolved = [];
  const dropped = [];
  const usedSpellings = new Set(rootSpellings);

  for (const def of compoundDefs) {
    if (conceptIds.has(def.concept)) {
      dropped.push({ concept: def.concept, reason: 'shadows a primitive root id' });
      continue;
    }
    const parts = (def.composition ?? []).map(id => ({ id, root: rootById[id] ?? null }));
    const missing = parts.filter(p => !p.root).map(p => p.id);
    if (missing.length) {
      dropped.push({ concept: def.concept, reason: `missing components: ${missing.join(', ')}` });
      continue;
    }

    const spelling = parts.map(p => p.root).join('');
    if (usedSpellings.has(spelling)) {
      dropped.push({ concept: def.concept, reason: `spelling "${spelling}" collides with an existing root/compound` });
      continue;
    }

    const segs = segmentCompound(spelling, segInventory);
    const intended = parts.map(p => p.root).join('+');
    const unique = segs.length === 1;
    const matchesIntent = segs.some(s => s.join('+') === intended);
    if (!unique || !matchesIntent) {
      dropped.push({
        concept: def.concept,
        reason: `ambiguous segmentation (${segs.length}: ${segs.map(s => s.join('+')).join(' | ')})`,
      });
      continue;
    }

    usedSpellings.add(spelling);
    resolved.push({ ...def, spelling, parts });
  }

  return { resolved, dropped };
}

function buildBucket(sounds, compounds, now) {
  return migrateBucket({
    version: '3.0-converged',
    philosophy: 'Single converged build: approved-locked roots + curated transparent compounds (docs/fonoran-grammar.md).',
    seeded_from: 'fonoran-build (concept-inventory + compounds)',
    updated_at: now,
    sounds,
    compounds,
    history: [{
      at: now,
      action: 'fonoran_build',
      sounds: sounds.length,
      compounds: compounds.length,
    }],
    events: [{
      at: now,
      type: 'import',
      kind: 'converged_build',
      detail: `${sounds.length} roots, ${compounds.length} compounds`,
    }],
  });
}

function computeHealth(bucket) {
  const inventory = bucket.sounds.map(s => ({
    root: s.spelling,
    id: s.concept_id ?? s.spelling,
    gloss: s.meaning ?? s.spelling,
    coordinates: {},
    repair_steps: 0,
  }));
  const derivations = bucket.compounds.map(c => ({
    compound: c.spelling,
    concept: c.meaning ?? c.concept_id ?? c.id,
    composition: (c.components ?? []).map(comp => comp.ref),
  }));
  const warnings = analyzeAmbiguity(inventory, derivations);
  const scores = auditScores(inventory, derivations, warnings);
  return { scores, warnings };
}

export async function buildFonoran({ preserveReview = true, approveAll = false } = {}) {
  const now = new Date().toISOString();

  // 1. Roots — regenerate, locking everything already approved.
  const rootOutput = await generateRootCandidates({ preserveReview });
  const candidates = rootOutput.candidates.filter(c => c.status !== 'rejected');
  const rootById = Object.fromEntries(candidates.map(c => [c.id, c.spelling]));
  const rootSpellings = candidates.map(c => c.spelling);

  // 2. Compounds — build + validate unique segmentation.
  const compoundDoc = JSON.parse(await readFile(COMPOUNDS_PATH, 'utf8'));
  const { resolved, dropped } = resolveCompounds(compoundDoc.compounds ?? [], rootById, rootSpellings);

  // 3. Lab records.
  const sounds = candidates
    .map(c => {
      const entry = {
        id: `snd-${c.spelling}`,
        spelling: c.spelling,
        meaning: labelFromId(c.id),
        concept_id: c.id,
        gloss: c.concept,
        aliases: aliasesForConcept({ id: c.id, concept: c.concept }),
        state: approveAll || c.status === 'approved' ? 'approved' : 'needs_review',
        generator_hint: `${c.id} · primitive root${c.status === 'approved' ? ' · approved' : ''}`,
        created_by: 'generator',
        named_at: now,
        dda: emptyDda(),
      };
      normalizeSoundRecord(entry);
      return entry;
    })
    .sort((a, b) => a.spelling.localeCompare(b.spelling));

  const compounds = resolved
    .map(def => {
      const entry = {
        id: `cmp-${def.spelling}`,
        spelling: def.spelling,
        components: def.parts.map(p => ({ type: 'root', ref: p.root })),
        meaning: labelFromId(def.concept),
        concept_id: def.concept,
        gloss: def.gloss ?? '',
        aliases: aliasesForConcept({ id: def.concept, concept: def.gloss ?? def.concept }),
        state: approveAll ? 'approved' : 'needs_review',
        generator_hint: `${def.concept} = ${def.composition.join(' + ')}`,
        created_by: 'generator',
        named_at: now,
        dda: emptyDda(),
      };
      const scratch = { sounds, compounds: [] };
      normalizeCompoundRecord(entry, scratch);
      if (entry.spelling !== def.spelling) {
        entry.spelling = def.spelling;
        entry.id = `cmp-${def.spelling}`;
        entry.parts = def.parts.map(p => p.root);
        entry.phonetic = { form: def.spelling };
      }
      return entry;
    })
    .sort((a, b) => a.spelling.localeCompare(b.spelling));

  const bucket = buildBucket(sounds, compounds, now);
  await writeBucketRaw(bucket);

  // When pre-approving for testing, keep the review layer + canonical export in sync
  // so the Dictionary and Root Review agree (no half-approved state).
  if (approveAll) await approveReviewLayer(now);

  const health = computeHealth(bucket);

  return {
    roots: sounds.length,
    approved: approveAll ? sounds.length : candidates.filter(c => c.status === 'approved').length,
    approveAll,
    compounds: compounds.length,
    dropped,
    health,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const approveAll = argv.some(a => a === '--approve-all' || a === '--approve_all' || a === 'approve_all=true');

  const r = await buildFonoran({ approveAll });
  console.log('Fonoran converged build complete.');
  if (r.approveAll) console.log('  Mode:      APPROVE-ALL (everything imported pre-approved, for testing)');
  console.log(`  Roots:     ${r.roots} (${r.approved} approved${r.approveAll ? '' : '/locked'})`);
  console.log(`  Compounds: ${r.compounds} built${r.approveAll ? ' (all approved)' : ''}, ${r.dropped.length} dropped`);
  if (r.dropped.length) {
    for (const d of r.dropped) console.log(`    - dropped ${d.concept}: ${d.reason}`);
  }
  const s = r.health.scores;
  console.log('  Health:');
  console.log(`    Learnability    ${s.learnability}/100`);
  console.log(`    Pronounceability ${s.pronounceability}/100`);
  console.log(`    Memorability    ${s.memorability}/100`);
  console.log(`    Parseability    ${s.parseability}/100`);
  console.log(`    Avg compound len ${s.compoundLength}`);
  console.log(`    Algorithmic feel ${s.algorithmicFeel}%`);
  console.log(`    Warnings: ${r.health.scores.warningCount} (${r.health.scores.highSeverityCount} high)`);
  console.log('Reload /fonoran/ to see Concept Editor, Dictionary and Health in sync.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
