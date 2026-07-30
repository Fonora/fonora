/**
 * English → Fonoran translator.
 * Compiles meaning into Fonoran per docs/fonoran-grammar.md — not word-for-word substitution.
 * Interpretive layer: docs/fonoran-interpretive-translator.md
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  phoneticKeyBold,
  compoundPhoneticKey,
  englishGuide,
  compoundEnglishGuide,
} from './fonoran-pronunciation.js';
import {
  loadInterpretationRules,
  matchVerbSpatialLandmark,
  matchSubjectBeAdj,
  matchBeConstruction,
  matchSubjectVerbToNp,
  matchDesireInfinitive,
  hasDesireInfinitive,
  matchIdiomPhrase,
  peelFutureIntent,
  irregularPastLemma,
  isIrregularPastForm,
  resetInterpretationCache,
  nominalPhraseFromTokens,
  parseTrailingPhrase,
  assignFallbackTrailing,
  matchLeadingTimeAdverbial,
  matchSubjectLinkingPredicate,
  splitIntoClauses,
  mergePhrasalTokens,
  MODALS,
  splitLandmarkPhrase,
  matchMotionPhrase,
  normalizeMotionSlots,
  peelFutureFromTokens,
  LEADING_TIME_WORDS,
  TEMPORAL_SCENE_CONCEPT_IDS,
  TEMPORAL_SCENE_TOPIC_IDS,
  TEMPORAL_SCENE_FRONT_ORDER,
  peelQuestionAuxiliary,
  peelExistentialDummyThere,
} from './fonoran-interpretation.js';
import {
  buildResolveContext,
  resolveEnglishToken,
  tokenizeEnglish,
  mergeEnglishCompounds,
  lemmatizeEnglish,
  IRREGULAR,
  CONJUNCTIONS,
  resolveConceptId,
  gapToken,
} from './fonoran-english-resolve.js';
import { getPosHint } from './fonoran-semantic-lookup.js';
import { parseEnglishStructure, splitClauses } from './fonoran-english-parse.js';
import {
  whComposition,
  whBlocked,
  whDimensionEnglish,
  modalComposition,
  unknownWord,
  particleForms,
} from './fonoran-language-policy.js';
import { getParticleRuntime, resetParticleCache } from './fonoran-particles.js';
import { attachTranslatorPlayback } from './fonoran-playback-build.js';
import { enforceModifierOrder } from './fonoran-grammar-spec.js';
import { promoteTemporalSceneToTime, applyDisjunction } from './fonoran-llm-grammar-brief.js';

/**
 * Cached grammar-particle runtime: { index, byId, quantifiers }.
 * Loaded once per process; reset via resetTranslatorCache().
 */
let PARTICLES = null;

/** English negation words removed from the lexical stream and emitted as the `no` particle. */
const NEGATION_WORDS = new Set(['not', 'never', 'no', 'none', 'cannot']);

function isNegationWord(word) {
  const w = String(word ?? '').toLowerCase();
  return NEGATION_WORDS.has(w) || w.endsWith("n't");
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

/** Dimension concepts that mark a within-slot no+know sequence as an "unknown" composition. */
const UNKNOWN_CATEGORY_IDS = new Set(Object.keys(whDimensionEnglish()));

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
  const form = PARTICLES?.byId?.get('clause_question')?.form ?? 'ka';
  return particleToken('question', form, 'question');
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

/** Drop trailing punctuation tokens so we can re-attach the source terminator. */
export function stripTrailingPunctuationTokens(tokens) {
  const out = Array.isArray(tokens) ? [...tokens] : [];
  while (out.length && isPunctuationToken(out[out.length - 1])) out.pop();
  return out;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTICLES_PATH = join(ROOT, 'data/fonoran-grammar-particles.json');

// Contentless words dropped from the lexical stream. Meaning-bearing relational
// words (e.g. `from` -> source) are NOT skipped: they resolve to a concept or
// surface as an honest gap rather than being silently discarded.
const SKIP = new Set([
  'a', 'an', 'the', 'to', 'at', 'in', 'on', 'of', 'for', 'with', 'by', 'into', 'about',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'this', 'that', 'these', 'those',
  ...CONJUNCTIONS,
  ...MODALS,
]);

const PRONOUNS = {
  i: 'mi',
  me: 'mi',
};

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

const PRONOUN_WORDS = new Set([
  'i', 'me', 'you', 'we', 'us', 'they', 'them', 'he', 'him', 'she', 'her', 'it',
]);

function subjectSlot(english) {
  const surface = String(english ?? '').trim();
  const p = surface.toLowerCase();
  if (PRONOUNS[p]) {
    return { english: surface, role: 'subject', particle: PRONOUNS[p] };
  }
  const conceptHint = PRONOUN_CONCEPTS[p];
  return {
    english: surface,
    role: 'subject',
    ...(conceptHint ? { concept_hint: conceptHint, interpret_reason: 'pronoun' } : {}),
  };
}

const TENSE_AUX = {
  is: 'present',
  am: 'present',
  are: 'present',
  was: 'past',
  were: 'past',
  be: 'present',
  been: 'past',
  being: 'present',
  do: 'present',
  does: 'present',
  did: 'past',
  have: 'present',
  has: 'present',
  had: 'past',
};

const PARTICLE_PLACEHOLDERS = {
  pronoun_i: 'mi',
  tense_past: 'ta',
  tense_future: 'sa',
};

/**
 * Does an `-ed` ending here mark past tense, or is it just how the word is spelled?
 *
 * Treating every word that ends in `-ed` as a past form put a past particle in front
 * of ordinary present-tense sentences: "I need water" compiled to `mi ta les ye`,
 * "we need to go" likewise, because `need` ends in those two letters. The same trap
 * waits in feed, seed, breed, speed, succeed, and proceed.
 *
 * A real `-ed` past has a stem we can look up (walked → walk, needed → need, stopped
 * → stop), so the suffix only counts when stripping it yields a word the lexicon
 * knows. The word itself must also not be a lemma, which is what separates `needed`
 * from `need` and `seed`.
 */
function edSuffixMarksPast(word, aliasIndex) {
  if (!aliasIndex) return true;
  const stems = [word.slice(0, -1), word.slice(0, -2)];
  // Undo a doubled final consonant (stopped → stop) and a y→ied shift (carried → carry).
  if (/([bdfglmnprt])\1ed$/.test(word)) stems.push(word.slice(0, -3));
  if (word.endsWith('ied')) stems.push(`${word.slice(0, -3)}y`);
  const stem = stems.find(k => k && k.length > 1 && aliasIndex.has(k));
  if (!stem) return false;
  // The lexicon curates past forms as aliases of their own lemma ("carried" under
  // hold, "opened" under open), so being a known word is not evidence against a
  // past reading. A word that claims a concept OTHER than its stem's is its own
  // lemma rather than an inflection, which is what separates `seed` from `owned`.
  const self = aliasIndex.get(word);
  if (self?.alias_strength !== 'strong') return true;
  return self.concept_id === aliasIndex.get(stem)?.concept_id;
}

function isPastForm(word, rules, aliasIndex = null) {
  const w = String(word ?? '').toLowerCase();
  if (TENSE_AUX[w] === 'past') return true;
  if (isIrregularPastForm(w, rules)) return true;
  if (w.endsWith('ed') && w.length > 3) return edSuffixMarksPast(w, aliasIndex);
  return Boolean(IRREGULAR[w] && /ed$/.test(w));
}

const HAVE_FORMS = new Set(['have', 'has', 'had']);

/**
 * Is the word after a have-form a past participle, so the have-form is aspect?
 *
 * A bare `-en` ending is deliberately not accepted. It also matches plural nouns
 * ("I have children", "we have oxen"), which would read the possession verb as
 * aspect and delete it. Every participle that matters here is curated in
 * `irregular_past` (eaten, seen, given, taken, spoken, written) or in
 * `participles`, or it ends in `-ed`.
 */
function isPerfectParticiple(word, rules) {
  const w = String(word ?? '').toLowerCase();
  if (!w) return false;
  if (w === 'been' || w === 'being') return true;
  if (irregularPastLemma(w, rules)) return true;
  if (rules?.participles?.[w]) return true;
  return w.endsWith('ed') && w.length > 3;
}

/**
 * Classify every have-form in a clause by the job it is doing.
 *
 * `have`, `has`, and `had` sat in TENSE_AUX unconditionally, so the content filter
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
 * The policy for this already existed in `data/fonoran-grammar-policy.json` and in
 * the MODAL_COMPOSITION doc block, but only the LLM path ever applied it. The
 * deterministic compiler had every modal in SKIP, so "we must run now" and "we run
 * now" produced the same sentence and "I can make fire" asserted that fire is being
 * made rather than that the speaker is able to.
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

function classifyHaveForms(tokens, rules) {
  const roles = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    const word = String(tokens[i] ?? '').toLowerCase();
    if (!HAVE_FORMS.has(word)) continue;
    let next = null;
    let sawTo = false;
    for (let k = i + 1; k < tokens.length; k += 1) {
      const w = String(tokens[k] ?? '').toLowerCase();
      if (!w || isNegationWord(w)) continue;
      if (w === 'to') { sawTo = true; continue; }
      if (SKIP.has(w)) continue;
      next = w;
      break;
    }
    if (sawTo && next) roles.set(i, 'necessity');
    else if (isPerfectParticiple(next, rules)) roles.set(i, 'aspect');
    else roles.set(i, 'main');
  }
  return roles;
}

function pronunciationForParts(parts) {
  if (!parts?.length) return { sayLine: '', englishLine: '' };
  return {
    sayLine: parts.length > 1 ? compoundPhoneticKey(parts) : phoneticKeyBold(parts[0]),
    englishLine: parts.length > 1 ? compoundEnglishGuide(parts) : englishGuide(parts[0]),
  };
}

function particleToken(role, placeholder, english) {
  const parts = [placeholder];
  return {
    // Negation is clause grammar, not a time element: label it honestly even
    // when it rides in the internal time slot (display + frame provenance).
    role: placeholder === 'no' ? 'negation' : role,
    english,
    fonoran: placeholder,
    parts,
    resolved: true,
    kind: 'particle',
    source: 'grammar',
    gloss: english,
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

function unresolvedToken(english, role) {
  return {
    role,
    english,
    fonoran: null,
    parts: [],
    resolved: false,
    kind: 'unknown',
    source: null,
    gloss: null,
    interpreted: false,
    resolution_kind: 'unknown',
    confidence: 'low',
    guessed: false,
    pronunciation: { sayLine: '', englishLine: '' },
  };
}

function applyIdiomToSlots(idiomMatch, slots, rules) {
  const { spec, before, after } = idiomMatch;
  const beforeWords = before.filter(w => !TENSE_AUX[w?.toLowerCase()]);
  if (beforeWords.length && !slots.subject.length) {
    const subjectPhrase = nominalPhraseFromTokens(beforeWords, { skip: SKIP });
    if (subjectPhrase) {
      slots.subject.push({ english: subjectPhrase, role: 'subject' });
    }
  }
  const slotKey = spec.slot ?? 'event';
  const entry = {
    english: idiomMatch.phrase,
    role: slotKey,
    concept_hint: spec.concept_id,
    interpret_reason: spec.reason ?? `idiom: ${idiomMatch.phrase}`,
  };
  if (slotKey === 'event') slots.event.push(entry);
  else if (slotKey === 'modifier') slots.modifiers.push(entry);
  else if (slotKey === 'object') slots.object.push(entry);
  else if (slotKey === 'path') slots.path.push(entry);

  const trailing = parseTrailingPhrase(after, { skip: SKIP });
  slots.path.push(...(trailing.path ?? []));
  slots.object.push(...trailing.object);
  slots.modifiers.push(...trailing.modifiers);
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

function applyTenseToSlots(slots, tense) {
  if (tense === 'past' && !slots.time.some(t => t.particle === PARTICLE_PLACEHOLDERS.tense_past)) {
    slots.time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
  } else if (tense === 'future' && !slots.time.some(t => t.particle === PARTICLE_PLACEHOLDERS.tense_future)) {
    slots.time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
  }
}

function applyMotionPhrase(motionHit, slots, rules, { subject = [] } = {}) {
  if (motionHit.subject && !subject.length) {
    slots.subject.push(motionHit.subject);
  }
  slots.event.push(motionHit.event);
  const paths = Array.isArray(motionHit.path) ? motionHit.path : (motionHit.path ? [motionHit.path] : []);
  slots.path.push(...paths);
  if (motionHit.object) slots.object.push(motionHit.object);
  if (motionHit.modifiers?.length) slots.modifiers.push(...motionHit.modifiers);
  if (motionHit.trailingTime?.length) slots.time.push(...motionHit.trailingTime);
  applyTenseToSlots(slots, motionHit.tense);
  return normalizeMotionSlots(slots, rules);
}

function applyBeConstruction(beHit, slots, rules) {
  if (!slots.subject.length) {
    slots.subject.push({ english: beHit.subject, role: 'subject' });
  }
  if (beHit.event) slots.event.push(beHit.event);

  const trailingTokens = beHit.trailingTokens ?? [];
  if (trailingTokens.length) {
    const trailing = parseTrailingPhrase(trailingTokens, { skip: SKIP });
    // Locative predicate ("cat is behind/above the tree"): the relation lands in
    // the Place slot (concept or honest gap), no longer silently dropped.
    slots.path.push(...(trailing.path ?? []));
    for (const obj of trailing.object) {
      const parts = obj.english.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        slots.object.push({ english: parts[0], role: 'object' });
        for (const part of parts.slice(1)) {
          slots.modifiers.push({ english: part, role: 'modifier' });
        }
      } else {
        slots.object.push(obj);
      }
    }
    slots.modifiers.push(...trailing.modifiers);
  }

  for (const mod of beHit.modifiers ?? []) {
    if (typeof mod === 'object' && mod.english) slots.modifiers.push(mod);
  }

  const beTense = TENSE_AUX[beHit.be];
  if (beTense === 'past' && !slots.time.length) {
    slots.time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
  } else if (beTense === 'future' && !slots.time.length) {
    slots.time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
  }
}

/** Tokens for phrase patterns: keep be-forms, drop only articles. */
function patternScanTokens(tokens, start = 0) {
  const out = [];
  for (let k = start; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t === 'a' || t === 'an' || t === 'the') continue;
    out.push(t);
  }
  return out;
}

/**
 * Compile one clause's tokens into grammar slots.
 * @param {string[]} rawTokens
 * @param {object} rules
 */
async function compileClause(rawTokens, rules, { carriedSubject = null, aliasIndex = null } = {}) {
  const subject = [];
  const time = [];
  const event = [];
  const path = [];
  const object = [];
  const modifiers = [];

  let tokens = [...rawTokens];

  while (tokens.length && MODALS.has(tokens[0]?.toLowerCase())) {
    tokens = tokens.slice(1);
  }

  const questionPeel = peelQuestionAuxiliary(tokens, { pronounWords: PRONOUN_WORDS });
  tokens = questionPeel.tokens;
  if (questionPeel.peeled && questionPeel.subjectWord && !subject.length) {
    subject.push(subjectSlot(questionPeel.subjectWord));
  }

  const existentialPeel = peelExistentialDummyThere(tokens);
  tokens = existentialPeel.tokens;

  const timeHit = matchLeadingTimeAdverbial(tokens);
  if (timeHit) {
    time.push({ english: timeHit.english, role: 'time' });
    tokens = tokens.slice(timeHit.consumed);
  }

  if (tokens.length && PRONOUN_WORDS.has(tokens[0]?.toLowerCase())) {
    subject.push(subjectSlot(tokens[0]));
    tokens = tokens.slice(1);
  }

  let motionTokens = [...tokens];
  let motionNegated = false;
  motionTokens = motionTokens.filter((t) => {
    if (isNegationWord(t)) {
      motionNegated = true;
      return false;
    }
    return true;
  });
  const futureOnRaw = peelFutureFromTokens(motionTokens, rules);
  if (futureOnRaw.tense === 'future') {
    motionTokens = futureOnRaw.tokens;
  }
  const motionHit = hasDesireInfinitive(motionTokens) ? null : matchMotionPhrase(motionTokens, rules);
  if (motionHit) {
    const slots = { subject, time, event, path, object, modifiers };
    if (futureOnRaw.tense === 'future') motionHit.tense = 'future';
    applyMotionPhrase(motionHit, slots, rules, { subject });
    if (motionNegated) {
      const negForm = PARTICLES?.byId.get('logic_not')?.form ?? 'no';
      event.unshift({ english: 'not', role: 'event', particle: negForm });
    }
    return slots;
  }

  if (tokens.length <= 1) {
    if (tokens.length === 1) {
      event.push({ english: tokens[0], role: 'event' });
    }
    return { subject, time, event, path, object, modifiers };
  }

  const idiomScan = patternScanTokens(tokens, 0);
  let scanAuxTense = null;
  for (const t of idiomScan) {
    if (TENSE_AUX[t]) scanAuxTense = TENSE_AUX[t];
  }

  const earlyIdiom = matchIdiomPhrase(idiomScan, rules);
  if (earlyIdiom) {
    const beforeContent = earlyIdiom.before.filter(w => {
      const x = w?.toLowerCase();
      return !TENSE_AUX[x] && !MODALS.has(x);
    });
    const trySpatial = [...beforeContent, earlyIdiom.phrase, ...earlyIdiom.after];
    const spatialFromIdiom = beforeContent.length >= 1 && trySpatial.length >= 3
      ? matchVerbSpatialLandmark(trySpatial, rules)
      : null;
    if (spatialFromIdiom) {
      event.push(spatialFromIdiom.event);
      path.push(spatialFromIdiom.path);
      const split = splitLandmarkPhrase(spatialFromIdiom.object.english, rules, { skip: SKIP });
      object.push(...split.object);
      modifiers.push(...split.modifiers);
      return { subject, time, event, path, object, modifiers };
    }

    const slots = { subject, time, event, path, object, modifiers };
    const tense = scanAuxTense ?? 'present';
    if (tense === 'past') {
      time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
    } else if (tense === 'future') {
      time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
    }
    applyIdiomToSlots(earlyIdiom, slots, rules);
    return slots;
  }

  const patternTokens = [...idiomScan];
  const priorSubject = subject.length === 1 && !subject[0].particle
    ? subject[0].english
    : (carriedSubject?.[0]?.english ?? null);
  const beHit = matchBeConstruction(patternTokens, rules, { priorSubject });
  if (beHit) {
    const slots = { subject, time, event, path, object, modifiers };
    applyBeConstruction(beHit, slots, rules);
    return slots;
  }

  const desireInf = matchDesireInfinitive(patternTokens, rules);
  if (desireInf) {
    if (desireInf.subject && !subject.length) subject.push(subjectSlot(desireInf.subject.english));
    event.push(desireInf.event);
    object.push(desireInf.object);
    modifiers.push(...desireInf.modifiers);
    let auxTense = null;
    let negated = false;
    for (const t of patternTokens) {
      if (TENSE_AUX[t]) auxTense = TENSE_AUX[t];
      if (isNegationWord(t)) negated = true;
    }
    if (auxTense === 'past') {
      time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
    } else if (auxTense === 'future') {
      time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
    }
    if (negated) {
      const negForm = PARTICLES?.byId.get('logic_not')?.form ?? 'no';
      event.unshift({ english: 'not', role: 'event', particle: negForm });
    }
    return { subject, time, event, path, object, modifiers };
  }

  const haveRoles = classifyHaveForms(tokens, rules);
  const content = [];
  let auxTense = null;
  // Negation is scanned up front because a modal reads differently under it
  // ("cannot walk" needs no ability marker) and the negation word can follow it.
  let negated = tokens.some(t => isNegationWord(t));
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (MODALS.has(t)) {
      const modal = modalConcept(t, { negated, subjectEnglish: subject[0]?.english, isQuestion });
      if (modal) content.push(modal);
      continue;
    }
    if (SKIP.has(t)) continue;
    if (isNegationWord(t)) {
      negated = true;
      continue;
    }
    const haveRole = haveRoles.get(i);
    if (haveRole === 'aspect') {
      // The perfect is a past reading, whichever have-form spells it.
      auxTense = 'past';
      continue;
    }
    if (haveRole === 'necessity') {
      const necessity = MODAL_COMPOSITION.necessity?.[0];
      if (necessity) {
        content.push(necessity);
        if (t === 'had') auxTense = 'past';
        continue;
      }
    }
    if (haveRole === 'main') {
      // `had` carries its own past; the verb itself resolves from the lemma.
      if (t === 'had') auxTense = 'past';
      content.push('have');
      continue;
    }
    if (TENSE_AUX[t]) {
      auxTense = TENSE_AUX[t];
      continue;
    }
    content.push(t);
  }

  let working = [...content];
  let tense = auxTense ?? 'present';

  const futurePeel = peelFutureIntent(working, rules);
  if (futurePeel) {
    tense = 'future';
    working = [...futurePeel.before, ...futurePeel.after];
  } else if (auxTense === 'past') {
    tense = 'past';
  } else if (auxTense == null && working.some(w => isPastForm(w, rules, aliasIndex))) {
    tense = 'past';
  } else {
    tense = 'present';
  }

  if (tense === 'past') {
    time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
  } else if (tense === 'future') {
    time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
  }

  // Negation is clause-scoped and sits between Time and Event (Subject · Time · no · Event).
  // It goes at the head of Event, not into Time: a Time entry that is neither scene time
  // nor a tense particle renders as residual time *after* the Target, which turned
  // "I will not hurt you" into `mi sa tes be no`. The LLM path already normalizes a
  // stray `no` to the event head (normalizeFrameParticles); this is the same rule
  // applied where the parse is built, so both engines place negation identically.
  if (negated) {
    const negForm = PARTICLES?.byId.get('logic_not')?.form ?? 'no';
    event.unshift({ english: 'not', role: 'event', particle: negForm });
  }

  const slots = { subject, time, event, path, object, modifiers };

  const linking = matchSubjectLinkingPredicate(working, rules);
  if (linking) {
    if (!subject.length) {
      subject.push({ english: linking.subject, role: 'subject' });
    }
    event.push(linking.event);
    modifiers.push(linking.modifier);
    return slots;
  }

  if (!subject.length && working.length >= 4) {
    const phraseAfterSubject = matchVerbSpatialLandmark(working.slice(1), rules);
    if (phraseAfterSubject) {
      subject.push(subjectSlot(working[0]));
      event.push(phraseAfterSubject.event);
      path.push(phraseAfterSubject.path);
      object.push(phraseAfterSubject.object);
      return slots;
    }
  }

  const beAdj = matchSubjectBeAdj(patternTokens, rules);
  if (beAdj) {
    if (!subject.length) subject.push(beAdj.subject);
    modifiers.push(beAdj.modifier);
    return slots;
  }

  const verbTo = matchSubjectVerbToNp(working, rules);
  if (verbTo) {
    if (!subject.length) subject.push(verbTo.subject);
    event.push(verbTo.event);
    object.push(verbTo.object);
    return slots;
  }

  const phrase = matchVerbSpatialLandmark(working, rules);
  if (phrase) {
    if (!subject.length && working.length > 3) {
      const subjParts = working.slice(0, working.indexOf(phrase.event.english)).filter(w => !SKIP.has(w));
      if (subjParts.length) {
        subject.push({ english: subjParts.join(' '), role: 'subject' });
      }
    }
    event.push(phrase.event);
    path.push(phrase.path);
    const split = splitLandmarkPhrase(phrase.object.english, rules, { skip: SKIP });
    object.push(...split.object);
    modifiers.push(...split.modifiers);
    return slots;
  }

  if (!subject.length && working.length >= 2) {
    const firstPos = await getPosHint(working[0]);
    const secondPos = await getPosHint(working[1]);
    if (firstPos === 'verb' && secondPos !== 'verb') {
      event.push({ english: working[0], role: 'event' });
      object.push({ english: working[1], role: 'object' });
      const trailing = await assignFallbackTrailing(working.slice(2), rules, { skip: SKIP });
      object.push(...trailing.object);
      modifiers.push(...trailing.modifiers);
      return slots;
    }
    subject.push(subjectSlot(working[0]));
    working = working.slice(1);
  }

  if (working.length >= 2) {
    event.push({ english: working[0], role: 'event' });
    object.push({ english: working[1], role: 'object' });
    const trailing = await assignFallbackTrailing(working.slice(2), rules, { skip: SKIP });
    object.push(...trailing.object);
    modifiers.push(...trailing.modifiers);
  } else if (working.length === 1) {
    event.push({ english: working[0], role: 'event' });
  }

  return normalizeMotionSlots({ subject, time, event, path, object, modifiers }, rules);
}

/**
 * Move the Time and Place periphery into its own slot, wherever the parse put it.
 *
 * The parser only recognises a time adverbial in leading position, so a trailing one
 * scattered: "right now" landed in modifiers and rendered last, and in "Are we safe
 * now?" `now` became the Target. Both then surfaced after the predicate, though Rule 4
 * fronts scene time. Doing this as one pass over the finished parse rather than inside
 * each matcher is deliberate: compileClause has a dozen early returns, and a rule
 * enforced in one branch is the pattern that let the negation bug sit in place.
 *
 * @param {{ subject: object[], time: object[], event: object[], path: object[], object: object[], modifiers: object[] }} slots
 */
function hoistPeripheries(slots) {
  const key = (item) => String(item?.english ?? item?.concept_id ?? '')
    .toLowerCase()
    .trim()
    // "right now" / "just now" carry no meaning Fonoran renders, and the scene-time
    // check matches on the bare word.
    .replace(/^(right|just)\s+/, '');
  const isTime = item => !item?.particle && LEADING_TIME_WORDS.has(key(item));
  const isPlace = item => !item?.particle && (key(item) === 'here' || key(item) === 'there');
  // Politeness is peripheral, not an argument. Leading "please" was being taken as the
  // Actor ("Please do not go" parsed please as the subject and led with kugu), which both
  // misreads the clause and puts the marker first; it trails in the corpus.
  const isPolite = item => !item?.particle && key(item) === 'please';

  const politeness = [];
  for (const role of ['subject', 'event', 'object', 'modifiers']) {
    const kept = [];
    for (const item of slots[role] ?? []) {
      // An Action is the clause's predicate; pulling it out would leave no verb.
      if (role !== 'event' && isTime(item)) slots.time.push({ english: key(item), role: 'time' });
      else if (role !== 'event' && isPlace(item)) slots.path.push({ ...item, role: 'path' });
      else if (role !== 'event' && isPolite(item)) politeness.push({ ...item, role: 'modifier' });
      else kept.push(item);
    }
    slots[role] = kept;
  }
  slots.modifiers.push(...politeness);
  return slots;
}

/**
 * Compile English tokens into grammar slots with phrase-aware interpretation.
 * @param {string[]} tokens
 * @param {object} rules
 */
/**
 * Possessive determiner -> the pronoun particle that carries it. Fonoran encodes the
 * possessor (`gamba be` = enemy-your), but `my`/`your`/`our` sit in SKIP and were deleted
 * before the parse, so the possessor vanished: `mi` and `be` were the two most-dropped
 * tokens across the corpus. Third person is left out on purpose, since there is no
 * approved pronoun for it and inventing one is not this layer's job.
 */
const POSSESSIVE_PARTICLES = new Map([
  ['my', 'mi'], ['mine', 'mi'],
  ['your', 'be'], ['yours', 'be'],
  ['our', 'dan'], ['ours', 'dan'],
]);

/**
 * Which front end decides the slots. `pos` reads word class from a tagger and is the
 * default: the older `patterns` cascade assigned slots by position whenever no hand-written
 * matcher applied, so an adjective shifted every role and "the tall man walks" made tall
 * the Actor and man the Action, while reporting no gaps. It is kept selectable for
 * comparison (scripts/fonoran-english-parse-prototype.js).
 * @param {string} [requested]
 */
export function resolveParser(requested) {
  const raw = (requested ?? process.env.FONORAN_PARSER ?? 'pos').toLowerCase();
  return raw === 'patterns' || raw === 'legacy' ? 'patterns' : 'pos';
}

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

/** Subordinators whose job is to locate the clause in time, as opposed to relating it logically. */
const TEMPORAL_SUBORDINATORS = new Set(['when', 'while', 'after', 'before', 'until', 'since']);

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
    slots.time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
  } else if (parse.tense === 'future') {
    slots.time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
  }

  // Rule 13: side by side already means "and", so a conjunction needs no word, while a
  // choice closes the group with `lu` ("a single one") AFTER the alternatives. Both
  // alternatives must sit in the same slot for that to be sayable at all: RN-38 recorded
  // disjunction as unreachable here precisely because the pattern parser never grouped
  // them, so the marker had no group to close.
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
    const negForm = PARTICLES?.byId.get('logic_not')?.form ?? 'no';
    slots.event.unshift({ english: 'not', role: 'event', particle: negForm });
  }

  // A relation goes in Place and its landmark trails as a modifier, which is how the
  // pattern parser fills these slots too: "into the forest" is path=into, modifier=forest.
  for (const place of parse.places) {
    if (place.prep) slots.path.push({ english: place.prep, role: 'path' });
    if (place.head) slots.modifiers.push({ english: place.head, role: 'modifier' });
  }

  groupInto(slots.object, parse.target, 'object', ['target'], parse.targetSurface);

  for (const modifier of parse.modifiers) {
    slots.modifiers.push({ english: modifier, role: 'modifier' });
  }

  for (const token of tokens) {
    const form = POSSESSIVE_PARTICLES.get(String(token ?? '').toLowerCase());
    if (form) slots.modifiers.push({ english: token, role: 'modifier', particle: form });
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
 * The POS front end already collapses "how many" / "how much" into one `wh` value.
 * This keeps the patterns parser on the same path when it still reports bare `how`.
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

async function compileSemanticSlots(tokens, rules, {
  aliasIndex = null, parser = 'patterns', sentence = '', isQuestion = false,
} = {}) {
  // A single word has no structure to read, and asking for one loses it: "behind" alone is
  // a lookup, and parsed as a clause it is a preposition governing nothing.
  if (parser === 'pos' && sentence && tokens.length > 1) {
    return compileSemanticSlotsFromPos(sentence, tokens, { isQuestion, rules, aliasIndex });
  }

  const compiled = await compileSemanticSlotsRaw(tokens, rules, { aliasIndex, isQuestion });
  if (compiled.mode === 'word') return compiled;
  const hoisted = hoistPeripheries(compiled);

  // Re-attach possessors the SKIP filter removed. They trail, which is where Fonoran puts
  // a possessor relative to the thing possessed, and the possessed noun is normally the
  // last argument anyway.
  for (const token of tokens) {
    const form = POSSESSIVE_PARTICLES.get(String(token ?? '').toLowerCase());
    if (form) hoisted.modifiers.push({ english: token, role: 'modifier', particle: form });
  }
  return hoisted;
}

/**
 * @param {string[]} tokens
 * @param {object} rules
 */
async function compileSemanticSlotsRaw(tokens, rules, { aliasIndex = null, isQuestion = false } = {}) {
  const timeHit = matchLeadingTimeAdverbial(tokens);
  if (timeHit && tokens.length <= timeHit.consumed) {
    return {
      mode: 'sentence',
      subject: [],
      time: [{ english: timeHit.english, role: 'time' }],
      event: [],
      path: [],
      object: [],
      modifiers: [],
    };
  }

  if (tokens.length <= 1) {
    return {
      mode: 'word',
      subject: [],
      time: [],
      event: tokens.length ? [{ english: tokens[0], role: 'concept' }] : [],
      path: [],
      object: [],
      modifiers: [],
    };
  }

  const merged = mergePhrasalTokens(tokens);
  const clauses = splitIntoClauses(merged, { pronounWords: PRONOUN_WORDS });

  if (clauses.length === 1) {
    const slotData = await compileClause(clauses[0], rules, { aliasIndex });
    return { mode: 'sentence', ...slotData };
  }

  const combined = emptySlots();
  let carriedSubject = null;
  for (const clause of clauses) {
    const slotData = await compileClause(clause, rules, { carriedSubject, aliasIndex });
    if (slotData.subject.length) {
      const lastSubj = combined.subject.at(-1);
      const newSubj = slotData.subject[0];
      const dupPronoun = lastSubj?.particle && newSubj?.particle
        && lastSubj.particle === newSubj.particle;
      if (!dupPronoun) {
        appendSlots(combined, slotData);
      } else {
        const { subject: _skip, ...rest } = slotData;
        appendSlots(combined, { subject: [], ...rest });
      }
      carriedSubject = slotData.subject;
    } else {
      appendSlots(combined, slotData);
    }
  }
  return { mode: 'discourse', ...combined };
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
    return particleToken(role, slot.particle, surface || slot.particle);
  }

  if (slot.unknown_word) {
    return unknownWordToken(role, surface);
  }

  if (slot.concept_id) {
    const token = resolveConceptId(slot.concept_id, ctx, role);
    return { ...token, role };
  }

  if (PRONOUNS[lower]) {
    return particleToken(role, PRONOUNS[lower], surface);
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
  const isTenseParticle = (slot) => slot.particle === 'ta' || slot.particle === 'sa'
    || timeKey(slot) === 'ta' || timeKey(slot) === 'sa';
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
    if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
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

/** Particle surface forms the LLM may emit in frame slots. */
const LLM_PARTICLE_FORMS = new Set(particleForms());

/**
 * Normalize an LLM `unresolved[]` entry into a short, reusable gap token. The
 * compiler sometimes returns verbose reasoning ("second clause '…' omitted per
 * rule 7") or an annotated head ("can (ability modal — no v1 form)"). Keep only
 * the head token so the honest-gap baseline stays a clean list of missing
 * English words; drop sentence-like descriptions and clause meta-labels.
 * @param {string} raw
 * @returns {string|null}
 */
export function cleanGapToken(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // Strip an explanatory tail: "( … )", ": …", or " — …" / " - …".
  s = s.split(/\s*[(:]|\s+[—-]\s+/)[0].trim();
  s = s.replace(/^['"“”]+|['"“”]+$/g, '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  // Clause meta-labels ("and-clause", "compound clause", "subordinate_clause…")
  // are structural notes, not gap words.
  if (/^(second|compound|subordinate|and|but|or)[-\s_]?(clause|conjunction|clause_embedding)/.test(lower)) return null;
  // Real gap words are short; sentence-like descriptions are noise.
  if (lower.split(/\s+/).length > 2) return null;
  return lower;
}

/**
 * Convert an LLM concept frame into internal grammar slots.
 * @param {object} frameSlots
 */
export function frameSlotsToSemanticSlots(frameSlots) {
  // Lexicalize WH "unknown": a within-slot no/neg + know sequence followed by a
  // category concept (person/thing/place/time) is the WH composition and fuses
  // to the single word nohu. Other no+know sequences (e.g. "I do not know…")
  // stay as clause negation.
  const collapseUnknown = (ids) => {
    const out = [];
    for (let i = 0; i < ids.length; i += 1) {
      const isNeg = ids[i] === 'no' || ids[i] === 'neg';
      if (isNeg && ids[i + 1] === 'know' && UNKNOWN_CATEGORY_IDS.has(ids[i + 2])) {
        out.push('unknown');
        i += 1;
      } else {
        out.push(ids[i]);
      }
    }
    return out;
  };

  const convert = (items, role) => {
    const list = Array.isArray(items) ? items : [];
    const ids = list.map(raw => String(raw ?? '').trim().toLowerCase()).filter(Boolean);
    return collapseUnknown(ids).map((id) => {
      if (id === 'unknown') {
        return { english: 'unknown', role, unknown_word: true };
      }
      if (id === 'neg') {
        return { english: 'not', role, particle: 'no' };
      }
      if (LLM_PARTICLE_FORMS.has(id)) {
        return { english: id, role, particle: id };
      }
      return { english: id, role, concept_id: id };
    });
  };

  return {
    mode: 'sentence',
    subject: convert(frameSlots?.subject, 'subject'),
    time: convert(frameSlots?.time, 'time'),
    event: convert(frameSlots?.event, 'event'),
    path: convert(frameSlots?.path, 'path'),
    object: convert(frameSlots?.object, 'object'),
    modifiers: convert(frameSlots?.modifiers, 'modifier'),
  };
}

/** @param {unknown} value */
function normalizeConceptKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '_');
}

/**
 * The LLM sometimes reports a concept as unresolved and composes a stand-in from
 * approved parts, even when the lexicon owns a word for exactly that concept
 * ("relieved" reported as a gap while `nesgu` exists). Where the pairing is
 * unambiguous, one composed stand-in against one reported gap the lexicon can
 * resolve directly, prefer the approved word and close the gap.
 *
 * @param {object} ctx
 * @param {object[]} tokens  mutated in place
 * @param {string[]} gapWords
 * @returns {string[]} gap words closed by an approved word
 */
function preferApprovedWordOverComposition(ctx, tokens, gapWords) {
  const composed = tokens.filter(t => t.ad_hoc_composition);
  if (composed.length !== 1) return [];
  const target = composed[0];
  const filled = [];
  for (const word of gapWords) {
    if (/\s/.test(word)) continue;
    const key = normalizeConceptKey(word);
    // The lexicon must own a spelling for this very concept. Resolving the word
    // is not enough: an alias can land on a neighbouring concept ("cook" reaching
    // `make`), which is a near miss rather than the word the gap reports missing.
    const owned = ctx.compoundByConceptId?.has(key) || Boolean(ctx.rootById?.get(key)?.root);
    if (!owned) continue;
    const hit = resolveConceptId(key, ctx, target.role);
    if (hit?.resolved && !hit.ad_hoc_composition) filled.push({ word, hit });
  }
  if (filled.length !== 1) return [];
  const { word, hit } = filled[0];
  tokens[tokens.indexOf(target)] = {
    ...hit,
    role: target.role,
    interpreted: true,
    interpreted_from: word,
    interpret_reason: `approved word for reported gap:${word}`,
  };
  return [word];
}

/**
 * Compile a language-neutral concept frame into Fonoran surface output.
 * @param {object} frame  { slots, is_question?, unresolved?, reasoning? }
 * @param {{ lab?: object, input?: string, sourceLang?: string }} [options]
 */
export async function translateFromFrame(frame, options = {}) {
  const input = String(options.input ?? '').trim();
  const ctx = await buildResolveContext(options.lab, { devLab: Boolean(options.devLab) });
  if (!PARTICLES) PARTICLES = await getParticleRuntime();

  ctx.isQuestion = Boolean(frame?.is_question);
  // Promote temporal scene concepts out of trailing modifiers before render so
  // structure is preserved even if the LLM (or a cached frame) parked them wrong.
  const structured = applyDisjunction(promoteTemporalSceneToTime(frame ?? { slots: {} }));
  const semantic = frameSlotsToSemanticSlots(structured?.slots ?? {});
  // Deterministic grammar enforcement: canonical modifier order (quality before
  // place) so floating modifiers render the same regardless of LLM slot order.
  enforceModifierOrder(semantic, ctx.inventory?.concepts ?? []);
  const rendered = await slotsToTokens(ctx, semantic);
  // Frame gaps are cleaned to short tokens; token gaps are already single words.
  const frameGapWords = (structured?.unresolved ?? frame?.unresolved ?? []).map(cleanGapToken).filter(Boolean);
  const filledByApprovedWord = new Set(preferApprovedWordOverComposition(ctx, rendered, frameGapWords));
  const tokens = markSentence(rendered, { isQuestion: ctx.isQuestion, sourceText: input });

  const surface = buildSurface(tokens);
  const frameGaps = frameGapWords.filter(w => !filledByApprovedWord.has(w));
  const tokenGaps = tokens.filter(t => !t.resolved).map(t => String(t.english ?? '').toLowerCase());
  const uniqueUnresolved = [...new Set([...frameGaps, ...tokenGaps])];

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
      slots: semantic,
    },
    frame: buildFrame(tokens),
    interpretations,
    unresolved: uniqueUnresolved,
    reasoning: frame?.reasoning ?? null,
    sourceLang: options.sourceLang ?? null,
  });
}

/**
 * @deprecated Use translate() from fonoran-translate.js (LLM compiler). Kept for regression comparison.
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

  const parser = resolveParser(options.parser);
  const sentences = splitSentences(input);
  if (sentences.length > 1) {
    const allTokens = [];
    const mergedSlots = emptySlots();
    for (const sent of sentences) {
      ctx.isQuestion = isQuestionSentence(sent);
      const englishTokens = mergePhrasalTokens(mergeEnglishCompounds(tokenizeEnglish(sent), ctx.aliasIndex));
      const semantic = await compileSemanticSlots(englishTokens, rules, {
        aliasIndex: ctx.aliasIndex,
        parser,
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
    parser,
    sentence: sentences[0] ?? input,
    isQuestion: ctx.isQuestion,
  });
  // enforceModifierOrder is deliberately NOT run here. It exists to give the LLM
  // path a canonical order because a frame arrives with arbitrary slot order, while
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

/** @deprecated Alias for translateEnglishLegacy — use translate() from fonoran-translate.js. */
export const translateEnglish = translateEnglishLegacy;

export async function loadGrammarParticlesMeta() {
  try {
    return JSON.parse(await readFile(PARTICLES_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Reset cached vocabulary (tests). */
export function resetTranslatorCache() {
  resetInterpretationCache();
  resetParticleCache();
  PARTICLES = null;
}

export { tokenizeEnglish, lemmatizeEnglish };
