/**
 * Unified English → Fonoran concept resolution for Translator and Word Generator.
 * Tiers: direct → interpreted → semantic (WordNet) → guessed compound → unknown.
 */

import {
  phoneticKeyBold,
  compoundPhoneticKey,
  englishGuide,
  compoundEnglishGuide,
} from './fonoran-pronunciation.js';
import { buildConceptAliasIndex, loadRuntimeConceptInventory, buildRootById } from './fonoran-concepts.js';
import { expandWord } from './fonoran-semantic-lookup.js';
import { getLab } from './fonoran-sound-bucket.js';
import {
  loadInterpretationRules,
  interpretToConcept,
  interpretToConceptRelaxed,
  irregularPastLemma,
  landmarkPhrase,
  lemmaCandidates,
  nominalPhrase,
  headNounToken,
} from './fonoran-interpretation.js';
import { REUSABLE_WORD_STATES } from './fonoran-derivation.js';

/** Hardcoded surface → lemma shortcuts shared with translator frame parser. */
export const IRREGULAR = {
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
  war: 'conflict',
  wars: 'conflict',
};

const GUESS_SCORE_THRESHOLD = 800;

/** Block WordNet/hypernym guessing on function words. */
const SEMANTIC_BLOCK = new Set([
  'something', 'anything', 'nothing', 'everything', 'another', 'else', 'someone', 'anyone',
]);

/** Conjunctions — not content words. */
export const CONJUNCTIONS = new Set(['and', 'or', 'but', 'nor', 'yet', 'so']);

export function tokenizeEnglish(text) {
  return String(text ?? '')
    .trim()
    .match(/[A-Za-z']+/g)
    ?.map(t => t.toLowerCase().replace(/^'+|'+$/g, ''))
    .filter(Boolean) ?? [];
}

export function lemmatizeEnglish(word, rules = null) {
  const w = String(word ?? '').toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  const pastLemma = rules ? irregularPastLemma(w, rules) : null;
  if (pastLemma) return pastLemma;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3);
    if (base.endsWith(base.at(-1)) && !base.endsWith('ing')) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('ed') && w.length > 4) {
    if (w.endsWith('ied')) return `${w.slice(0, -3)}y`;
    if (w.endsWith('ted') || w.endsWith('ded')) return w.slice(0, -1);
    const base = w.slice(0, -2);
    if (base.length >= 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('en') && w.length > 4) {
    const base = w.slice(0, -2);
    if (base.length >= 2 && base.at(-1) === base.at(-2)) return base.slice(0, -1);
    return base;
  }
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Agentive forms: traveler → travel (+ person). */
export function agentiveBase(word) {
  const w = String(word ?? '').toLowerCase();
  if (w.endsWith('er') && w.length > 4) return [w.slice(0, -2), `${w.slice(0, -2)}e`];
  if (w.endsWith('or') && w.length > 4) return [w.slice(0, -2), `${w.slice(0, -2)}e`];
  if (w.endsWith('ist') && w.length > 5) return [w.slice(0, -3)];
  return null;
}

function partsForEntry(entry) {
  if (entry.parts?.length) return entry.parts;
  if (entry.composition_roots?.length) return entry.composition_roots;
  if (entry.fonoran) return [entry.fonoran];
  return [];
}

function pronunciationForParts(parts) {
  if (!parts?.length) return { sayLine: '', englishLine: '' };
  return {
    sayLine: parts.length > 1 ? compoundPhoneticKey(parts) : phoneticKeyBold(parts[0]),
    englishLine: parts.length > 1 ? compoundEnglishGuide(parts) : englishGuide(parts[0]),
  };
}

function buildTryKeys(raw, rules) {
  return [...new Set([...lemmaCandidates(raw, rules), IRREGULAR[raw]].filter(Boolean))];
}

function phraseLookupKeys(phrase, rules, skip = null) {
  const raw = String(phrase ?? '').trim().toLowerCase();
  if (!raw) return [];
  const parts = raw.split(/\s+/).filter(Boolean);
  const keys = [
    raw,
    landmarkPhrase(raw),
    nominalPhrase(raw, { skip }),
  ];
  const head = headNounToken(parts, { skip });
  if (head) keys.push(...buildTryKeys(head, rules));
  for (const part of parts) keys.push(...buildTryKeys(part, rules));
  return [...new Set(keys.filter(Boolean))];
}

function lookupAliasEntry(aliasIndex, keys) {
  for (const key of keys) {
    const hit = aliasIndex.get(key);
    if (hit) return { hit, lookup: key };
  }
  return null;
}

function entryToHit(entry, { lookup, rules, pastLemma }) {
  const parts = partsForEntry(entry);
  const fonoran = entry.fonoran ?? parts[0] ?? null;
  return {
    ...entry,
    fonoran,
    parts,
    resolved: Boolean(fonoran),
    lookup,
    past_lemma: pastLemma && lookup === pastLemma ? pastLemma : null,
    pronunciation: pronunciationForParts(parts),
  };
}

function unknownHit(raw) {
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

function enrichToken(base, meta) {
  return {
    ...base,
    resolution_kind: meta.resolution_kind ?? (base.resolved ? 'direct' : 'unknown'),
    confidence: meta.confidence ?? (base.resolved ? 'high' : 'low'),
    concept_id: meta.concept_id ?? base.concept_id ?? base.english ?? null,
    interpreted: Boolean(meta.interpreted),
    interpreted_from: meta.interpreted_from ?? null,
    interpret_reason: meta.interpret_reason ?? null,
    interpret_class: meta.interpret_class ?? null,
    guessed: meta.guessed ?? false,
    guess_components: meta.guess_components ?? null,
    lookup: meta.lookup ?? base.lookup ?? null,
  };
}

/**
 * Build shared resolution context (alias index + roots + compounds + rules).
 */
export async function buildResolveContext(lab = null) {
  const liveLab = lab ?? await getLab();
  const inventory = await loadRuntimeConceptInventory({ lab: liveLab });
  const rules = await loadInterpretationRules().catch(() => null);
  const aliasIndex = buildConceptAliasIndex(inventory.concepts, liveLab, {}, { labFirst: true });

  for (const compound of liveLab?.compounds ?? []) {
    const meaning = String(compound.meaning ?? '').trim().toLowerCase();
    if (!meaning || !compound.spelling) continue;
    const entry = {
      english: meaning,
      concept_id: compound.concept_id ?? null,
      gloss: compound.meaning ?? '',
      fonoran: compound.spelling,
      kind: 'compound',
      composition_readable: compound.composition_readable ?? compound.generator_hint ?? null,
      composition_roots: compound.parts ?? null,
      parts: compound.parts ?? [compound.spelling],
      source: 'lab',
      state: compound.state,
    };
    aliasIndex.set(meaning, entry);
    for (const alias of compound.aliases ?? []) {
      const key = String(alias).trim().toLowerCase();
      if (!key || aliasIndex.has(key)) continue;
      aliasIndex.set(key, { ...entry, matched_alias: key });
    }
  }

  const rootById = buildRootById(inventory.concepts, liveLab);
  const rootInventory = (liveLab.sounds ?? [])
    .filter(s => s.state !== 'rejected' && s.spelling)
    .map(s => ({ root: s.spelling, id: s.concept_id ?? s.spelling }));

  const compoundByConceptId = new Map();
  const parseInventory = [...rootInventory];
  for (const c of liveLab.compounds ?? []) {
    if (!REUSABLE_WORD_STATES.includes(c.state) || !c.concept_id || !c.spelling) continue;
    compoundByConceptId.set(c.concept_id, {
      id: c.id,
      spelling: c.spelling,
      gloss: c.meaning ?? c.gloss ?? c.concept_id,
    });
    parseInventory.push({ root: c.spelling, id: c.concept_id });
  }

  return {
    lab: liveLab,
    inventory,
    aliasIndex,
    rootById,
    rootInventory,
    parseInventory,
    compoundByConceptId,
    rules,
  };
}

/** @deprecated alias — word generator uses buildResolveContext */
export const buildContext = buildResolveContext;

function lookupByKeys(ctx, keys) {
  const found = lookupAliasEntry(ctx.aliasIndex, keys);
  if (!found) return unknownHit(keys[0] ?? '');
  const pastLemma = irregularPastLemma(keys[0], ctx.rules);
  return entryToHit(found.hit, { lookup: found.lookup, rules: ctx.rules, pastLemma });
}

function lookupByConceptId(ctx, conceptId) {
  if (!conceptId) return unknownHit('');
  const spec = ctx.rootById.get(conceptId);
  const compound = ctx.compoundByConceptId.get(conceptId);
  if (compound) {
    return entryToHit({
      english: conceptId,
      concept_id: conceptId,
      gloss: compound.gloss,
      fonoran: compound.spelling,
      kind: 'compound',
      parts: [compound.spelling],
      source: 'lab',
    }, { lookup: conceptId, rules: ctx.rules, pastLemma: null });
  }
  if (spec?.root) {
    return entryToHit({
      english: conceptId,
      concept_id: conceptId,
      gloss: spec.gloss,
      fonoran: spec.root,
      kind: 'primitive',
      parts: [spec.root],
      source: 'concept',
    }, { lookup: conceptId, rules: ctx.rules, pastLemma: null });
  }
  const aliasHit = lookupAliasEntry(ctx.aliasIndex, [conceptId, conceptId.replace(/_/g, ' ')]);
  if (aliasHit) {
    return entryToHit(aliasHit.hit, { lookup: aliasHit.lookup, rules: ctx.rules, pastLemma: null });
  }
  return {
    ...unknownHit(conceptId),
    concept_id: conceptId,
    gloss: spec?.gloss ?? conceptId,
  };
}

/**
 * Try resolving a multi-word English phrase against the alias index.
 */
export function resolveEnglishPhrase(phrase, ctx, { skip = null } = {}) {
  const raw = String(phrase ?? '').trim().toLowerCase();
  if (!raw) return unknownHit('');
  const fullCandidates = [...new Set([
    raw,
    landmarkPhrase(raw),
    nominalPhrase(raw, { skip }),
  ].filter(Boolean))];
  for (const candidate of fullCandidates) {
    const hit = lookupByKeys(ctx, [candidate]);
    if (hit.resolved) {
      return enrichToken(hit, {
        resolution_kind: 'direct',
        confidence: 'high',
        concept_id: hit.concept_id ?? hit.english,
        lookup: candidate,
      });
    }
  }
  return unknownHit(raw);
}

/**
 * Resolve a concept id only (Word Generator component suggest).
 */
export function resolveConceptId(token, ctx) {
  const tries = buildTryKeys(String(token ?? '').toLowerCase(), ctx.rules);
  const direct = lookupAliasEntry(ctx.aliasIndex, tries);
  if (direct?.hit?.concept_id) return { concept_id: direct.hit.concept_id, agentive: false, via: 'alias' };

  const interp = interpretToConceptRelaxed(token, 'concept', ctx.rules)
    ?? interpretToConceptRelaxed(lemmatizeEnglish(token, ctx.rules), 'concept', ctx.rules);
  if (interp?.concept_id && ctx.rootById.has(interp.concept_id)) {
    return { concept_id: interp.concept_id, agentive: false, via: interp.reason };
  }

  const bases = agentiveBase(token);
  if (bases) {
    for (const base of bases) {
      const hit = lookupAliasEntry(ctx.aliasIndex, buildTryKeys(base, ctx.rules));
      if (hit?.hit?.concept_id) return { concept_id: hit.hit.concept_id, agentive: true, via: 'agentive' };
    }
  }
  return null;
}

async function tryGuessSpelling(conceptIds, ctx) {
  if (!conceptIds?.length || conceptIds.length < 2) return null;
  const { composeOptions, componentSpecForConcept } = await import('./fonoran-word-generator.js');
  const specs = conceptIds
    .map(id => componentSpecForConcept(id, ctx, { preferWord: true }))
    .filter(Boolean);
  if (specs.length < 2) return null;
  const options = composeOptions(conceptIds, ctx, { limit: 3, specs });
  const top = options[0];
  if (!top) return null;
  if (!top.unique && top.score < GUESS_SCORE_THRESHOLD) return null;
  return top;
}

/**
 * Full async resolution pipeline for one English token or phrase.
 */
export async function resolveEnglishToken(english, ctx, {
  role = 'concept',
  hints = {},
  allowSemantic = true,
  allowGuess = true,
  surfaceEnglish = null,
} = {}) {
  const surface = String(surfaceEnglish ?? english ?? '').trim();
  const lookupWord = role === 'object' ? landmarkPhrase(surface) : String(english ?? '').trim().toLowerCase();
  if (!lookupWord) {
    return enrichToken(unknownHit(''), { resolution_kind: 'unknown', confidence: 'low', role, english: surface });
  }

  if (SEMANTIC_BLOCK.has(lookupWord)) {
    allowSemantic = false;
    allowGuess = false;
  }

  if (hints.concept_hint) {
    const hintHit = lookupByConceptId(ctx, hints.concept_hint);
    if (hintHit.resolved) {
      return enrichToken({ ...hintHit, role, english: surface }, {
        resolution_kind: 'interpreted',
        confidence: 'medium',
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: hints.interpret_reason ?? 'concept hint',
      });
    }
  }

  if (lookupWord.includes(' ')) {
    const phraseHit = resolveEnglishPhrase(lookupWord, ctx);
    if (phraseHit.resolved) {
      return enrichToken({ ...phraseHit, role, english: surface }, {
        resolution_kind: 'direct',
        confidence: 'high',
      });
    }

    if (hints.concept_hint) {
      const hintHit = lookupByConceptId(ctx, hints.concept_hint);
      if (hintHit.resolved) {
        return enrichToken({ ...hintHit, role, english: surface }, {
          resolution_kind: 'interpreted',
          confidence: 'medium',
          interpreted: true,
          interpreted_from: surface,
          interpret_reason: hints.interpret_reason ?? 'concept hint',
        });
      }
    }

    const head = headNounToken(lookupWord.split(/\s+/), { skip: null });
    if (head && head !== lookupWord) {
      const headToken = await resolveEnglishToken(head, ctx, {
        role,
        allowSemantic,
        allowGuess: false,
      });
      if (headToken.resolved) {
        return enrichToken({ ...headToken, english: surface }, {
          interpreted: true,
          interpreted_from: surface,
          interpret_reason: headToken.interpret_reason
            ? `head noun:${head} (${headToken.interpret_reason})`
            : `head noun:${head}`,
        });
      }
    }
  }

  const keys = buildTryKeys(lookupWord, ctx.rules);
  let hit = lookupByKeys(ctx, keys);
  if (hit.resolved) {
    const pastLemma = irregularPastLemma(surface, ctx.rules);
    const interpretedPast = Boolean(pastLemma && hit.past_lemma);
    return enrichToken({ ...hit, role, english: surface }, {
      resolution_kind: 'direct',
      confidence: 'high',
      concept_id: hit.concept_id ?? hit.english,
      interpreted: interpretedPast,
      interpreted_from: interpretedPast ? surface : null,
      interpret_reason: interpretedPast ? 'irregular past' : null,
    });
  }

  if (hints.concept_hint) {
    hit = lookupByConceptId(ctx, hints.concept_hint);
    if (hit.resolved || hit.concept_id) {
      return enrichToken({ ...hit, role, english: surface }, {
        resolution_kind: hit.resolved ? 'interpreted' : 'semantic',
        confidence: hit.resolved ? 'medium' : 'low',
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: hints.interpret_reason ?? 'concept hint fallback',
      });
    }
  }

  const interp = interpretToConceptRelaxed(surface, role, ctx.rules)
    ?? interpretToConceptRelaxed(lemmatizeEnglish(surface, ctx.rules), role, ctx.rules);
  let conceptIds = [];
  if (interp?.concept_id) {
    conceptIds.push(interp.concept_id);
    hit = lookupByConceptId(ctx, interp.concept_id);
    if (hit.resolved) {
      return enrichToken({ ...hit, role, english: surface }, {
        resolution_kind: 'interpreted',
        confidence: 'medium',
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: interp.reason,
        interpret_class: interp.class,
      });
    }
  }

  const bases = agentiveBase(lookupWord);
  if (bases) {
    for (const base of bases) {
      const agentHit = lookupAliasEntry(ctx.aliasIndex, buildTryKeys(base, ctx.rules));
      if (agentHit?.hit?.concept_id) {
        conceptIds.push(agentHit.hit.concept_id);
        if (ctx.rootById.has('person')) conceptIds.push('person');
        break;
      }
    }
  }

  if (allowSemantic) {
    const { synonyms, hypernym_concepts } = await expandWord(lookupWord);

    for (const cid of hypernym_concepts) {
      if (!ctx.rootById.has(cid)) continue;
      conceptIds.push(cid);
      hit = lookupByConceptId(ctx, cid);
      if (hit.resolved) {
        return enrichToken({ ...hit, role, english: surface }, {
          resolution_kind: 'semantic',
          confidence: 'medium',
          interpreted: true,
          interpreted_from: surface,
          interpret_reason: `hypernym:${cid}`,
        });
      }
    }

    for (const syn of synonyms) {
      const synKeys = buildTryKeys(syn.replace(/\s+/g, '_'), ctx.rules);
      synKeys.push(syn, lemmatizeEnglish(syn, ctx.rules));
      const synHit = lookupAliasEntry(ctx.aliasIndex, [...new Set(synKeys)]);
      if (synHit?.hit?.concept_id) {
        conceptIds.push(synHit.hit.concept_id);
        hit = lookupByConceptId(ctx, synHit.hit.concept_id);
        if (hit.resolved) {
          return enrichToken({ ...hit, role, english: surface }, {
            resolution_kind: 'semantic',
            confidence: 'medium',
            interpreted: true,
            interpreted_from: surface,
            interpret_reason: `synonym:${syn}`,
          });
        }
      }
    }
  }

  conceptIds = [...new Set(conceptIds.filter(id => ctx.rootById.has(id)))];

  if (allowGuess && conceptIds.length >= 1) {
    const guessIds = conceptIds.length >= 2 ? conceptIds : conceptIds;
    let guess = null;
    if (guessIds.length >= 2) {
      guess = await tryGuessSpelling(guessIds, ctx);
    } else if (guessIds.length === 1) {
      const single = lookupByConceptId(ctx, guessIds[0]);
      if (single.resolved) {
        return enrichToken({ ...single, role, english: surface }, {
          resolution_kind: single.fonoran ? 'interpreted' : 'semantic',
          confidence: 'medium',
          interpreted: true,
          interpreted_from: surface,
          interpret_reason: interp?.reason ?? 'nearest concept',
        });
      }
    }
    if (guess) {
      return enrichToken({
        english: surface,
        fonoran: guess.spelling,
        parts: guess.roots,
        resolved: true,
        gloss: guess.breakdown,
        kind: 'guessed',
        source: 'generator',
        pronunciation: pronunciationForParts(guess.roots),
        role,
      }, {
        resolution_kind: 'guessed',
        confidence: guess.unique ? 'medium' : 'low',
        concept_id: guess.components?.map(c => c.id).join('+') ?? null,
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: 'guessed compound',
        guessed: true,
        guess_components: guess.components,
      });
    }

    if (conceptIds.length === 1) {
      const partial = lookupByConceptId(ctx, conceptIds[0]);
      if (partial.concept_id && !partial.resolved) {
        return enrichToken({ ...partial, role, english: surface, resolved: false }, {
          resolution_kind: 'unknown',
          confidence: 'low',
          concept_id: conceptIds[0],
          interpreted: true,
          interpreted_from: surface,
          interpret_reason: interp?.reason ?? 'concept without spelling',
        });
      }
    }
  }

  return enrichToken({ ...unknownHit(lookupWord), role, english: surface }, {
    resolution_kind: 'unknown',
    confidence: 'low',
  });
}

/** Expand unresolved tokens via WordNet for word-generator suggestComponents. */
export async function expandTokenToConcept(token, ctx) {
  const { synonyms, hypernym_concepts } = await expandWord(token);
  for (const cid of hypernym_concepts) {
    if (ctx.rootById.has(cid)) {
      return { concept_id: cid, via: `hypernym:${cid}` };
    }
  }
  for (const syn of synonyms) {
    const keys = [syn, syn.replace(/\s+/g, '_'), lemmatizeEnglish(syn, ctx.rules)];
    const hit = lookupAliasEntry(ctx.aliasIndex, keys);
    if (hit?.hit?.concept_id && ctx.rootById.has(hit.hit.concept_id)) {
      return { concept_id: hit.hit.concept_id, via: `synonym:${syn}` };
    }
  }
  return null;
}
