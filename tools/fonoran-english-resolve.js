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
import { buildConceptAliasIndex, loadRuntimeConceptInventory, buildRootById, loadLocalization } from './fonoran-concepts.js';
import { expandWord, pickHypernymConcept } from './fonoran-semantic-lookup.js';
import { getLab } from './fonoran-sound-bucket.js';
import {
  loadInterpretationRules,
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

/** Block WordNet/hypernym guessing on function words. */
const SEMANTIC_BLOCK = new Set([
  'something', 'anything', 'nothing', 'everything', 'another', 'else', 'someone', 'anyone',
  'spirit',
]);

/** Force nearest concept before WordNet (honest bridges). */
const SEMANTIC_BRIDGE = new Map([
  ['reason', 'think'],
  // `from` carries origin meaning; bridge it to the existing `source` root
  // instead of silently dropping it as a function word.
  ['from', 'source'],
]);

/** Synonyms to reject during semantic tier. */
const SEMANTIC_DENY_SYNONYMS = new Map([
  ['reason', new Set(['ground', 'earth'])],
  ['spirit', new Set(['feel', 'feeling', 'emotion'])],
]);

/** Conjunctions — not content words. */
export const CONJUNCTIONS = new Set(['and', 'or', 'but', 'nor', 'yet', 'so']);

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

const ASSEMBLY_STOP = new Set([
  'to', 'in', 'at', 'on', 'of', 'by', 'as', 'an', 'or', 'if', 'so', 'do', 'be', 'we', 'he', 'ye',
  'way', 'side', 'line', 'like', 'less', 'ness', 'ful',
]);

function assemblyKeys(aliasIndex) {
  return [...aliasIndex.keys()]
    .filter(k => !k.includes(' ') && k.length >= 3 && !ASSEMBLY_STOP.has(k))
    .sort((a, b) => b.length - a.length);
}

function segmentEnglishWord(word, aliasIndex) {
  const w = String(word ?? '').trim().toLowerCase();
  if (w.length < 4) return null;
  const keys = assemblyKeys(aliasIndex);
  const solutions = [];
  function dfs(start, parts) {
    if (start === w.length) {
      if (parts.length >= 2) solutions.push([...parts]);
      return;
    }
    for (const key of keys) {
      if (key.length <= w.length - start && w.startsWith(key, start)) {
        dfs(start + key.length, [...parts, key]);
      }
    }
  }
  dfs(0, []);
  return solutions.length === 1 ? solutions[0] : null;
}

function assemblyToken(parts, resolved, surface, role, reason) {
  const fonoranParts = resolved.map(r => r.fonoran).filter(Boolean);
  if (!fonoranParts.length) return null;
  return enrichToken({
    english: surface,
    fonoran: fonoranParts.join(' '),
    parts: fonoranParts,
    resolved: true,
    gloss: resolved.map(r => r.gloss ?? r.english).join(' + '),
    kind: 'compound',
    source: 'assembly',
    pronunciation: pronunciationForParts(fonoranParts),
  }, {
    resolution_kind: 'interpreted',
    confidence: 'medium',
    role,
    interpreted: true,
    interpreted_from: surface,
    interpret_reason: reason,
    guess_components: parts,
  });
}

async function tryTransparentWordAssembly(word, ctx, role) {
  const parts = segmentEnglishWord(word, ctx.aliasIndex);
  if (!parts) return null;
  const resolved = [];
  for (const part of parts) {
    const hit = lookupByKeys(ctx, buildTryKeys(part, ctx.rules));
    if (!hit.resolved || hit.alias_strength === 'weak') return null;
    resolved.push(hit);
  }
  return assemblyToken(parts, resolved, word, role, `transparent assembly:${parts.join('+')}`);
}

async function tryTransparentPhraseAssembly(phrase, ctx, role) {
  const words = String(phrase ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const resolved = [];
  for (const word of words) {
    const hit = lookupByKeys(ctx, buildTryKeys(word, ctx.rules));
    if (!hit.resolved || hit.alias_strength === 'weak') return null;
    resolved.push(hit);
  }
  return assemblyToken(words, resolved, phrase, role, `transparent assembly:${words.join('+')}`);
}

export function tokenizeEnglish(text) {
  return String(text ?? '')
    .trim()
    .match(/[A-Za-z']+/g)
    ?.map(t => {
      // Possession is not lexical in Fonoran: strip the possessive clitic so the
      // bare noun resolves (man's -> man, children's -> children, dogs'/James' -> dogs/james).
      const possessive = t.toLowerCase().replace(/'s$/, '');
      return possessive.replace(/^'+|'+$/g, '');
    })
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
  const locData = await loadLocalization('en');
  const aliasIndex = buildConceptAliasIndex(inventory.concepts, liveLab, locData, { labFirst: true });

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
      const weakAlias = hit.alias_strength === 'weak';
      return enrichToken(hit, {
        resolution_kind: weakAlias ? 'alias_weak' : 'direct',
        confidence: weakAlias ? 'low' : 'high',
        concept_id: hit.concept_id ?? hit.english,
        interpreted: weakAlias,
        interpreted_from: weakAlias ? raw : null,
        interpret_reason: weakAlias ? `weak alias:${hit.matched_alias ?? candidate}` : null,
        lookup: candidate,
      });
    }
  }
  return unknownHit(raw);
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
  avoidConceptIds = null,
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

  const bridgeConcept = SEMANTIC_BRIDGE.get(lookupWord);
  if (bridgeConcept && !hints.concept_hint) {
    hints.concept_hint = bridgeConcept;
    hints.interpret_reason = hints.interpret_reason ?? 'semantic bridge';
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
      const weakAlias = phraseHit.resolution_kind === 'alias_weak';
      return enrichToken({ ...phraseHit, role, english: surface }, {
        resolution_kind: weakAlias ? 'alias_weak' : 'direct',
        confidence: weakAlias ? 'low' : 'high',
        interpreted: phraseHit.interpreted ?? false,
        interpreted_from: phraseHit.interpreted_from ?? null,
        interpret_reason: phraseHit.interpret_reason ?? null,
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
        avoidConceptIds,
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

    const phraseAssembly = await tryTransparentPhraseAssembly(lookupWord, ctx, role);
    if (phraseAssembly) return phraseAssembly;
  }

  const keys = buildTryKeys(lookupWord, ctx.rules);
  let hit = lookupByKeys(ctx, keys);
  if (hit.resolved) {
    const pastLemma = irregularPastLemma(surface, ctx.rules);
    const interpretedPast = Boolean(pastLemma && hit.past_lemma);
    // A weak (description/gloss-derived) alias is a low-confidence match — flag
    // it so the quality gate can treat it as a review item, not a clean hit.
    const weakAlias = hit.alias_strength === 'weak';
    return enrichToken({ ...hit, role, english: surface }, {
      resolution_kind: weakAlias ? 'alias_weak' : 'direct',
      confidence: weakAlias ? 'low' : 'high',
      concept_id: hit.concept_id ?? hit.english,
      interpreted: interpretedPast,
      interpreted_from: interpretedPast ? surface : null,
      interpret_reason: interpretedPast ? 'irregular past' : (weakAlias ? `weak alias:${hit.matched_alias ?? lookupWord}` : null),
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

  const wordAssembly = await tryTransparentWordAssembly(lookupWord, ctx, role);
  if (wordAssembly) return wordAssembly;

  if (allowSemantic) {
    const { synonyms, hypernym_concepts } = await expandWord(lookupWord);
    const hypernymPick = pickHypernymConcept(hypernym_concepts, role);
    const hypernymCandidates = hypernymPick
      ? [hypernymPick, ...hypernym_concepts.filter(c => c !== hypernymPick)]
      : hypernym_concepts;

    for (const cid of hypernymCandidates) {
      if (avoidConceptIds?.has(cid)) continue;
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
      const synNorm = String(syn).toLowerCase().replace(/_/g, ' ').trim();
      const denied = SEMANTIC_DENY_SYNONYMS.get(lookupWord);
      if (denied?.has(synNorm)) continue;
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

  // Honest single-concept fallback: map to the nearest existing root if one
  // exists. We never fabricate a new multi-root compound — an unmatched word
  // surfaces as a gap so the language can be grown deliberately.
  if (allowGuess && conceptIds.length >= 1) {
    const single = lookupByConceptId(ctx, conceptIds[0]);
    if (single.resolved) {
      return enrichToken({ ...single, role, english: surface }, {
        resolution_kind: 'semantic',
        confidence: 'medium',
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: interp?.reason ?? 'nearest concept',
      });
    }
    if (single.concept_id && !single.resolved) {
      return enrichToken({ ...single, role, english: surface, resolved: false }, {
        resolution_kind: 'unknown',
        confidence: 'low',
        concept_id: conceptIds[0],
        interpreted: true,
        interpreted_from: surface,
        interpret_reason: interp?.reason ?? 'concept without spelling',
      });
    }
  }

  return enrichToken({ ...unknownHit(lookupWord), role, english: surface }, {
    resolution_kind: 'unknown',
    confidence: 'low',
  });
}
