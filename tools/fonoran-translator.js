/**
 * English → Fonoran translator.
 * Compiles meaning into Fonoran per docs/fonoran-grammar.md — not word-for-word substitution.
 * Interpretive layer: docs/fonoran-interpretive-translator.md
 */

import {
  phoneticKeyBold,
  compoundPhoneticKey,
  englishGuide,
  compoundEnglishGuide,
} from './fonoran-pronunciation.js';
import {
  loadInterpretationRules,
  resetInterpretationCache,
  matchLeadingTimeAdverbial,
  mergePhrasalTokens,
  POSSESSIVE_OWNERS,
  TEMPORAL_SCENE_CONCEPT_IDS,
  TEMPORAL_SCENE_TOPIC_IDS,
  TEMPORAL_SCENE_FRONT_ORDER,
} from './fonoran-interpretation.js';
import { LEADING_TIME_WORDS, TEMPORAL_SUBORDINATORS } from './fonoran-english-morphology.js';
import {
  buildResolveContext,
  resolveEnglishToken,
  tokenizeEnglish,
  mergeEnglishCompounds,
  lemmatizeEnglish,
  resolveConceptId,
  gapToken,
} from './fonoran-english-resolve.js';
import { parseEnglishStructure, splitClauses } from './fonoran-english-parse.js';
import {
  whComposition,
  whBlocked,
  modalComposition,
  unknownWord,
} from './fonoran-language-policy.js';
import { getParticleRuntime, resetParticleCache } from './fonoran-particles.js';
import { attachTranslatorPlayback } from './fonoran-playback-build.js';

/**
 * Cached grammar-particle runtime: { index, byId, quantifiers }.
 * Loaded once per process; reset via resetTranslatorCache().
 */
let PARTICLES = null;

/**
 * Particle spelling by id, from data/fonoran-grammar-particles.json only.
 * Spellings are never hardcoded here: a respelled particle in the seed must
 * flow through, and a missing id is a data error, not something to paper over.
 */
function particleFormById(id) {
  const form = PARTICLES?.byId?.get(id)?.form;
  if (!form) throw new Error(`Grammar particle missing from data/fonoran-grammar-particles.json: ${id}`);
  return form;
}

/** Like particleFormById, but null when the runtime is not loaded (comparisons only). */
function particleFormSafe(id) {
  return PARTICLES?.byId?.get(id)?.form ?? null;
}

/** English trigger word -> pronoun-group particle entry (only `mi` today), or null. */
function pronounParticle(word) {
  const entry = PARTICLES?.index?.get(String(word ?? '').toLowerCase());
  return entry?.group === 'pronoun' ? entry : null;
}

// User-facing skeleton (docs/fonoran-grammar.md Rule 4). Internal slot keys keep
// their historical names (subject/event/object/path) and map onto these roles:
// Actor=subject, Action=event, Target=object, Place=path, Time=time.
const GRAMMAR_SKELETON = 'Actor · Action · Target · Place · Time';

/**
 * TRANSLATOR/VOCABULARY POLICY — NOT grammar.
 * Content (wh) questions have no grammatical particle in v1. They are expressed
 * with the lexicalized word **nohu** "unknown" (fused from no + hu, playtest
 * decision 2026-07: separated `no hu` read as clause negation, the fused word
 * reads as one learnable concept) applied to a category concept
 * (person/thing/place/time/cause). Grammar only states that questions are
 * compositional (docs/fonoran-grammar.md Rule 3); the concrete mapping lives
 * here and MAY CHANGE as the lexicon evolves (e.g. if a `method` concept is
 * later justified by usage).
 *   who   -> nohu ba    (unknown person)
 *   what  -> nohu to    (unknown thing)
 *   where -> nohu che   (unknown place)
 *   when  -> nohu kan   (unknown time)
 *   why   -> nohu gak   (unknown cause)
 *   how        -> nohu moyu  (unknown manner)
 *   how many   -> nohu tan   (unknown count)
 *   how much   -> nohu tan   (unknown count; same question, mass noun)
 * Each pairs `nohu` with a concept naming a DIMENSION (a kind of thing, neutral as
 * to which one), never a value on a scale. `manner` is the compound do + form.
 * `count` is the quantity axis: English "how many" / "how much" are one interrogative
 * ("what count?"), and the noun names what is counted — Fonoran does not split the
 * English count/mass distinction. Degree adjectives ("how far") stay as a polar probe
 * on the scale word for now (`ka ye fet`).
 * Applied only in interrogative sentences so relative / subordinate "who"/"when"
 * are left alone.
 */
const WH_QUESTION_COMPOSITION = whComposition();

/** Interrogatives that must surface as a gap instead of being approximated. */
const WH_BLOCKED = whBlocked();

/** First sentence of a policy reason, for a gap label that stays short. */
function firstSentence(text) {
  return String(text ?? '').split(/(?<=\.)\s/)[0].trim();
}

/**
 * Sanctioned modal compositions. Reference policy for the prompt and probes; the
 * model does the sense disambiguation, this records which concepts it may use.
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

/**
 * The lexicalized "unknown" word: negation form + the `know` root. Deliberately
 * transparent (a learner can still decompose it) but written and taught as ONE word so
 * it is not misread as clause negation.
 *
 * Resolved from the seeds per call rather than held as a literal. This was the one live,
 * taught word in the language whose only definition anywhere was a hardcoded string in
 * this file, invisible to the seeds and to every other tool; it is now declared in
 * `data/fonoran-grammar-policy.json` and assembled from its parts, so respelling either
 * part carries it along.
 */
const unknownWordForm = () => unknownWord();

/** A source sentence is a written question when it ends with `?`. */
function isQuestionSentence(sentence) {
  return String(sentence ?? '').trim().endsWith('?');
}

/** Trailing punctuation token (`.` `!` `?`) for surface + readback pauses. */
export function punctuationToken(mark) {
  return {
    role: 'punctuation',
    english: mark,
    fonoran: mark,
    parts: [],
    resolved: true,
    kind: 'punctuation',
    source: 'grammar',
    gloss: mark,
    interpreted: false,
    resolution_kind: 'direct',
    confidence: 'high',
    guessed: false,
    pronunciation: { sayLine: '', englishLine: '' },
  };
}

/** Terminal `.` `!` or `?` from a source sentence, if present. */
export function terminalPunctuationFromText(text) {
  const m = String(text ?? '').trim().match(/([.!?])\s*$/);
  return m ? m[1] : null;
}

function isPunctuationToken(token) {
  return token?.kind === 'punctuation' || token?.role === 'punctuation';
}

/**
 * The question particle (`ka`), opening the clause it asks about.
 *
 * Fonoran writes no `?`: the nine-symbol script has no such glyph, and without a word
 * for it `be len mi` is both "you hear me" and "do you hear me". The particle also
 * separates an interrogative `nohu` from a lexical one, since `ka nohu ba` asks who
 * while `nohu ba` names an unknown person.
 */
function questionParticleToken() {
  return particleToken('question', particleFormById('clause_question'), 'question');
}

/**
 * Mark one sentence: a question opens with `ka`, and every sentence keeps its source
 * terminator for readback pauses and for sentence boundaries in multi-sentence output.
 *
 * A question's `?` becomes `.`, because the terminator only says the sentence ended;
 * `ka` is what says it was a question. Dropping it altogether ran sentences together
 * ("do you hear me? I am here." gave `ka be len mi mi nam`).
 */
function markSentence(tokens, { isQuestion, sourceText }) {
  const out = Array.isArray(tokens) ? [...tokens] : [];
  if (isQuestion) out.unshift(questionParticleToken());
  const mark = terminalPunctuationFromText(sourceText);
  if (mark) out.push(punctuationToken(mark === '?' ? '.' : mark));
  return out;
}

/**
 * Subject pronouns → nearest concept id for resolution.
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
  const p = surface.toLowerCase();
  const pronoun = pronounParticle(p);
  if (pronoun) {
    return { english: surface, role: 'subject', particle: pronoun.form, particle_id: pronoun.id };
  }
  const conceptHint = PRONOUN_CONCEPTS[p];
  return {
    english: surface,
    role: 'subject',
    ...(conceptHint ? { concept_hint: conceptHint, interpret_reason: 'pronoun' } : {}),
  };
}

/**
 * Classify every have-form in a clause by the job it is doing.
 *
 * `have`, `has`, and `had` sat in a tense-auxiliary lookup unconditionally, so the content filter
 * consumed each one as a bare tense marker and dropped the word. In a possession
 * clause that deletes the predicate: "I have water" compiled to `mi ye`, which is
 * also what "I am water" and the bare phrase "my water" compiled to. It also
 * mis-tensed the aspect case, because `have` claimed `present` and so suppressed
 * the past reading of the participle after it, turning "I have eaten" into `mi tel`
 * ("I eat"). A deleted verb and an inverted tense are both fabricated sentences, so
 * the form has to be read in context rather than by lookup.
 *
 * - `aspect`: a past participle follows, so this is the perfect and marks past.
 * - `necessity`: `have to` + verb, routed through the curated necessity sense in
 *   `data/fonoran-grammar-policy.json` rather than dropped.
 * - `main`: everything else is the possession verb and stays in the content stream,
 *   to resolve or to gap honestly.
 *
 * @returns {Map<number, 'aspect'|'necessity'|'main'>}
 */
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

function pronunciationForParts(parts) {
  if (!parts?.length) return { sayLine: '', englishLine: '' };
  return {
    sayLine: parts.length > 1 ? compoundPhoneticKey(parts) : phoneticKeyBold(parts[0]),
    englishLine: parts.length > 1 ? compoundEnglishGuide(parts) : englishGuide(parts[0]),
  };
}

function particleToken(role, placeholder, english, { englishSource = null } = {}) {
  const parts = [placeholder];
  return {
    // Negation is clause grammar, not a time element: label it honestly even
    // when it rides in the internal time slot (display + frame provenance).
    role: placeholder === particleFormSafe('logic_not') ? 'negation' : role,
    english,
    fonoran: placeholder,
    parts,
    resolved: true,
    kind: 'particle',
    source: 'grammar',
    gloss: english,
    // The written word this particle stands for when English spells the grammar
    // inside another word: "handed" carries the past that Fonoran writes as its
    // own particle. Alignment uses it to draw the particle's line to that word.
    ...(englishSource ? { english_source: englishSource } : {}),
    interpreted: false,
    resolution_kind: 'direct',
    confidence: 'high',
    guessed: false,
    pronunciation: pronunciationForParts(parts),
  };
}

/**
 * The lexicalized "unknown" word (nohu). Surfaces as ONE word: unlike quantifier
 * pronouns it is written fused, per the WH policy note above.
 */
function unknownWordToken(role, english) {
  return {
    role,
    english: english || 'unknown',
    fonoran: unknownWordForm().form,
    parts: [...unknownWordForm().parts],
    resolved: true,
    kind: 'compound',
    source: 'vocabulary',
    gloss: 'unknown (no + hu, not-known)',
    concept_id: 'unknown',
    interpreted: false,
    resolution_kind: 'direct',
    confidence: 'high',
    guessed: false,
    pronunciation: pronunciationForParts(unknownWordForm().parts),
  };
}

function emptySlots() {
  return {
    subject: [],
    time: [],
    event: [],
    path: [],
    object: [],
    modifiers: [],
  };
}

function appendSlots(target, source) {
  for (const key of ['subject', 'time', 'event', 'path', 'object', 'modifiers']) {
    target[key].push(...source[key]);
  }
}

/** Split paragraph into sentences on . ! ? or newlines. */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Compile English tokens into grammar slots with phrase-aware interpretation.
 * @param {string[]} tokens
 * @param {object} rules
 */
/**
 * Possessive re-attachment: Fonoran encodes the possessor (`gamba be` = enemy-your),
 * but `my`/`your`/`our` used to be skipped and deleted before the parse, so the
 * possessor vanished: `mi` and `be` were the two most-dropped tokens across the
 * corpus. The owner map (POSSESSIVE_OWNERS) lives in fonoran-interpretation.js and
 * is shared with the structure parser, which skips exactly those words.
 */

/**
 * Slots from a word-class parse. The Fonoran side is untouched: every entry is handed to
 * the same `slotsToTokens`, so pronouns still become particles, `nohu` composition still
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
    return posClauseToSlots(text, clauseTokens, {
      isQuestion,
      connector: clause.connector,
      rules,
      phrases,
    });
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
    slots.time.push({ english: 'past', role: 'time', particle: particleFormById('tense_past'), particle_id: 'tense_past', english_source: parse.tenseSource ?? null });
  } else if (parse.tense === 'future') {
    slots.time.push({ english: 'future', role: 'time', particle: particleFormById('tense_future'), particle_id: 'tense_future', english_source: parse.tenseSource ?? null });
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
    slots.event.unshift({ english: 'not', role: 'event', particle: particleFormById('logic_not'), particle_id: 'logic_not' });
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
 * Slots for one sentence. Word class decides the structure of anything longer than a
 * word; a single word has no structure to read, and asking for one loses it, since
 * "behind" alone is a lookup and parsed as a clause it is a preposition governing nothing.
 */
async function compileSemanticSlots(tokens, rules, {
  aliasIndex = null, sentence = '', isQuestion = false,
} = {}) {
  if (sentence && tokens.length > 1) {
    return compileSemanticSlotsFromPos(sentence, tokens, { isQuestion, rules, aliasIndex });
  }

  // A bare time adverbial is still a time slot: "yesterday" alone is not a concept.
  const timeHit = matchLeadingTimeAdverbial(tokens);
  if (timeHit && tokens.length <= timeHit.consumed) {
    return { ...emptySlots(), mode: 'sentence', time: [{ english: timeHit.english, role: 'time' }] };
  }

  return {
    ...emptySlots(),
    mode: 'word',
    event: tokens.length ? [{ english: tokens[0], role: 'concept' }] : [],
  };
}

/**
 * Expand a quantifier pronoun (e.g. nobody = no + person) into ordered tokens.
 * Composition happens at the particle/root layer per docs/fonoran-grammar.md.
 */
async function expandQuantifier(ctx, parts, role, surface) {
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    const piece = parts[i];
    if (piece === 'unknown') {
      out.push(unknownWordToken(role, i === 0 ? surface : 'unknown'));
    } else if (piece === 'neg') {
      const neg = PARTICLES?.byId.get('logic_not');
      if (neg?.form) out.push(particleToken(role, neg.form, i === 0 ? surface : 'not'));
    } else {
      out.push(await resolveEnglishToken(piece, ctx, {
        role,
        allowSemantic: false,
        allowGuess: false,
        surfaceEnglish: i === 0 ? surface : piece,
      }));
    }
  }
  return out.length ? out : null;
}

async function resolveSlot(ctx, slot, role) {
  const surface = String(slot.english ?? '').trim();
  const lower = surface.toLowerCase();

  if (slot.particle) {
    return particleToken(role, slot.particle, surface || slot.particle, { englishSource: slot.english_source });
  }

  // Possessives carry their owner as a reference, never a spelling: pronoun_i is a
  // grammar particle, addressee/collective are lexical roots resolved from the lab.
  if (slot.possessor) {
    const form = slot.possessor.particle_id
      ? particleFormById(slot.possessor.particle_id)
      : resolveConceptId(slot.possessor.concept_id, ctx, role).fonoran;
    return particleToken(role, form, surface);
  }

  if (slot.unknown_word) {
    return unknownWordToken(role, surface);
  }

  if (slot.concept_id) {
    const token = resolveConceptId(slot.concept_id, ctx, role);
    return { ...token, role };
  }

  const pronoun = pronounParticle(lower);
  if (pronoun) {
    return particleToken(role, pronoun.form, surface);
  }

  // Lexicalized "unknown" (nohu) is a word in its own right, not just the WH base.
  if (lower === 'unknown') {
    return unknownWordToken(role, surface);
  }

  // A deliberately unexpressible interrogative must never be approximated. Without this,
  // "how many" fell through to the head-noun tier and resolved to `many`, so the output
  // asserted there were many of them while purporting to ask how many there were.
  if (lower && WH_BLOCKED[lower]) {
    return gapToken(surface, role, { reason: `blocked interrogative: ${firstSentence(WH_BLOCKED[lower])}` });
  }

  // Content-question composition (translator/vocabulary policy, NOT grammar).
  // Only in interrogative sentences, so relative/subordinate who/when are untouched.
  if (ctx.isQuestion && lower && WH_QUESTION_COMPOSITION[lower]) {
    const expanded = await expandQuantifier(ctx, WH_QUESTION_COMPOSITION[lower], role, surface);
    if (expanded) return expanded;
  }

  // Grammar particles + quantifier pronouns (closed class, single-word slots only).
  if (PARTICLES && lower && !lower.includes(' ')) {
    const quant = PARTICLES.quantifiers[lower];
    if (quant) {
      const expanded = await expandQuantifier(ctx, quant, role, surface);
      if (expanded) return expanded;
    }
    const particle = PARTICLES.index.get(lower);
    if (particle?.form) return particleToken(role, particle.form, surface);
  }

  const hints = {};
  if (slot.concept_hint) {
    hints.concept_hint = slot.concept_hint;
    hints.interpret_reason = slot.interpret_reason;
  }
  const token = await resolveEnglishToken(slot.english, ctx, {
    role,
    hints,
    allowSemantic: true,
    allowGuess: true,
    // The parse looks a word up by its lemma but reports it as written, so a reader sees
    // "ate" while the lexicon is searched for "eat".
    surfaceEnglish: slot.surface ?? slot.english,
    avoidConceptIds: role === 'modifier' ? ctx.frameConceptIds : null,
  });

  // Some entries are curated in an inflected form and have no lemma entry: "bleeding" has a
  // word, "bleed" does not. Reducing to the lemma is a lookup strategy, not a rule, so when
  // it finds nothing the written form gets its turn before the word is called a gap.
  if (!token?.resolved && slot.surface && slot.surface !== slot.english) {
    const bySurface = await resolveEnglishToken(slot.surface, ctx, {
      role,
      hints,
      allowSemantic: true,
      allowGuess: true,
      surfaceEnglish: slot.surface,
      avoidConceptIds: role === 'modifier' ? ctx.frameConceptIds : null,
    });
    if (bySurface?.resolved) return bySurface;
  }

  // A liberty the compiler took that is not a concept substitution: the word resolves
  // normally and the note travels with it so interpretations[] shows what narrowed.
  if (slot.interpret_note && token?.resolved) {
    return {
      ...token,
      interpreted: true,
      interpreted_from: slot.interpret_from ?? slot.english,
      interpret_reason: slot.interpret_note,
    };
  }

  // Record the step from written form to lemma. The lookup succeeds directly now, so
  // nothing else would report it, and a learner reading the Translate output needs to see
  // why "ate" produced the word for eat plus a past particle.
  if (slot.surface && slot.surface !== slot.english && token?.resolved && !token.interpreted) {
    return {
      ...token,
      interpreted: true,
      interpreted_from: slot.surface,
      interpret_reason: 'inflected form',
    };
  }
  return token;
}

/**
 * A verbless clause naming a temporal scene is a Time, not an Actor: "every morning" sets
 * when, and only the concept can say so, which is why this runs after resolution.
 * @param {object[]} tokens
 * @param {object} slots
 */
function promoteSceneToTime(tokens, slots) {
  if (!slots?.verbless) return tokens;
  return tokens.map(token => (token?.role === 'subject' && TEMPORAL_SCENE_CONCEPT_IDS.has(token.concept_id)
    ? { ...token, role: 'time' }
    : token));
}

async function slotsToTokens(ctx, slots) {
  ctx.frameConceptIds = ctx.frameConceptIds ?? new Set();

  const trackResolved = (token, role) => {
    if (!token) return;
    if (Array.isArray(token)) {
      for (const t of token) trackResolved(t, role);
      return;
    }
    if (token.concept_id && (role === 'event' || role === 'object')) {
      ctx.frameConceptIds.add(token.concept_id);
    }
  };
  if (slots.mode === 'word') {
    const english = slots.event[0]?.english;
    if (!english) return [];
    const lower = String(english).toLowerCase();
    if (ctx.isQuestion && WH_QUESTION_COMPOSITION[lower]) {
      const expanded = await expandQuantifier(ctx, WH_QUESTION_COMPOSITION[lower], 'concept', english);
      if (expanded) return expanded;
    }
    if (lower === 'unknown') return [unknownWordToken('concept', english)];
    const particle = PARTICLES && !lower.includes(' ') ? PARTICLES.index.get(lower) : null;
    if (particle?.form) return [particleToken('concept', particle.form, english)];
    return [await resolveEnglishToken(english, ctx, { role: 'concept', allowSemantic: true, allowGuess: true })];
  }

  const out = [];
  const push = (resolved, role) => {
    if (Array.isArray(resolved)) {
      for (const t of resolved) {
        trackResolved(t, role);
        out.push(t);
      }
    } else {
      trackResolved(resolved, role);
      out.push(resolved);
    }
  };

  // Questions open with the `ka` particle, prepended once per sentence by markSentence;
  // content questions additionally compose the unknown from concepts (`ka nohu ba`).
  //
  // Scene structure (Rule 4): lexical Time periphery may front as scene-setting;
  // tense particles ta/sa stay next to the Action (not floating in the scene).
  // Order: [scene time] · Actor · [ta/sa] · Action · Target · Place · modifiers

  const timeKey = (slot) => String(slot.particle ?? slot.concept_id ?? slot.english ?? '').toLowerCase();
  // Tense identity is the particle ID, with the seed-loaded forms as a fallback for
  // slots that carry only a surface (never spellings hardcoded in code).
  const tenseForms = new Set([particleFormSafe('tense_past'), particleFormSafe('tense_future')].filter(Boolean));
  const isTenseParticle = (slot) => slot.particle_id === 'tense_past' || slot.particle_id === 'tense_future'
    || tenseForms.has(slot.particle) || tenseForms.has(timeKey(slot));
  const isSceneTime = (slot) => {
    if (isTenseParticle(slot)) return false;
    const key = timeKey(slot);
    return TEMPORAL_SCENE_CONCEPT_IDS.has(key)
      || TEMPORAL_SCENE_TOPIC_IDS.has(key)
      || LEADING_TIME_WORDS.has(key);
  };
  const sceneRank = (slot) => {
    const idx = TEMPORAL_SCENE_FRONT_ORDER.indexOf(timeKey(slot));
    return idx >= 0 ? idx : TEMPORAL_SCENE_FRONT_ORDER.length + 1;
  };

  const sceneTime = slots.time.filter(isSceneTime).sort((a, b) => sceneRank(a) - sceneRank(b));
  const tenseTime = slots.time.filter(isTenseParticle);
  const otherTime = slots.time.filter(s => !isSceneTime(s) && !isTenseParticle(s));

  const pushTimeSlot = async (slot) => {
    if (slot.particle) out.push(particleToken('time', slot.particle, slot.english, { englishSource: slot.english_source }));
    else push(await resolveSlot(ctx, slot, 'time'), 'time');
  };
  const pushSubjectSlot = async (slot) => {
    if (slot.particle) out.push(particleToken('subject', slot.particle, slot.english));
    else push(await resolveSlot(ctx, slot, 'subject'), 'subject');
  };

  // Front lexical scene time whenever present (calendar + long_ago/beginning/world…).
  for (const slot of sceneTime) await pushTimeSlot(slot);
  for (const slot of slots.subject) await pushSubjectSlot(slot);
  // Tense particles immediately before Action (Rule 3).
  for (const slot of tenseTime) await pushTimeSlot(slot);
  for (const slot of slots.event) push(await resolveSlot(ctx, slot, 'event'), 'event');
  for (const slot of slots.path) push(await resolveSlot(ctx, slot, 'path'), 'path');
  for (const slot of slots.object) push(await resolveSlot(ctx, slot, 'object'), 'object');
  // Non-scene residual time (rare) stays before trailing modifiers.
  for (const slot of otherTime) await pushTimeSlot(slot);
  for (const slot of slots.modifiers) push(await resolveSlot(ctx, slot, 'modifier'), 'modifier');
  return out;
}

// Internal slot role -> language-neutral frame role. Actor=subject, Action=event,
// Target=object, Place=path, Time=time (docs/fonoran-grammar.md Rule 4/7).
const ROLE_TO_FRAME = {
  subject: 'actor',
  event: 'action',
  concept: 'action',
  object: 'target',
  path: 'place',
  time: 'time',
  modifier: 'modifiers',
};

/**
 * Build the language-neutral semantic frame (docs/fonoran-grammar.md Rule 7):
 * the pivot between the English parse and the Fonoran surface. Every filled role
 * references a concept_id + provenance (resolution_kind, confidence); every
 * unresolved element becomes a first-class gap {role, english, reason}. The
 * Fonoran surface is generated from the resolved tokens, so this object is a
 * faithful description of what the surface actually says (never fabricates).
 */
export function buildFrame(tokens) {
  const frame = {
    actor: [],
    action: [],
    target: [],
    place: [],
    time: [],
    modifiers: [],
    particles: [],
    gaps: [],
  };
  for (const t of tokens) {
    if (!t) continue;
    if (t.kind === 'particle' || t.kind === 'punctuation') {
      frame.particles.push({ role: t.role, english: t.english, form: t.fonoran });
      continue;
    }
    if (!t.resolved) {
      frame.gaps.push({
        role: t.role,
        english: t.english,
        reason: t.gap_reason ?? 'no confident concept',
        ...(t.suggestion ? { suggestion: t.suggestion } : {}),
      });
      continue;
    }
    const frameRole = ROLE_TO_FRAME[t.role] ?? 'modifiers';
    frame[frameRole].push({
      concept_id: t.concept_id ?? null,
      english: t.english,
      fonoran: t.fonoran,
      resolution_kind: t.resolution_kind,
      confidence: t.confidence,
    });
  }
  return frame;
}

export function buildSurface(tokens) {
  const romanChunks = [];
  const sayChunks = [];
  const englishParts = [];
  const allParts = [];

  for (const t of tokens ?? []) {
    const punct = isPunctuationToken(t);
    const roman = t.resolved ? t.fonoran : `[${t.english}]`;
    if (punct) {
      if (romanChunks.length) romanChunks[romanChunks.length - 1] += roman;
      else romanChunks.push(roman);
    } else {
      romanChunks.push(roman);
    }

    if (t.resolved && Array.isArray(t.parts)) allParts.push(...t.parts);

    if (punct) {
      if (sayChunks.length) sayChunks[sayChunks.length - 1] += roman;
      else sayChunks.push(roman);
      continue;
    }
    if (!t.resolved) {
      sayChunks.push(`[${String(t.english).toUpperCase()}]`);
      continue;
    }
    sayChunks.push(t.pronunciation?.sayLine || String(t.fonoran).toUpperCase());
    if (t.pronunciation?.englishLine) englishParts.push(t.pronunciation.englishLine);
  }

  return {
    roman: romanChunks.join(' '),
    parts: allParts,
    pronunciation: {
      sayLine: sayChunks.join(' · '),
      englishLine: englishParts.join(' · '),
    },
  };
}

/**
 * Translate an English sentence. This is the only forward engine; `translate()` in
 * fonoran-translate.js is the public wrapper around it. The `Legacy` in the name is
 * a leftover from when a second, model-backed engine existed.
 * @param {string} text
 * @param {{ lab?: object }} [options]
 */
export async function translateEnglishLegacy(text, options = {}) {
  const input = String(text ?? '').trim();
  if (!input) {
    return {
      input: '',
      mode: 'empty',
      tokens: [],
      surface: { roman: '', parts: [], pronunciation: { sayLine: '', englishLine: '' } },
      semantic: null,
      frame: null,
      interpretations: [],
      unresolved: [],
    };
  }

  const ctx = await buildResolveContext(options.lab, { devLab: Boolean(options.devLab) });
  const rules = ctx.rules ?? await loadInterpretationRules();
  ctx.rules = rules;
  if (!PARTICLES) PARTICLES = await getParticleRuntime();

  const sentences = splitSentences(input);
  if (sentences.length > 1) {
    const allTokens = [];
    const mergedSlots = emptySlots();
    for (const sent of sentences) {
      ctx.isQuestion = isQuestionSentence(sent);
      const englishTokens = mergePhrasalTokens(mergeEnglishCompounds(tokenizeEnglish(sent), ctx.aliasIndex));
      const semantic = await compileSemanticSlots(englishTokens, rules, {
        aliasIndex: ctx.aliasIndex,
        sentence: sent,
        isQuestion: ctx.isQuestion,
      });
      appendSlots(mergedSlots, semantic);
      allTokens.push(...markSentence(await slotsToTokens(ctx, semantic), {
        isQuestion: ctx.isQuestion,
        sourceText: sent,
      }));
    }
    const tokens = allTokens;
    const surface = buildSurface(tokens);
    const unresolved = tokens.filter(t => !t.resolved).map(t => t.english);
    const interpretations = tokens
      .filter(t => t.interpreted)
      .map(t => ({
        english: t.interpreted_from ?? t.english,
        concept_id: t.concept_id ?? t.english,
        fonoran: t.fonoran,
        reason: t.interpret_reason ?? '',
        role: t.role,
        resolution_kind: t.resolution_kind,
      }));

    return attachTranslatorPlayback({
      input,
      mode: 'discourse',
      tokens,
      surface,
      semantic: {
        skeleton: GRAMMAR_SKELETON,
        slots: mergedSlots,
      },
      frame: buildFrame(tokens),
      interpretations,
      unresolved,
    });
  }

  ctx.isQuestion = isQuestionSentence(sentences[0] ?? input);
  const englishTokens = mergePhrasalTokens(mergeEnglishCompounds(tokenizeEnglish(sentences[0] ?? input), ctx.aliasIndex));
  const semantic = await compileSemanticSlots(englishTokens, rules, {
    aliasIndex: ctx.aliasIndex,
    sentence: sentences[0] ?? input,
    isQuestion: ctx.isQuestion,
  });
  // Modifier order is deliberately left as the parse produced it. A canonical sort
  // exists in fonoran-grammar-spec.js for slots that arrive in arbitrary order, but
  // this parse already carries English order, which for a relation plus its landmark
  // is the recoverable one: sorting turned "near you" (`dal be`) into `be dal`, and
  // "stay here" into "here stay".
  // A multi-clause parse renders clause by clause: slotsToTokens emits one slot at a time,
  // so handing it merged slots would interleave both predications' Actors and Actions.
  const rendered = semantic.clauses?.length
    ? (await Promise.all(semantic.clauses.map(async clause => promoteSceneToTime(
      await slotsToTokens(ctx, clause),
      clause,
    )))).flat()
    : await slotsToTokens(ctx, semantic);
  const tokens = markSentence(rendered, {
    isQuestion: ctx.isQuestion,
    sourceText: sentences[0] ?? input,
  });
  const surface = buildSurface(tokens);
  const unresolved = tokens.filter(t => !t.resolved).map(t => t.english);
  const interpretations = tokens
    .filter(t => t.interpreted)
    .map(t => ({
      english: t.interpreted_from ?? t.english,
      concept_id: t.concept_id ?? t.english,
      fonoran: t.fonoran,
      reason: t.interpret_reason ?? '',
      role: t.role,
      resolution_kind: t.resolution_kind,
    }));

  return attachTranslatorPlayback({
    input,
    mode: semantic.mode,
    tokens,
    surface,
    semantic: {
      skeleton: GRAMMAR_SKELETON,
      slots: {
        subject: semantic.subject,
        time: semantic.time,
        event: semantic.event,
        path: semantic.path,
        object: semantic.object,
        modifiers: semantic.modifiers,
      },
    },
    frame: buildFrame(tokens),
    interpretations,
    unresolved,
  });
}

/** Reset cached vocabulary (tests). */
export function resetTranslatorCache() {
  resetInterpretationCache();
  resetParticleCache();
  PARTICLES = null;
}

export { tokenizeEnglish, lemmatizeEnglish };
