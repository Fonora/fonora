#!/usr/bin/env node
/**
 * Deterministic unit tests for the Fonoran grammar spec (tools/fonoran-grammar-spec.js).
 * Pure functions only — no DB/store, no LLM. Exercises the hard-rule enforcement
 * (canonical modifier order) and the grammar-invariant checker.
 */
import {
  buildPlaceConceptSet,
  orderModifiers,
  enforceModifierOrder,
  grammarInvariantViolations,
  SLOT_SURFACE_ORDER,
  PARTICLE_FORMS,
} from '../tools/fonoran-grammar-spec.js';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const concepts = [
  { id: 'here', domain: 'space' },
  { id: 'there', domain: 'space' },
  { id: 'near', domain: 'space' },
  { id: 'safe', domain: 'quality' },
  { id: 'big', domain: 'quality' },
  { id: 'addressee', domain: 'being' },
];
const placeSet = buildPlaceConceptSet(concepts);

// 1. Place set only contains space-domain ids.
assert(placeSet.has('here') && placeSet.has('near'), 'place set includes space concepts');
assert(!placeSet.has('safe') && !placeSet.has('big'), 'place set excludes quality concepts');

// 2. orderModifiers puts quality before place (the "you are safe here" case).
const ordered = orderModifiers(
  [{ concept_id: 'here' }, { concept_id: 'safe' }],
  placeSet,
);
assert(
  ordered[0].concept_id === 'safe' && ordered[1].concept_id === 'here',
  `quality before place, got ${ordered.map(s => s.concept_id).join(',')}`,
);

// 3. Stable within groups (two qualities keep relative order).
const stable = orderModifiers(
  [{ concept_id: 'big' }, { concept_id: 'here' }, { concept_id: 'safe' }],
  placeSet,
);
assert(
  stable.map(s => s.concept_id).join(',') === 'big,safe,here',
  `stable grouping, got ${stable.map(s => s.concept_id).join(',')}`,
);

// 4. enforceModifierOrder mutates slots in place and reports change.
const slots = { modifiers: [{ concept_id: 'here' }, { concept_id: 'safe' }] };
const res = enforceModifierOrder(slots, concepts);
assert(res.changed === true, 'enforce reports a change');
assert(slots.modifiers[0].concept_id === 'safe', 'enforce reorders in place');

// 5. No-op when already ordered or fewer than 2 modifiers.
const already = { modifiers: [{ concept_id: 'safe' }, { concept_id: 'here' }] };
assert(enforceModifierOrder(already, concepts).changed === false, 'already-ordered is a no-op');
assert(enforceModifierOrder({ modifiers: [{ concept_id: 'here' }] }, concepts).changed === false, 'single modifier is a no-op');

// 6. grammarInvariantViolations: a correct token stream passes.
const goodTokens = [
  { role: 'subject', kind: 'concept', concept_id: 'addressee', fonoran: 'be' },
  { role: 'modifier', kind: 'concept', concept_id: 'safe', fonoran: 'tampe' },
  { role: 'modifier', kind: 'concept', concept_id: 'here', fonoran: 'nam' },
];
assert(grammarInvariantViolations(goodTokens, { placeSet }).length === 0, 'good stream has no violations');

// 7. Detects a place modifier before a quality modifier.
const badOrder = [
  { role: 'subject', kind: 'concept', concept_id: 'addressee', fonoran: 'be' },
  { role: 'modifier', kind: 'concept', concept_id: 'here', fonoran: 'nam' },
  { role: 'modifier', kind: 'concept', concept_id: 'safe', fonoran: 'tampe' },
];
assert(
  grammarInvariantViolations(badOrder, { placeSet }).some(v => v.kind === 'modifier_order'),
  'detects modifier_order violation',
);

// 8. Detects an illegal particle form.
const badParticle = [
  { role: 'time', kind: 'particle', fonoran: 'wo' },
];
const pv = grammarInvariantViolations(badParticle, { placeSet });
assert(pv.some(v => v.kind === 'illegal_particle'), 'detects illegal particle');
assert(pv.some(v => v.kind === 'bad_time_particle'), 'detects bad time particle');

// 9. Detects slot-order violation (subject after event).
const badSlotOrder = [
  { role: 'event', kind: 'concept', concept_id: 'move', fonoran: 'gi' },
  { role: 'subject', kind: 'concept', concept_id: 'addressee', fonoran: 'be' },
];
assert(
  grammarInvariantViolations(badSlotOrder, { placeSet }).some(v => v.kind === 'slot_order'),
  'detects slot_order violation',
);

// 10. Detects a demonstrative surfacing as a concept (must be inferred, not encoded).
const demoTokens = [
  { role: 'subject', kind: 'concept', concept_id: 'this', fonoran: 'dan' },
  { role: 'event', kind: 'concept', concept_id: 'move', fonoran: 'gi' },
];
assert(
  grammarInvariantViolations(demoTokens, { placeSet }).some(v => v.kind === 'demonstrative'),
  'detects demonstrative surfacing as a concept',
);

// 11. Spec constants are well-formed.
assert(SLOT_SURFACE_ORDER[0] === 'subject', 'subject is first slot');
assert(PARTICLE_FORMS.length === 6, 'six closed-class particles');

console.log('fonoran-grammar-spec: all assertions passed');
