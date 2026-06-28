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

const GRAMMAR_SKELETON = 'Subject · Time · Event · Path · Object · Modifiers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTICLES_PATH = join(ROOT, 'data/fonoran-grammar-particles.json');

const SKIP = new Set([
  'a', 'an', 'the', 'to', 'at', 'in', 'on', 'of', 'for', 'with', 'by', 'from', 'into', 'about',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'this', 'that', 'these', 'those',
  ...CONJUNCTIONS,
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

function applyBeConstruction(beHit, slots) {
  if (!slots.subject.length) {
    slots.subject.push({ english: beHit.subject, role: 'subject' });
  }
  if (beHit.event) slots.event.push(beHit.event);
  slots.modifiers.push(...beHit.modifiers);
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
async function compileClause(rawTokens, rules) {
  const subject = [];
  const time = [];
  const event = [];
  const path = [];
  const object = [];
  const modifiers = [];

  let tokens = [...rawTokens];

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
  const beHit = matchBeConstruction(patternTokens, rules);
  if (beHit) {
    const slots = { subject, time, event, path, object, modifiers };
    applyBeConstruction(beHit, slots);
    return slots;
  }

  const content = [];
  let auxTense = null;
  for (const t of tokens) {
    if (SKIP.has(t)) continue;
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
  } else if (working.some(w => isPastForm(w, rules))) {
    tense = 'past';
  } else {
    tense = 'present';
  }

  if (tense === 'past') {
    time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
  } else if (tense === 'future') {
    time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
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
    object.push(phrase.object);
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
    const slotData = await compileClause(clause, rules);
    if (slotData.subject.length) {
      carriedSubject = slotData.subject;
    } else if (carriedSubject?.length) {
      slotData.subject.push(...carriedSubject.map(s => ({ ...s })));
    }
    appendSlots(combined, slotData);
  }
  return { mode: 'discourse', ...combined };
}

async function resolveSlot(ctx, slot, role) {
  const surface = String(slot.english ?? '').trim();
  const lower = surface.toLowerCase();
  if (PRONOUNS[lower]) {
    return particleToken(role, PRONOUNS[lower], surface);
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
    return english
      ? [await resolveEnglishToken(english, ctx, { role: 'concept', allowSemantic: true, allowGuess: true })]
      : [];
  }

  const out = [];
  for (const slot of slots.subject) {
    if (slot.particle) out.push(particleToken('subject', slot.particle, slot.english));
    else out.push(await resolveSlot(ctx, slot, 'subject'));
  }
  for (const slot of slots.time) {
    if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
    else out.push(await resolveSlot(ctx, slot, 'time'));
  }
  for (const slot of slots.event) out.push(await resolveSlot(ctx, slot, 'event'));
  for (const slot of slots.path) out.push(await resolveSlot(ctx, slot, 'path'));
  for (const slot of slots.object) out.push(await resolveSlot(ctx, slot, 'object'));
  for (const slot of slots.modifiers) out.push(await resolveSlot(ctx, slot, 'modifier'));
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
}

export { tokenizeEnglish, lemmatizeEnglish };
