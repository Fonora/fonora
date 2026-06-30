/**
 * Understandability — an advisory estimate of communicative success.
 *
 * THIS IS A RANKING AID, NOT AN AUTHORITY. See docs/fonoran-constitution.md.
 * The number estimates "would another root-knower likely recover the intended meaning?"
 * It exists to *order* candidate expressions. Human guess-the-meaning playtests decide
 * which form is preferred, and the playtest overrides this score whenever they disagree.
 *
 * Pure and dependency-free so it runs in the browser (UI), in tools, and in tests.
 *
 * Factors (all 0..1, blended):
 *   - familiarity   how well-known the component roots are (core > extended > complete)
 *   - simplicity    fewer roots are easier to recover (2 is ideal)
 *   - transparency  are the components recognizable roots at all?
 *   - ambiguity     how uniquely the combination points at the intended meaning
 *   - concreteness  concrete/human-experience components recover better than abstract ones
 */

const WEIGHTS = {
  familiarity: 0.3,
  simplicity: 0.2,
  transparency: 0.2,
  ambiguity: 0.2,
  concreteness: 0.1,
};

const LANGUAGE_TIER_WEIGHT = {
  communicative_core: 1.0,
  extended_core: 0.7,
  complete: 0.4,
};

const EXPERIENCE_CONCRETENESS = {
  survival_body: 1.0,
  space_motion: 1.0,
  social: 0.85,
  emotion: 0.8,
  time: 0.7,
  thinking: 0.55,
  abstract: 0.35,
};

/**
 * Generic / vague roots that combine into many things and therefore weaken a guess.
 * (e.g. "thing", "do", "part" appear in dozens of plausible compounds.)
 */
const VAGUE_COMPONENTS = new Set([
  'thing', 'substance', 'form', 'part', 'do', 'make', 'source', 'place', 'mark', 'change',
]);

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function familiarity(parts, metaFor) {
  if (!parts.length) return 0;
  let sum = 0;
  for (const id of parts) {
    const meta = metaFor(id);
    sum += LANGUAGE_TIER_WEIGHT[meta?.language_tier] ?? (meta ? 0.55 : 0.2);
  }
  return sum / parts.length;
}

function simplicity(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 1;
  if (n === 3) return 0.72;
  if (n === 4) return 0.48;
  return 0.3;
}

function transparency(parts, metaFor) {
  if (!parts.length) return 0;
  const known = parts.filter(id => Boolean(metaFor(id))).length;
  return known / parts.length;
}

function concreteness(parts, metaFor) {
  if (!parts.length) return 0.5;
  let sum = 0;
  for (const id of parts) {
    const meta = metaFor(id);
    sum += EXPERIENCE_CONCRETENESS[meta?.experience_tier] ?? 0.5;
  }
  return sum / parts.length;
}

function ambiguity(parts, { collisionCount = 1 } = {}) {
  let score = 1;
  for (const id of parts) {
    if (VAGUE_COMPONENTS.has(id)) score -= 0.12;
  }
  // If the exact same combination is claimed by more than one concept, it is ambiguous.
  if (collisionCount > 1) score -= 0.25 * Math.min(collisionCount - 1, 3);
  return clamp01(score);
}

export function understandabilityLabel(score) {
  if (score >= 0.8) return 'very likely understood';
  if (score >= 0.65) return 'likely understood';
  if (score >= 0.5) return 'plausible';
  if (score >= 0.35) return 'risky';
  return 'unlikely';
}

/**
 * Score one expression attempt.
 *
 * @param {string[]} composition  concept ids, e.g. ["water", "path"]
 * @param {object} ctx
 * @param {(id:string)=> ({language_tier?:string, experience_tier?:string}|null)} ctx.metaFor
 *        Returns experience metadata for a component id, or null if unknown.
 * @param {number} [ctx.collisionCount]  how many concepts claim this exact combination.
 * @returns {{ score:number, label:string, breakdown:object }}
 */
export function scoreUnderstandability(composition, ctx = {}) {
  const parts = Array.isArray(composition) ? composition.filter(Boolean) : [];
  const metaFor = ctx.metaFor ?? (() => null);

  const breakdown = {
    familiarity: clamp01(familiarity(parts, metaFor)),
    simplicity: clamp01(simplicity(parts.length)),
    transparency: clamp01(transparency(parts, metaFor)),
    ambiguity: clamp01(ambiguity(parts, ctx)),
    concreteness: clamp01(concreteness(parts, metaFor)),
  };

  let score = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) score += breakdown[k] * w;
  score = clamp01(score);

  return { score: Math.round(score * 100) / 100, label: understandabilityLabel(score), breakdown };
}

/**
 * Build a `metaFor` lookup from an array of inventory/approved records that carry
 * experience_tier / language_tier. Convenience for tools and the migration.
 */
export function metaLookupFromRecords(records = []) {
  const map = new Map();
  for (const r of records) {
    if (!r?.id) continue;
    map.set(r.id, { language_tier: r.language_tier, experience_tier: r.experience_tier });
  }
  return id => map.get(id) ?? null;
}
