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
  matchIdiomPhrase,
  peelFutureIntent,
  irregularPastLemma,
  isIrregularPastForm,
  resetInterpretationCache,
  nominalPhraseFromTokens,
  parseTrailingPhrase,
  matchLeadingTimeAdverbial,
  matchSubjectLinkingPredicate,
  splitIntoClauses,
  mergePhrasalTokens,
  MODALS,
  splitLandmarkPhrase,
} from './fonoran-interpretation.js';
import {
  buildResolveContext,
  resolveEnglishToken,
  tokenizeEnglish,
  lemmatizeEnglish,
  IRREGULAR,
  CONJUNCTIONS,
} from './fonoran-english-resolve.js';
import { getPosHint } from './fonoran-semantic-lookup.js';
import { getParticleRuntime, resetParticleCache } from './fonoran-particles.js';

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

const GRAMMAR_SKELETON = 'Subject · Time · Event · Path · Object · Modifiers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTICLES_PATH = join(ROOT, 'data/fonoran-grammar-particles.json');

const SKIP = new Set([
  'a', 'an', 'the', 'to', 'at', 'in', 'on', 'of', 'for', 'with', 'by', 'from', 'into', 'about',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'this', 'that', 'these', 'those',
  ...CONJUNCTIONS,
  ...MODALS,
]);

const PRONOUNS = {
  i: 'mi',
  me: 'mi',
};

/** Subject pronouns → nearest concept id for resolution. */
const PRONOUN_CONCEPTS = {
  you: 'different',
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
  tense_future: 'na',
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

function applyBeConstruction(beHit, slots, rules) {
  if (!slots.subject.length) {
    slots.subject.push({ english: beHit.subject, role: 'subject' });
  }
  if (beHit.event) slots.event.push(beHit.event);

  const trailingTokens = beHit.trailingTokens ?? [];
  if (trailingTokens.length) {
    const trailing = parseTrailingPhrase(trailingTokens, { skip: SKIP });
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

  const timeHit = matchLeadingTimeAdverbial(tokens);
  if (timeHit) {
    time.push({ english: timeHit.english, role: 'time' });
    tokens = tokens.slice(timeHit.consumed);
  }

  if (tokens.length && PRONOUN_WORDS.has(tokens[0]?.toLowerCase())) {
    const p = tokens[0].toLowerCase();
    if (PRONOUNS[p]) {
      subject.push({ english: tokens[0], role: 'subject', particle: PRONOUNS[p] });
    } else {
      const conceptHint = PRONOUN_CONCEPTS[p];
      subject.push({
        english: tokens[0],
        role: 'subject',
        ...(conceptHint ? { concept_hint: conceptHint, interpret_reason: 'pronoun' } : {}),
      });
    }
    tokens = tokens.slice(1);
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

  const futurePeel = peelFutureIntent(working);
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
      subject.push({ english: working[0], role: 'subject' });
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
      for (const extra of working.slice(2)) modifiers.push({ english: extra, role: 'modifier' });
      return slots;
    }
    subject.push({ english: working[0], role: 'subject' });
    working = working.slice(1);
  }

  if (working.length >= 2) {
    event.push({ english: working[0], role: 'event' });
    object.push({ english: working[1], role: 'object' });
    for (const extra of working.slice(2)) modifiers.push({ english: extra, role: 'modifier' });
  } else if (working.length === 1) {
    event.push({ english: working[0], role: 'event' });
  }

  return slots;
}

/**
 * Compile English tokens into grammar slots with phrase-aware interpretation.
 * @param {string[]} tokens
 * @param {object} rules
 */
async function compileSemanticSlots(tokens, rules) {
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
      carriedSubject = slotData.subject;
    }
    appendSlots(combined, slotData);
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
  if (PRONOUNS[lower]) {
    return particleToken(role, PRONOUNS[lower], surface);
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
  });
}

async function slotsToTokens(ctx, slots) {
  if (slots.mode === 'word') {
    const english = slots.event[0]?.english;
    if (!english) return [];
    const lower = String(english).toLowerCase();
    const particle = PARTICLES && !lower.includes(' ') ? PARTICLES.index.get(lower) : null;
    if (particle?.form) return [particleToken('concept', particle.form, english)];
    return [await resolveEnglishToken(english, ctx, { role: 'concept', allowSemantic: true, allowGuess: true })];
  }

  const out = [];
  const push = (resolved) => {
    if (Array.isArray(resolved)) out.push(...resolved);
    else out.push(resolved);
  };

  // A wh-interrogative anywhere in the clause flags a question; emit the clause-initial marker.
  const allSlots = [
    ...slots.subject, ...slots.time, ...slots.event,
    ...slots.path, ...slots.object, ...slots.modifiers,
  ];
  const isQuestion = PARTICLES && allSlots.some((s) => {
    const p = PARTICLES.index.get(String(s.english ?? '').toLowerCase());
    return p?.group === 'interrogative';
  });
  if (isQuestion) {
    const marker = PARTICLES.byId.get('query_marker');
    if (marker?.form) out.push(particleToken('interrogative', marker.form, 'question'));
  }

  for (const slot of slots.subject) {
    if (slot.particle) out.push(particleToken('subject', slot.particle, slot.english));
    else push(await resolveSlot(ctx, slot, 'subject'));
  }
  for (const slot of slots.time) {
    if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
    else push(await resolveSlot(ctx, slot, 'time'));
  }
  for (const slot of slots.event) push(await resolveSlot(ctx, slot, 'event'));
  for (const slot of slots.path) push(await resolveSlot(ctx, slot, 'path'));
  for (const slot of slots.object) push(await resolveSlot(ctx, slot, 'object'));
  for (const slot of slots.modifiers) push(await resolveSlot(ctx, slot, 'modifier'));
  return out;
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

/**
 * @param {string} text
 * @param {{ lab?: object }} [options]
 */
export async function translateEnglish(text, options = {}) {
  const input = String(text ?? '').trim();
  if (!input) {
    return {
      input: '',
      mode: 'empty',
      tokens: [],
      surface: { roman: '', parts: [], pronunciation: { sayLine: '', englishLine: '' } },
      semantic: null,
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
      const englishTokens = mergePhrasalTokens(tokenizeEnglish(sent));
      const semantic = await compileSemanticSlots(englishTokens, rules);
      appendSlots(mergedSlots, semantic);
      allTokens.push(...await slotsToTokens(ctx, semantic));
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

    return {
      input,
      mode: 'discourse',
      tokens,
      surface,
      semantic: {
        skeleton: GRAMMAR_SKELETON,
        slots: mergedSlots,
      },
      interpretations,
      unresolved,
    };
  }

  const englishTokens = mergePhrasalTokens(tokenizeEnglish(sentences[0] ?? input));
  const semantic = await compileSemanticSlots(englishTokens, rules);
  const tokens = await slotsToTokens(ctx, semantic);
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

  return {
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
    interpretations,
    unresolved,
  };
}

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
