/**
 * Authoritative grammar brief for the LLM semantic compiler.
 * Distilled from docs/fonoran-grammar.md and data/fonoran-grammar-particles.json.
 */
import { isExistentialDummyThereEnglish } from './fonoran-interpretation.js';

/** Map LLM frame slots to the human skeleton (Rule 4 / Rule 7). */
export const SLOT_SKELETON = {
  subject: 'Actor — who/what performs or is the topic',
  event: 'Action — the event, state, or main predicate concept',
  object: 'Target — who/what is affected or referenced',
  path: 'Place — spatial relations, motion paths, locatives (lexical, not particles)',
  time: 'Time — ta (past), sa (future), or time concepts (now, before, after); empty = present',
  modifiers: 'Peripheral modifiers (each modifies the concept to its right)',
};

const RESERVED_PARTICLE_FORMS = new Set(['mi', 'ta', 'sa', 'no', 'ya', 'von']);

const REMOVED_PARTICLE_FORMS = new Set([
  'wo', 'vus', 'zas', 'zes', 'zis', 'zos', 'zus', 'vat', 'vet', 'vit',
]);

/** Build the grammar section injected into the LLM user prompt. */
export function buildLlmGrammarBrief(particlesDoc = {}) {
  const lines = [];

  lines.push('# Fonoran grammar (authoritative — docs/fonoran-grammar.md)');
  lines.push('');
  lines.push('## Design Rule 0');
  lines.push('Compile MEANING into approved concepts — never literal English word substitution.');
  lines.push('If a distinction can be expressed with ordinary concepts, do NOT invent grammar.');
  lines.push('Never invent concept ids. Unmapped ideas go in unresolved[] (honest gaps).');
  lines.push('');
  lines.push('## Sentence skeleton (Rule 4 / Rule 7)');
  lines.push('Actor · Action · Target · Place · Time');
  lines.push('Core order is strict: Actor → Action → Target. Place and Time may float.');
  lines.push('');
  lines.push('### Frame slot mapping (your JSON output)');
  for (const [slot, desc] of Object.entries(SLOT_SKELETON)) {
    lines.push(`- ${slot}: ${desc}`);
  }
  lines.push('');
  lines.push('## Particles — closed class ONLY (Rule 3)');
  lines.push('The ONLY grammatical particles: mi (I), ta (past), sa (future), no (not), ya (yes), von (if).');
  lines.push('Present tense: leave time slot EMPTY (no particle). Past: ta in time. Future: sa in time.');
  lines.push('Negation no attaches near the action, clause-scoped. Map internal "neg" to form "no".');
  lines.push('Particles never fuse into lexical spellings. Do NOT emit removed v1 forms (wo, vus, zas, etc.).');
  lines.push('');
  lines.push('## Lexical, NOT particles');
  lines.push('Spatial/relational meaning uses concept ids — never English prepositions as grammar:');
  const lexical = particlesDoc.deliberately_lexical ?? {};
  if (lexical.spatial_relations?.length) {
    for (const row of lexical.spatial_relations) {
      lines.push(`  ${row}`);
    }
  } else {
    lines.push('  in/inside→inside (mes), here→here (nam), there→there (tak), toward→path (nan), from→source (lo), near→near (dal), far→far (fet), up→up (ra), down→down (ju)');
  }
  lines.push('Personal pronouns except mi resolve lexically: you→addressee (be), self→self (de).');
  lines.push('First-person plural we/us — default subject: collective (dan). Optional alternate: mi + addressee (I + you) when the source explicitly signals a dyad (each other, you and I, both of us). Do not infer dyadic vs group from topic alone.');
  lines.push('Conjunctions (and/or/but/because) are structural — split clauses, do not invent connective particles.');
  lines.push('');
  lines.push('## Quantifier pronouns (compose, not roots)');
  const quants = particlesDoc.quantifier_pronouns ?? {};
  for (const [surface, parts] of Object.entries(quants)) {
    if (surface === 'note') continue;
    if (Array.isArray(parts)) {
      lines.push(`  ${surface} → [${parts.map(p => (p === 'neg' ? 'no' : p)).join(', ')}]`);
    }
  }
  lines.push('');
  lines.push('## Questions (Rule 3)');
  lines.push('No question particle. Set is_question true; surface gets ?.');
  lines.push('WH content questions ONLY when source contains who/whom/what/where/when:');
  lines.push('  who/whom → [no,know,person]  what → [no,know,thing]  where → [no,know,place]  when → [no,know,time]');
  lines.push('Yes/no questions (Are you…?, Is there…?, Do you…?, Can we…?) must NOT use WH composition.');
  lines.push('Existential "Are there…" / "There are…": English dummy there has NO meaning — do NOT emit concept there (tak).');
  lines.push('  Compile only the entities and relations being asserted (e.g. other + people + near + addressee + ?).');
  lines.push('  Use there (tak) ONLY for deictic pointing at a place ("over there", "put it there").');
  lines.push('Why/how are NOT expressible in v1 — list in unresolved[], do not approximate.');
  lines.push('');
  lines.push('## Compounding (Rule 5)');
  lines.push('Prefer approved compound concept ids (e.g. people, war, tribe) over listing raw roots.');
  lines.push('Semantic economy: omit implied concepts unless needed for disambiguation.');
  lines.push('');
  lines.push('## Motion & locatives (Rule 7)');
  lines.push('Motion frames: event=move/run/etc, path slot holds direction/landmark concepts (path, source, far, near, up, inside).');
  lines.push('Static locatives ("X is near Y"): place concepts in path/modifiers, not collapsed head nouns only.');

  return lines.join('\n');
}

export function normalizeFrameParticles(frame) {
  if (!frame?.slots) return frame;
  const slots = {};
  for (const [role, items] of Object.entries(frame.slots)) {
    if (!Array.isArray(items)) {
      slots[role] = items;
      continue;
    }
    slots[role] = items.map(x => {
      const id = String(x ?? '').trim().toLowerCase();
      return id === 'neg' ? 'no' : x;
    });
  }
  return { ...frame, slots };
}

/** Remove spurious there (tak) from frames for existential English dummy-there. */
export function stripExistentialThereFromFrame(frame, sourceText) {
  if (!frame?.slots || !isExistentialDummyThereEnglish(sourceText)) return frame;
  const slots = {};
  for (const [role, items] of Object.entries(frame.slots)) {
    if (!Array.isArray(items)) {
      slots[role] = items;
      continue;
    }
    slots[role] = items.filter(x => String(x ?? '').trim().toLowerCase() !== 'there');
  }
  return { ...frame, slots };
}

/**
 * Grammar violations in an LLM frame (beyond unknown concept ids).
 * @returns {{ violations: object[], repairable: boolean }}
 */
export function checkLlmGrammarViolations(frame, sourceText = '') {
  const violations = [];
  const slots = frame?.slots ?? {};
  const hasWh = /\b(who|whom|what|where|when)\b/i.test(String(sourceText));

  for (const [role, items] of Object.entries(slots)) {
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const id = String(raw ?? '').trim().toLowerCase();
      if (!id) continue;
      if (id === 'neg') {
        violations.push({ kind: 'neg_alias', role, id, message: 'Use particle form "no", not "neg".' });
      }
      if (REMOVED_PARTICLE_FORMS.has(id)) {
        violations.push({ kind: 'removed_particle', role, id, message: `Removed v1 particle "${id}" must not appear.` });
      }
    }
  }

  if (frame?.is_question && !hasWh) {
    for (const items of Object.values(slots)) {
      if (!Array.isArray(items)) continue;
      const ids = items.map(x => String(x ?? '').trim().toLowerCase());
      const whPatterns = [
        ['no', 'know', 'person'],
        ['no', 'know', 'thing'],
        ['no', 'know', 'place'],
        ['no', 'know', 'time'],
      ];
      for (const pattern of whPatterns) {
        if (ids.length >= pattern.length && pattern.every((p, i) => ids[i] === p)) {
          violations.push({
            kind: 'wh_on_yesno',
            message: 'WH composition used on yes/no question without who/what/where/when.',
          });
          break;
        }
      }
    }
  }

  if (isExistentialDummyThereEnglish(sourceText)) {
    for (const [role, items] of Object.entries(slots)) {
      if (!Array.isArray(items)) continue;
      if (items.some(x => String(x ?? '').trim().toLowerCase() === 'there')) {
        violations.push({
          kind: 'existential_there',
          role,
          message: 'Dummy existential English "there" must not map to concept there (tak).',
        });
      }
    }
  }

  const timeItems = (slots.time ?? []).map(x => String(x ?? '').trim().toLowerCase());
  for (const id of timeItems) {
    if (!id) continue;
    if (RESERVED_PARTICLE_FORMS.has(id) && id !== 'ta' && id !== 'sa') {
      violations.push({ kind: 'particle_in_time', id, message: `Only ta/sa or time concepts belong in time slot, not "${id}".` });
    }
  }

  return {
    violations,
    repairable: violations.some(v => v.kind === 'wh_on_yesno' || v.kind === 'neg_alias'),
  };
}

export { RESERVED_PARTICLE_FORMS, REMOVED_PARTICLE_FORMS };
