#!/usr/bin/env node
/**
 * DEPRECATED — use npm run fonoran:build (converged pipeline).
 * See tools/legacy/README.md and docs/fonoran.md.
 *
 * Fonoran primitive root generator (experimental).
 * Assigns phonetically simple syllables to ranked semantic primitives.
 * Follows docs/fonoran-grammar.md — invariant concepts, reserved particles.
 *
 * Run: npm run fonoran:primitive-roots
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  distinctivenessPenalty,
  distinctivenessScore,
  rhymeKey,
  splitRoot,
} from '../fonoran-gen3-distinctiveness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(ROOT, 'data/fonoran-primitive-roots-config.json');
const COMPOUNDS_PATH = join(ROOT, 'data/fonoran-stress-test-concepts.json');
const OUTPUT_PATH = join(ROOT, 'data/fonoran-primitive-roots.json');
const REPORT_PATH = join(ROOT, 'docs/fonoran-primitive-roots-report.md');

/** Compounds required by grammar examples but absent from stress-test. */
const GRAMMAR_COMPOUNDS = [
  { concept: 'tribe', composition: ['collective', 'person'], gloss: 'collective of persons' },
  { concept: 'war', composition: ['collective', 'person', 'conflict'], gloss: 'collective person conflict' },
  { concept: 'family', composition: ['collective', 'bond', 'person'], gloss: 'bonded collective of persons' },
  { concept: 'nation', composition: ['collective', 'bound', 'place'], gloss: 'bounded collective place' },
  { concept: 'religion', composition: ['bond', 'source', 'collective'], gloss: 'collective bonded to source' },
  { concept: 'government', composition: ['collective', 'agent', 'bound'], gloss: 'collective acting authority' },
];

const GRAMMAR_PARTICLE_PHRASES = [
  ['mi'],
  ['mi', 'ta'],
  ['mi', 'na'],
];

const COMPOUND_PROBE_PAIRS = [
  ['person', 'collective'],
  ['water', 'fire'],
  ['love', 'person'],
  ['inside', 'container'],
  ['speak', 'signal'],
  ['move', 'path'],
  ['light', 'dark'],
  ['give', 'take'],
  ['life', 'death'],
  ['know', 'unknown'],
];

function isExcludedSyllable(form, excluded) {
  const lower = form.toLowerCase();
  return excluded.some(ex => lower === ex || lower.startsWith(ex));
}

function buildSyllablePool(config) {
  const { phonetics, reserved_particles, excluded_syllables } = config;
  const reserved = new Set(reserved_particles.forms.map(s => s.toLowerCase()));
  const excluded = excluded_syllables.forms.map(s => s.toLowerCase());
  const pool = [];

  const add = (form, template, cost, tier) => {
    const f = form.toLowerCase();
    if (!f || reserved.has(f) || isExcludedSyllable(f, excluded)) return;
    if (pool.some(p => p.form === f)) return;
    pool.push({ form: f, template, phonetic_cost: cost, tier });
  };

  let cost = 1;
  for (const onset of phonetics.preferred_onsets) {
    for (const vowel of phonetics.vowels_by_cost) {
      const tier = vowel === 'a' ? 'preferred-cv-a' : 'preferred-cv';
      const vowelCost = phonetics.vowels_by_cost.indexOf(vowel);
      add(onset + vowel, 'CV', cost + vowelCost, tier);
    }
    cost++;
  }

  cost = 20;
  for (const onset of phonetics.secondary_onsets) {
    for (const vowel of phonetics.vowels_by_cost) {
      const vowelCost = phonetics.vowels_by_cost.indexOf(vowel);
      add(onset + vowel, 'CV', cost + vowelCost, 'secondary-cv');
    }
    cost++;
  }

  cost = 35;
  for (const onset of phonetics.tertiary_onsets) {
    for (const vowel of ['a', 'e', 'u']) {
      add(onset + vowel, 'CV', cost, 'tertiary-cv');
    }
    cost++;
  }

  cost = 50;
  for (const onset of phonetics.coda_onsets) {
    for (const vowel of ['a', 'e']) {
      for (const coda of ['n', 'm', 't', 'k', 's', 'l']) {
        add(onset + vowel + coda, 'CVC', cost, 'cvc');
        cost += 0.1;
      }
    }
  }

  // CV-CV disyllabic forms intentionally excluded.
  // Primitive roots are one syllable only: CV or CVC.
  // Multi-syllable forms are reserved for compounds and derived words.

  pool.sort((a, b) => a.phonetic_cost - b.phonetic_cost || a.form.localeCompare(b.form));
  return pool;
}

function expectedPhoneticCost(priority, minP, maxP) {
  const span = maxP - minP || 1;
  const t = (priority - minP) / span;
  return 1 + (1 - t) * 85;
}

function tierGate(priority, minP, maxP, syllable) {
  const span = maxP - minP || 1;
  const t = (priority - minP) / span;
  if (t >= 0.92 && syllable.template !== 'CV') return 4000;
  if (t >= 0.75 && syllable.template === 'CVC') return 2500;
  return 0;
}

function particleFlowPenalty(root, particles) {
  let penalty = 0;
  for (const phrase of GRAMMAR_PARTICLE_PHRASES) {
    const surface = [...phrase, root].join(' ');
    const concat = phrase.join('') + root;
    if (root.startsWith(phrase[phrase.length - 1])) penalty += 200;
    if (phrase.some(p => p === root)) penalty += 5000;
    const lastParticle = phrase[phrase.length - 1];
    if (root.endsWith(lastParticle) && root.length > lastParticle.length) penalty += 80;
    if (/(.)\1{2,}/.test(concat)) penalty += 60;
    if (surface.includes(' la la') || surface.includes(' ta ta')) penalty += 100;
  }
  return penalty;
}

function compoundFlowPenalty(root, usedRoots) {
  let penalty = 0;
  for (const other of usedRoots.slice(-30)) {
    const compound = root + other;
    if (/(.)\1{3,}/.test(compound)) penalty += 40;
    if (root === other) penalty += 5000;
    if (root.endsWith(other) || other.endsWith(root)) penalty += 25;
    const { onset: o1, ending: e1 } = splitRoot(root);
    const { onset: o2, ending: e2 } = splitRoot(other);
    if (e1 === e2 && o1 === o2) penalty += 50;
  }
  return penalty;
}

function assignRoots(concepts, syllablePool, config) {
  const priorities = concepts.map(c => c.priority);
  const minP = Math.min(...priorities);
  const maxP = Math.max(...priorities);
  const usedRoots = [];
  const rhymeCounts = new Map();
  const vowelEndingCounts = new Map();
  const onsetCounts = new Map();
  const assignments = [];

  const ctxBase = {
    usedRoots,
    vowelEndingCounts: rhymeCounts,
    weights: {
      duplicate_root: 10000,
      prefix_overlap: 4000,
      vowel_ending_cap: 600,
      same_onset: 100,
      same_rhyme: 70,
      one_vowel_diff: 80,
      one_onset_diff: 60,
      similarity_high: 90,
    },
    maxVowelEnding: config.phonetics.max_cv_per_rhyme ?? 4,
    allowedPrefixPairs: [],
  };

  for (const concept of concepts) {
    const targetCost = expectedPhoneticCost(concept.priority, minP, maxP);
    let best = null;

    for (const syllable of syllablePool) {
      if (usedRoots.includes(syllable.form)) continue;

      const distinctPenalty = distinctivenessPenalty(syllable.form, ctxBase);
      if (distinctPenalty >= ctxBase.weights.duplicate_root) continue;
      if (distinctPenalty >= ctxBase.weights.prefix_overlap
        && concept.priority > minP + (maxP - minP) * 0.5) continue;

      const costMismatch = Math.abs(syllable.phonetic_cost - targetCost);
      const flowPenalty = particleFlowPenalty(syllable.form, config.reserved_particles.forms)
        + compoundFlowPenalty(syllable.form, usedRoots);

      const onset = splitRoot(syllable.form).onset;
      const onsetOverload = Math.max(0, (onsetCounts.get(onset) ?? 0) - (config.phonetics.max_same_onset ?? 5));
      const rhyme = rhymeKey(syllable.form);
      const rhymeOverload = Math.max(0, (rhymeCounts.get(rhyme) ?? 0) - (config.phonetics.max_cv_per_rhyme ?? 4));

      const totalPenalty = distinctPenalty
        + flowPenalty
        + tierGate(concept.priority, minP, maxP, syllable)
        + costMismatch * 12
        + onsetOverload * 120
        + rhymeOverload * 150
        + (syllable.template === 'CVC' ? 30 : 0)
        + (syllable.tier === 'tertiary-cv' ? 40 : 0);

      const candidate = {
        root: syllable.form,
        phonetic_cost: syllable.phonetic_cost,
        target_cost: Math.round(targetCost * 10) / 10,
        cost_delta: Math.round(costMismatch * 10) / 10,
        template: syllable.template,
        tier: syllable.tier,
        distinctiveness_penalty: distinctPenalty,
        distinctiveness_score: distinctivenessScore(syllable.form, ctxBase),
        flow_penalty: flowPenalty,
        total_penalty: totalPenalty,
      };

      if (!best
        || candidate.total_penalty < best.total_penalty
        || (candidate.total_penalty === best.total_penalty && candidate.phonetic_cost < best.phonetic_cost)) {
        best = candidate;
      }
    }

    if (!best) {
      for (const syllable of syllablePool) {
        if (usedRoots.includes(syllable.form)) continue;
        const distinctPenalty = distinctivenessPenalty(syllable.form, ctxBase);
        if (distinctPenalty >= ctxBase.weights.duplicate_root) continue;
        const costMismatch = Math.abs(syllable.phonetic_cost - targetCost);
        best = {
          root: syllable.form,
          phonetic_cost: syllable.phonetic_cost,
          target_cost: Math.round(targetCost * 10) / 10,
          cost_delta: Math.round(costMismatch * 10) / 10,
          template: syllable.template,
          tier: syllable.tier,
          distinctiveness_penalty: distinctPenalty,
          distinctiveness_score: distinctivenessScore(syllable.form, ctxBase),
          flow_penalty: 0,
          total_penalty: distinctPenalty + costMismatch * 12,
          fallback: true,
        };
        break;
      }
    }

    if (!best) {
      for (const syllable of syllablePool) {
        if (usedRoots.includes(syllable.form)) continue;
        const costMismatch = Math.abs(syllable.phonetic_cost - targetCost);
        best = {
          root: syllable.form,
          phonetic_cost: syllable.phonetic_cost,
          target_cost: Math.round(targetCost * 10) / 10,
          cost_delta: Math.round(costMismatch * 10) / 10,
          template: syllable.template,
          tier: syllable.tier,
          distinctiveness_penalty: 0,
          distinctiveness_score: 1000,
          flow_penalty: 0,
          total_penalty: costMismatch * 12,
          fallback: 'emergency',
        };
        break;
      }
    }

    if (!best) {
      throw new Error(`No syllable available for concept: ${concept.id}`);
    }

    usedRoots.push(best.root);
    const rhyme = rhymeKey(best.root);
    rhymeCounts.set(rhyme, (rhymeCounts.get(rhyme) ?? 0) + 1);
    const { ending, onset } = splitRoot(best.root);
    if (ending) vowelEndingCounts.set(ending, (vowelEndingCounts.get(ending) ?? 0) + 1);
    if (onset) onsetCounts.set(onset, (onsetCounts.get(onset) ?? 0) + 1);

    assignments.push({
      rank: assignments.length + 1,
      id: concept.id,
      gloss: concept.gloss,
      domain: concept.domain,
      priority: concept.priority,
      root: best.root,
      scoring: {
        phonetic_cost: Math.round(best.phonetic_cost * 10) / 10,
        target_cost: best.target_cost,
        cost_delta: best.cost_delta,
        template: best.template,
        tier: best.tier,
        distinctiveness_score: best.distinctiveness_score,
        flow_penalty: best.flow_penalty,
        total_penalty: best.total_penalty,
      },
    });
  }

  return assignments;
}

function analyzeDistribution(assignments) {
  const byTemplate = {};
  const byTier = {};
  const costByDecile = [];
  for (const a of assignments) {
    byTemplate[a.scoring.template] = (byTemplate[a.scoring.template] ?? 0) + 1;
    byTier[a.scoring.tier] = (byTier[a.scoring.tier] ?? 0) + 1;
  }
  const sorted = [...assignments].sort((a, b) => b.priority - a.priority);
  const chunk = Math.ceil(sorted.length / 10);
  for (let i = 0; i < 10; i++) {
    const slice = sorted.slice(i * chunk, (i + 1) * chunk);
    if (!slice.length) continue;
    const avgCost = slice.reduce((s, a) => s + a.scoring.phonetic_cost, 0) / slice.length;
    const avgLen = slice.reduce((s, a) => s + a.root.length, 0) / slice.length;
    costByDecile.push({
      decile: i + 1,
      priority_range: [slice[slice.length - 1].priority, slice[0].priority],
      avg_phonetic_cost: Math.round(avgCost * 10) / 10,
      avg_length: Math.round(avgLen * 10) / 10,
      sample: slice.slice(0, 3).map(s => `${s.root} (${s.id})`),
    });
  }
  return { byTemplate, byTier, costByDecile };
}

function probeCompounds(assignments) {
  const byId = Object.fromEntries(assignments.map(a => [a.id, a.root]));
  return COMPOUND_PROBE_PAIRS.map(([a, b]) => ({
    concepts: [a, b],
    compound: (byId[a] ?? '?') + (byId[b] ?? '?'),
    roots: [byId[a], byId[b]],
  }));
}

function buildRootMap(assignments) {
  return Object.fromEntries(assignments.map(a => [a.id, a.root]));
}

function loadCompoundDefinitions() {
  return readFile(COMPOUNDS_PATH, 'utf8').then(raw => {
    const stress = JSON.parse(raw);
    const seen = new Set();
    const out = [];
    const add = def => {
      const key = def.concept;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(def);
    };
    for (const def of GRAMMAR_COMPOUNDS) add(def);
    for (const def of stress.concepts ?? []) add(def);
    return out;
  });
}

function buildVocabulary(assignments, compoundDefs) {
  const rootMap = buildRootMap(assignments);
  const primitiveIds = new Set(assignments.map(a => a.id));
  const vocabulary = [];

  for (const a of assignments) {
    vocabulary.push({
      english: a.id,
      gloss: a.gloss,
      fonoran: a.root,
      kind: 'primitive',
      composition: null,
      composition_readable: null,
      priority: a.priority,
    });
  }

  for (const def of compoundDefs) {
    if (primitiveIds.has(def.concept)) continue;

    const parts = def.composition.map(id => ({ id, root: rootMap[id] ?? null }));
    const missing = parts.filter(p => !p.root).map(p => p.id);
    const fonoran = missing.length ? null : parts.map(p => p.root).join('');

    vocabulary.push({
      english: def.concept,
      gloss: def.gloss ?? '',
      fonoran,
      kind: 'compound',
      composition: def.composition,
      composition_roots: parts.map(p => p.root),
      composition_readable: parts.map(p => p.id).join(' + '),
      unresolved: missing.length ? missing : undefined,
    });
  }

  vocabulary.sort((a, b) => a.english.localeCompare(b.english));
  return vocabulary;
}

function buildReport(config, assignments, pool, analysis, compounds, vocabulary) {
  const lines = [];
  const ts = new Date().toISOString().slice(0, 10);
  lines.push('# Fonoran primitive roots — generation report');
  lines.push('');
  lines.push(`> **Status:** experimental · generated ${ts} · **not committed as canonical**`);
  lines.push('');
  lines.push('Algorithmic assignment of ~200 semantic primitives to phonetically ranked syllables, following [fonoran-grammar.md](fonoran-grammar.md).');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Concepts assigned | ${assignments.length} |`);
  lines.push(`| **Total vocabulary** | **${vocabulary.length}** (${vocabulary.filter(v => v.kind === 'primitive').length} primitives + ${vocabulary.filter(v => v.kind === 'compound').length} compounds) |`);
  lines.push(`| Unresolved compounds | ${vocabulary.filter(v => v.unresolved?.length).length} |`);
  lines.push(`| Syllable pool size | ${pool.length} |`);
  lines.push(`| Reserved particles | ${config.reserved_particles.forms.join(', ')} |`);
  lines.push(`| Excluded syllables | ${config.excluded_syllables.forms.join(', ')} |`);
  lines.push(`| Shortest root | ${assignments[0]?.root} (${assignments[0]?.id}) |`);
  lines.push(`| Longest root | ${assignments.reduce((a, b) => a.root.length >= b.root.length ? a : b).root} |`);
  lines.push('');
  lines.push('## Prior generator evaluation');
  lines.push('');
  lines.push('| Generation | Approach | Adaptable? |');
  lines.push('| --- | --- | --- |');
  lines.push('| Gen 1 | Hand roots + grammar vowels (a/e/i/o/u inflection) | **No** — violates invariant-word grammar |');
  lines.push('| Gen 2 | Coordinate → grid + IE collision repair | **No** — concept-first, not grid-native |');
  lines.push('| Gen 3 / 3.1 | 36 DDA primitives → phonetic spread | **Partially** — reused `distinctivenessPenalty` scoring |');
  lines.push('| **This run** | 200 ranked human primitives → Huffman-like syllable allocation | **New** — `tools/fonoran-primitive-roots.js` |');
  lines.push('');
  lines.push('## Scoring methodology');
  lines.push('');
  lines.push('Concepts are sorted by **fundamentality priority** (1000 = most foundational). Each concept receives a **target phonetic cost** linearly mapped from priority — a Huffman-like principle where frequent/fundamental concepts should have the lowest phonetic cost.');
  lines.push('');
  lines.push('For each concept, the generator evaluates every available syllable in the pool:');
  lines.push('');
  lines.push('1. **Phonetic cost mismatch** — `|syllable_cost − target_cost| × 12`');
  lines.push('2. **Distinctiveness** — adapted from Gen 3.1 (`fonoran-gen3-distinctiveness.js`): duplicate roots, prefix overlaps, rhyme clustering, onset similarity');
  lines.push('3. **Particle flow**: penalizes roots that echo particles in `mi ___`, `mi ta ___`, `mi na ___`');
  lines.push('4. **Compound flow** — penalizes awkward concatenations with recently assigned roots');
  lines.push('5. **Distribution caps** — soft limits on rhyme class and onset reuse');
  lines.push('6. **Tier gates** — top-priority concepts blocked from CVC; relaxed for lower deciles');
  lines.push('');
  lines.push('### Syllable pool tiers (lowest cost first)');
  lines.push('');
  lines.push('1. Preferred onsets (`b d f g k l m n s t`) + vowel `a`');
  lines.push('2. Same onsets + other vowels (`e i o u`)');
  lines.push('3. Secondary onsets (`h w y`)');
  lines.push('4. Tertiary onsets (`p ch sh j r`) — `p` only with safe vowels; `pi`/`po` excluded');
  lines.push('5. CVC extensions');
  lines.push('6. CVC for lower-priority concepts when CV pool is exhausted');
  lines.push('');
  lines.push('## Priority ↔ phonetic cost correlation');
  lines.push('');
  lines.push('| Decile | Priority range | Avg cost | Avg length | Samples |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const d of analysis.costByDecile) {
    lines.push(`| ${d.decile} | ${d.priority_range[0]}–${d.priority_range[1]} | ${d.avg_phonetic_cost} | ${d.avg_length} | ${d.sample.join(', ')} |`);
  }
  lines.push('');
  lines.push('## Template distribution');
  lines.push('');
  for (const [k, v] of Object.entries(analysis.byTemplate).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${k}**: ${v}`);
  }
  lines.push('');
  lines.push('## Sample compound probes');
  lines.push('');
  lines.push('| Concepts | Compound |');
  lines.push('| --- | --- |');
  for (const c of compounds.slice(0, 12)) {
    lines.push(`| ${c.concepts.join(' + ')} | **${c.compound}** |`);
  }
  lines.push('');
  lines.push('## Tradeoffs and heuristics');
  lines.push('');
  lines.push('- **Fundamentality scores are author-curated**, not corpus-derived. A future pass could seed priorities from semantic dependency graphs or Swadesh-style lists.');
  lines.push('- **Grammar doc examples** (`ka`, `sha`, `kaso`, `fa`) are illustrative placeholders; this run does not preserve them — compare output before any canonical merge.');
  lines.push('- **Particle reservation** is conservative (`mi`, `la`, `ta`, `na`). Future particles (negation, future tense) may require re-reservation.');
  lines.push('- **`p` onset** is deprioritized and `pi`/`po` blocked; this shrinks the pool but avoids English bathroom humor.');
  lines.push('- **CVC and disyllabic forms** absorb lowest-priority concepts when CV inventory exhausts — expect longer forms below priority ~850.');
  lines.push('- **Compound flow** uses local pairwise checks only; full-tree pronounceability needs human review.');
  lines.push('- **Excluded composites** (tribe, family, language, …) are not primitive roots — they appear as **transparent compounds** in the vocabulary layer.');
  lines.push('');
  lines.push('## Vocabulary (English → Fonoran)');
  lines.push('');
  lines.push('Each primitive is a standalone word. Complex English concepts are **compound words** built by concatenating primitive roots (semantic tree visible in spelling).');
  lines.push('');
  lines.push('### Grammar examples');
  lines.push('');
  const grammarSamples = ['tribe', 'war', 'family', 'language', 'river', 'memory', 'community'];
  lines.push('| English | Fonoran | Composition |');
  lines.push('| --- | --- | --- |');
  for (const id of grammarSamples) {
    const row = vocabulary.find(v => v.english === id);
    if (!row) continue;
    lines.push(`| ${row.english} | **${row.fonoran ?? '—'}** | ${row.composition_readable ?? 'primitive'} |`);
  }
  lines.push('');
  lines.push('### Full vocabulary');
  lines.push('');
  lines.push('| English | Fonoran | Kind | Composition |');
  lines.push('| --- | --- | --- | --- |');
  for (const v of vocabulary) {
    const comp = v.composition_readable ?? '—';
    lines.push(`| ${v.english} | **${v.fonoran ?? '—'}** | ${v.kind} | ${comp} |`);
  }
  lines.push('');
  lines.push('## Primitive roots (ranked)');
  lines.push('');
  lines.push('| Rank | Root | Concept | Gloss | Priority | Cost |');
  lines.push('| ---: | --- | --- | --- | ---: | ---: |');
  for (const a of assignments) {
    lines.push(`| ${a.rank} | **${a.root}** | ${a.id} | ${a.gloss} | ${a.priority} | ${a.scoring.phonetic_cost} |`);
  }
  lines.push('');
  lines.push('## Commands');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run fonoran:primitive-roots          # generate JSON + import to lab bucket');
  lines.push('npm run fonoran:primitive-roots:gen        # generate JSON only');
  lines.push('npm run fonoran:primitive-roots:import     # import existing JSON → Dictionary');
  lines.push('```');
  lines.push('');
  lines.push('*Related: [fonoran-grammar.md](fonoran-grammar.md) · [fonoran-generator-archive.md](fonoran-generator-archive.md)*');
  return lines.join('\n') + '\n';
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const targetCount = Number(process.env.FONORAN_PRIMITIVE_COUNT || 200);
  const concepts = [...config.concepts]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, targetCount);

  const pool = buildSyllablePool(config);
  if (pool.length < concepts.length) {
    throw new Error(`Syllable pool (${pool.length}) smaller than concepts (${concepts.length})`);
  }

  const assignments = assignRoots(concepts, pool, config);
  const analysis = analyzeDistribution(assignments);
  const compounds = probeCompounds(assignments);
  const compoundDefs = await loadCompoundDefinitions();
  const vocabulary = buildVocabulary(assignments, compoundDefs);

  const output = {
    version: config.version,
    generated_at: new Date().toISOString(),
    status: 'experimental',
    philosophy: config.philosophy,
    reserved_particles: config.reserved_particles.forms,
    excluded_syllables: config.excluded_syllables.forms,
    primitive_count: assignments.length,
    compound_count: vocabulary.filter(v => v.kind === 'compound').length,
    vocabulary_count: vocabulary.length,
    syllable_pool_size: pool.length,
    analysis,
    compound_probes: compounds,
    primitives: assignments,
    vocabulary,
    inventory: assignments,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  await writeFile(REPORT_PATH, buildReport(config, assignments, pool, analysis, compounds, vocabulary));

  const unresolved = vocabulary.filter(v => v.unresolved?.length);
  console.log(`Vocabulary: ${vocabulary.length} words (${output.primitive_count} primitives + ${output.compound_count} compounds)`);
  console.log(`Primitive roots: ${assignments.length} → ${new Set(assignments.map(a => a.root)).size} unique forms`);
  console.log(`Pool: ${pool.length} syllables · top: ${assignments.slice(0, 5).map(a => `${a.root}=${a.id}`).join(', ')}`);
  if (unresolved.length) console.log(`Unresolved: ${unresolved.map(u => u.english).join(', ')}`);
  console.log(`Written: ${OUTPUT_PATH}`);
  console.log(`Report:  ${REPORT_PATH}`);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      vocabulary_count: output.vocabulary_count,
      primitive_count: output.primitive_count,
      compound_count: output.compound_count,
      top_ten: assignments.slice(0, 10).map(a => ({ root: a.root, id: a.id, priority: a.priority })),
      sample_compounds: vocabulary.filter(v => v.kind === 'compound').slice(0, 10),
    }, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
