/**
 * The Fonoran engine: neutral meaning slots → Fonoran surface.
 * Compiles meaning into Fonoran per docs/fonoran-grammar.md — not word-for-word substitution.
 *
 * The source language lives on the other side of the parser boundary
 * (fonoran-source-parsers.js): a parser turns text into the neutral slot
 * structure, and this module resolves concepts, attaches particles, orders the
 * output, and reports what it could not say. It reads source-language forms
 * only as lookup keys into the seed-loaded lexicon; the rules of any human
 * language belong to a parser, never here.
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
  TEMPORAL_SCENE_CONCEPT_IDS,
  TEMPORAL_SCENE_TOPIC_IDS,
  TEMPORAL_SCENE_FRONT_ORDER,
} from './fonoran-interpretation.js';
import { LEADING_TIME_WORDS } from './fonoran-english-morphology.js';
import {
  buildResolveContext,
  resolveEnglishToken,
  tokenizeEnglish,
  lemmatizeEnglish,
  resolveConceptId,
  gapToken,
} from './fonoran-english-resolve.js';
import {
  whComposition,
  whBlocked,
  unknownWord,
} from './fonoran-language-policy.js';
import { getSourceParser, emptySlots, appendSlots } from './fonoran-source-parsers.js';
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

/** Sanctioned modal compositions; owned by the English parser, re-exported for probes. */
export { MODAL_COMPOSITION } from './fonoran-source-english.js';

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

/** Sentence splitting is parser work; re-exported for callers that had it from here. */
export { splitSentences } from './fonoran-source-english.js';

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

  // A parser names grammar facts by particle id (tense_past, logic_not…) and never by
  // spelling; the seed-loaded form is attached here. `slot.particle` (a literal form)
  // is still honored for engine-internal slots.
  if (slot.particle || slot.particle_id) {
    const form = slot.particle ?? particleFormById(slot.particle_id);
    return particleToken(role, form, surface || form, { englishSource: slot.english_source });
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

  // resolveSlot's particle branch handles slots carrying a particle id or form.
  const pushTimeSlot = async (slot) => push(await resolveSlot(ctx, slot, 'time'), 'time');
  const pushSubjectSlot = async (slot) => push(await resolveSlot(ctx, slot, 'subject'), 'subject');

  // Front lexical scene time whenever present (calendar + long_ago/beginning/world…).
  for (const slot of sceneTime) await pushTimeSlot(slot);
  for (const slot of slots.subject) await pushSubjectSlot(slot);
  // Tense particles immediately before Action (Rule 3).
  for (const slot of tenseTime) await pushTimeSlot(slot);
  for (const slot of slots.event) push(await resolveSlot(ctx, slot, 'event'), 'event');
  // Target before Place, as the order comment above and rulebook Rule 8 say. The
  // path loop sat before the object loop for a long time, unnoticed while place
  // phrases had no object competing: with both, "she gives food to the child"
  // rendered as give TO food child.
  for (const slot of slots.object) push(await resolveSlot(ctx, slot, 'object'), 'object');
  for (const slot of slots.path) push(await resolveSlot(ctx, slot, 'path'), 'path');
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
 * Translate source-language text into Fonoran. This is the only forward engine;
 * `translate()` in fonoran-translate.js is the public wrapper around it. The
 * source language arrives as a parser (fonoran-source-parsers.js): the parser
 * produces the neutral slots, and everything below is Fonoran.
 * @param {string} text
 * @param {{ parser?: object, lab?: object, devLab?: boolean }} [options]
 */
export async function translateFromSource(text, options = {}) {
  const parser = options.parser ?? getSourceParser('en');
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

  const ctx = await buildResolveContext(options.lab, {
    devLab: Boolean(options.devLab),
    lang: parser.lang,
    morphology: parser.morphology,
    guess: Boolean(options.guess),
  });
  const rules = ctx.rules ?? await loadInterpretationRules();
  ctx.rules = rules;
  if (!PARTICLES) PARTICLES = await getParticleRuntime();

  const sentences = parser.splitSentences(input);
  if (sentences.length > 1) {
    const allTokens = [];
    const mergedSlots = emptySlots();
    for (const sent of sentences) {
      ctx.isQuestion = parser.isQuestionSentence(sent);
      const semantic = await parser.compileSlots(sent, {
        isQuestion: ctx.isQuestion,
        rules,
        aliasIndex: ctx.aliasIndex,
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

  ctx.isQuestion = parser.isQuestionSentence(sentences[0] ?? input);
  const semantic = await parser.compileSlots(sentences[0] ?? input, {
    isQuestion: ctx.isQuestion,
    rules,
    aliasIndex: ctx.aliasIndex,
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

/**
 * The forward engine under its historical name: English in, Fonoran out.
 * Kept because scripts and tests import it; it is exactly `translateFromSource`
 * with the English parser.
 * @param {string} text
 * @param {{ lab?: object, devLab?: boolean }} [options]
 */
export function translateEnglishLegacy(text, options = {}) {
  return translateFromSource(text, { ...options, parser: getSourceParser('en') });
}

/** Reset cached vocabulary (tests). */
export function resetTranslatorCache() {
  resetInterpretationCache();
  resetParticleCache();
  PARTICLES = null;
}

export { tokenizeEnglish, lemmatizeEnglish };
