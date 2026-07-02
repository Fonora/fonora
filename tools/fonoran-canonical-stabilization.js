/**
 * Fonoran canonical root stabilization.
 * DDA coordinates are semantic authority; canonical roots are fixed after approval.
 */

import {
  resolveCanonical,
  generateRoot,
  coordinateFaithfulCandidates,
} from './legacy/gen3/fonoran-gen3-coordinates.js';
import {
  distinctivenessPenalty,
  distinctivenessScore,
  rhymeKey,
} from './fonoran-gen3-distinctiveness.js';
import {
  coordinateFidelity,
  runSemanticIntegrityAudit,
} from './legacy/gen3/fonoran-gen3-semantic-integrity.js';
import { analyzeAmbiguity, auditScores, segmentCompound } from './fonoran-gen3-readability.js';

export const FIDELITY_REVIEW_THRESHOLD = 80;
export const CANDIDATE_LABELS = ['A', 'B', 'C', 'D'];

export function buildDistinctivenessContext(config, usedRoots = []) {
  const gen = config.generation ?? {};
  return {
    usedRoots: [...usedRoots],
    vowelEndingCounts: new Map(),
    weights: gen.distinctiveness_weights ?? {},
    maxVowelEnding: gen.max_vowel_ending_per_class ?? 3,
    allowedPrefixPairs: gen.allowed_prefix_pairs ?? [],
  };
}

export function scoreCoordinateFaithfulCandidate(primitive, config, cand, ctx) {
  const result = generateRoot(
    primitive, config, cand.manner, cand.place, cand.vowel, cand.coda,
  );
  if (!result.root) return null;

  const penalty = distinctivenessPenalty(result.root, ctx);
  const fidelity = coordinateFidelity(
    { coordinates: result.coordinates, repair_detail: { pd: 0, md: 0, vd: 0 } },
    config,
    primitive,
  );
  const coordFidelity = cand.phonotactic_alt
    ? Math.max(85, fidelity.score)
    : fidelity.score;

  return {
    root: result.root,
    coordinates: result.coordinates,
    coordinate_fidelity: coordFidelity,
    grid_repair: false,
    phonotactic_alt: cand.phonotactic_alt ?? false,
    phonetic_spread: result.coordinates.phonetic_spread,
    coda_extension: Boolean(cand.coda),
    distinctiveness_score: distinctivenessScore(result.root, ctx),
    distinctiveness_penalty: penalty,
    phonetic_form: `${result.coordinates.fonora_onset}+${cand.vowel}${cand.coda ? '+' + cand.coda : ''}`,
  };
}

export function generateCoordinateFaithfulCandidates(primitive, config, ctx, limit = 4) {
  const scored = [];
  const seenRoots = new Set();

  for (const cand of coordinateFaithfulCandidates(primitive, config)) {
    const item = scoreCoordinateFaithfulCandidate(primitive, config, cand, ctx);
    if (!item || seenRoots.has(item.root)) continue;
    seenRoots.add(item.root);
    scored.push(item);
  }

  scored.sort((a, b) => {
    if (a.phonotactic_alt !== b.phonotactic_alt) return a.phonotactic_alt ? 1 : -1;
    if (a.distinctiveness_penalty !== b.distinctiveness_penalty) {
      return a.distinctiveness_penalty - b.distinctiveness_penalty;
    }
    if (a.coda_extension !== b.coda_extension) return a.coda_extension ? 1 : -1;
    if (a.phonetic_spread !== b.phonetic_spread) return a.phonetic_spread ? 1 : -1;
    return a.root.localeCompare(b.root);
  });

  return scored.slice(0, limit).map((c, i) => ({
    label: CANDIDATE_LABELS[i],
    ...c,
  }));
}

export function primitiveRegistryEntry(primitive, gen31Item, auditEntry, config, approvedRoots) {
  const canon = resolveCanonical(primitive, config);
  const fidelity = auditEntry?.fidelity_score ?? 100;
  const needsReview = fidelity < FIDELITY_REVIEW_THRESHOLD;

  const ctx = buildDistinctivenessContext(config, approvedRoots);
  const candidates = needsReview
    ? generateCoordinateFaithfulCandidates(primitive, config, ctx, 4)
    : [];

  const base = {
    id: primitive.id,
    gloss: primitive.gloss,
    coordinates: {
      D: primitive.D,
      M: primitive.M,
      A: primitive.A,
      notation: canon.notation,
      canonical_place: canon.place,
      canonical_manner: canon.manner,
      canonical_vowel: canon.vowel,
    },
    gen31_root: gen31Item?.root ?? null,
    fidelity_score: fidelity,
    repair_severity: auditEntry?.repair_severity ?? 'none',
    semantic_drift: auditEntry?.semantic_drift ?? [],
  };

  if (needsReview) {
    return {
      ...base,
      status: 'pending_review',
      canonical_root: null,
      candidates,
      review_note: 'Fidelity < 80: select coordinate-faithful candidate (A–D). No grid repair.',
    };
  }

  return {
    ...base,
    status: 'approved',
    canonical_root: gen31Item?.root ?? null,
    candidates: [],
    approved_at: null,
    approval_source: 'gen3.1_auto',
    review_note: null,
  };
}

export function buildCanonicalRegistry(gen31, gen3, config) {
  const audit = runSemanticIntegrityAudit(gen31, gen3, config);
  const auditById = Object.fromEntries(audit.primitives.map(p => [p.id, p]));
  const gen31ById = Object.fromEntries(gen31.inventory.map(i => [i.id, i]));
  const primById = Object.fromEntries(config.primitives.map(p => [p.id, p]));

  const approvedFirst = config.primitives
    .filter(p => (auditById[p.id]?.fidelity_score ?? 100) >= FIDELITY_REVIEW_THRESHOLD)
    .map(p => gen31ById[p.id]?.root)
    .filter(Boolean);

  const primitives = config.primitives.map(primitive => {
    const approvedRoots = approvedFirst.filter(r => r !== gen31ById[primitive.id]?.root);
    return primitiveRegistryEntry(
      primitive,
      gen31ById[primitive.id],
      auditById[primitive.id],
      config,
      approvedRoots,
    );
  });

  const pending = primitives.filter(p => p.status === 'pending_review');
  const approved = primitives.filter(p => p.status === 'approved');

  return {
    version: '1.0-canonical',
    stabilized_at: new Date().toISOString(),
    status: pending.length ? 'draft' : 'stabilized',
    philosophy: {
      semantic_authority: 'DDA coordinates ⟨Depth, Mode, Aspect⟩',
      phonetic_layer: 'Roman realization; fixed after human approval',
      mutation_policy: 'Generators may reference canonical roots but must not mutate approved primitives',
    },
    summary: {
      primitive_count: primitives.length,
      approved_count: approved.length,
      pending_review_count: pending.length,
      fidelity_threshold: FIDELITY_REVIEW_THRESHOLD,
    },
    primitives,
    pending_review_ids: pending.map(p => p.id),
  };
}

export function applyApproval(registry, primitiveId, canonicalRoot) {
  const entry = registry.primitives.find(p => p.id === primitiveId);
  if (!entry) throw new Error(`Unknown primitive: ${primitiveId}`);
  if (entry.status === 'approved' && entry.canonical_root === canonicalRoot) return registry;

  const valid = entry.candidates.some(c => c.root === canonicalRoot)
    || entry.gen31_root === canonicalRoot;
  if (entry.status === 'pending_review' && !valid) {
    const fromCandidates = entry.candidates.map(c => c.root).join(', ');
    throw new Error(`Root "${canonicalRoot}" not in candidates for ${primitiveId}: ${fromCandidates}`);
  }

  entry.canonical_root = canonicalRoot;
  entry.status = 'approved';
  entry.approved_at = new Date().toISOString();
  entry.approval_source = 'human_review';

  const stillPending = registry.primitives.filter(p => p.status === 'pending_review');
  registry.status = stillPending.length ? 'draft' : 'stabilized';
  registry.summary.approved_count = registry.primitives.filter(p => p.status === 'approved').length;
  registry.summary.pending_review_count = stillPending.length;
  registry.pending_review_ids = stillPending.map(p => p.id);
  return registry;
}

export function canonicalInventory(registry) {
  return registry.primitives
    .filter(p => p.status === 'approved' && p.canonical_root)
    .map(p => ({
      id: p.id,
      root: p.canonical_root,
      gloss: p.gloss,
      coordinates: {
        D: p.coordinates.D,
        M: p.coordinates.M,
        A: p.coordinates.A,
        notation: p.coordinates.notation,
      },
    }));
}

export function composeFromCanonical(composition, registry) {
  const byId = Object.fromEntries(registry.primitives.map(p => [p.id, p]));
  const parts = composition.map(id => {
    const p = byId[id];
    if (!p?.canonical_root) return { id, root: null, notation: p?.coordinates?.notation ?? null };
    return { id, root: p.canonical_root, notation: p.coordinates.notation };
  });
  const compound = parts.every(p => p.root) ? parts.map(p => p.root).join('') : null;
  return { parts, compound };
}

export function generateCanonicalRootsMarkdown(registry) {
  const lines = [];
  lines.push('# Fonoran Canonical Roots: Lexical Constitution');
  lines.push('');
  lines.push(`> Version: ${registry.version}`);
  lines.push(`> Status: **${registry.status}**`);
  lines.push(`> Updated: ${registry.stabilized_at}`);
  lines.push('');
  lines.push('## Constitutional rules');
  lines.push('');
  lines.push('1. **Semantic authority**: Meaning lives in DDA coordinates `⟨Depth, Mode, Aspect⟩`, not in English glosses.');
  lines.push('2. **Canonical roots**: Each primitive has one approved roman root. Once approved, it is **immutable**.');
  lines.push('3. **Compounding**: Compounds concatenate canonical roots in order general → specific.');
  lines.push('4. **Expansion**: New vocabulary may be coined from primitives; **accepted primitives may not be rewritten** by generators.');
  lines.push('5. **Phonetic layer**: Vowel spread and CVC extensions are allowed at selection time; post-hoc grid repair is not.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Primitives | ${registry.summary.primitive_count} |`);
  lines.push(`| Approved | ${registry.summary.approved_count} |`);
  lines.push(`| Pending human review | ${registry.summary.pending_review_count} |`);
  lines.push('');
  if (registry.pending_review_ids?.length) {
    lines.push('> **Draft:** The following primitives await human selection: '
      + registry.pending_review_ids.map(id => `\`${id}\``).join(', '));
    lines.push('');
  }
  lines.push('## Primitive inventory');
  lines.push('');
  lines.push('| ID | Canonical root | Coordinates | Gloss | Status |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const p of registry.primitives) {
    const root = p.canonical_root ?? ': ';
    const st = p.status === 'approved' ? '✓ approved' : '⏳ pending';
    lines.push(`| ${p.id} | \`${root}\` | ${p.coordinates.notation} | ${p.gloss} | ${st} |`);
  }
  lines.push('');
  lines.push('## Pending review');
  lines.push('');
  const pending = registry.primitives.filter(p => p.status === 'pending_review');
  if (!pending.length) {
    lines.push('None: all primitives canonical.');
  } else {
    for (const p of pending) {
      lines.push(`### ${p.id}`);
      lines.push('');
      lines.push(`- **Coordinates:** ${p.coordinates.notation}`);
      lines.push(`- **Gen 3.1 (repaired):** \`${p.gen31_root}\`: fidelity ${p.fidelity_score}`);
      lines.push(`- **Issue:** phonetic repair drift, not semantic weakness`);
      lines.push('');
      lines.push('| Label | Root | Fidelity | Distinctiveness | Form |');
      lines.push('| --- | --- | ---: | ---: | --- |');
      for (const c of p.candidates) {
        const phon = c.phonotactic_alt ? ' · phonotactic' : '';
        lines.push(`| ${c.label} | \`${c.root}\` | ${c.coordinate_fidelity} | ${c.distinctiveness_score} | ${c.phonetic_form}${phon} |`);
      }
      lines.push('');
    }
  }
  lines.push('## Review workflow');
  lines.push('');
  lines.push('Canonical approval is reference-only. Use `/language/` for your live lab vocabulary.');
  lines.push('Registry data: `data/fonoran-canonical-registry.json`');
  lines.push('Re-run `npm run fonoran:canonical:constitution` to refresh registry + `reports/fonoran-canonical-roots.md`.');
  lines.push('');
  return lines.join('\n');
}

export function registryToRootsJson(registry) {
  const inventory = registry.primitives
    .filter(p => p.canonical_root)
    .map(p => ({
      root: p.canonical_root,
      id: p.id,
      gloss: p.gloss,
      coordinates: {
        id: p.id,
        gloss: p.gloss,
        D: p.coordinates.D,
        M: p.coordinates.M,
        A: p.coordinates.A,
        notation: p.coordinates.notation,
      },
      canonical: true,
      approved_at: p.approved_at,
      approval_source: p.approval_source,
    }));

  return {
    version: registry.version,
    status: registry.status,
    canonical: true,
    primitive_count: inventory.length,
    inventory,
  };
}

export function runStressTestConcept(concept, registry, config) {
  const { parts, compound } = composeFromCanonical(concept.composition, registry);
  if (!compound) {
    return {
      concept: concept.concept,
      compound: null,
      gloss: concept.gloss,
      error: 'Missing canonical root for: ' + parts.filter(p => !p.root).map(p => p.id).join(', '),
    };
  }

  const inventory = canonicalInventory(registry).map(p => ({
    root: p.root,
    id: p.id,
    gloss: p.gloss,
    coordinates: p.coordinates,
  }));

  const segmentations = segmentCompound(compound, inventory);
  const ambiguous = segmentations.length > 1;
  const length = compound.length;
  const morphemeCount = parts.length;

  let elegance = 100;
  const notes = [];
  if (length > 12) { elegance -= 20; notes.push('long'); }
  else if (length > 9) { elegance -= 10; notes.push('moderate length'); }
  if (ambiguous) { elegance -= 30; notes.push('ambiguous segmentation'); }
  if (morphemeCount > 3) { elegance -= 10; notes.push('many morphemes'); }
  elegance = Math.max(0, elegance);

  const pronScore = Math.max(0, 100 - (compound.match(/[^aeiou]/gi)?.length ?? 0) * 3);

  return {
    concept: concept.concept,
    compound,
    composition: concept.composition.join(' + '),
    gloss: concept.gloss,
    length,
    morpheme_count: morphemeCount,
    segmentations: segmentations.length,
    ambiguous,
    elegance,
    pronounceability: pronScore,
    memorability: ambiguous ? 50 : Math.max(60, 100 - length * 2),
    readability: ambiguous ? 40 : Math.max(70, 100 - Math.max(0, length - 6) * 5),
    notes,
    parts,
  };
}

export function runStressTest(concepts, registry, config) {
  const results = concepts.map(c => runStressTestConcept(c, registry, config));
  const valid = results.filter(r => r.compound);
  const avg = (key) => valid.length
    ? Math.round(valid.reduce((a, r) => a + r[key], 0) / valid.length)
    : 0;

  return {
    generated_at: new Date().toISOString(),
    registry_status: registry.status,
    concept_count: concepts.length,
    derived_count: valid.length,
    failed_count: results.length - valid.length,
    averages: {
      readability: avg('readability'),
      elegance: avg('elegance'),
      length: avg('length'),
      memorability: avg('memorability'),
      pronounceability: avg('pronounceability'),
    },
    ambiguous_count: valid.filter(r => r.ambiguous).length,
    results,
  };
}

export function generateStressTestMarkdown(report) {
  const a = report.averages;
  const lines = [];
  lines.push('# Fonoran Language Stress Test');
  lines.push('');
  lines.push(`> Generated: ${report.generated_at}`);
  lines.push(`> Registry status: ${report.registry_status}`);
  lines.push(`> Concepts: ${report.derived_count}/${report.concept_count} derived from canonical roots`);
  lines.push('');
  lines.push('## Aggregate scores');
  lines.push('');
  lines.push('| Metric | Average |');
  lines.push('| --- | ---: |');
  lines.push(`| Readability | ${a.readability}/100 |`);
  lines.push(`| Elegance | ${a.elegance}/100 |`);
  lines.push(`| Memorability | ${a.memorability}/100 |`);
  lines.push(`| Pronounceability | ${a.pronounceability}/100 |`);
  lines.push(`| Compound length (chars) | ${a.length} |`);
  lines.push(`| Ambiguous compounds | ${report.ambiguous_count} |`);
  lines.push('');
  lines.push('## All concepts');
  lines.push('');
  lines.push('| Concept | Compound | Length | Read | Elegant | Ambig | Composition |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | --- |');
  for (const r of report.results) {
    if (!r.compound) {
      lines.push(`| ${r.concept} | n/a |: | n/a |: | n/a | ${r.error} |`);
      continue;
    }
    lines.push(`| ${r.concept} | \`${r.compound}\` | ${r.length} | ${r.readability} | ${r.elegance} | ${r.ambiguous ? 'yes' : ': '} | ${r.composition} |`);
  }
  lines.push('');
  return lines.join('\n');
}
