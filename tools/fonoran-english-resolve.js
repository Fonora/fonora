/**
 * Unified, concept-first English → Fonoran resolution for Translator and Word
 * Generator. Deterministic ordered tiers with a hard confidence floor:
 *   direct (strong alias/concept id/lemma) → interpreted (curated rule / hint /
 *   morphology / transparent assembly) → honest gap.
 * WordNet is not consulted at runtime (moved to an offline curation assistant);
 * below-floor elements surface as honest gaps rather than fabricated words.
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
import { checkCompoundBoundary } from './fonoran-gen3-readability.js';
import { buildConceptAliasIndex, loadRuntimeConceptInventory, buildRootById, loadLocalization } from './fonoran-concepts.js';
// WordNet is imported ONLY for the offline curation assistant (suggestGapConcepts).
// It is never used by resolveEnglishToken / the runtime translate path.
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

const RESOLVE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONCEPT_BRIDGES_PATH = join(RESOLVE_ROOT, 'data/fonoran-concept-bridges.json');

/**
 * Former root spellings that still appear as concept ids in cached LLM frames
 * after a respell (e.g. banned fa → one/lu). Resolve through the live concept id
 * so Learn / translator recompiles stay current without rewarming every cache row.
 */
const RETIRED_SPELLING_CONCEPT_IDS = Object.freeze({
  fa: 'one',
});

// Optional local-only loanword glossaries (not tracked in this repo). Drop a
// JSON glossary at data/local/glossary.json to pin proper-noun/loanword
// decisions for a private corpus; absent by default.
const LOCAL_GLOSSARY_PATHS = [join(RESOLVE_ROOT, 'data/local/glossary.json')];

let conceptBridgeCache = null;

/**
 * Load curated concept bridges (data/fonoran-concept-bridges.json) plus any
 * optional local glossaries (data/local/glossary.json) into one flat lookup:
 *   Map<englishForm, { compose?: string[], concept?: string, loan?: bool, roman?, gloss? }>
 * Bridges are meaning-attempts over APPROVED concepts (docs Rule 5/7): they add
 * a `composed` / `interpreted` / `loan` tier so abstract text resolves instead
 * of red-gapping, without ever inventing a root spelling.
 */
export async function loadConceptBridges() {
  if (conceptBridgeCache) return conceptBridgeCache;
  const map = new Map();

  const add = (form, entry) => {
    const key = String(form ?? '').trim().toLowerCase();
    if (!key || map.has(key)) return;
    map.set(key, entry);
  };

  // Optional local glossaries load FIRST so their pinned decisions (e.g. a
  // proper noun kept as a loanword) win over the general bridge set.
  for (const glossaryPath of LOCAL_GLOSSARY_PATHS) {
    try {
      const raw = JSON.parse(await readFile(glossaryPath, 'utf8'));
      for (const bucket of ['loans', 'compose', 'concept']) {
        for (const [term, spec] of Object.entries(raw[bucket] ?? {})) {
          add(term, {
            compose: Array.isArray(spec.compose) ? spec.compose : null,
            concept: spec.concept ?? null,
            loan: bucket === 'loans' || Boolean(spec.loan),
            roman: spec.roman ?? null,
            gloss: spec.gloss ?? null,
          });
        }
      }
    } catch { /* glossary optional */ }
  }

  try {
    const raw = JSON.parse(await readFile(CONCEPT_BRIDGES_PATH, 'utf8'));
    for (const [id, spec] of Object.entries(raw.bridges ?? {})) {
      const entry = {
        compose: Array.isArray(spec.compose) ? spec.compose : null,
        concept: spec.concept ?? null,
        loan: Boolean(spec.loan),
        roman: spec.roman ?? null,
        gloss: spec.gloss ?? null,
      };
      add(id, entry);
      for (const form of spec.forms ?? []) add(form, entry);
    }
  } catch { /* bridges file optional */ }

  conceptBridgeCache = map;
  return map;
}

/** Reset the concept-bridge cache (tests / hot reload). */
export function resetConceptBridgeCache() {
  conceptBridgeCache = null;
}

/** Hardcoded surface → lemma shortcuts shared with translator frame parser. */
export const IRREGULAR = {
  fought: 'war',
  fight: 'war',
  fighting: 'war',
  fights: 'war',
  loved: 'love',
  loves: 'love',
  loving: 'love',
  laughed: 'laugh',
  laughing: 'laugh',
  laughs: 'laugh',
  lost: 'lose',
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

/**
 * Curated English → concept bridges. Deliberate, human-authored mappings for
 * meaning-bearing words that have no direct alias but a clear nearest concept
 * (e.g. `reason` → think, `from` → source). This is NOT WordNet guessing: each
 * entry is a reviewed decision, applied as a concept hint.
 */
const SEMANTIC_BRIDGE = new Map([
  ['reason', 'think'],
  ['from', 'source'],
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
    // Gap provenance: why an element did not resolve, plus a non-authoritative
    // low-confidence suggestion for the human curation queue (never surfaced).
    gap_reason: meta.gap_reason ?? base.gap_reason ?? null,
    suggestion: meta.suggestion ?? base.suggestion ?? null,
  };
}

/**
 * Build an honest gap token. Below the resolver's confidence floor an element
 * surfaces as `[english]` — never a fabricated word (docs Design Rule 0). An
 * optional `suggestion` (e.g. a demoted weak/gloss alias) is carried for the
 * curation queue but is deliberately not used as output.
 */
function gapToken(surface, role, { reason = 'no confident concept', suggestion = null, conceptId = null } = {}) {
  return enrichToken({ ...unknownHit(surface), role, english: surface, resolved: false, fonoran: null }, {
    resolution_kind: 'unknown',
    confidence: 'low',
    concept_id: conceptId,
    gap_reason: reason,
    suggestion,
  });
}

/**
 * Build shared resolution context (alias index + roots + compounds + rules).
 */
export async function buildResolveContext(lab = null, { devLab = false } = {}) {
  const liveLab = lab ?? await getLab();
  const inventory = await loadRuntimeConceptInventory({ lab: liveLab });
  const rules = await loadInterpretationRules().catch(() => null);
  const locData = await loadLocalization('en');
  const bridges = await loadConceptBridges();
  const aliasIndex = buildConceptAliasIndex(inventory.concepts, liveLab, locData, {
    labFirst: !devLab,
    devLab,
  });

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
  const spellingByConceptId = new Map();
  const parseInventory = [...rootInventory];
  for (const s of liveLab.sounds ?? []) {
    if (s.state === 'rejected' || !s.spelling || !s.concept_id) continue;
    spellingByConceptId.set(String(s.spelling).toLowerCase(), s.concept_id);
  }
  // Include compounds for translator context. Dev mode uses the full non-rejected lab.
  const TRANSLATOR_COMPOUND_STATES = devLab
    ? ['draft', 'needs_review', 'approved', 'revised']
    : [...REUSABLE_WORD_STATES, 'needs_review'];
  const compoundStateRank = (st) => {
    if (devLab) {
      const order = { approved: 4, revised: 3, needs_review: 2, draft: 1 };
      return order[st] ?? 0;
    }
    const order = { approved: 3, revised: 2, needs_review: 1 };
    return order[st] ?? 0;
  };
  for (const c of liveLab.compounds ?? []) {
    if (!TRANSLATOR_COMPOUND_STATES.includes(c.state) || !c.concept_id || !c.spelling) continue;
    const existing = compoundByConceptId.get(c.concept_id);
    if (existing && compoundStateRank(existing.state) >= compoundStateRank(c.state)) continue;
    compoundByConceptId.set(c.concept_id, {
      id: c.id,
      spelling: c.spelling,
      gloss: c.meaning ?? c.gloss ?? c.concept_id,
      parts: c.parts?.length ? [...c.parts] : null,
      state: c.state,
    });
    spellingByConceptId.set(String(c.spelling).toLowerCase(), c.concept_id);
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
    spellingByConceptId,
    bridges,
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
      composition_roots: compound.parts ?? undefined,
      parts: compound.parts ?? undefined,
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
  const mappedId = ctx.spellingByConceptId?.get(String(conceptId).toLowerCase());
  if (mappedId && mappedId !== conceptId) {
    return lookupByConceptId(ctx, mappedId);
  }
  const retiredId = RETIRED_SPELLING_CONCEPT_IDS[String(conceptId).toLowerCase()];
  if (retiredId && retiredId !== conceptId) {
    return lookupByConceptId(ctx, retiredId);
  }
  return {
    ...unknownHit(conceptId),
    concept_id: conceptId,
    gloss: spec?.gloss ?? conceptId,
  };
}

/**
 * Resolve a list of concept ids to their spellings for transparent composition.
 * Returns null if ANY part is unresolved (never partially fabricate).
 */
function partSpellings(ctx, conceptIds) {
  const specs = [];
  for (const id of conceptIds) {
    const hit = lookupByConceptId(ctx, id);
    if (!hit.resolved || !hit.fonoran) return null;
    specs.push({ id, spelling: hit.fonoran, gloss: hit.gloss ?? id });
  }
  return specs;
}

/**
 * Tier COMPOSED: build a transparent compound from approved concepts at runtime
 * (docs/fonoran-grammar.md Rule 5 + Rule 7 stage 5). Parts fuse into one written
 * word only when every boundary is clean (Compound Boundary Constraint); a
 * colliding boundary falls back to a space-separated phrase (still valid,
 * modifier-before-head) rather than silently altering sounds. Never invents a
 * spelling: every part comes from an approved root or compound.
 */
export function composeConceptToken(ctx, conceptIds, { role = 'concept', english = '', gloss = null, reason = 'concept bridge' } = {}) {
  const ids = (conceptIds ?? []).map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
  if (ids.length < 2) return null;
  const specs = partSpellings(ctx, ids);
  if (!specs) return null;
  const parts = specs.map(s => s.spelling);
  const boundary = checkCompoundBoundary(parts);
  const fused = boundary.valid ? parts.join('') : parts.join(' ');
  const composedGloss = gloss ?? specs.map(s => s.gloss).join(' + ');
  const conceptKey = ids.join('+');
  return enrichToken({
    english: english || conceptKey,
    fonoran: fused,
    parts,
    composition_roots: parts,
    resolved: true,
    gloss: composedGloss,
    kind: 'compound',
    source: 'bridge_compose',
    concept_id: conceptKey,
    pronunciation: pronunciationForParts(parts),
  }, {
    role,
    resolution_kind: 'composed',
    confidence: 'medium',
    concept_id: conceptKey,
    interpreted: true,
    interpreted_from: english || conceptKey,
    interpret_reason: `${reason}:${conceptKey}${boundary.valid ? '' : ' (spaced: boundary collision)'}`,
    guess_components: ids,
  });
}

/**
 * Tier LOAN: a phonetic loanword, always visibly marked (roman wrapped «…»).
 * Used for proper nouns / terms with no recoverable Fonoran path (the
 * "iPhone stays iPhone" rule). The `parts` carry a Fonora-roman approximation so
 * the playback pipeline can render Fonora script; the surface stays marked so a
 * reader knows it is borrowed, not composed from roots.
 */
export function loanToken({ role = 'concept', english = '', roman = null, gloss = null } = {}) {
  const clean = String(roman ?? english ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const parts = clean ? [clean] : [];
  return enrichToken({
    english,
    fonoran: `\u00ab${clean || String(english).toLowerCase()}\u00bb`,
    parts,
    composition_roots: parts,
    resolved: true,
    gloss: gloss ?? `${english} (loanword)`,
    kind: 'loan',
    loan: true,
    source: 'bridge_loan',
    concept_id: null,
    pronunciation: pronunciationForParts(parts),
  }, {
    role,
    resolution_kind: 'loan',
    confidence: 'low',
    interpreted: true,
    interpreted_from: english,
    interpret_reason: 'loanword (phonetic)',
  });
}

/** Turn a concept-bridge entry into a translator token (compose / concept / loan). */
export function bridgeToToken(ctx, entry, { role = 'concept', english = '' } = {}) {
  if (!entry) return null;
  if (entry.loan) {
    return loanToken({ role, english, roman: entry.roman, gloss: entry.gloss });
  }
  if (Array.isArray(entry.compose) && entry.compose.length >= 2) {
    return composeConceptToken(ctx, entry.compose, { role, english, gloss: entry.gloss });
  }
  if (entry.concept) {
    const hit = lookupByConceptId(ctx, entry.concept);
    if (hit.resolved) {
      return enrichToken({ ...hit, role, english: english || hit.english }, {
        role,
        resolution_kind: 'interpreted',
        confidence: 'medium',
        concept_id: entry.concept,
        interpreted: true,
        interpreted_from: english,
        interpret_reason: `concept bridge:${entry.concept}`,
      });
    }
  }
  return null;
}

/** Look up an English word / concept id in the curated bridges. */
function lookupBridge(ctx, word) {
  const key = String(word ?? '').trim().toLowerCase();
  if (!key || !ctx.bridges) return null;
  return ctx.bridges.get(key) ?? null;
}

/** Resolve an approved concept id to a translator token (LLM frame path). */
export function resolveConceptId(conceptId, ctx, role) {
  const id = String(conceptId ?? '').trim();
  // LLM may emit an explicit compose path, e.g. "think+self".
  if (id.includes('+')) {
    const composed = composeConceptToken(ctx, id.split('+'), { role, english: id, reason: 'frame compose' });
    if (composed) return composed;
  }
  const hit = lookupByConceptId(ctx, conceptId);
  if (hit.resolved) {
    return enrichToken(hit, {
      role,
      concept_id: conceptId,
      resolution_kind: 'direct',
      confidence: 'high',
    });
  }
  // Concept id had no spelling: try a curated bridge (compose / concept / loan)
  // keyed by the id itself before surfacing an honest gap.
  const bridged = bridgeToToken(ctx, lookupBridge(ctx, id.replace(/_/g, ' ')) ?? lookupBridge(ctx, id), { role, english: id });
  if (bridged) return bridged;
  return enrichToken(hit, {
    role,
    concept_id: conceptId,
    resolution_kind: 'unknown',
    confidence: 'low',
  });
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

/** Non-authoritative curation suggestion built from a demoted weak alias. */
function weakSuggestionFromHit(hit) {
  if (!hit?.concept_id && !hit?.fonoran) return null;
  return {
    kind: 'weak_alias',
    concept_id: hit.concept_id ?? null,
    fonoran: hit.fonoran ?? null,
    reason: `weak alias:${hit.matched_alias ?? hit.lookup ?? ''}`.replace(/:$/, ''),
  };
}

/**
 * Deterministic, concept-first English → Fonoran resolution for one token or
 * phrase. Ordered tiers with a hard confidence floor:
 *
 *   HIGH   (direct):      curated strong alias / concept id / lemma / phrase.
 *   MEDIUM (interpreted): curated concept hint, curated interpretation rule
 *                         (spatial_path / classes / idioms), irregular past,
 *                         head-noun of a phrase, agentive morphology, and
 *                         transparent compound assembly over strong aliases.
 *   BELOW FLOOR:          honest gap — surfaces as `[english]`, never a
 *                         fabricated word (docs Design Rule 0). A demoted weak
 *                         (gloss-derived) alias is carried as a curation
 *                         `suggestion` but is NOT emitted as output.
 *
 * WordNet is no longer consulted at runtime; it is an offline curation
 * assistant (tools/fonoran-semantic-lookup.js). `allowSemantic`/`allowGuess`/
 * `avoidConceptIds` are retained for call-site compatibility but no longer gate
 * any runtime guessing.
 */
export async function resolveEnglishToken(english, ctx, {
  role = 'concept',
  hints = {},
  allowSemantic = true, // eslint-disable-line no-unused-vars
  allowGuess = true, // eslint-disable-line no-unused-vars
  surfaceEnglish = null,
  avoidConceptIds = null, // eslint-disable-line no-unused-vars
} = {}) {
  const surface = String(surfaceEnglish ?? english ?? '').trim();
  const lookupWord = role === 'object' ? landmarkPhrase(surface) : String(english ?? '').trim().toLowerCase();
  if (!lookupWord) {
    return gapToken(surface, role, { reason: 'empty token' });
  }

  // Curated semantic bridge (e.g. reason → think, from → source): a deliberate
  // English → concept mapping, treated as a concept hint (not a WordNet guess).
  const bridgeConcept = SEMANTIC_BRIDGE.get(lookupWord);
  if (bridgeConcept && !hints.concept_hint) {
    hints.concept_hint = bridgeConcept;
    hints.interpret_reason = hints.interpret_reason ?? 'semantic bridge';
  }

  // Pinned loanword: a proper noun / coined name explicitly locked as a loan in
  // a glossary is authoritative over any coincidental lexicon alias, so a name
  // reads identically everywhere (e.g. "Platform" ≠ the ordinary word "raft").
  const pinnedLoan = lookupBridge(ctx, lookupWord) ?? lookupBridge(ctx, surface.toLowerCase());
  if (pinnedLoan?.loan) {
    return loanToken({ role, english: surface, roman: pinnedLoan.roman, gloss: pinnedLoan.gloss });
  }

  // Tier MEDIUM: curated concept hint.
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

  let weakSuggestion = null;

  if (lookupWord.includes(' ')) {
    const phraseHit = resolveEnglishPhrase(lookupWord, ctx);
    // Tier HIGH: strong multi-word alias.
    if (phraseHit.resolved && phraseHit.resolution_kind !== 'alias_weak') {
      return enrichToken({ ...phraseHit, role, english: surface }, {
        resolution_kind: 'direct',
        confidence: 'high',
      });
    }
    // Weak phrase alias → curation suggestion only, never output.
    if (phraseHit.resolution_kind === 'alias_weak') {
      weakSuggestion = weakSuggestion ?? weakSuggestionFromHit(phraseHit);
    }

    // Tier MEDIUM: head noun of the phrase.
    const head = headNounToken(lookupWord.split(/\s+/), { skip: null });
    if (head && head !== lookupWord) {
      const headToken = await resolveEnglishToken(head, ctx, { role });
      if (headToken.resolved) {
        return enrichToken({ ...headToken, english: surface }, {
          interpreted: true,
          interpreted_from: surface,
          interpret_reason: headToken.interpret_reason
            ? `head noun:${head} (${headToken.interpret_reason})`
            : `head noun:${head}`,
        });
      }
      if (headToken.suggestion) weakSuggestion = weakSuggestion ?? headToken.suggestion;
    }

    // Tier MEDIUM: transparent phrase assembly over strong aliases only.
    const phraseAssembly = await tryTransparentPhraseAssembly(lookupWord, ctx, role);
    if (phraseAssembly) return phraseAssembly;
  }

  const keys = buildTryKeys(lookupWord, ctx.rules);
  let hit = lookupByKeys(ctx, keys);
  if (hit.resolved) {
    const weakAlias = hit.alias_strength === 'weak';
    if (!weakAlias) {
      // Tier HIGH: strong alias / concept id / lemma.
      const pastLemma = irregularPastLemma(surface, ctx.rules);
      const interpretedPast = Boolean(pastLemma && hit.past_lemma);
      return enrichToken({ ...hit, role, english: surface }, {
        resolution_kind: interpretedPast ? 'interpreted' : 'direct',
        confidence: interpretedPast ? 'medium' : 'high',
        concept_id: hit.concept_id ?? hit.english,
        interpreted: interpretedPast,
        interpreted_from: interpretedPast ? surface : null,
        interpret_reason: interpretedPast ? 'irregular past' : null,
      });
    }
    // Weak single-word alias → curation suggestion only, never output.
    weakSuggestion = weakSuggestion ?? weakSuggestionFromHit(hit);
  }

  // Tier MEDIUM: curated interpretation rule (spatial_path / classes / idioms).
  const interp = interpretToConceptRelaxed(surface, role, ctx.rules)
    ?? interpretToConceptRelaxed(lemmatizeEnglish(surface, ctx.rules), role, ctx.rules);
  if (interp?.concept_id) {
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
    // Rule matched a concept that has no spelling yet: honest gap, but keep the
    // concept id so the curation queue knows which root to grow.
    return gapToken(surface, role, {
      reason: `interpretation rule matched unspelled concept:${interp.concept_id}`,
      conceptId: interp.concept_id,
      suggestion: weakSuggestion,
    });
  }

  // NOTE: naive agentive `-er/-or/-ist` stripping is intentionally NOT a runtime
  // tier. Without part-of-speech disambiguation it fabricates (e.g. flower→flow,
  // power→pow, water→wat). Genuine agentive nouns (healer, hunter, traveler) are
  // curated as explicit aliases; unknown ones surface as honest gaps and the
  // offline WordNet assistant proposes agentive splits for human review.

  // Tier MEDIUM: transparent single-word assembly over strong aliases only.
  const wordAssembly = await tryTransparentWordAssembly(lookupWord, ctx, role);
  if (wordAssembly) return wordAssembly;

  // Tier COMPOSED / CONCEPT / LOAN: curated concept bridge for an abstract or
  // technical word (docs/fonoran-grammar.md Rule 5/7). Tried before the honest
  // gap so direct/interpreted lexicon still wins, but abstract prose composes
  // from roots (or falls back to a marked loanword) instead of red-gapping.
  const bridge = lookupBridge(ctx, lookupWord)
    ?? lookupBridge(ctx, lemmatizeEnglish(lookupWord, ctx.rules))
    ?? lookupBridge(ctx, surface);
  if (bridge) {
    const bridged = bridgeToToken(ctx, bridge, { role, english: surface });
    if (bridged) return bridged;
  }

  // Below the confidence floor → honest gap (never fabricate a word).
  return gapToken(surface, role, {
    reason: weakSuggestion ? 'only a weak (gloss-derived) alias matched' : 'no confident concept',
    suggestion: weakSuggestion,
  });
}

/**
 * OFFLINE curation assistant: propose ranked, human-reviewable concept mappings
 * for an unresolved English word, disambiguated by slot role via WordNet (WSD +
 * POS). Each suggestion points at an EXISTING Fonoran root the human can approve
 * into localizations/en.json. This is deliberately NOT called from
 * resolveEnglishToken — the runtime never guesses (docs Design Rule 0).
 *
 * @returns {Promise<Array<{ concept_id, fonoran, gloss, reason, kind }>>}
 */
export async function suggestGapConcepts(word, role, ctx, { limit = 5 } = {}) {
  const lookupWord = String(word ?? '').trim().toLowerCase();
  if (!lookupWord) return [];
  const suggestions = [];
  const seen = new Set();
  const push = (conceptId, reason) => {
    if (!conceptId || seen.has(conceptId)) return;
    const hit = lookupByConceptId(ctx, conceptId);
    if (!hit.resolved) return;
    seen.add(conceptId);
    suggestions.push({
      concept_id: conceptId,
      fonoran: hit.fonoran,
      gloss: hit.gloss ?? conceptId,
      reason,
      kind: 'wordnet',
    });
  };

  // A demoted weak (gloss-derived) alias is the cheapest suggestion.
  const weakHit = lookupByKeys(ctx, buildTryKeys(lookupWord, ctx.rules));
  if (weakHit.resolved && weakHit.alias_strength === 'weak' && weakHit.concept_id) {
    push(weakHit.concept_id, `weak alias:${weakHit.matched_alias ?? lookupWord}`);
  }

  let expanded;
  try {
    expanded = await expandWord(lookupWord, { role });
  } catch {
    return suggestions.slice(0, limit);
  }
  const { synonyms = [], hypernym_concepts = [] } = expanded ?? {};

  const hypernymPick = pickHypernymConcept(hypernym_concepts, role);
  const rankedHypernyms = hypernymPick
    ? [hypernymPick, ...hypernym_concepts.filter(c => c !== hypernymPick)]
    : hypernym_concepts;
  for (const cid of rankedHypernyms) push(cid, `hypernym:${cid}`);

  for (const syn of synonyms) {
    const synKeys = [...new Set([
      ...buildTryKeys(syn.replace(/\s+/g, '_'), ctx.rules),
      syn,
      lemmatizeEnglish(syn, ctx.rules),
    ])];
    const synHit = lookupAliasEntry(ctx.aliasIndex, synKeys);
    if (synHit?.hit?.concept_id && synHit.hit.alias_strength !== 'weak') {
      push(synHit.hit.concept_id, `synonym:${syn}`);
    }
  }

  return suggestions.slice(0, limit);
}
