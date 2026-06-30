#!/usr/bin/env node
/**
 * Migrate data/fonoran-compounds.json from single canonical recipes to ranked
 * meaning-attempts.
 *
 * OLD shape (one canonical answer per concept):
 *   { "concept": "river", "composition": ["water","path"], "gloss": "..." }
 *
 * NEW shape (a preferred form PLUS alternate understandable forms):
 *   {
 *     "concept": "river",
 *     "preferred":  { "composition": ["water","path"], "gloss": "..." },
 *     "alternates": [ { "composition": ["flow","water"], "understandability": 0.82,
 *                       "label": "very likely understood", "status": "plausible",
 *                       "source": "heuristic" }, ... ],
 *     "understandability": 0.86,
 *     "notes": "preferred is the seed recipe; alternates are heuristic until playtested"
 *   }
 *
 * The understandability number is an advisory RANKING AID only (see the constitution).
 * Alternate `status` stays "plausible"/"confusing" until a human playtest promotes a form
 * to "understood" or sets it "preferred".
 *
 * Idempotent: re-running re-derives alternates and refreshes scores without losing a
 * human-chosen preferred form.
 *
 * Run: node scripts/fonoran-migrate-compounds.js
 */

import { readDoc, writeDoc } from '../tools/fonoran-store.js';
import { scoreUnderstandability, metaLookupFromRecords } from '../tools/fonoran-understandability.js';
import { experienceMetaFor } from '../tools/fonoran-experience-tiers.js';
import { ASSOCIATION_SEEDS } from '../tools/fonoran-expression-candidates.js';

function key(comp) {
  return (comp ?? []).join('+');
}

function statusFromScore(score) {
  if (score >= 0.5) return 'plausible';
  return 'confusing';
}

async function main() {
  const [doc, inventory, approved] = await Promise.all([
    readDoc('compounds'),
    readDoc('concept_inventory'),
    readDoc('approved_roots'),
  ]);
  if (!doc?.compounds) throw new Error('compounds doc missing compounds array');

  const fromRecords = metaLookupFromRecords([
    ...(inventory?.primitives ?? []),
    ...(approved?.roots ?? []),
  ]);
  const metaFor = id => fromRecords(id) ?? experienceMetaFor(id);

  // Collision counts across all preferred forms (an exact combo claimed by 2+ concepts
  // is ambiguous and should score lower).
  const collisionCounts = new Map();
  for (const c of doc.compounds) {
    const pref = c.preferred?.composition ?? c.composition;
    if (pref) collisionCounts.set(key(pref), (collisionCounts.get(key(pref)) ?? 0) + 1);
  }

  const migrated = doc.compounds.map(c => {
    const preferredComposition = c.preferred?.composition ?? c.composition ?? [];
    const gloss = c.preferred?.gloss ?? c.gloss ?? '';
    const prefScore = scoreUnderstandability(preferredComposition, {
      metaFor,
      collisionCount: collisionCounts.get(key(preferredComposition)) ?? 1,
    });

    // Preserve any human/playtest alternates already present; re-derive heuristic ones.
    const humanAlternates = (c.alternates ?? []).filter(
      a => a.source && a.source !== 'heuristic',
    );
    const humanKeys = new Set(humanAlternates.map(a => key(a.composition)));
    const prefKey = key(preferredComposition);

    const seedAlternates = (ASSOCIATION_SEEDS[c.concept] ?? [])
      .filter(comp => key(comp) !== prefKey && !humanKeys.has(key(comp)))
      .map(comp => {
        const s = scoreUnderstandability(comp, {
          metaFor,
          collisionCount: collisionCounts.get(key(comp)) ?? 1,
        });
        return {
          composition: comp,
          understandability: s.score,
          label: s.label,
          status: statusFromScore(s.score),
          source: 'heuristic',
        };
      })
      .sort((a, b) => b.understandability - a.understandability)
      .slice(0, 4);

    const alternates = [...humanAlternates, ...seedAlternates];

    return {
      concept: c.concept,
      preferred: { composition: preferredComposition, gloss },
      alternates,
      understandability: prefScore.score,
      notes: c.notes
        ?? 'preferred is the seed recipe; alternates are heuristic until playtested',
    };
  });

  const out = {
    version: '2.0-communicative',
    status: 'canonical',
    philosophy:
      'Compounds are meaning-attempts, not canonical answers. Each concept keeps a preferred '
      + 'form and alternate understandable forms. understandability is an advisory ranking aid; '
      + 'human guess-the-meaning playtests decide the preferred form (docs/fonoran-constitution.md).',
    description:
      'Curated transparent Fonoran compounds with ranked alternates. Components reference ids '
      + 'in data/fonoran-concept-inventory.json (primitive roots) OR other compounds in this file.',
    compound_count: migrated.length,
    compounds: migrated,
  };
  await writeDoc('compounds', out);
  console.log(`Migrated ${migrated.length} compounds to ranked preferred + alternates.`);
  const withAlts = migrated.filter(c => c.alternates.length).length;
  console.log(`  ${withAlts} concepts now carry alternate understandable forms.`);
}

main().catch(err => { console.error(err); process.exit(1); });
