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
import { loadConceptInventory, buildConceptAliasIndex } from './fonoran-concepts.js';
import {
  loadInterpretationRules,
  interpretToConcept,
  matchVerbSpatialLandmark,
  landmarkPhrase,
  peelFutureIntent,
  irregularPastLemma,
  isIrregularPastForm,
  resetInterpretationCache,
} from './fonoran-interpretation.js';

const GRAMMAR_SKELETON = 'Subject · Time · Event · Path · Object · Modifiers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTICLES_PATH = join(ROOT, 'data/fonoran-grammar-particles.json');

const SKIP = new Set([
  'a', 'an', 'the', 'to', 'at', 'in', 'on', 'of', 'for', 'with', 'by', 'from', 'into', 'about',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'this', 'that', 'these', 'those',
]);

const PRONOUNS = {
  i: 'mi',
  me: 'mi',
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

const IRREGULAR = {
  fought: 'war',
  fight: 'war',
  fighting: 'war',
  fights: 'war',
  loved: 'love',
  loves: 'love',
  loving: 'love',
  went: 'move',
  go: 'move',
  goes: 'move',
  going: 'move',
  gone: 'move',
  said: 'speak',
  say: 'speak',
  says: 'speak',
  saying: 'speak',
  knew: 'know',
  knows: 'know',
  knowing: 'know',
  children: 'child',
  men: 'person',
  man: 'person',
  women: 'person',
  woman: 'person',
  people: 'person',
};

const PARTICLE_PLACEHOLDERS = {
  pronoun_i: 'mi',
  tense_past: 'ta',
  tense_future: 'na',
};

function tokenizeEnglish(text) {
  return String(text ?? '')
    .trim()
    .match(/[A-Za-z']+/g)
    ?.map(t => t.toLowerCase().replace(/^'+|'+$/g, ''))
    .filter(Boolean) ?? [];
}

function lemmatize(word) {
  const w = String(word ?? '').toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    if (base.endsWith(base.at(-1)) && !base.endsWith('ing')) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('ed') && w.length > 4) {
    if (w.endsWith('ted') || w.endsWith('ded')) return w.slice(0, -2);
    const base = w.slice(0, -2);
    if (base.length >= 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function isPastForm(word, rules) {
  const w = String(word ?? '').toLowerCase();
  if (TENSE_AUX[w] === 'past') return true;
  if (isIrregularPastForm(w, rules)) return true;
  if (w.endsWith('ed') && w.length > 3) return true;
  return Boolean(IRREGULAR[w] && /ed$/.test(w));
}

function partsForEntry(entry) {
  if (entry.parts?.length) return entry.parts;
  if (entry.composition_roots?.length) return entry.composition_roots;
  return [entry.fonoran];
}

function pronunciationForParts(parts) {
  if (!parts?.length) return { sayLine: '', englishLine: '' };
  return {
    sayLine: parts.length > 1 ? compoundPhoneticKey(parts) : phoneticKeyBold(parts[0]),
    englishLine: parts.length > 1 ? compoundEnglishGuide(parts) : englishGuide(parts[0]),
  };
}

async function loadTranslationIndex(lab) {
  // Converged source of truth: the concept inventory (root-candidates) + the live lab.
  // The retired data/fonoran-primitive-roots.json is intentionally NOT consulted, so the
  // Translator can only produce words that actually exist in the Dictionary / Concept Editor.
  const index = new Map();
  const inventory = await loadConceptInventory();
  const conceptIndex = buildConceptAliasIndex(inventory.concepts, null);
  for (const [key, entry] of conceptIndex) {
    index.set(key, entry);
  }
  for (const sound of lab?.sounds ?? []) {
    const meaning = String(sound.meaning ?? sound.legacy_label ?? '').trim().toLowerCase();
    if (!meaning || !sound.spelling) continue;
    index.set(meaning, {
      english: sound.concept_id ?? meaning,
      concept_id: sound.concept_id ?? null,
      gloss: sound.meaning ?? sound.legacy_label ?? '',
      fonoran: sound.spelling,
      kind: 'primitive',
      parts: [sound.spelling],
      source: 'lab',
      state: sound.state,
    });
    if (sound.concept_id) {
      const hit = inventory.concepts.find(c => c.id === sound.concept_id);
      for (const alias of hit?.aliases ?? [sound.concept_id]) {
        if (!index.has(alias)) {
          index.set(alias, {
            english: sound.concept_id,
            concept_id: sound.concept_id,
            gloss: sound.meaning,
            fonoran: sound.spelling,
            kind: 'primitive',
            parts: [sound.spelling],
            source: 'lab',
            state: sound.state,
          });
        }
      }
    }
  }
  for (const compound of lab?.compounds ?? []) {
    const meaning = String(compound.meaning ?? '').trim().toLowerCase();
    if (!meaning || !compound.spelling) continue;
    index.set(meaning, {
      english: meaning,
      gloss: compound.meaning ?? '',
      fonoran: compound.spelling,
      kind: 'compound',
      composition_readable: compound.generator_hint ?? null,
      composition_roots: compound.parts ?? null,
      parts: compound.parts ?? [compound.spelling],
      source: 'lab',
      state: compound.state,
    });
  }
  return index;
}

function lookupConcept(index, englishWord, rules) {
  const raw = String(englishWord ?? '').trim().toLowerCase();
  if (!raw) return null;

  const pastLemma = irregularPastLemma(raw, rules);
  const tryKeys = [raw, pastLemma, lemmatize(raw), IRREGULAR[raw]].filter(Boolean);
  for (const key of tryKeys) {
    const hit = index.get(key);
    if (hit) {
      const parts = partsForEntry(hit);
      return {
        ...hit,
        parts,
        resolved: true,
        lookup: key,
        past_lemma: pastLemma && key === pastLemma ? pastLemma : null,
        pronunciation: pronunciationForParts(parts),
      };
    }
  }
  return {
    english: raw,
    fonoran: null,
    parts: [],
    resolved: false,
    gloss: null,
    kind: 'unknown',
    source: null,
    pronunciation: { sayLine: '', englishLine: '' },
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
    pronunciation: { sayLine: '', englishLine: '' },
  };
}

/**
 * Resolve English to Fonoran: direct alias → interpretation hint → class rule.
 */
function interpretConceptToken(index, english, role, rules, hints = {}) {
  const surface = String(english ?? '').trim();
  const lookupWord = role === 'object' ? landmarkPhrase(surface) : surface.toLowerCase();

  let hit = lookupConcept(index, lookupWord, rules);
  if (hit.resolved) {
    const pastLemma = irregularPastLemma(surface, rules);
    const interpreted = Boolean(pastLemma && hit.past_lemma);
    return {
      ...hit,
      role,
      english: surface,
      concept_id: hit.concept_id ?? hit.english,
      interpreted,
      ...(interpreted ? {
        interpreted_from: surface,
        interpret_reason: 'irregular past',
      } : {}),
    };
  }

  if (hints.concept_hint) {
    hit = lookupConcept(index, hints.concept_hint, rules);
    if (hit.resolved) {
      return {
        ...hit,
        role,
        english: surface,
        concept_id: hit.concept_id ?? hit.english,
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: hints.interpret_reason ?? 'spatial path',
      };
    }
  }

  const interp = interpretToConcept(surface, role, rules);
  if (interp) {
    hit = lookupConcept(index, interp.concept_id, rules);
    if (hit.resolved) {
      return {
        ...hit,
        role,
        english: surface,
        concept_id: hit.concept_id ?? interp.concept_id,
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: interp.reason,
        interpret_class: interp.class,
      };
    }
  }

  return { ...hit, role, english: surface, interpreted: false };
}

/**
 * Compile English tokens into grammar slots with phrase-aware interpretation.
 * @param {string[]} tokens
 * @param {object} rules
 */
function compileSemanticSlots(tokens, rules) {
  if (tokens.length <= 1) {
    return {
      mode: 'word',
      subject: [],
      time: [],
      event: tokens.length ? [{ english: tokens[0], role: 'event' }] : [],
      path: [],
      object: [],
      modifiers: [],
    };
  }

  let i = 0;
  const subject = [];
  const time = [];
  const event = [];
  const path = [];
  const object = [];
  const modifiers = [];

  if (PRONOUN_WORDS.has(tokens[0])) {
    if (PRONOUNS[tokens[0]]) {
      subject.push({ english: tokens[0], role: 'subject', particle: PRONOUNS[tokens[0]] });
    } else {
      subject.push({ english: tokens[0], role: 'subject' });
    }
    i = 1;
  }

  const content = [];
  let auxTense = null;
  while (i < tokens.length) {
    const t = tokens[i];
    i += 1;
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
  } else if (auxTense === 'past' || working.some(w => isPastForm(w, rules))) {
    tense = 'past';
  } else {
    tense = 'present';
  }

  if (tense === 'past') {
    time.push({ english: 'past', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_past });
  } else if (tense === 'future') {
    time.push({ english: 'future', role: 'time', particle: PARTICLE_PLACEHOLDERS.tense_future });
  }

  if (!subject.length && working.length >= 4) {
    const phraseAfterSubject = matchVerbSpatialLandmark(working.slice(1), rules);
    if (phraseAfterSubject) {
      subject.push({ english: working[0], role: 'subject' });
      event.push(phraseAfterSubject.event);
      path.push(phraseAfterSubject.path);
      object.push(phraseAfterSubject.object);
      return { mode: 'sentence', subject, time, event, path, object, modifiers };
    }
  }

  const phrase = matchVerbSpatialLandmark(working, rules);
  if (phrase) {
    event.push(phrase.event);
    path.push(phrase.path);
    object.push(phrase.object);
    return { mode: 'sentence', subject, time, event, path, object, modifiers };
  }

  if (!subject.length && working.length >= 2) {
    subject.push({ english: working[0], role: 'subject' });
    working.shift();
  }

  if (working.length >= 2) {
    event.push({ english: working[0], role: 'event' });
    object.push({ english: working[1], role: 'object' });
    for (const extra of working.slice(2)) modifiers.push({ english: extra, role: 'modifier' });
  } else if (working.length === 1) {
    event.push({ english: working[0], role: 'event' });
  }

  return { mode: 'sentence', subject, time, event, path, object, modifiers };
}

function slotsToTokens(index, slots, rules) {
  if (slots.mode === 'word') {
    const english = slots.event[0]?.english;
    return english ? [interpretConceptToken(index, english, 'concept', rules)] : [];
  }

  const out = [];
  for (const slot of slots.subject) {
    if (slot.particle) out.push(particleToken('subject', slot.particle, slot.english));
    else out.push(interpretConceptToken(index, slot.english, 'subject', rules));
  }
  for (const slot of slots.time) {
    if (slot.particle) out.push(particleToken('time', slot.particle, slot.english));
    else out.push(unresolvedToken(slot.english, 'time'));
  }
  for (const slot of slots.event) out.push(interpretConceptToken(index, slot.english, 'event', rules));
  for (const slot of slots.path) {
    out.push(interpretConceptToken(index, slot.english, 'path', rules, {
      concept_hint: slot.concept_hint,
      interpret_reason: slot.interpret_reason,
    }));
  }
  for (const slot of slots.object) out.push(interpretConceptToken(index, slot.english, 'object', rules));
  for (const slot of slots.modifiers) out.push(interpretConceptToken(index, slot.english, 'modifier', rules));
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

  const baseIndex = await loadTranslationIndex(options.lab);
  const rules = await loadInterpretationRules();
  const englishTokens = tokenizeEnglish(input);
  const semantic = compileSemanticSlots(englishTokens, rules);
  const tokens = slotsToTokens(baseIndex, semantic, rules);
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
