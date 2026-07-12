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
  lines.push('Clause negation goes at the FRONT of the event slot: "do not want to see" → event [no, want], object [see, …].');
  lines.push('Never park no in time or modifiers; no belongs in a non-event slot ONLY for quantifier composition (nobody → [no, person]).');
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
    lines.push('  in/inside→inside (mes), here→here (nam), there→there (tak), toward→path (nan), from→source (lo), near→near (dal), far→far (fet), up→up (wa), down→down (do)');
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
  lines.push('WH content questions ONLY when source contains who/whom/what/where/when.');
  lines.push('Use the lexicalized word unknown (nohu) + a category concept:');
  lines.push('  who/whom → [unknown,person]  what → [unknown,thing]  where → [unknown,place]  when → [unknown,time]');
  lines.push('unknown is ONE word (nohu) — do NOT spell it as no + know.');
  lines.push('Yes/no questions (Are you…?, Is there…?, Do you…?, Can we…?) must NOT use WH composition.');
  lines.push('Embedded "where X is" in a STATEMENT or imperative is possession, not a question:');
  lines.push('  compile as [X, place] — "nobody knows where we are" → object [collective, place] (= our place);');
  lines.push('  "show me where the food is" → object [food, place]. is_question stays false; no ?.');
  lines.push('Embedded identity "what X is" keeps [unknown, thing]: "I do not know what it is" → object [unknown, thing].');
  lines.push('Existential "Are there…" / "There are…": English dummy there has NO meaning — do NOT emit concept there (tak).');
  lines.push('  Compile only the entities and relations being asserted (e.g. other + people + near + addressee + ?).');
  lines.push('  Use there (tak) ONLY for deictic pointing at a place ("over there", "put it there").');
  lines.push('Why/how are NOT expressible in v1 — list in unresolved[], do not approximate.');
  lines.push('');
  lines.push('## Compounding (Rule 5)');
  lines.push('Prefer approved compound concept ids (e.g. rain, thirsty, happy) over listing raw roots.');
  lines.push('Semantic economy: if a compound concept already encodes a locative (e.g. "staying" = still+inside), do NOT also emit that locative separately in the path slot — it would be expressed twice.');
  lines.push('');
  lines.push('## Motion & locatives (Rule 7)');
  lines.push('Motion frames: event=move/run/etc, path slot holds direction/landmark concepts (path, source, far, near, up, inside).');
  lines.push('Static locatives ("X is near Y"): place concepts in path/modifiers, not collapsed head nouns only.');
  lines.push('');
  lines.push('## Weather / impersonal events');
  lines.push('English weather verbs use a dummy "it" subject that has no meaning — drop it entirely.');
  lines.push('"It rains" / "It is raining" → event=[rain], subject empty.');
  lines.push('"It will rain" / "It is going to rain" → time=[sa], event=[rain], subject empty.');
  lines.push('"It rained yesterday" → time=[ta], event=[rain], subject empty.');
  lines.push('');
  lines.push('## Future tense — "going to" and "about to"');
  lines.push('"going to [verb]" and "about to [verb]" are English future markers, NOT motion.');
  lines.push('Map them to sa in the time slot, not as the verb "come" or "go" in the event slot.');
  lines.push('When sa (future) is in the time slot, do NOT also add now (gem) — they contradict.');

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

  // "now" alongside an explicit tense particle is a contradiction: "going to rain"
  // triggers sa (future) but the LLM sometimes also emits "now" because the source
  // uses the present-continuous form "is going to". Strip it.
  if (Array.isArray(slots.time)) {
    const timeIds = slots.time.map(x => String(x ?? '').trim().toLowerCase());
    if ((timeIds.includes('sa') || timeIds.includes('ta')) && timeIds.includes('now')) {
      slots.time = slots.time.filter(x => String(x ?? '').trim().toLowerCase() !== 'now');
    }
  }

  // Negation attaches near the action (Rule 3): LLMs sometimes park a clause-
  // scoped `no` in time, in modifiers, or trailing in another slot. Move it to
  // the event front so the frame validates and renders before the Action.
  // `no` + a CATEGORY concept in the same slot is local composition sanctioned
  // by the grammar (nobody = no+person, nothing = no+thing, different =
  // no+same, false = no+true) and is left alone; `no` + anything else (verbs,
  // adjectives) is misplaced clause negation.
  const isNo = x => String(x ?? '').trim().toLowerCase() === 'no';
  // person/thing/place/time: quantifier pronouns; same/true: polarity antonyms;
  // know: legacy WH composition [no, know, X] that fuses to nohu downstream.
  const NO_COMPOSITION_TARGETS = new Set(['person', 'thing', 'place', 'time', 'same', 'true', 'know']);
  let misplacedNegation = false;
  for (const role of Object.keys(slots)) {
    if (role === 'event' || !Array.isArray(slots[role])) continue;
    const items = slots[role];
    const kept = [];
    for (let i = 0; i < items.length; i += 1) {
      const nextId = String(items[i + 1] ?? '').trim().toLowerCase();
      if (isNo(items[i]) && (role === 'time' || !NO_COMPOSITION_TARGETS.has(nextId))) {
        misplacedNegation = true;
        continue;
      }
      kept.push(items[i]);
    }
    slots[role] = kept;
  }
  if (misplacedNegation && !(Array.isArray(slots.event) && slots.event.some(isNo))) {
    slots.event = ['no', ...(Array.isArray(slots.event) ? slots.event : [])];
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
        ['unknown', 'person'],
        ['unknown', 'thing'],
        ['unknown', 'place'],
        ['unknown', 'time'],
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
  const hasFuture = timeItems.includes('sa');
  const hasPast = timeItems.includes('ta');
  for (const id of timeItems) {
    if (!id) continue;
    if (RESERVED_PARTICLE_FORMS.has(id) && id !== 'ta' && id !== 'sa') {
      violations.push({ kind: 'particle_in_time', id, message: `Only ta/sa or time concepts belong in time slot, not "${id}".` });
    }
    // "now" contradicts an explicit tense particle — flag it for repair.
    if (id === 'now' && (hasFuture || hasPast)) {
      violations.push({ kind: 'now_with_tense', id, message: `"now" (gem) must not appear alongside ${hasFuture ? 'sa (future)' : 'ta (past)'}.` });
    }
  }

  return {
    violations,
    repairable: violations.some(v => v.kind === 'wh_on_yesno' || v.kind === 'neg_alias'),
  };
}

export { RESERVED_PARTICLE_FORMS, REMOVED_PARTICLE_FORMS };
