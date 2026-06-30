/**
 * Unified Fonoran concept inventory.
 * Concepts (not English words) are the semantic authority across UI and translator.
 * English is one localization stored in data/localizations/en.json — not the canonical meaning.
 */

import { romanToIpa } from './fonoran-pronunciation.js';
import { readDoc } from './fonoran-store.js';

const STOP = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'are', 'be', 'with',
  'any', 'all', 'one', 'not', 'that', 'this', 'from', 'into', 'by', 'as', 'it', 'its',
]);

/** Cache: locale code → entries object from localization JSON. */
const localizationCache = new Map();

/**
 * Load the localization file for a given locale (e.g. 'en').
 * Returns an object keyed by concept id: { label, aliases }.
 * Caches the result in memory until clearLocalizationCache() is called.
 */
export async function loadLocalization(locale = 'en') {
  if (localizationCache.has(locale)) return localizationCache.get(locale);
  if (locale !== 'en') {
    localizationCache.set(locale, {});
    return {};
  }
  try {
    const data = await readDoc('localization_en');
    const entries = data?.entries ?? {};
    localizationCache.set(locale, entries);
    return entries;
  } catch {
    localizationCache.set(locale, {});
    return {};
  }
}

/** Invalidate the in-memory cache for a locale after a write. */
export function clearLocalizationCache(locale = 'en') {
  localizationCache.delete(locale);
}

/** Return the English-localized aliases for a concept id. */
export function extraAliasesForLocale(id, locData) {
  return [...(locData[id]?.aliases ?? [])];
}

function glossTokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[;,.]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length >= 3 && !STOP.has(w));
}

/**
 * Build the full alias list for a concept.
 * locData: the entries object from loadLocalization(locale).
 * Falls back gracefully to an empty set when locData is omitted.
 */
export function aliasesForConcept(candidate, locData = {}) {
  const out = new Set();
  const id = candidate.id;
  out.add(id);
  out.add(id.replace(/_/g, ' '));

  const display = String(candidate.concept ?? candidate.description ?? candidate.gloss ?? '').split(';')[0].trim().toLowerCase();
  if (display) out.add(display);

  for (const w of glossTokens(candidate.concept ?? candidate.description ?? candidate.gloss)) out.add(w);

  const stored = candidate.aliases ?? candidate.stored_aliases;
  if (Array.isArray(stored) && stored.length) {
    for (const a of stored) out.add(String(a).toLowerCase());
  } else {
    for (const a of locData[id]?.aliases ?? []) out.add(a.toLowerCase());
  }

  return [...out].filter(Boolean);
}

export function conceptRecord(candidate, approvedRoot = null, primitive = null, locData = {}) {
  const description = primitive?.description ?? primitive?.gloss ?? candidate.concept;
  const domain = primitive?.domain ?? candidate.domain;
  const spelling = approvedRoot?.spelling ?? candidate.spelling;
  // Aliases stored directly on the primitive (legacy) take precedence; otherwise use locale data.
  const storedAliases = primitive?.aliases ?? locData[candidate.id]?.aliases ?? null;
  return {
    id: candidate.id,
    concept: description,
    domain,
    spelling,
    ipa: approvedRoot?.ipa ?? candidate.ipa ?? (spelling ? romanToIpa(spelling) : null),
    aliases: aliasesForConcept({ id: candidate.id, concept: description, aliases: storedAliases }, locData),
    stored_aliases: storedAliases,
    status: candidate.status,
    reason: candidate.reason ?? null,
    pronunciation_ease: candidate.pronunciation_ease ?? null,
    semantic_usefulness: candidate.semantic_usefulness ?? null,
    plain_description: primitive?.plain_description ?? candidate.plain_description ?? null,
    primitive_test_note: primitive?.primitive_test_note ?? candidate.primitive_test_note ?? null,
    suggested_status: primitive?.suggested_status ?? candidate.suggested_status ?? 'primitive',
    priority_class: primitive?.priority_class ?? candidate.priority_class ?? null,
  };
}

export async function loadConceptInventory(locale = 'en') {
  const locData = await loadLocalization(locale);

  const [candidatesFile, approved, semantic] = await Promise.all([
    readDoc('root_candidates'),
    readDoc('approved_roots'),
    readDoc('concept_inventory'),
  ]);
  const candidatesData = candidatesFile ?? { candidates: [] };
  if (!candidatesData.candidates?.length && !candidatesData.version) {
    return { version: '1.0-concepts', concepts: [], concept_count: 0 };
  }

  const approvedData = approved ?? { roots: [] };
  const approvedById = Object.fromEntries((approvedData.roots ?? []).map(r => [r.id, r]));

  const semanticData = semantic ?? { primitives: [] };
  const primitiveById = Object.fromEntries((semanticData.primitives ?? []).map(p => [p.id, p]));

  const candidates = candidatesData.candidates ?? [];

  // After a blank-slate reset the review queue is empty, but the semantic
  // inventory still lists concepts — just without assigned sounds yet.
  if (!candidates.length && Object.keys(primitiveById).length) {
    const concepts = Object.values(primitiveById).map(p => conceptRecord({
      id: p.id,
      concept: p.description ?? p.gloss,
      domain: p.domain,
      status: 'pending',
      spelling: '',
      aliases: p.aliases,
    }, null, p, locData));
    return {
      version: '1.0-concepts',
      source: 'data/fonoran-concept-inventory.json',
      generated_at: candidatesData.generated_at ?? null,
      concept_count: concepts.length,
      concepts,
    };
  }

  const concepts = candidates.map(c => conceptRecord(c, approvedById[c.id], primitiveById[c.id], locData));

  return {
    version: '1.0-concepts',
    source: 'data/fonoran-root-candidates.json',
    generated_at: candidatesData.generated_at,
    concept_count: concepts.length,
    concepts,
  };
}

export function labSoundState(sound) {
  if (sound?.state) return sound.state;
  return sound?.meaning?.trim() ? 'needs_review' : 'draft';
}

function labSoundPriority(sound) {
  const state = labSoundState(sound);
  let score = 0;
  if (state === 'approved' || state === 'revised') score += 100;
  else if (state === 'needs_review') score += 50;
  if (sound.created_by === 'user') score += 10;
  const namedAt = sound.named_at ? Date.parse(sound.named_at) : 0;
  return score * 1e15 + namedAt;
}

export function labSoundsByConceptId(lab) {
  const map = new Map();
  for (const s of lab?.sounds ?? []) {
    if (!s.concept_id || labSoundState(s) === 'rejected') continue;
    const existing = map.get(s.concept_id);
    if (!existing || labSoundPriority(s) > labSoundPriority(existing)) {
      map.set(s.concept_id, s);
    }
  }
  return map;
}

function statusFromLabState(state) {
  if (state === 'approved' || state === 'revised') return 'approved';
  if (state === 'rejected') return 'rejected';
  return 'pending';
}

/** Overlay live lab spellings and review state onto static concept inventory records. */
export function mergeLabIntoConcepts(concepts, lab, locData = {}) {
  if (!lab?.sounds?.length) return concepts;

  const labByConceptId = labSoundsByConceptId(lab);

  const conceptIds = new Set(concepts.map(c => c.id));
  const merged = concepts.map(c => {
    const ls = labByConceptId.get(c.id);
    if (!ls) return c;

    const staticSpelling = c.spelling;
    const spelling = ls.spelling;
    const localeAliases = locData[c.id]?.aliases;
    const storedAliases = localeAliases?.length
      ? localeAliases
      : (ls.aliases?.length ? ls.aliases : c.stored_aliases);

    return {
      ...c,
      spelling,
      ipa: romanToIpa(spelling),
      status: statusFromLabState(labSoundState(ls)),
      stored_aliases: storedAliases,
      aliases: aliasesForConcept({ id: c.id, concept: c.concept, aliases: storedAliases }, locData),
      lab_linked: true,
      lab_spelling: spelling,
      lab_meaning: ls.meaning?.trim() || undefined,
      inventory_spelling: staticSpelling && staticSpelling !== spelling ? staticSpelling : undefined,
    };
  });

  for (const s of lab.sounds) {
    if (!s.concept_id || labSoundState(s) === 'rejected' || conceptIds.has(s.concept_id)) continue;
    if (!s.spelling || !s.meaning?.trim()) continue;
    merged.push({
      id: s.concept_id,
      concept: s.meaning.trim(),
      domain: 'being',
      spelling: s.spelling,
      ipa: romanToIpa(s.spelling),
      aliases: aliasesForConcept({
        id: s.concept_id,
        concept: s.meaning.trim(),
        aliases: s.aliases ?? null,
      }, locData),
      stored_aliases: s.aliases ?? null,
      status: statusFromLabState(labSoundState(s)),
      lab_linked: true,
      lab_only: true,
    });
  }

  return merged;
}

/** Runtime inventory: static semantics + live lab spellings and review state. */
export async function loadRuntimeConceptInventory({ lab = null, locale = 'en' } = {}) {
  const base = await loadConceptInventory(locale);
  if (!lab) return base;
  const locData = await loadLocalization(locale);
  const concepts = mergeLabIntoConcepts(base.concepts, lab, locData);
  return {
    ...base,
    concepts,
    concept_count: concepts.length,
    runtime_source: 'lab-merged',
  };
}

/** concept_id → { root, gloss, state } for composition tools. Lab wins on conflict. */
export function buildRootById(concepts, lab = null) {
  const rootById = new Map();
  for (const c of concepts) {
    if (c.spelling) rootById.set(c.id, { root: c.spelling, gloss: c.concept, state: c.status });
  }
  for (const [conceptId, s] of labSoundsByConceptId(lab)) {
    rootById.set(conceptId, {
      root: s.spelling,
      gloss: s.gloss ?? s.meaning ?? rootById.get(conceptId)?.gloss,
      state: s.state,
    });
  }
  return rootById;
}

/** Build translator lookup: alias → concept entry with fonoran spelling. */
export function buildConceptAliasIndex(concepts, lab = null, locData = {}, { labFirst = false } = {}) {
  const index = new Map();

  // Alias strength controls shadowing. `strong` aliases are authoritative
  // (concept id, curated locale/stored aliases, lab meaning + aliases); `weak`
  // aliases are derived from description/gloss text and must never shadow a
  // strong claim. Order-independent rule: a weak registration never overwrites
  // an existing entry, and a strong registration may overwrite an existing weak
  // entry (so e.g. the strong `light` root always wins over the weak `light`
  // token leaked from dark's gloss "no light"). `force` (lab-canonical) wins
  // over anything.
  const register = (alias, entry, { force = false, strength = 'strong' } = {}) => {
    const key = String(alias ?? '').trim().toLowerCase();
    if (!key) return;
    const existing = index.get(key);
    if (existing && !force) {
      const overrideWeak = strength === 'strong' && existing.alias_strength === 'weak';
      if (!overrideWeak) return;
    }
    index.set(key, { ...entry, alias_strength: strength });
  };

  const baseFor = (c) => ({
    english: c.id,
    concept_id: c.id,
    gloss: c.concept,
    fonoran: c.spelling,
    kind: 'primitive',
    parts: [c.spelling],
    source: 'concept',
    domain: c.domain,
  });

  // Strong aliases claim keys first so an incidental description token can never
  // shadow the real concept (e.g. "time" inside before's description).
  const strongAliases = (c) => {
    const out = [c.id, c.id.replace(/_/g, ' ')];
    const stored = c.stored_aliases;
    if (Array.isArray(stored) && stored.length) {
      out.push(...stored.map(a => String(a).toLowerCase()));
    } else {
      out.push(...(locData[c.id]?.aliases ?? []).map(a => a.toLowerCase()));
    }
    return out;
  };
  // Weak aliases derived from the description text: only fill gaps left by strong ones.
  const weakAliases = (c) => {
    const lead = String(c.concept ?? '').split(';')[0].trim().toLowerCase();
    return [lead, ...glossTokens(c.concept)];
  };

  const registerLabSound = (sound, { force = false } = {}) => {
    const meaning = String(sound.meaning ?? '').trim().toLowerCase();
    if (!meaning || !sound.spelling) return;
    const hit = concepts.find(c => c.id === sound.concept_id)
      || concepts.find(c => c.concept.toLowerCase() === meaning)
      || concepts.find(c => c.id === meaning);
    const entry = {
      english: hit?.id ?? sound.concept_id ?? meaning,
      concept_id: sound.concept_id ?? hit?.id ?? null,
      gloss: sound.meaning,
      fonoran: sound.spelling,
      kind: 'primitive',
      parts: [sound.spelling],
      source: 'lab',
      state: sound.state,
    };
    // The sound's own meaning + curated aliases are authoritative (strong).
    register(meaning, entry, { force, strength: 'strong' });

    // Curated strong set = concept id + localized aliases + the meaning label.
    // Lab-sound `aliases` arrays historically also include description/gloss
    // tokens (e.g. dark's "light", path's "travel", surface's "you"); those must
    // be demoted to weak so they can never shadow the real root they belong to.
    const strongSet = new Set([meaning]);
    if (hit) {
      for (const alias of strongAliases(hit)) {
        const key = String(alias).toLowerCase();
        strongSet.add(key);
        register(alias, { ...entry, matched_alias: alias }, { force, strength: 'strong' });
      }
      for (const alias of weakAliases(hit)) {
        register(alias, { ...entry, matched_alias: alias }, { strength: 'weak' });
      }
    } else if (sound.concept_id) {
      strongSet.add(String(sound.concept_id).toLowerCase());
      register(sound.concept_id, { ...entry, matched_alias: sound.concept_id }, { force, strength: 'strong' });
    }
    for (const alias of sound.aliases ?? []) {
      const isStrong = strongSet.has(String(alias).toLowerCase());
      register(alias, { ...entry, matched_alias: alias }, {
        force: force && isStrong,
        strength: isStrong ? 'strong' : 'weak',
      });
    }
  };

  const canonicalLabSounds = [...labSoundsByConceptId(lab).values()].filter(
    s => s.state === 'approved' || s.state === 'revised',
  );

  if (labFirst) {
    for (const sound of canonicalLabSounds) registerLabSound(sound, { force: true });
  }

  for (const c of concepts) {
    const base = baseFor(c);
    for (const alias of strongAliases(c)) register(alias, { ...base, matched_alias: alias }, { strength: 'strong' });
  }
  for (const c of concepts) {
    const base = baseFor(c);
    for (const alias of weakAliases(c)) register(alias, { ...base, matched_alias: alias }, { strength: 'weak' });
  }

  const bestByConcept = labSoundsByConceptId(lab);
  for (const sound of lab?.sounds ?? []) {
    if (labFirst && (sound.state === 'approved' || sound.state === 'revised')) continue;
    if (sound.concept_id && bestByConcept.get(sound.concept_id) !== sound) continue;
    registerLabSound(sound);
  }

  return index;
}

export function isConceptMatchedInLab(concept, lab) {
  if (!lab?.sounds?.length) return concept.status === 'approved';
  const display = concept.concept?.trim().toLowerCase();
  const id = concept.id?.toLowerCase();
  return lab.sounds.some(s => {
    if (s.state === 'rejected') return false;
    if (!s.meaning?.trim()) return false;
    if (s.concept_id === concept.id) return true;
    if (s.spelling === concept.spelling) return true;
    const m = s.meaning.trim().toLowerCase();
    return m === display || m === id;
  }) || concept.status === 'approved';
}

export function isSpellingMatchedInLab(spelling, lab) {
  const s = lab?.sounds?.find(x => x.spelling === spelling && x.state !== 'rejected');
  return Boolean(s?.meaning?.trim());
}
