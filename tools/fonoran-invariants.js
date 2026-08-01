/**
 * Seed-level invariants for the published lexicon.
 *
 * Rules in this project have tended to live as a filter inside one pipeline stage.
 * The excluded-syllable list is the clearest case: it was consulted when syllables
 * were first handed out and never again, so `fa` (/fʌ/) and `fu` were approved as
 * roots months later despite sitting on the list, and no test noticed. A filter
 * decides once; an invariant is re-checked on every commit.
 *
 * Each rule reads the committed seeds and returns findings. A finding whose subject
 * appears in the rule's waiver list is reported as visible debt rather than a
 * failure, so accepted exceptions stay in the seed where an editor will see them
 * instead of being quietly dropped.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExcludedSyllable } from './fonoran-root-sound-assign.js';
import { loadRetiredSpellings } from './fonoran-retired-spellings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} relPath
 * @returns {Promise<object>}
 */
async function readJson(relPath) {
  return JSON.parse(await readFile(join(ROOT, relPath), 'utf8'));
}

/**
 * Load the seeds every rule reads. `approved-roots` is the editorial source for root
 * spellings; the sound bucket is what the public surfaces publish.
 * @returns {Promise<{ config: object, roots: object[], compounds: object[] }>}
 */
export async function loadInvariantContext() {
  const [config, approvedRoots, dimensions, compoundDoc, localization, ownership, particlesDoc, grammarPolicy] = await Promise.all([
    readJson('data/fonoran-primitive-roots-config.json'),
    readJson('data/fonoran-approved-roots.json'),
    readJson('data/fonoran-semantic-dimensions.json'),
    readJson('data/fonoran-compounds.json'),
    readJson('data/localizations/en.json'),
    readJson('data/fonoran-word-ownership.json').catch(() => ({ contested: [] })),
    readJson('data/fonoran-grammar-particles.json'),
    readJson('data/fonoran-grammar-policy.json'),
  ]);
  const roots = approvedRoots.roots ?? [];
  const compoundSeed = compoundDoc.compounds ?? [];
  return {
    config,
    dimensions,
    roots,
    compoundSeed,
    particles: particlesDoc.particles ?? [],
    compounds: deriveCompoundSpellings(roots, compoundSeed),
    retired: loadRetiredSpellings(),
    localization,
    ownership,
    grammarPolicy,
    conceptIds: new Set([...roots.map(r => String(r.id)), ...compoundSeed.map(c => String(c.concept))]),
  };
}

/**
 * Compound spellings, derived from the committed seeds rather than read from the lab
 * bucket. The bucket is a gitignored build artifact, so reading it would mean the check
 * runs against a file that is not in the repo: it passes in CI only because CI builds
 * first, and crashes on a fresh clone. Deriving keeps the check on the committed truth.
 *
 * @param {object[]} roots
 * @param {object[]} compoundSeed
 * @returns {Array<{ spelling: string, concept_id: string, parts: string[] }>}
 */
function deriveCompoundSpellings(roots, compoundSeed) {
  const rootSpelling = new Map(roots.map(r => [String(r.id), String(r.spelling ?? '')]));
  const byConcept = new Map(compoundSeed.map(row => [String(row.concept), row]));
  const memo = new Map();

  /** @param {string} conceptId @param {Set<string>} seen @returns {string | null} */
  const spellingFor = (conceptId, seen) => {
    if (rootSpelling.has(conceptId)) return rootSpelling.get(conceptId) || null;
    if (memo.has(conceptId)) return memo.get(conceptId);
    if (seen.has(conceptId)) return null; // cyclic composition: not this rule's problem
    const row = byConcept.get(conceptId);
    const composition = row?.preferred?.composition ?? [];
    if (!composition.length) return null;
    seen.add(conceptId);
    const parts = composition.map(p => spellingFor(String(p), seen));
    seen.delete(conceptId);
    const fused = parts.every(Boolean) ? parts.join('') : null;
    memo.set(conceptId, fused);
    return fused;
  };

  const derived = [];
  for (const row of compoundSeed) {
    const conceptId = String(row.concept);
    const composition = row.preferred?.composition ?? [];
    const partSpellings = composition.map(p => spellingFor(String(p), new Set([conceptId])));
    if (!partSpellings.length || !partSpellings.every(Boolean)) continue;
    derived.push({
      spelling: partSpellings.join(''),
      concept_id: conceptId,
      parts: /** @type {string[]} */ (partSpellings),
    });
  }
  return derived;
}

/** @param {string} form @param {string} concept */
const waiverKey = (form, concept) => `${String(form).toLowerCase()}:${String(concept).toLowerCase()}`;

/**
 * No approved spelling may use a syllable the project has excluded as awkward or as
 * English near-profanity, and fusing two approved parts must not create one.
 *
 * The predicate is imported from the generator rather than reimplemented, so the
 * pool that hands out syllables and the check that audits them cannot disagree.
 */
export const excludedSyllableRule = {
  id: 'excluded-syllables',
  title: 'no approved spelling may use an excluded syllable',
  /**
   * @param {{ config: object, roots: object[], compounds: object[] }} ctx
   * @returns {Array<{ rule: string, subject: string, concept: string, detail: string, waived: boolean, reason: string | null }>}
   */
  run(ctx) {
    const block = ctx.config?.excluded_syllables ?? {};
    const forms = (block.forms ?? []).map(s => String(s).toLowerCase());
    const waivers = new Map((block.known_violations ?? []).map(w => [waiverKey(w.form, w.concept), w]));
    const findings = [];
    if (!forms.length) return findings;

    for (const root of ctx.roots ?? []) {
      const spelling = String(root.spelling ?? '').toLowerCase();
      if (!spelling || !isExcludedSyllable(spelling, forms)) continue;
      const waiver = waivers.get(waiverKey(spelling, root.id));
      findings.push({
        rule: excludedSyllableRule.id,
        subject: `root ${spelling}`,
        concept: String(root.id ?? ''),
        detail: `${spelling} ${root.ipa ?? ''} is an excluded syllable`.trim(),
        waived: Boolean(waiver),
        reason: waiver?.reason ?? null,
      });
    }

    // A compound inherits its parts' spellings, so only report a sequence that the
    // fusion itself created: reporting the inherited one would just repeat the root.
    for (const compound of ctx.compounds ?? []) {
      const fused = String(compound.spelling ?? '').toLowerCase();
      if (!fused) continue;
      const parts = (compound.parts ?? []).map(p => String(p).toLowerCase());
      for (const form of forms) {
        if (!fused.includes(form) || parts.some(p => p.includes(form))) continue;
        const concept = String(compound.concept_id ?? compound.concept ?? '');
        const waiver = waivers.get(waiverKey(fused, concept));
        findings.push({
          rule: excludedSyllableRule.id,
          subject: `compound ${fused}`,
          concept,
          detail: `fusing ${parts.join('+') || 'parts'} creates "${form}"`,
          waived: Boolean(waiver),
          reason: waiver?.reason ?? null,
        });
        break;
      }
    }
    return findings;
  },
};

/**
 * A retired spelling is never handed to a different concept. Lessons, docs and cached
 * translations still carry the old meaning, so reuse gives one sound two meanings. This
 * is not hypothetical: `fa` was retired from `one`, recorded only in a JS map, and then
 * approved for `child` with nothing objecting.
 */
export const retiredReassignmentRule = {
  id: 'retired-reassignment',
  title: 'a retired spelling is never reassigned',
  severity: 'error',
  /**
   * @param {{ roots: object[], compounds: object[], retired: object[] }} ctx
   * @returns {object[]}
   */
  run(ctx) {
    const retired = new Map((ctx.retired ?? []).map(e => [e.form, e]));
    if (!retired.size) return [];
    const findings = [];
    const check = (spelling, concept, kind) => {
      const form = String(spelling ?? '').toLowerCase();
      const entry = retired.get(form);
      if (!entry) return;
      // The retirement's own concept is the historical owner, not a live reassignment.
      findings.push({
        rule: retiredReassignmentRule.id,
        severity: 'error',
        subject: `${kind} ${form}`,
        concept: String(concept ?? ''),
        detail: `${form} was retired${entry.concept ? ` from ${entry.concept}` : ''} on ${entry.retired_at || 'an earlier date'} and must not be reused`,
        waived: false,
        reason: null,
      });
    };
    for (const root of ctx.roots ?? []) check(root.spelling, root.id, 'root');
    for (const compound of ctx.compounds ?? []) {
      check(compound.spelling, compound.concept_id ?? compound.concept, 'compound');
    }
    return findings;
  },
};

/**
 * A root that owns a semantic dimension should not be stood in for by a root that owns
 * a different one. Advisory only: detection reads the gloss, which is a heuristic and
 * not a proof, so every hit needs a human read before it becomes a rule.
 */
export const dimensionConsistencyRule = {
  id: 'dimension-consistency',
  title: 'a dimension is expressed by its own root',
  severity: 'advisory',
  /**
   * @param {{ dimensions: object, compoundSeed: object[] }} ctx
   * @returns {object[]}
   */
  run(ctx) {
    const dims = ctx.dimensions?.dimensions ?? [];
    const markers = (ctx.dimensions?.sense_markers?.time ?? []).map(s => String(s).toLowerCase());
    const spatialOwners = dims.filter(d => d.reserved_for === 'space').map(d => d.owner);
    const timeOwners = dims.filter(d => d.id.startsWith('time_')).map(d => d.owner);
    if (!spatialOwners.length || !markers.length) return [];

    const findings = [];
    for (const row of ctx.compoundSeed ?? []) {
      const composition = row.preferred?.composition ?? [];
      const offending = composition.find(part => spatialOwners.includes(part));
      if (!offending) continue;
      const gloss = `${row.concept ?? ''} ${row.preferred?.gloss ?? ''}`.toLowerCase();
      if (!markers.some(m => gloss.includes(m))) continue;
      findings.push({
        rule: dimensionConsistencyRule.id,
        severity: 'advisory',
        subject: `compound ${composition.join('+')}`,
        concept: String(row.concept ?? ''),
        detail: `reads as temporal ("${(row.preferred?.gloss ?? '').trim()}") but uses the spatial root \`${offending}\`; time is owned by ${timeOwners.join('/') || 'before/after'}`,
        waived: false,
        reason: null,
      });
    }
    return findings;
  },
};

/** Every rule the checker enforces. Add a rule here and `npm test` picks it up. */
export const englishWordOwnershipRule = {
  id: 'english-word-ownership',
  title: 'an English word belongs to one concept only',
  severity: 'error',
  run(ctx) {
    const conceptIds = ctx.conceptIds ?? new Set();
    const entries = ctx.localization?.entries ?? {};
    /** @type {Map<string, string[]>} */
    const claims = new Map();
    for (const [conceptId, entry] of Object.entries(entries)) {
      if (conceptIds.size && !conceptIds.has(conceptId)) continue;
      for (const word of [entry?.label, ...(entry?.aliases ?? [])]) {
        if (!word) continue;
        const key = String(word).toLowerCase().trim();
        if (!key) continue;
        if (!claims.has(key)) claims.set(key, []);
        if (!claims.get(key).includes(conceptId)) claims.get(key).push(conceptId);
      }
    }

    // The backlog is recorded in the seed, so it is visible rather than forgotten, and a word
    // already known to be contested does not fail the build. A word that becomes contested
    // without being recorded does, which is the point: two owners means the translator has to
    // guess, and guessing is what this project is trying to stop doing.
    const known = new Set((ctx.ownership?.contested ?? []).map(c => String(c.word).toLowerCase()));
    const findings = [];
    for (const [word, owners] of claims) {
      if (owners.length < 2) continue;
      const waived = known.has(word);
      findings.push({
        rule: englishWordOwnershipRule.id,
        severity: 'error',
        subject: `"${word}"`,
        concept: owners.join(' / '),
        detail: `claimed by ${owners.length} concepts (${owners.join(', ')}), so it has no deterministic translation`,
        waived,
        reason: waived ? 'recorded in data/fonoran-word-ownership.json, awaiting a ruling' : null,
      });
    }
    return findings;
  },
};

/**
 * Every active particle form must be reserved in the phonetics config, so the root
 * generator can never hand a particle spelling to a lexical concept. The particle
 * inventory is the authority; the reservation list is a copy the generator reads,
 * and this rule is what keeps the copy honest when a particle is added or respelled.
 */
export const particleReservationRule = {
  id: 'particle-reservation',
  title: 'every particle form is reserved from the root generator',
  severity: 'error',
  run(ctx) {
    const reserved = new Set(
      (ctx.config?.reserved_particles?.forms ?? []).map(f => String(f).toLowerCase()),
    );
    const findings = [];
    for (const particle of ctx.particles ?? []) {
      const form = String(particle.form ?? '').toLowerCase();
      if (!form || reserved.has(form)) continue;
      findings.push({
        rule: particleReservationRule.id,
        severity: 'error',
        subject: `particle ${form}`,
        concept: String(particle.id ?? ''),
        detail: `${form} (${particle.id}) is missing from reserved_particles.forms in data/fonoran-primitive-roots-config.json, so the root generator could assign it to a lexical concept`,
        waived: false,
        reason: null,
      });
    }
    return findings;
  },
};

/**
 * Interrogatives are grammar, not vocabulary. Fonoran has no question words:
 * `nohu` + a dimension root is the whole system, and data/fonoran-grammar-policy.json
 * (`wh_composition`) is its single owner. A lexicon entry that also claims an
 * interrogative word creates a second answer the WH machinery cannot see — this is
 * not hypothetical: a heuristic compound `what = speak+want+know` sat in the seed
 * for weeks, so questions said `nohu to` while the bare word said `sesakhu`, and a
 * stray alias sent `where` to `bound` instead of `place`.
 *
 * Outside a question an interrogative word may resolve, but only to the policy's
 * own dimension for it ("tell me where you live" is the place you live), so the two
 * moods can never disagree about what the word means.
 */
export const interrogativeOwnershipRule = {
  id: 'interrogative-ownership',
  title: 'an interrogative word is owned by the WH policy, never by the lexicon',
  severity: 'error',
  run(ctx) {
    const composition = ctx.grammarPolicy?.wh_composition ?? {};
    /** wh word -> the one concept allowed to claim it (its policy dimension). */
    const dimensionFor = new Map();
    for (const [word, parts] of Object.entries(composition)) {
      if (word.startsWith('_') || !Array.isArray(parts) || !parts.length) continue;
      dimensionFor.set(word.toLowerCase(), String(parts[parts.length - 1]));
    }
    for (const word of Object.keys(ctx.grammarPolicy?.wh_blocked ?? {})) {
      if (!word.startsWith('_')) dimensionFor.set(word.toLowerCase(), null);
    }
    if (!dimensionFor.size) return [];

    const findings = [];
    const flag = (subject, concept, detail) => findings.push({
      rule: interrogativeOwnershipRule.id,
      severity: 'error',
      subject,
      concept: String(concept ?? ''),
      detail,
      waived: false,
      reason: null,
    });

    // An interrogative can never be a concept of its own: no root, no compound.
    for (const root of ctx.roots ?? []) {
      if (dimensionFor.has(String(root.id).toLowerCase())) {
        flag(`root ${root.id}`, root.id, `"${root.id}" is an interrogative; it is asked as nohu + ${dimensionFor.get(String(root.id).toLowerCase()) ?? 'a dimension'}, never spoken as a word of its own`);
      }
    }
    for (const row of ctx.compoundSeed ?? []) {
      if (dimensionFor.has(String(row.concept).toLowerCase())) {
        flag(`compound ${row.concept}`, row.concept, `"${row.concept}" is an interrogative and cannot be a compound; the WH policy composes it as nohu + ${dimensionFor.get(String(row.concept).toLowerCase()) ?? 'a dimension'}`);
      }
    }

    // A localization may hand an interrogative word only to its policy dimension.
    for (const [conceptId, entry] of Object.entries(ctx.localization?.entries ?? {})) {
      for (const word of [conceptId, entry?.label, ...(entry?.aliases ?? [])]) {
        const key = String(word ?? '').toLowerCase().trim();
        if (!dimensionFor.has(key)) continue;
        const allowed = dimensionFor.get(key);
        if (conceptId === allowed) continue;
        flag(
          `"${key}" -> ${conceptId}`,
          conceptId,
          allowed
            ? `the interrogative "${key}" may resolve only to its policy dimension \`${allowed}\`, not to \`${conceptId}\``
            : `the interrogative "${key}" is policy-blocked and may not resolve to any concept`,
        );
      }
    }
    return findings;
  },
};

export const RULES = [
  excludedSyllableRule,
  retiredReassignmentRule,
  englishWordOwnershipRule,
  dimensionConsistencyRule,
  particleReservationRule,
  interrogativeOwnershipRule,
];

/**
 * Run every invariant against the committed seeds.
 * @param {{ config: object, roots: object[], compounds: object[] } | null} [ctx]
 * @returns {Promise<{ findings: object[], violations: object[], waived: object[], rules: string[] }>}
 */
export async function runInvariants(ctx = null) {
  const context = ctx ?? await loadInvariantContext();
  const findings = [];
  for (const rule of RULES) findings.push(...rule.run(context));
  return {
    findings,
    // Advisory findings are reported but never gate: their detection is heuristic and
    // each one needs a human read before it becomes a rule.
    violations: findings.filter(f => !f.waived && f.severity !== 'advisory'),
    advisories: findings.filter(f => f.severity === 'advisory'),
    waived: findings.filter(f => f.waived),
    rules: RULES.map(r => r.id),
  };
}
