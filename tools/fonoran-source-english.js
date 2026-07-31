/**
 * The English source parser: English text → the neutral slot structure.
 *
 * This is the whole of "understanding English" for the forward path, behind
 * the parser contract in fonoran-source-parsers.js. It knows English (via
 * wink-nlp and the structure parse) and it knows concept ids and grammar
 * particle ids. It deliberately knows no Fonoran spelling: tense is reported
 * as `particle_id: 'tense_past'`, negation as `particle_id: 'logic_not'`, a
 * possessor as a { particle_id } / { concept_id } reference, and the engine
 * attaches the seed-loaded forms. A respelled particle flows through this
 * module with no change.
 *
 * It moved here from fonoran-translator.js so the engine is language-neutral
 * and a second source language is a second module with this shape, never a
 * second pipeline.
 */

import { parseEnglishStructure, splitClauses } from './fonoran-english-parse.js';
import {
  matchLeadingTimeAdverbial,
  mergePhrasalTokens,
  lemmaCandidates,
  POSSESSIVE_OWNERS,
} from './fonoran-interpretation.js';
import {
  tokenizeEnglish,
  lemmatizeEnglish,
  inflectedLemma,
  TEMPORAL_SUBORDINATORS,
} from './fonoran-english-morphology.js';
import { modalComposition } from './fonoran-language-policy.js';
import { emptySlots, appendSlots } from './fonoran-source-parsers.js';
import { derivationalBases, negatedBases } from './fonoran-english-derivation.js';

/** Language this parser owns. */
export const lang = 'en';

/**
 * The morphology hooks the resolver uses for this language (parser contract).
 * All three delegate to wink-nlp via fonoran-english-morphology.js; a second
 * language supplies its own, and the resolver never calls an English function
 * by name.
 */
export const morphology = {
  /** Dictionary form of a single word. */
  lemmatize: lemmatizeEnglish,
  /** Dictionary form when the surface is inflected, null when it already is one. */
  inflectedLemma,
  /** Lookup-key candidates for a surface form: the word itself plus its lemma. */
  lemmaCandidates: word => lemmaCandidates(word),
  /** Same-concept derivational bases (safety→safe), candidates only. */
  derivationalBases,
};

/**
 * English writes some single concepts as several words, closed or open:
 * "sea food" is the lexicon's `seafood`, "some one" is `someone`. Joining them
 * before tagging is English orthography knowledge, so it lives with the parser.
 */
const CLOSED_ENGLISH_COMPOUNDS = new Set([
  'seafood', 'something', 'someone', 'anyone', 'everyone', 'nothing', 'anything', 'everything',
  'somebody', 'anybody', 'everybody', 'nobody', 'somewhere', 'anywhere', 'everywhere', 'nowhere',
  'somehow', 'anyhow', 'into', 'onto', 'upon', 'within', 'without', 'throughout', 'underneath',
]);

export function mergeEnglishCompounds(tokens, aliasIndex = null) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let merged = null;
    let consumed = 0;
    for (let len = Math.min(3, tokens.length - i); len >= 2; len -= 1) {
      const slice = tokens.slice(i, i + len);
      if (slice.some(t => String(t).toLowerCase() === 'to')) break;
      const spaced = slice.join(' ').toLowerCase();
      const closed = slice.join('').toLowerCase();
      if (aliasIndex?.has(spaced)) { merged = spaced; consumed = len; break; }
      if (CLOSED_ENGLISH_COMPOUNDS.has(closed)) { merged = closed; consumed = len; break; }
    }
    if (merged) { out.push(merged); i += consumed; continue; }
    if (i + 1 < tokens.length) {
      const closed = `${tokens[i]}${tokens[i + 1]}`.toLowerCase();
      const hasTo = String(tokens[i]).toLowerCase() === 'to' || String(tokens[i + 1]).toLowerCase() === 'to';
      if (!hasTo && CLOSED_ENGLISH_COMPOUNDS.has(closed)) { out.push(closed); i += 2; continue; }
    }
    out.push(tokens[i]);
    i += 1;
  }
  return out;
}

/**
 * Sanctioned modal compositions. Reference policy for the prompt and probes; the
 * grammar-policy seed records which concepts each sense may use.
 *
 * Modality is lexical, not grammatical: modal senses chain as ordinary concepts
 * in the Action slot on the `sak` (want) precedent, so none of this costs a
 * particle or a root. Every mapping below reuses an approved form.
 *
 *   ability     -> know + VERB   "I can make fire"  -> mi hu kel dat
 *   necessity   -> need + VERB   "we must run now"  -> gem dan les ginek
 *   possibility -> maybe         "maybe we can go"  -> ketnat dan gi
 *   inability   -> no + VERB     "I cannot walk"    -> mi no giti
 *
 * `know` for ability is the ordinary creole route (Haitian `konn`, Tok Pisin
 * `save`) and stays lego-recoverable: "know make fire" reads as knowing how.
 * `maybe` is the existing compound `some` + `true` (`ketnat`), so possibility
 * was already expressible and only needed to be applied consistently.
 *
 * Measured against the 1001-phrase corpus, the raw modal count badly overstates
 * the gap. Of 75 `can` phrases, 39 are interrogative requests that need no
 * modal at all, because a bare question already reads as one ("can you hear
 * me?" -> `be len mi?`), and 11 of 12 negated modals are `cannot`, which plain
 * negation already covers.
 *
 * Two senses are deliberately left unexpressed rather than approximated:
 *
 * - `should` / `ought`. Mapping it onto `need` inverts under negation: "we
 *   should not go there" would render as "we do not need to go there", which
 *   permits what the source forbids. An honest gap beats a reversed one.
 * - Permission-granting "you can keep this". No approved root separates
 *   granting from merely stating, and the sense is 5 corpus phrases.
 */
export const MODAL_COMPOSITION = modalComposition();

/** A source sentence is a written question when it ends with `?`. */
export function isQuestionSentence(sentence) {
  return String(sentence ?? '').trim().endsWith('?');
}

/** Split paragraph into sentences on . ! ? or newlines. */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Subject pronouns → nearest concept id for resolution. `i`/`me` need no entry:
 * the engine resolves them through the pronoun particle triggers in the seed.
 */
const PRONOUN_CONCEPTS = {
  you: 'addressee',
  we: 'collective',
  us: 'collective',
  they: 'collective',
  them: 'collective',
  he: 'person',
  him: 'person',
  she: 'person',
  it: 'thing',
};

function subjectSlot(english) {
  const surface = String(english ?? '').trim();
  const conceptHint = PRONOUN_CONCEPTS[surface.toLowerCase()];
  return {
    english: surface,
    role: 'subject',
    ...(conceptHint ? { concept_hint: conceptHint, interpret_reason: 'pronoun' } : {}),
  };
}

/**
 * Which concept carries this modal, or null when the sense is correctly unmarked?
 *
 * The policy for this lives in `data/fonoran-grammar-policy.json` and in the
 * MODAL_COMPOSITION doc block, and for a long time nothing applied it: every modal
 * sat in a skip list, so "we must run now" and "we run now" produced the same sentence and
 * "I can make fire" asserted that fire is being made rather than that the speaker
 * is able to.
 *
 * The three unmarked senses are unmarked on purpose, not for lack of vocabulary:
 * an interrogative `can` is a request the question already carries, a first-person
 * plural `can` proposes a joint action rather than claiming skill, and a negated
 * modal is covered by plain negation. Only ability and necessity take a marker, and
 * it lands immediately before the Action because the English modal sits there too.
 */
function modalConcept(word, { negated = false, subjectEnglish = null, isQuestion = false } = {}) {
  const w = String(word ?? '').toLowerCase();
  if (w === 'must') return MODAL_COMPOSITION.necessity?.[0] ?? null;
  if (w !== 'can' && w !== 'could') return null;
  if (negated || isQuestion) return null;
  const subject = String(subjectEnglish ?? '').toLowerCase();
  if (subject === 'we' || subject === 'us') return null;
  return MODAL_COMPOSITION.ability?.[0] ?? null;
}

/**
 * Possessive re-attachment: Fonoran encodes the possessor (`gamba be` = enemy-your),
 * but `my`/`your`/`our` used to be skipped and deleted before the parse, so the
 * possessor vanished: `mi` and `be` were the two most-dropped tokens across the
 * corpus. The owner map (POSSESSIVE_OWNERS) lives in fonoran-interpretation.js and
 * is shared with the structure parser, which skips exactly those words.
 */

/**
 * Slots from a word-class parse. The Fonoran side is untouched: every entry is handed to
 * the same engine, so pronouns still become particles, `nohu` composition still
 * fires on WH words, and tense still renders as a particle. Only the choice of which
 * English word fills which slot changes.
 *
 * @param {string} sentence
 * @param {string[]} tokens the tokenized sentence, for the possessive re-attachment pass
 */
function compileSemanticSlotsFromPos(sentence, tokens, {
  isQuestion = false, rules = null, aliasIndex = null,
} = {}) {
  const perClause = splitClauses(sentence).map((clause) => {
    // Multi-word lexicon entries ("time traveler") and phrasal verbs ("wake up") are single
    // words as far as the lexicon is concerned, so they are masked before tagging: read word
    // by word, "time traveler" becomes two nouns and the compound is never looked up.
    const rawTokens = tokenizeEnglish(clause.text);
    const clauseTokens = mergeIdiomTokens(
      mergePhrasalTokens(mergeEnglishCompounds(rawTokens, aliasIndex)),
      rules,
    );
    const { text, phrases } = maskPhrases(clause.text, rawTokens, clauseTokens);
    const slots = posClauseToSlots(text, clauseTokens, {
      isQuestion,
      connector: clause.connector,
      rules,
      phrases,
    });
    expandNegatedDerivations(slots, aliasIndex);
    return slots;
  });

  // One slot set for the semantic report, plus the per-clause sets the renderer walks, so
  // two predications stay two predications instead of interleaving slot by slot.
  const merged = emptySlots();
  merged.mode = 'sentence';
  for (const clause of perClause) appendSlots(merged, clause);
  merged.clauses = perClause;
  return merged;
}

/**
 * Join the words of a curated idiom into one token, so it reaches the lexicon whole.
 * @param {string[]} tokens
 * @param {object|null} rules
 */
function mergeIdiomTokens(tokens, rules) {
  const phrases = Object.keys(rules?.idioms ?? {})
    .map(key => key.toLowerCase().split(/\s+/).filter(Boolean))
    .filter(parts => parts.length > 1)
    .sort((a, b) => b.length - a.length);
  if (!phrases.length) return tokens;

  const out = [];
  let at = 0;
  while (at < tokens.length) {
    const hit = phrases.find(parts => parts.length <= tokens.length - at
      && parts.every((part, k) => String(tokens[at + k]).toLowerCase() === part));
    if (hit) {
      out.push(hit.join(' '));
      at += hit.length;
      continue;
    }
    out.push(tokens[at]);
    at += 1;
  }
  return out;
}

/**
 * Rebuild a clause so every lexicon entry is one word the tagger cannot split, and return
 * the map needed to put the originals back.
 *
 * The lexicon has entries that English writes as several words, and the merge upstream
 * already found them: "time traveler" and "sea food" arrive as single tokens, the second
 * respelled to match the entry. Reading the raw sentence instead would tag two nouns and
 * the compound would never be looked up.
 *
 * Case is kept, because the tagger uses it: lowercasing "Light travels fast" makes light
 * an adjective and leaves the clause with no subject.
 *
 * @param {string} text the clause as written
 * @param {string[]} rawTokens the clause tokenized, one word each
 * @param {string[]} mergedTokens the same clause after the lexicon and phrasal merges
 */
function maskPhrases(text, rawTokens, mergedTokens) {
  const surfaces = text.match(/[\p{L}'-]+/gu) ?? [];
  const phrases = new Map();
  const words = [];
  let at = 0;
  for (const token of mergedTokens) {
    const word = String(token ?? '').toLowerCase();
    // How many written words this token was merged from. "sea food" is one entry spelled
    // seafood, so the span is found by joining candidates rather than by string equality.
    let span = 0;
    for (let len = 1; len <= 3 && at + len <= rawTokens.length; len += 1) {
      const slice = rawTokens.slice(at, at + len).map(t => String(t).toLowerCase());
      if (slice.join(' ') === word || slice.join('') === word) { span = len; break; }
    }
    if (span === 1) {
      const surface = surfaces[at];
      words.push(surface && surface.toLowerCase() === word ? surface : word);
      at += 1;
      continue;
    }
    // Letters only, and capitalized, so the tagger reads it as one unknown name rather
    // than guessing a part of speech from a digit or an underscore.
    const placeholder = `Xxphrase${'a'.repeat(phrases.size + 1)}`;
    phrases.set(placeholder.toLowerCase(), word);
    words.push(placeholder);
    at += span || 1;
  }
  return { text: words.join(' '), phrases };
}

/**
 * Put masked phrases back into a parse, so the slots carry "time traveler" rather than the
 * placeholder the tagger saw.
 * @param {object} parse
 * @param {Map<string, string>} phrases
 */
function restorePhrases(parse, phrases) {
  if (!phrases?.size) return parse;
  const swap = value => (typeof value === 'string' && phrases.has(value.toLowerCase())
    ? phrases.get(value.toLowerCase())
    : value);
  return {
    ...parse,
    actor: swap(parse.actor),
    action: swap(parse.action),
    target: swap(parse.target),
    actionSurface: swap(parse.actionSurface),
    targetSurface: swap(parse.targetSurface),
    modifiers: parse.modifiers.map(swap),
    places: parse.places.map(place => ({ ...place, head: swap(place.head) })),
    coordinated: parse.coordinated.map(entry => ({ ...entry, word: swap(entry.word) })),
  };
}

function posClauseToSlots(sentence, tokens, {
  isQuestion = false, connector = null, rules = null, phrases = null,
} = {}) {
  // Which of the masked tokens the editorial data calls a predicate rather than an argument.
  const predicates = new Set(
    [...(phrases ?? [])]
      .filter(([, phrase]) => rules?.idioms?.[phrase]?.slot === 'event')
      .map(([placeholder]) => placeholder),
  );
  const parse = restorePhrases(parseEnglishStructure(sentence, { predicates }), phrases);
  const slots = emptySlots();
  slots.mode = 'sentence';
  // "Every morning" is a bare noun phrase with nothing predicated of it. Whether that is
  // a Time or an ordinary Actor depends on the concept, not on the English, so the label
  // is settled after resolution.
  slots.verbless = !parse.action;

  // Fonoran has no root for "when" or "because", so the connector surfaces as a bracketed
  // gap rather than being dropped: the two statements would otherwise read as unrelated.
  if (connector) {
    const role = TEMPORAL_SUBORDINATORS.has(connector) ? 'time' : 'modifier';
    if (role === 'time') slots.time.push({ english: connector, role });
    else slots.modifiers.push({ english: connector, role });
  }

  // A WH word leads the clause and is expanded to `nohu` + dimension downstream, so it
  // goes in ahead of the Actor rather than replacing it: "why did you go" keeps you.
  // Only in a question: the "when" of "when the forest was young" is a subordinator, and
  // asking `nohu kan` there would turn a narrative clause into an interrogative.
  // A degree question ("how far is the water") is asked as a yes/no question about the scale
  // word itself, `ka ye fet`, and refined with more and less. There is no scale dimension to
  // pair with `nohu`, and `nohu fet` would answer the question ("unknown very-far") while
  // asking it. The scale word carries a note so the liberty shows up in interpretations[].
  const whWord = quantityProbe(sentence, parse.wh);
  if (whWord && isQuestion && !parse.whDegree) slots.subject.push({ english: whWord, role: 'subject' });
  // Outside a question, `how` is ordinary vocabulary (the manner concept) and dropping it
  // changed meaning silently: "I do not know how" rendered as "I do not know". The other WH
  // words are left alone here, because a non-interrogative "where we are" or "who you are"
  // is a relative clause, and Fonoran has no relativizer: that is a separate, tracked gap,
  // and resolving the bare word instead lands on the wrong concept (`where` reached empty).
  // "know how to" is excluded: the infinitive already carries it, so `hu kel dat` is right.
  if (parse.wh === 'how' && !isQuestion && !/\bhow\s+to\b/i.test(String(sentence ?? ''))) {
    slots.modifiers.push({ english: whWord, role: 'modifier' });
  }
  if (parse.actor) slots.subject.push(subjectSlot(parse.actor));

  // A scene word and a tense are different claims: "I will sit down now" names the moment
  // and marks the future, and reporting only the scene word dropped the future particle.
  if (parse.time && parse.time !== parse.tense) {
    slots.time.push({ english: parse.time, role: 'time' });
  }
  if (parse.tense === 'past') {
    slots.time.push({ english: 'past', role: 'time', particle_id: 'tense_past', english_source: parse.tenseSource ?? null });
  } else if (parse.tense === 'future') {
    slots.time.push({ english: 'future', role: 'time', particle_id: 'tense_future', english_source: parse.tenseSource ?? null });
  }

  // Rule 13: side by side already means "and", so a conjunction needs no word, while a
  // choice closes the group with `lu` ("a single one") AFTER the alternatives. Both
  // alternatives must sit in the same slot for that to be sayable at all: disjunction was
  // unreachable for a long time because the old front end never grouped them, so the
  // marker had no group to close.
  /**
   * @param {object[]} slot
   * @param {string|null} head
   * @param {string} role
   * @param {string[]} coordinatedKinds which coordinated entries belong in this slot
   * @param {string|null} [surface] the head as written, when it differs from the lemma
   */
  const groupInto = (slot, head, role, coordinatedKinds, surface = null) => {
    if (head) slot.push({ english: head, role, ...(surface && surface !== head ? { surface } : {}) });
    const alternatives = parse.coordinated.filter(c => coordinatedKinds.includes(c.slot));
    for (const alt of alternatives) slot.push({ english: alt.word, role });
    if (alternatives.some(alt => alt.conj === 'or') && slot.length >= 2) {
      slot.push({ english: 'one', role });
    }
  };

  // Only ability and necessity take a marker, and it sits immediately before the Action,
  // where the English modal sits.
  const modal = parse.modal
    ? modalConcept(parse.modal, { negated: parse.negated, subjectEnglish: parse.actor, isQuestion })
    : null;
  if (modal) slots.event.push({ english: modal, role: 'event' });

  groupInto(slots.event, parse.action, 'event', ['action', 'predicate'], parse.actionSurface);

  // Clause-scoped negation sits at the head of Event (Actor · Time · no · Action).
  if (parse.negated) {
    slots.event.unshift({ english: 'not', role: 'event', particle_id: 'logic_not' });
  }

  // A relation goes in Place and its landmark trails as a modifier:
  // "into the forest" is path=into, modifier=forest.
  for (const place of parse.places) {
    if (place.prep) slots.path.push({ english: place.prep, role: 'path' });
    if (place.head) slots.modifiers.push({ english: place.head, role: 'modifier' });
  }

  groupInto(slots.object, parse.target, 'object', ['target'], parse.targetSurface);

  for (const modifier of parse.modifiers) {
    slots.modifiers.push({ english: modifier, role: 'modifier' });
  }

  for (const token of tokens) {
    const owner = POSSESSIVE_OWNERS.get(String(token ?? '').toLowerCase());
    if (owner) slots.modifiers.push({ english: token, role: 'modifier', possessor: owner });
  }

  applyIdiomHints(slots, rules);
  if (parse.whDegree && isQuestion) markDegreeProbe(slots, parse.whDegree);
  return slots;
}

/**
 * Read negating affixes as structure: `unsafe` becomes `no` + safe (rulebook
 * rule 9 constituent negation), `fearless` becomes `no` + fear. English affix
 * knowledge lives with the parser; the engine only ever sees a particle id and
 * an ordinary word.
 *
 * Guarded twice: the affix rules carry stoplists (`unless` is not un+less),
 * and the base must be a known lexicon alias — checked with full strength, so
 * a weak gloss-derived alias cannot invite the split. A word that fails either
 * guard flows on whole and gaps honestly.
 *
 * @param {object} slots
 * @param {Map|null} aliasIndex
 */
function expandNegatedDerivations(slots, aliasIndex) {
  if (!aliasIndex) return;
  const baseInLexicon = (base) => {
    for (const key of [base, lemmatizeEnglish(base)]) {
      const hit = key ? aliasIndex.get(key) : null;
      if (hit && hit.alias_strength !== 'weak') return true;
    }
    return false;
  };
  for (const key of ['subject', 'event', 'object', 'path', 'modifiers']) {
    const entries = slots[key];
    for (let at = 0; at < entries.length; at += 1) {
      const entry = entries[at];
      if (entry.particle_id || entry.concept_hint || entry.possessor) continue;
      const word = String(entry.english ?? '').trim().toLowerCase();
      if (!word || word.includes(' ')) continue;
      // Never split a word the lexicon already knows whole: `unbound` may one
      // day be its own compound, and the whole-word claim must win.
      if (baseInLexicon(word)) continue;
      const candidate = negatedBases(word).find(({ base }) => baseInLexicon(base));
      if (!candidate) continue;
      entries.splice(at, 1,
        {
          english: 'not',
          role: entry.role,
          particle_id: 'logic_not',
          interpret_reason: `negating affix:${candidate.affix} (${word})`,
        },
        {
          english: candidate.base,
          role: entry.role,
          interpret_from: word,
          interpret_reason: `negating affix:${candidate.affix}`,
        });
      at += 1;
    }
  }
}

/**
 * Label the scale word of a degree question, so the reader is told the question narrowed.
 * "How far is the water" is asked as "is the water far", which is answerable with `mas`
 * and `sha` (more, less) and is all the language can ask while it has no numerals.
 *
 * @param {object} slots
 * @param {string} degree
 */
function markDegreeProbe(slots, degree) {
  for (const key of ['subject', 'time', 'event', 'path', 'object', 'modifiers']) {
    for (const entry of slots[key]) {
      if (String(entry.english ?? '').toLowerCase() !== degree) continue;
      entry.interpret_from = `how ${degree}`;
      entry.interpret_note = 'degree asked as a yes/no probe on the scale, refine with more or less';
      return;
    }
  }
}

/**
 * Safety net for the two-word quantity interrogative.
 *
 * The parse normally collapses "how many" / "how much" into one `wh` value; this
 * catches the case where it reports a bare `how`.
 *
 * @param {string} sentence
 * @param {string|null} wh
 */
function quantityProbe(sentence, wh) {
  if (wh === 'how many' || wh === 'how much') return wh;
  if (wh !== 'how') return wh;
  const m = String(sentence ?? '').match(/\bhow\s+(many|much)\b/i);
  return m ? `how ${m[1].toLowerCase()}` : wh;
}

/**
 * Give a curated idiom its concept where it landed.
 *
 * The idiom arrives as one token because it was masked before tagging, so the parse has
 * already placed it. Handing the whole clause to the idiom matcher instead threw the rest
 * away: "we can help each other" kept only the idiom and lost both we and help.
 *
 * @param {object} slots
 * @param {object|null} rules
 */
function applyIdiomHints(slots, rules) {
  const idioms = rules?.idioms ?? {};
  for (const key of ['subject', 'time', 'event', 'path', 'object', 'modifiers']) {
    for (const entry of slots[key]) {
      const spec = idioms[String(entry.english ?? '').toLowerCase()];
      if (!spec) continue;
      entry.concept_hint = spec.concept_id;
      entry.interpret_reason = spec.reason ?? `idiom: ${entry.english}`;
    }
  }
}

/**
 * Slots for one sentence — the parser contract entry point. Owns tokenization.
 *
 * Word class decides the structure of anything longer than a word; a single word has no
 * structure to read, and asking for one loses it, since "behind" alone is a lookup and
 * parsed as a clause it is a preposition governing nothing.
 *
 * @param {string} sentence
 * @param {{ isQuestion?: boolean, rules?: object|null, aliasIndex?: Map|null }} [options]
 */
export async function compileSlots(sentence, {
  isQuestion = false, rules = null, aliasIndex = null,
} = {}) {
  const tokens = mergePhrasalTokens(mergeEnglishCompounds(tokenizeEnglish(sentence), aliasIndex));

  if (sentence && tokens.length > 1) {
    return compileSemanticSlotsFromPos(sentence, tokens, { isQuestion, rules, aliasIndex });
  }

  // A bare time adverbial is still a time slot: "yesterday" alone is not a concept.
  const timeHit = matchLeadingTimeAdverbial(tokens);
  if (timeHit && tokens.length <= timeHit.consumed) {
    return { ...emptySlots(), mode: 'sentence', time: [{ english: timeHit.english, role: 'time' }] };
  }

  const single = {
    ...emptySlots(),
    mode: 'word',
    event: tokens.length ? [{ english: tokens[0], role: 'concept' }] : [],
  };
  expandNegatedDerivations(single, aliasIndex);
  return single;
}
