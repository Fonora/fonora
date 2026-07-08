/**
 * Fonoran grammar spec — the hard, machine-checkable rules.
 *
 * This is the single source of truth for BOTH the deterministic grammar-
 * enforcement pass (applied to every LLM/cached frame before render) and the
 * grammar-invariant tests. The LLM is free to choose meaning (concept ids), but
 * the grammar around those concepts is guaranteed here by hard rules.
 *
 * Distilled from docs/fonoran-grammar.md (Rules 3/4/5/7) and
 * data/fonoran-grammar-particles.json.
 */

/**
 * Surface order of frame slots (Rule 4 / Rule 7: Actor · Action · Target ·
 * Place · Time). The renderer emits subject → time → event → path → object →
 * modifiers; Time floats up next to the Actor, Place (path) precedes the
 * trailing modifiers.
 */
export const SLOT_SURFACE_ORDER = Object.freeze([
  'subject', 'time', 'event', 'path', 'object', 'modifier',
]);

/** The only legal grammatical particle forms (Rule 3, closed class). */
export const PARTICLE_FORMS = Object.freeze(['mi', 'ta', 'sa', 'no', 'ya', 'von']);

/** Particles allowed in the Time slot (present tense = empty). */
export const TENSE_PARTICLES = Object.freeze(['ta', 'sa']);

/** Inventory domain that marks a concept as locative / Place. */
export const PLACE_DOMAIN = 'space';

/**
 * Demonstratives have NO Fonoran form (Rule 7). Fonoran is deliberately small and
 * inference-based: "this/that/these/those" are recovered from context, never
 * encoded as concepts or particles. The compiler must drop them; the invariant
 * checker asserts none ever surface as a content token.
 */
export const DEMONSTRATIVES = Object.freeze(['this', 'that', 'these', 'those']);

/**
 * Build the set of place/locative concept ids from the concept inventory.
 * @param {Array<{id?: string, domain?: string}>} concepts
 * @returns {Set<string>}
 */
export function buildPlaceConceptSet(concepts = []) {
  const set = new Set();
  for (const c of concepts) {
    if (c && c.domain === PLACE_DOMAIN && c.id) set.add(String(c.id).toLowerCase());
  }
  return set;
}

/** True if a slot object refers to a place/locative concept. */
function slotIsPlace(slot, placeSet) {
  const id = String(slot?.concept_id ?? slot?.english ?? '').toLowerCase();
  return placeSet.has(id);
}

/**
 * Canonical intra-slot modifier order: quality (non-place) BEFORE place.
 * Two floating modifiers must render deterministically, so "you are safe here"
 * always yields `... tampe nam` (quality `safe` then place `here`), never the
 * reverse. Stable: relative order within each group is preserved.
 * @param {object[]} modifierSlots
 * @param {Set<string>} placeSet
 * @returns {object[]} reordered copy
 */
export function orderModifiers(modifierSlots = [], placeSet = new Set()) {
  const quality = [];
  const place = [];
  for (const slot of modifierSlots) {
    if (slotIsPlace(slot, placeSet)) place.push(slot);
    else quality.push(slot);
  }
  return [...quality, ...place];
}

/**
 * Enforce grammar on internal semantic slots in place (deterministic).
 * Currently: canonical modifier ordering (quality before place). Returns whether
 * anything changed so callers can log/audit.
 * @param {object} slots  output of frameSlotsToSemanticSlots
 * @param {Array<{id?: string, domain?: string}>} concepts  inventory concepts
 * @returns {{ changed: boolean }}
 */
export function enforceModifierOrder(slots, concepts = []) {
  if (!slots || !Array.isArray(slots.modifiers) || slots.modifiers.length < 2) {
    return { changed: false };
  }
  const placeSet = buildPlaceConceptSet(concepts);
  const before = slots.modifiers;
  const after = orderModifiers(before, placeSet);
  const changed = after.some((slot, i) => slot !== before[i]);
  if (changed) slots.modifiers = after;
  return { changed };
}

/**
 * Check hard grammar invariants against a rendered token stream. Used by the
 * grammar-invariant tests: these must hold regardless of which synonym concept
 * the LLM chose. Returns a list of violations (empty = grammatical).
 * @param {object[]} tokens  resolved tokens (role, kind, fonoran, concept_id)
 * @param {{ placeSet?: Set<string> }} [opts]
 * @returns {Array<{ kind: string, message: string }>}
 */
export function grammarInvariantViolations(tokens = [], { placeSet = new Set() } = {}) {
  const violations = [];
  const contentTokens = tokens.filter(t => t && t.kind !== 'punctuation');

  // 1. Slot order follows the fixed skeleton.
  const rank = new Map(SLOT_SURFACE_ORDER.map((role, i) => [role, i]));
  let lastRank = -1;
  for (const t of contentTokens) {
    const r = rank.has(t.role) ? rank.get(t.role) : SLOT_SURFACE_ORDER.length;
    if (r < lastRank) {
      violations.push({ kind: 'slot_order', message: `Slot "${t.role}" appears after a later-ranked slot.` });
      break;
    }
    lastRank = Math.max(lastRank, r);
  }

  // 2. Particle tokens use only the closed-class forms.
  for (const t of tokens) {
    if (t?.kind !== 'particle') continue;
    if (!PARTICLE_FORMS.includes(String(t.fonoran ?? '').toLowerCase())) {
      violations.push({ kind: 'illegal_particle', message: `Illegal particle form "${t.fonoran}".` });
    }
  }

  // 3. Time slot carries only ta/sa particles (present = no particle).
  for (const t of tokens) {
    if (t?.role !== 'time' || t?.kind !== 'particle') continue;
    if (!TENSE_PARTICLES.includes(String(t.fonoran ?? '').toLowerCase())) {
      violations.push({ kind: 'bad_time_particle', message: `Time slot particle must be ta/sa, got "${t.fonoran}".` });
    }
  }

  // 4. Canonical modifier order: no place modifier precedes a quality modifier.
  const modifiers = contentTokens.filter(t => t.role === 'modifier');
  let seenPlace = false;
  for (const m of modifiers) {
    const id = String(m.concept_id ?? m.english ?? '').toLowerCase();
    const isPlace = placeSet.has(id);
    if (isPlace) seenPlace = true;
    else if (seenPlace) {
      violations.push({ kind: 'modifier_order', message: 'Quality modifier appears after a place modifier.' });
      break;
    }
  }

  // 5. Demonstratives never surface as concepts (Rule 7 — inferred, not encoded).
  for (const t of contentTokens) {
    const id = String(t.concept_id ?? t.english ?? '').toLowerCase();
    if (DEMONSTRATIVES.includes(id)) {
      violations.push({ kind: 'demonstrative', message: `Demonstrative "${id}" surfaced as a concept; must be inferred, not encoded.` });
    }
  }

  return violations;
}
