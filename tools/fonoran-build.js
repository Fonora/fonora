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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRootCandidates } from './fonoran-root-candidates.js';
import { writeBucketRaw, readBucketRaw, readDoc, writeDoc } from './fonoran-store.js';
import { emptyDda, migrateBucket, normalizeCompoundRecord, normalizeSoundRecord } from './fonoran-derivation.js';
import { analyzeAmbiguity, auditScores, segmentCompound, checkCompoundBoundary } from './fonoran-gen3-readability.js';
import { aliasesForConcept, loadLocalization } from './fonoran-concepts.js';
import { parseSyllable } from './fonoran-pronunciation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Mark every candidate approved in the review layer + canonical export (testing). */
async function approveReviewLayer(now) {
  const store = await readDoc('root_candidates');
  for (const c of store.candidates ?? []) {
    if (c.status === 'rejected') continue;
    // Compound candidates have no spelling and cannot be approved as roots.
    if (!c.spelling || c.suggested_status === 'compound_candidate') continue;
    c.status = 'approved';
    c.review = { ...(c.review ?? {}), approved_at: c.review?.approved_at ?? now };
  }
  store.summary = {
    total: store.candidates.length,
    pending: store.candidates.filter(c => c.status === 'pending').length,
    approved: store.candidates.filter(c => c.status === 'approved').length,
    rejected: store.candidates.filter(c => c.status === 'rejected').length,
  };
  await writeDoc('root_candidates', store);

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
  await writeDoc('approved_roots', canonical);
}

function labelFromId(id) {
  return String(id).replace(/_/g, ' ');
}

/**
 * Resolve and validate the curated compounds against the assigned roots.
 *
 * Compounds may reference primitive roots OR other compounds (a component id can
 * itself be a compound concept). This mirrors the grammar's semantic tree:
 * sha+ka → shaka (tribe), then shaka+fa → shakafa (war). Nested components are
 * flattened down to their root sequence for spelling, segmentation and boundary
 * checks, so the stored compound stays a transparent string of roots.
 *
 * Returns { resolved, dropped } where resolved compounds parse uniquely.
 */
/**
 * Normalize a compound definition to the legacy flat shape regardless of which schema
 * the file uses. v2 (communicative) stores `{ preferred: { composition, gloss }, alternates }`;
 * v1 stored `{ composition, gloss }` directly. We always expose `composition`, `gloss`,
 * `alternates`, and `understandability`.
 */
function normalizeCompoundDef(def) {
  const composition = def.preferred?.composition ?? def.composition ?? [];
  const gloss = def.preferred?.gloss ?? def.gloss ?? '';
  return {
    concept: def.concept,
    composition,
    gloss,
    alternates: Array.isArray(def.alternates) ? def.alternates : [],
    understandability: def.understandability ?? null,
  };
}

function resolveCompounds(compoundDefsRaw, rootById, rootSpellings) {
  const compoundDefs = compoundDefsRaw.map(normalizeCompoundDef);
  const conceptIds = new Set(Object.keys(rootById));
  const segInventory = rootSpellings.map(root => ({ root, id: root }));
  const resolved = [];
  const dropped = [];
  const usedSpellings = new Set(rootSpellings);

  // resolvedById maps a concept id to its flattened root sequence.
  // Seed it with every primitive root (a root is a one-element sequence).
  const resolvedById = new Map();
  for (const [id, root] of Object.entries(rootById)) {
    resolvedById.set(id, { roots: [root], spelling: root });
  }

  const defById = new Map();
  for (const def of compoundDefs) {
    if (!conceptIds.has(def.concept)) defById.set(def.concept, def);
  }

  // Best-effort: resolve an alternate composition to a transparent spelling. Returns null
  // when any component is unresolved or the join breaks the boundary constraint. Alternates
  // are recognizable input forms for puzzle/repair mode, so they may collide with the
  // preferred spelling space without being dropped.
  const resolveAlternate = comp => {
    if (!Array.isArray(comp) || !comp.length) return null;
    if (!comp.every(id => resolvedById.has(id))) return null;
    const seq = comp.flatMap(id => resolvedById.get(id).roots);
    if (!checkCompoundBoundary(seq).valid) return null;
    return { composition: comp, parts: seq, spelling: seq.join('') };
  };

  const validateAndRecord = def => {
    const comps = def.composition ?? [];
    const rootSeq = comps.flatMap(id => resolvedById.get(id).roots);
    const spelling = rootSeq.join('');

    if (usedSpellings.has(spelling)) {
      dropped.push({ concept: def.concept, reason: `spelling "${spelling}" collides with an existing root/compound` });
      return;
    }

    const segs = segmentCompound(spelling, segInventory);
    const intended = rootSeq.join('+');
    const unique = segs.length === 1;
    const matchesIntent = segs.some(s => s.join('+') === intended);
    if (!unique || !matchesIntent) {
      dropped.push({
        concept: def.concept,
        reason: `ambiguous segmentation (${segs.length}: ${segs.map(s => s.join('+')).join(' | ')})`,
      });
      return;
    }

    const boundary = checkCompoundBoundary(rootSeq);
    if (!boundary.valid) {
      dropped.push({ concept: def.concept, reason: boundary.violations.map(v => v.reason).join('; ') });
      return;
    }

    usedSpellings.add(spelling);
    resolvedById.set(def.concept, { roots: rootSeq, spelling });
    const alternateForms = (def.alternates ?? [])
      .map(alt => {
        const r = resolveAlternate(alt.composition);
        if (!r || r.spelling === spelling) return null;
        return {
          spelling: r.spelling,
          composition: r.composition,
          parts: r.parts,
          understandability: alt.understandability ?? null,
          status: alt.status ?? 'plausible',
          source: alt.source ?? 'heuristic',
        };
      })
      .filter(Boolean);
    resolved.push({ ...def, spelling, rootSeq, alternateForms });
  };

  let pending = [];
  for (const def of compoundDefs) {
    if (conceptIds.has(def.concept)) {
      dropped.push({ concept: def.concept, reason: 'shadows a primitive root id' });
      continue;
    }
    pending.push(def);
  }

  // Iterate to a fixed point: resolve any compound whose components are all known.
  let progress = true;
  while (progress && pending.length) {
    progress = false;
    const stillPending = [];
    for (const def of pending) {
      const comps = def.composition ?? [];
      const unknown = comps.filter(id => !resolvedById.has(id));
      if (unknown.length === 0) {
        validateAndRecord(def);
        progress = true;
        continue;
      }
      // A component we cannot resolve now is only worth waiting on if it is itself
      // a (not-yet-resolved) compound. Otherwise it is genuinely missing.
      const waitable = unknown.every(id => defById.has(id));
      if (waitable) stillPending.push(def);
      else dropped.push({ concept: def.concept, reason: `missing components: ${unknown.join(', ')}` });
    }
    pending = stillPending;
  }

  // Anything left forms an unresolvable dependency cycle.
  for (const def of pending) {
    const unknown = (def.composition ?? []).filter(id => !resolvedById.has(id));
    dropped.push({ concept: def.concept, reason: `unresolved components (cycle?): ${unknown.join(', ')}` });
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
  const locData = await loadLocalization('en');

  // 1. Roots — regenerate, locking everything already approved.
  // Skip rejected rows and compound candidates (semantic-only, no spelling yet).
  const rootOutput = await generateRootCandidates({ preserveReview });
  const candidates = rootOutput.candidates.filter(c =>
    c.status !== 'rejected' && c.spelling && c.suggested_status !== 'compound_candidate');

  // Build-time gate: every primitive root must be a valid single-syllable CV or CVC form.
  // CV-CV and multi-syllable spellings are not allowed for primitive roots.
  const syllableViolations = candidates.filter(c => {
    const parsed = parseSyllable(c.spelling);
    return !parsed || parsed.unparsed || !parsed.vowel;
  });
  if (syllableViolations.length > 0) {
    const list = syllableViolations.map(c => `  ${c.spelling} (${c.id})`).join('\n');
    throw new Error(
      `Build halted: ${syllableViolations.length} primitive root(s) are not valid CV/CVC syllables.\n` +
      `Primitive roots must be one syllable only. CV-CV forms are reserved for compounds.\n` +
      `Invalid roots:\n${list}`
    );
  }

  const rootById = Object.fromEntries(candidates.map(c => [c.id, c.spelling]));
  const rootSpellings = candidates.map(c => c.spelling);

  // 2. Compounds — build + validate unique segmentation.
  const compoundDoc = (await readDoc('compounds')) ?? { compounds: [] };
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
        aliases: aliasesForConcept({ id: c.id, concept: c.concept }, locData),
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
        components: def.rootSeq.map(ref => ({ type: 'root', ref })),
        meaning: labelFromId(def.concept),
        concept_id: def.concept,
        gloss: def.gloss ?? '',
        aliases: aliasesForConcept({ id: def.concept, concept: def.gloss ?? def.concept }, locData),
        state: approveAll ? 'approved' : 'needs_review',
        composition_readable: `${def.concept} = ${def.composition.join(' + ')}`,
        generator_hint: `curated: ${def.concept} = ${def.composition.join(' + ')}`,
        created_by: 'generator',
        named_at: now,
        dda: emptyDda(),
        understandability: def.understandability ?? null,
        alternate_forms: def.alternateForms ?? [],
      };
      const scratch = { sounds, compounds: [] };
      normalizeCompoundRecord(entry, scratch);
      if (entry.spelling !== def.spelling) {
        entry.spelling = def.spelling;
        entry.id = `cmp-${def.spelling}`;
        entry.parts = def.rootSeq;
        entry.phonetic = { form: def.spelling };
      }
      return entry;
    })
    .sort((a, b) => a.spelling.localeCompare(b.spelling));

  let preservedCompounds = [];
  let preservedSounds = [];
  try {
    const existing = await readBucketRaw();
    const builtCompoundSpellings = new Set(compounds.map(c => c.spelling));
    const builtSoundSpellings = new Set(sounds.map(s => s.spelling));
    preservedCompounds = (existing?.compounds ?? []).filter(c =>
      c.created_by === 'user' && !builtCompoundSpellings.has(c.spelling),
    );
    preservedSounds = (existing?.sounds ?? []).filter(s =>
      s.created_by === 'user' && !builtSoundSpellings.has(s.spelling),
    );
  } catch {
    /* first build or empty bucket */
  }

  const mergedSounds = [...sounds, ...preservedSounds].sort((a, b) => a.spelling.localeCompare(b.spelling));
  const mergedCompounds = [...compounds, ...preservedCompounds].sort((a, b) => a.spelling.localeCompare(b.spelling));

  const bucket = buildBucket(mergedSounds, mergedCompounds, now);
  await writeBucketRaw(bucket);

  // When pre-approving for testing, keep the review layer + canonical export in sync
  // so the Dictionary and Root Review agree (no half-approved state).
  if (approveAll) await approveReviewLayer(now);

  const health = computeHealth(bucket);

  return {
    roots: mergedSounds.length,
    approved: approveAll ? sounds.length : candidates.filter(c => c.status === 'approved').length,
    approveAll,
    compounds: mergedCompounds.length,
    preserved_compounds: preservedCompounds.length,
    preserved_sounds: preservedSounds.length,
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
  if (r.preserved_compounds || r.preserved_sounds) {
    console.log(`  Preserved: ${r.preserved_sounds ?? 0} user roots, ${r.preserved_compounds ?? 0} user words`);
  }
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
  console.log('Reload /language/ to see Concept Editor, Dictionary and Health in sync.');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
