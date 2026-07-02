#!/usr/bin/env node
/**
 * Fonoran Gen 3.1: distinctiveness-aware root generator.
 * Semantic DDA coordinates unchanged; phonetic vowel spread + grid repair.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  distinctivenessPenalty,
  distinctivenessScore,
  splitRoot,
  rhymeKey,
} from '../../fonoran-gen3-distinctiveness.js';
import { analyzeAmbiguity, auditScores, segmentCompound } from '../../fonoran-gen3-readability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CONFIG_PATH = join(ROOT, 'data', 'fonoran-gen3-1-config.json');
const OUTPUT_PATH = join(ROOT, 'data', 'fonoran-gen3-1-roots.json');

const MANNER_ORDER = ['plain', 'voice', 'friction', 'nasal', 'glide'];
const PLACE_IDS = ['1', '2', '3', '4', '5'];

function resolveCanonical(primitive, config) {
  return {
    place: config.depth_to_place[primitive.D],
    manner: config.mode_to_manner[primitive.M],
    vowel: config.aspect_vowel[primitive.A],
    D: primitive.D,
    M: primitive.M,
    A: primitive.A,
  };
}

function buildSyllable(onset, vowel, coda = '') {
  if (!onset) return null;
  return coda ? onset + vowel + coda : onset + vowel;
}

function plainCodas(config) {
  const row = config.sound_grid.plain;
  const out = [];
  for (const p of PLACE_IDS) {
    const c = row[p];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function sortedVowelPool(pool, vowelEndingCounts) {
  return [...pool].sort((a, b) =>
    (vowelEndingCounts.get(a) ?? 0) - (vowelEndingCounts.get(b) ?? 0),
  );
}

function generateRoot(primitive, config, manner, place, vowel, coda = '') {
  const onset = config.sound_grid[manner]?.[place] ?? null;
  const root = buildSyllable(onset, vowel, coda);
  const canonical = config.aspect_vowel[primitive.A];
  return {
    root,
    coordinates: {
      id: primitive.id,
      gloss: primitive.gloss,
      D: primitive.D,
      M: primitive.M,
      A: primitive.A,
      place,
      manner,
      vowel,
      vowel_canonical: canonical,
      phonetic_spread: vowel !== canonical,
      syllable_template: coda ? 'CVC' : 'CV',
      coda: coda || null,
      fonora_onset: onset,
      notation: `⟨${primitive.D}, ${primitive.M}, ${primitive.A}⟩`,
    },
  };
}

function* candidateCoordinates(primitive, config, vowelEndingCounts, rhymeCounts) {
  const canon = resolveCanonical(primitive, config);
  const pool = config.phonetic_realization?.aspect_vowel_pools?.[primitive.A]
    ?? [canon.vowel];
  const seen = new Set();
  const vowelOrder = sortedVowelPool(pool, vowelEndingCounts);
  const codas = ['', ...plainCodas(config)];

  const push = (place, manner, vowel, coda = '') => {
    const key = `${place}|${manner}|${vowel}|${coda}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { place, manner, vowel, coda, canon };
  };

  const phases = [];
  for (const vowel of vowelOrder) {
    phases.push([canon.place, canon.manner, vowel, '']);
  }
  for (let md = 1; md < MANNER_ORDER.length; md++) {
    const manner = MANNER_ORDER[(MANNER_ORDER.indexOf(canon.manner) + md) % MANNER_ORDER.length];
    for (const vowel of vowelOrder) phases.push([canon.place, manner, vowel, '']);
  }
  for (let pd = 1; pd < PLACE_IDS.length; pd++) {
    const place = PLACE_IDS[(PLACE_IDS.indexOf(canon.place) + pd) % PLACE_IDS.length];
    for (let md = 0; md < MANNER_ORDER.length; md++) {
      const manner = MANNER_ORDER[(MANNER_ORDER.indexOf(canon.manner) + md) % MANNER_ORDER.length];
      for (const vowel of vowelOrder) phases.push([place, manner, vowel, '']);
    }
  }
  for (const [place, manner, vowel] of [...phases]) {
    for (const coda of plainCodas(config)) {
      phases.push([place, manner, vowel, coda]);
    }
  }

  for (const [place, manner, vowel, coda] of phases) {
    const c = push(place, manner, vowel, coda);
    if (c) yield c;
  }
}

function repairDistance(canon, place, manner, vowel, pool) {
  const pd = (PLACE_IDS.indexOf(place) - PLACE_IDS.indexOf(canon.place) + 5) % 5;
  const md = (MANNER_ORDER.indexOf(manner) - MANNER_ORDER.indexOf(canon.manner) + 5) % 5;
  const vi = pool.indexOf(vowel);
  const canonicalVi = pool.indexOf(canon.vowel);
  const vd = vi >= 0 && canonicalVi >= 0
    ? Math.min(Math.abs(vi - canonicalVi), pool.length - Math.abs(vi - canonicalVi))
    : vi >= 0 ? vi : 0;
  return { pd, md, vd, total: pd + md + vd };
}

function primitivePriority(primitive, config) {
  const ids = new Set();
  for (const d of config.example_derivations ?? []) {
    for (const id of d.composition) ids.add(id);
  }
  let score = 0;
  if (ids.has(primitive.id)) score += 1000;
  if (primitive.A === 'focal') score += 100;
  return score;
}

function generateDistinct(primitive, config, usedRoots, vowelEndingCounts, rhymeCounts) {
  const gen = config.generation;
  const canon = resolveCanonical(primitive, config);
  const pool = config.phonetic_realization?.aspect_vowel_pools?.[primitive.A] ?? [canon.vowel];
  const maxEnding = gen.max_vowel_ending_per_class ?? 3;
  const ctxBase = {
    usedRoots,
    vowelEndingCounts: rhymeCounts,
    weights: gen.distinctiveness_weights,
    maxVowelEnding: maxEnding,
    allowedPrefixPairs: gen.allowed_prefix_pairs ?? [],
  };

  let best = null;
  for (const cand of candidateCoordinates(primitive, config, vowelEndingCounts, rhymeCounts)) {
    const result = generateRoot(primitive, config, cand.manner, cand.place, cand.vowel, cand.coda);
    if (!result.root) continue;

    const rhyme = rhymeKey(result.root);
    if ((rhymeCounts.get(rhyme) ?? 0) >= maxEnding) continue;
    if ((vowelEndingCounts.get(cand.vowel) ?? 0) >= maxEnding && !cand.coda) continue;

    const penalty = distinctivenessPenalty(result.root, ctxBase);
    const repair = repairDistance(canon, cand.place, cand.manner, cand.vowel, pool);
    const gridRepair = repair.pd + repair.md;
    if (penalty >= (ctxBase.weights?.duplicate_root ?? 10000)
      || penalty >= (ctxBase.weights?.prefix_overlap ?? 5000)) continue;

    const spreadBonus = (maxEnding - (rhymeCounts.get(rhyme) ?? 0)) * 30
      + (maxEnding - (vowelEndingCounts.get(cand.vowel) ?? 0)) * 15;
    const adjustedPenalty = penalty - spreadBonus + gridRepair * 20 + (cand.coda ? 15 : 0);

    const candidate = {
      ...result,
      repair_steps: gridRepair,
      phonetic_vowel_steps: repair.vd,
      grid_repair_steps: gridRepair,
      repair_detail: repair,
      distinctiveness_penalty: penalty,
      adjusted_penalty: adjustedPenalty,
      distinctiveness_score: distinctivenessScore(result.root, ctxBase),
      phonetic_only_repair: gridRepair === 0 && cand.vowel !== canon.vowel && !cand.coda,
      coda_extension: Boolean(cand.coda),
    };

    if (!best
      || candidate.adjusted_penalty < best.adjusted_penalty
      || (candidate.adjusted_penalty === best.adjusted_penalty
        && candidate.repair_steps < best.repair_steps)) {
      best = candidate;
    }
  }

  if (!best) {
    for (const cand of candidateCoordinates(primitive, config, vowelEndingCounts, rhymeCounts)) {
      const result = generateRoot(primitive, config, cand.manner, cand.place, cand.vowel, cand.coda);
      if (!result.root || usedRoots.includes(result.root)) continue;
      const repair = repairDistance(canon, cand.place, cand.manner, cand.vowel, pool);
      best = {
        ...result,
        repair_steps: repair.total,
        distinctiveness_penalty: distinctivenessPenalty(result.root, ctxBase),
        distinctiveness_score: distinctivenessScore(result.root, ctxBase),
        fallback: true,
      };
      break;
    }
  }

  if (best?.root) {
    usedRoots.push(best.root);
    const rhyme = rhymeKey(best.root);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    if (!best.coordinates.coda) {
      vowelEndingCounts.set(
        best.coordinates.vowel,
        (vowelEndingCounts.get(best.coordinates.vowel) ?? 0) + 1,
      );
    }
  }

  return best;
}

function composeDerivation(example, rootMap) {
  const parts = example.composition.map(id => ({
    id,
    root: rootMap[id]?.root ?? null,
    notation: rootMap[id]?.coordinates?.notation ?? null,
  }));
  const compound = parts.every(p => p.root) ? parts.map(p => p.root).join('') : null;
  return { ...example, parts, compound };
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const usedRoots = [];
  const vowelEndingCounts = new Map();
  const rhymeCounts = new Map();

  const sorted = [...config.primitives].sort(
    (a, b) => primitivePriority(b, config) - primitivePriority(a, config),
  );

  const inventory = sorted.map(p =>
    generateDistinct(p, config, usedRoots, vowelEndingCounts, rhymeCounts),
  ).filter(Boolean);

  const rootMap = Object.fromEntries(inventory.map(row => [row.coordinates.id, row]));
  const derivations = config.example_derivations.map(ex => composeDerivation(ex, rootMap));

  const invFlat = inventory.map(({ root, coordinates, repair_steps }) => ({
    root, id: coordinates.id, gloss: coordinates.gloss, coordinates, repair_steps,
  }));
  const warnings = analyzeAmbiguity(invFlat, derivations);
  const scores = auditScores(invFlat, derivations, warnings);

  const endings = new Map();
  const rhymes = new Map();
  const poolVowels = new Map();
  let gridRepairCount = 0;
  for (const item of inventory) {
    const { ending } = splitRoot(item.root);
    endings.set(ending, (endings.get(ending) ?? 0) + 1);
    const rk = rhymeKey(item.root);
    rhymes.set(rk, (rhymes.get(rk) ?? 0) + 1);
    if (!item.coordinates.coda) {
      poolVowels.set(item.coordinates.vowel, (poolVowels.get(item.coordinates.vowel) ?? 0) + 1);
    }
    if ((item.grid_repair_steps ?? item.repair_steps ?? 0) > 0) gridRepairCount++;
  }

  const output = {
    version: config.version,
    generated_at: new Date().toISOString(),
    philosophy: config.philosophy.premise,
    coordinate_system: config.coordinate_system.name,
    phonetic_layer: config.phonetic_realization?.note,
    primitive_count: inventory.length,
    unique_roots: new Set(inventory.map(i => i.root)).size,
    vowel_ending_distribution: Object.fromEntries(endings),
    pool_vowel_cv_distribution: Object.fromEntries(poolVowels),
    rhyme_distribution: Object.fromEntries(rhymes),
    max_pool_vowel_cv: Math.max(...poolVowels.values(), 0),
    max_rhyme_count: Math.max(...rhymes.values(), 0),
    grid_repair_rate: Math.round((gridRepairCount / inventory.length) * 100),
    audit_scores: scores,
    inventory: inventory.map(({ root, coordinates, repair_steps, grid_repair_steps, phonetic_vowel_steps, distinctiveness_score, distinctiveness_penalty, phonetic_only_repair, coda_extension, fallback, repair_detail }) => ({
      root,
      id: coordinates.id,
      gloss: coordinates.gloss,
      coordinates,
      repair_steps,
      grid_repair_steps: grid_repair_steps ?? repair_steps,
      phonetic_vowel_steps: phonetic_vowel_steps ?? 0,
      repair_detail,
      distinctiveness_score,
      distinctiveness_penalty,
      phonetic_only_repair: phonetic_only_repair ?? false,
      coda_extension: coda_extension ?? false,
      fallback: fallback ?? false,
    })),
    derivations,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

  console.log(`Gen 3.1: ${output.primitive_count} → ${output.unique_roots} roots`);
  console.log(`Max pool vowel (CV): ${output.max_pool_vowel_cv} · max rhyme: ${output.max_rhyme_count} · grid repair: ${output.grid_repair_rate}%`);
  console.log(`Audit: pron=${scores.pronounceability} mem=${scores.memorability} parse=${scores.parseability} algo=${scores.algorithmicFeel}%`);
  console.log(`Written: ${OUTPUT_PATH}`);

  if (process.argv.includes('--derivations')) {
    for (const d of derivations) {
      const n = segmentCompound(d.compound, invFlat).length;
      console.log(`${d.concept}: ${d.compound} (${n} parses)`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
