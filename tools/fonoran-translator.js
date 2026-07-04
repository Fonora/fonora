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
} from './fonoran-english-resolve.js';
import { getPosHint } from './fonoran-semantic-lookup.js';
import { getParticleRuntime, resetParticleCache } from './fonoran-particles.js';
import { attachTranslatorPlayback } from './fonoran-playback-build.js';

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
 * compositionally from ordinary concepts: an "unknown" (not + know) applied to a
 * category concept (person/thing/place/time). Grammar only states that questions
 * are compositional (docs/fonoran-grammar.md Rule 3); the concrete mapping lives
 * here and MAY CHANGE as the lexicon evolves (e.g. if a dedicated `unknown` root
 * or `reason`/`method` concept is later justified by usage).
 *   who   -> no hu ba   (not-known person)
 *   what  -> no hu to    (not-known thing)
 *   where -> no hu che   (not-known place)
 *   when  -> no hu kan   (not-known time)
 * why/how are intentionally absent: Fonoran has no robust reason/method concept yet.
 * Applied only in interrogative sentences (source marked with `?`) so relative /
 * subordinate "who"/"when" are left alone.
 */
const WH_QUESTION_COMPOSITION = {
  who: ['neg', 'know', 'person'],
  whom: ['neg', 'know', 'person'],
  what: ['neg', 'know', 'thing'],
  where: ['neg', 'know', 'place'],
  when: ['neg', 'know', 'time'],
};

/** A source sentence is a written question when it ends with `?`. */
function isQuestionSentence(sentence) {
  return String(sentence ?? '').trim().endsWith('?');
}

/** Trailing punctuation token so written questions surface a `?` (Rule 3/4). */
function punctuationToken(mark) {
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

function isPastForm(word, rules) {
  const w = String(word ?? '').toLowerCase();
  if (TENSE_AUX[w] === 'past') return true;
  if (isIrregularPastForm(w, rules)) return true;
  if (w.endsWith('ed') && w.length > 3) return true;
  return Boolean(IRREGULAR[w] && /ed$/.test(w));
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
    role,
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
async function compileClause(rawTokens, rules, { carriedSubject = null } = {}) {
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
  const motionHit = matchMotionPhrase(motionTokens, rules);
  if (motionHit) {
    const slots = { subject, time, event, path, object, modifiers };
    if (futureOnRaw.tense === 'future') motionHit.tense = 'future';
    applyMotionPhrase(motionHit, slots, rules, { subject });
    if (motionNegated) {
      const negForm = PARTICLES?.byId.get('logic_not')?.form ?? 'no';
      time.push({ english: 'not', role: 'time', particle: negForm });
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
      time.push({ english: 'not', role: 'time', particle: negForm });
    }
    return { subject, time, event, path, object, modifiers };
  }

  const content = [];
  let auxTense = null;
  let negated = false;
  for (const t of tokens) {
    if (SKIP.has(t)) continue;
    if (isNegationWord(t)) {
      negated = true;
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
  } else if (auxTense == null && working.some(w => isPastForm(w, rules))) {
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
  if (negated) {
    const negForm = PARTICLES?.byId.get('logic_not')?.form ?? 'no';
    time.push({ english: 'not', role: 'time', particle: negForm });
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
 * Compile English tokens into grammar slots with phrase-aware interpretation.
 * @param {string[]} tokens
 * @param {object} rules
 */
async function compileSemanticSlots(tokens, rules) {
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
    const slotData = await compileClause(clauses[0], rules);
    return { mode: 'sentence', ...slotData };
  }

  const combined = emptySlots();
  let carriedSubject = null;
  for (const clause of clauses) {
    const slotData = await compileClause(clause, rules, { carriedSubject });
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
    if (piece === 'neg') {
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

  if (slot.concept_id) {
    const token = resolveConceptId(slot.concept_id, ctx, role);
    return { ...token, role };
  }

  if (PRONOUNS[lower]) {
    return particleToken(role, PRONOUNS[lower], surface);
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
  return resolveEnglishToken(slot.english, ctx, {
    role,
    hints,
    allowSemantic: true,
    allowGuess: true,
    surfaceEnglish: slot.english,
    avoidConceptIds: role === 'modifier' ? ctx.frameConceptIds : null,
  });
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

  // v1: questions carry no particle. Written questions are marked with `?`
  // (appended by translateEnglish); content questions compose from concepts.

  const calendarTime = slots.time.filter(s => LEADING_TIME_WORDS.has(String(s.english ?? '').toLowerCase()));
  const otherTime = slots.time.filter(s => !LEADING_TIME_WORDS.has(String(s.english ?? '').toLowerCase()));

  if (calendarTime.length) {
    for (const slot of calendarTime) {
      if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
      else push(await resolveSlot(ctx, slot, 'time'), 'time');
    }
    for (const slot of otherTime) {
      if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
      else push(await resolveSlot(ctx, slot, 'time'), 'time');
    }
    for (const slot of slots.subject) {
      if (slot.particle) out.push(particleToken('subject', slot.particle, slot.english));
      else push(await resolveSlot(ctx, slot, 'subject'), 'subject');
    }
  } else {
    for (const slot of slots.subject) {
      if (slot.particle) out.push(particleToken('subject', slot.particle, slot.english));
      else push(await resolveSlot(ctx, slot, 'subject'), 'subject');
    }
    for (const slot of slots.time) {
      if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
      else push(await resolveSlot(ctx, slot, 'time'), 'time');
    }
  }
  for (const slot of slots.event) push(await resolveSlot(ctx, slot, 'event'), 'event');
  for (const slot of slots.path) push(await resolveSlot(ctx, slot, 'path'), 'path');
  for (const slot of slots.object) push(await resolveSlot(ctx, slot, 'object'), 'object');
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
function buildFrame(tokens) {
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

function buildSurface(tokens) {
  const romanWords = tokens.map(t => (t.resolved ? t.fonoran : `[${t.english}]`));
  const allParts = tokens.flatMap(t => (t.resolved ? t.parts : []));
  const sayParts = tokens.map(t => {
    if (!t.resolved) return `[${t.english.toUpperCase()}]`;
    return t.pronunciation?.sayLine || t.fonoran.toUpperCase();
  });
  const englishParts = tokens.map(t => {
    if (!t.resolved) return '';
    return t.pronunciation?.englishLine || '';
  }).filter(Boolean);

  return {
    roman: romanWords.join(' '),
    parts: allParts,
    pronunciation: {
      sayLine: sayParts.join(' · '),
      englishLine: englishParts.join(' · '),
    },
  };
}

/** Particle surface forms the LLM may emit in frame slots. */
const LLM_PARTICLE_FORMS = new Set(['mi', 'ta', 'sa', 'no', 'ya', 'von']);

/**
 * Convert an LLM concept frame into internal grammar slots.
 * @param {object} frameSlots
 */
export function frameSlotsToSemanticSlots(frameSlots) {
  const convert = (items, role) => {
    const list = Array.isArray(items) ? items : [];
    return list.map((raw) => {
      const id = String(raw ?? '').trim().toLowerCase();
      if (!id) return null;
      if (id === 'neg') {
        return { english: 'not', role, particle: 'no' };
      }
      if (LLM_PARTICLE_FORMS.has(id)) {
        return { english: id, role, particle: id };
      }
      return { english: id, role, concept_id: id };
    }).filter(Boolean);
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

/**
 * Compile a language-neutral concept frame into Fonoran surface output.
 * @param {object} frame  { slots, is_question?, unresolved?, reasoning? }
 * @param {{ lab?: object, input?: string, sourceLang?: string }} [options]
 */
export async function translateFromFrame(frame, options = {}) {
  const input = String(options.input ?? '').trim();
  const ctx = await buildResolveContext(options.lab);
  if (!PARTICLES) PARTICLES = await getParticleRuntime();

  ctx.isQuestion = Boolean(frame?.is_question);
  const semantic = frameSlotsToSemanticSlots(frame?.slots ?? {});
  const tokens = await slotsToTokens(ctx, semantic);
  if (ctx.isQuestion) tokens.push(punctuationToken('?'));

  const surface = buildSurface(tokens);
  const unresolved = [
    ...(frame?.unresolved ?? []).map(w => String(w)),
    ...tokens.filter(t => !t.resolved).map(t => t.english),
  ];
  const uniqueUnresolved = [...new Set(unresolved.map(w => String(w).toLowerCase()))];

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

  const ctx = await buildResolveContext(options.lab);
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
      const semantic = await compileSemanticSlots(englishTokens, rules);
      appendSlots(mergedSlots, semantic);
      allTokens.push(...await slotsToTokens(ctx, semantic));
      if (ctx.isQuestion) allTokens.push(punctuationToken('?'));
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
  const semantic = await compileSemanticSlots(englishTokens, rules);
  const tokens = await slotsToTokens(ctx, semantic);
  if (ctx.isQuestion) tokens.push(punctuationToken('?'));
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
