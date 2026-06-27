/**
 * Sound-first Fonoran: bucket of syllables + compounds, meaning assigned later.
 */

import { readBucketRaw, writeBucketRaw } from './fonoran-store.js';
import { sayAs, sayAsBold, describeParts, compoundSayAs, parseSyllable } from './fonoran-pronunciation.js';
import { writeEnglishLexicon } from './fonoran-english-lexicon.js';
import { analyzeAmbiguity, auditScores, segmentCompound, checkCompoundBoundary } from './fonoran-gen3-readability.js';
import {
  normalizeComponents,
  normalizeCompoundRecord,
  normalizeSoundRecord,
  migrateBucket,
  resolveSpelling,
  resolvePartSpellings,
  validateComponents,
  buildDerivationTree,
  buildGraphPayload,
  wordsUsing,
  partsToComponents,
  markDdaStale,
  markDescendantsDdaStale,
  emptyDda,
} from './fonoran-derivation.js';
import { runDdaBatch, ddaSummary } from './fonoran-dda-infer.js';
import { buildMermaidGraph, buildPreviewMermaidGraph } from './fonoran-graph.js';

/** Review lifecycle shared by base sounds and compounds. */
export const REVIEW_STATES = ['draft', 'needs_review', 'approved', 'rejected', 'revised'];
const HISTORY_LIMIT = 60;

/**
 * Resolve a stored item to a concrete review state.
 * Older records have no `state`: an item with a meaning is awaiting review,
 * an empty one is still a raw draft.
 */
export function effectiveState(item) {
  if (item?.state && REVIEW_STATES.includes(item.state)) return item.state;
  return item?.meaning?.trim() ? 'needs_review' : 'draft';
}

export async function loadBucket() {
  try {
    const bucket = await readBucketRaw();
    if (!bucket) return seedBucket();
    return migrateBucket(bucket);
  } catch {
    return seedBucket();
  }
}

async function saveBucket(bucket) {
  return writeBucketRaw(bucket);
}

function enrichSound(s, bucket) {
  normalizeSoundRecord(s);
  const usedIn = wordsUsing('root', s.spelling, bucket).map(c => ({
    id: c.id, spelling: c.spelling, meaning: c.meaning, state: effectiveState(c),
  }));
  return {
    ...s,
    state: effectiveState(s),
    why: legacyGlossFromHint(s.generator_hint) ?? s.gloss ?? null,
    say_as: sayAs(s.spelling),
    say_bold: sayAsBold(s.spelling),
    parts: describeParts(s.spelling),
    legacy_label: s.legacy_label ?? legacyLabelFromHint(s.generator_hint),
    used_in: usedIn,
    used_in_count: usedIn.length,
    kind: 'root',
  };
}

function legacyLabelFromHint(hint) {
  if (!hint) return null;
  return hint.split(', ')[0]?.trim() || null;
}

function legacyGlossFromHint(hint) {
  if (!hint) return null;
  const parts = hint.split(', ');
  return parts.slice(1).join(', ').trim() || null;
}

function suggestCompoundMeaning(components, bucket, soundsBySpelling) {
  const labels = (components ?? []).map(comp => {
    if (comp.type === 'root') {
      const snd = soundsBySpelling[comp.ref];
      return snd?.meaning || snd?.legacy_label || null;
    }
    const w = bucket.compounds.find(x => x.id === comp.ref);
    return w?.meaning || w?.legacy_label || null;
  });
  if (labels.some(l => !l)) return null;
  return labels.join(' + ');
}

function enrichCompound(c, bucket, soundsBySpelling) {
  normalizeCompoundRecord(c, bucket);
  const components = c.components ?? partsToComponents(c.parts);
  const partSpellings = resolvePartSpellings(components, bucket, { flatOnly: true });
  const suggested = suggestCompoundMeaning(components, bucket, soundsBySpelling);
  return {
    ...c,
    kind: 'word',
    state: effectiveState(c),
    why: legacyGlossFromHint(c.generator_hint) ?? c.gloss ?? null,
    say_as: compoundSayAs(partSpellings),
    suggested_meaning: suggested,
    parts: partSpellings,
    components,
    part_details: components.map(comp => {
      if (comp.type === 'root') {
        const snd = soundsBySpelling[comp.ref];
        return {
          type: 'root',
          ref: comp.ref,
          spelling: comp.ref,
          say_as: sayAs(comp.ref),
          meaning: snd?.meaning ?? null,
          state: snd ? effectiveState(snd) : 'draft',
          legacy_label: snd?.legacy_label ?? legacyLabelFromHint(snd?.generator_hint),
        };
      }
      const w = bucket.compounds.find(x => x.id === comp.ref);
      return {
        type: 'word',
        ref: comp.ref,
        spelling: w?.spelling ?? comp.ref,
        say_as: w ? compoundSayAs(w.parts ?? []) : comp.ref,
        meaning: w?.meaning ?? null,
        state: w ? effectiveState(w) : 'draft',
        legacy_label: w?.legacy_label ?? null,
      };
    }),
  };
}

function countByState(items) {
  const counts = { draft: 0, needs_review: 0, approved: 0, rejected: 0, revised: 0 };
  for (const item of items) counts[effectiveState(item)] += 1;
  return counts;
}

export async function getLab() {
  const bucket = await loadBucket();
  const soundsBySpelling = Object.fromEntries(bucket.sounds.map(s => [s.spelling, s]));
  const sounds = bucket.sounds.map(s => enrichSound(s, bucket));
  const compounds = bucket.compounds.map(c => enrichCompound(c, bucket, soundsBySpelling));
  const soundStates = countByState(bucket.sounds);
  const compoundStates = countByState(bucket.compounds);
  return {
    version: bucket.version,
    philosophy: bucket.philosophy,
    updated_at: bucket.updated_at,
    rules: FONORAN_RULES,
    sounds,
    compounds,
    can_undo: Boolean(bucket.history?.length),
    events: (bucket.events ?? []).slice(-80).reverse(),
    next_step: computeNextStep(sounds, compounds, soundStates, compoundStates),
    stats: {
      sounds: bucket.sounds.length,
      sounds_named: bucket.sounds.filter(s => s.meaning?.trim()).length,
      compounds: bucket.compounds.length,
      compounds_named: bucket.compounds.filter(c => c.meaning?.trim()).length,
      sound_states: soundStates,
      compound_states: compoundStates,
    },
  };
}

/**
 * Decide what the human should look at next, base sounds before compounds,
 * unreviewed before settled. Returns a plain-English nudge plus the item id.
 */
export function computeNextStep(sounds, compounds, soundStates, compoundStates) {
  const open = (item) => item.state === 'draft' || item.state === 'needs_review';
  const baseDone = soundStates.approved + soundStates.revised + soundStates.rejected;
  const nextSound = sounds.find(open);

  if (nextSound) {
    return {
      phase: 'base',
      message: `You have ${sounds.length} base sounds. `
        + `${baseDone} reviewed, ${soundStates.draft + soundStates.needs_review} still need review. `
        + 'Start with the base sounds. Every word is built from them.',
      target: { type: 'sound', id: nextSound.spelling },
    };
  }

  const nextCompound = compounds.find(open);
  if (nextCompound) {
    const compDone = compoundStates.approved + compoundStates.revised + compoundStates.rejected;
    return {
      phase: 'compound',
      message: `All base sounds are reviewed. Now the compounds: `
        + `${compDone} reviewed, ${compoundStates.draft + compoundStates.needs_review} to go.`,
      target: { type: 'compound', id: nextCompound.id },
    };
  }

  return {
    phase: 'done',
    message: 'Everything has been reviewed. Browse the Dictionary or invent new words.',
    target: null,
  };
}

export const FONORAN_RULES = {
  summary: 'Words are syllable sounds glued together. No spaces. You name each sound and each compound.',
  layers: [
    {
      name: 'Sound',
      pattern: 'CV or CVC syllable',
      example: 'da, po, xaech',
      rule: 'One mouthful. Built from Fonora\'s consonant + vowel grid (see language-rules.md).',
    },
    {
      name: 'Compound',
      pattern: 'sound + sound (+ sound…)',
      example: 'xaech + lik → xaechlik',
      rule: 'Concatenate spellings with no separator. Meaning is usually the ideas combined, but you can name it anything.',
    },
  ],
  not_yet: [
    'Grammar endings (noun a / verb e), proposed in older docs, not used in current vocabulary',
    'Sentence word order',
    'Separate modifier affixes, modifiers are just more sounds in the chain',
  ],
  invent: [
    'Open Build → tap 2+ sounds → save with a meaning',
    'Or pick an existing compound and rename it',
    'Changing a base sound\'s meaning does not auto-rename compounds, clear and redefine those if needed',
  ],
};

function compoundsUsingSound(bucket, spelling) {
  return wordsUsing('root', spelling, bucket);
}

function markRootImpactDdaStale(spelling, bucket) {
  for (const c of wordsUsing('root', spelling, bucket)) {
    markDdaStale(c);
    markDescendantsDdaStale(c.id, bucket);
  }
}

/** Snapshot mutated rows so a single change can be reverted later. */
function pushHistory(bucket, label, snapshots) {
  if (!Array.isArray(bucket.history)) bucket.history = [];
  bucket.history.push({
    at: new Date().toISOString(),
    label,
    snapshots,
  });
  if (bucket.history.length > HISTORY_LIMIT) {
    bucket.history = bucket.history.slice(-HISTORY_LIMIT);
  }
}

/** Human-readable activity log powering the progress timeline. */
function pushEvent(bucket, action, kind, word, detail) {
  if (!Array.isArray(bucket.events)) bucket.events = [];
  bucket.events.push({ at: new Date().toISOString(), action, kind, word, detail: detail ?? null });
  if (bucket.events.length > 200) bucket.events = bucket.events.slice(-200);
}

function snapshotSound(s) {
  return { kind: 'sound', spelling: s.spelling, meaning: s.meaning ?? null, state: s.state ?? null, named_at: s.named_at ?? null };
}

function snapshotCompound(c) {
  return {
    kind: 'compound',
    id: c.id,
    spelling: c.spelling,
    parts: [...(c.parts ?? [])],
    components: c.components ? c.components.map(x => ({ ...x })) : undefined,
    derivation: c.derivation ? JSON.parse(JSON.stringify(c.derivation)) : undefined,
    meaning: c.meaning ?? null,
    aliases: c.aliases ? [...c.aliases] : undefined,
    state: c.state ?? null,
    named_at: c.named_at ?? null,
    removed: false,
  };
}

function normalizeCompoundAliases(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\n,]+/);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const a = String(item ?? '').trim();
    if (!a || seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    out.push(a);
  }
  return out;
}

function normalizeState(state) {
  if (state == null) return null;
  if (!REVIEW_STATES.includes(state)) throw new Error(`Unknown state: ${state}`);
  return state;
}

/**
 * Update a base sound's spelling and/or meaning and/or review state.
 * Renaming updates every compound that uses this root (new spellings derived from parts).
 */
export async function patchSound(spelling, { new_spelling, meaning, state, concept_id, clear_affected_compounds = false } = {}) {
  const bucket = await loadBucket();
  const old = spelling.trim().toLowerCase();
  const s = bucket.sounds.find(x => x.spelling === old);
  if (!s) throw new Error(`Unknown sound: ${old}`);

  const snapshots = [];
  const next = new_spelling?.trim().toLowerCase();
  let spellingChanged = false;

  if (next && next !== old) {
    const syl = parseSyllable(next);
    if (!syl || syl.unparsed) throw new Error(`Not a valid Fonoran syllable: ${next}`);
    if (bucket.sounds.some(x => x.spelling === next && x !== s)) {
      throw new Error(`Root already exists: ${next}`);
    }

    snapshots.push({ kind: 'sound_full', newSpelling: next, prev: { ...s } });
    for (const c of compoundsUsingSound(bucket, old)) {
      const prev = { ...c, parts: [...(c.parts ?? [])], components: c.components?.map(x => ({ ...x })) };
      const comps = c.components ?? partsToComponents(c.parts);
      c.components = comps.map(comp =>
        comp.type === 'root' && comp.ref === old ? { ...comp, ref: next } : comp,
      );
      c.parts = resolvePartSpellings(c.components, bucket, { flatOnly: true });
      const newCompoundSpelling = resolveSpelling(c.components, bucket);
      const newId = `cmp-${newCompoundSpelling}`;
      if (bucket.compounds.some(x => x !== c && x.spelling === newCompoundSpelling)) {
        throw new Error(`Renaming would collide with existing word: ${newCompoundSpelling}`);
      }
      snapshots.push({ kind: 'compound_full', findId: newId, prev });
      c.spelling = newCompoundSpelling;
      c.id = newId;
      c.derivation = buildDerivationTree(c.components, bucket);
      markDdaStale(c);
    }

    s.spelling = next;
    if (s.id.startsWith('snd-custom-')) s.id = `snd-custom-${next}`;
    spellingChanged = true;
    bucket.sounds.sort((a, b) => a.spelling.localeCompare(b.spelling));
  }

  const nextState = normalizeState(state);
  const previous = s.meaning;
  const affected = compoundsUsingSound(bucket, s.spelling).filter(c => c.meaning?.trim());
  const meaningProvided = meaning !== undefined;
  const meaningChanged = meaningProvided && (previous ?? '') !== (meaning?.trim() ?? '');

  if (!spellingChanged) snapshots.push(snapshotSound(s));

  if (meaningProvided) {
    s.meaning = meaning?.trim() || null;
    s.named_at = meaning?.trim() ? new Date().toISOString() : null;
    markDdaStale(s);
    markRootImpactDdaStale(s.spelling, bucket);
  }
  if (concept_id !== undefined) s.concept_id = concept_id?.trim() || null;
  if (nextState) s.state = nextState;
  if (spellingChanged) {
    markDdaStale(s);
    markRootImpactDdaStale(s.spelling, bucket);
  }

  const clearedCompounds = [];
  if (clear_affected_compounds && meaningChanged && affected.length) {
    for (const c of affected) {
      if (!snapshots.some(x => x.kind === 'compound_full' && x.prev?.id === c.id)) {
        snapshots.push(snapshotCompound(c));
      }
      c.meaning = null;
      c.named_at = null;
      c.state = 'needs_review';
      clearedCompounds.push({ id: c.id, spelling: c.spelling });
    }
  }

  const label = spellingChanged ? `rename sound ${old} → ${s.spelling}` : `sound ${s.spelling}`;
  pushHistory(bucket, label, snapshots);
  const evtWord = s.spelling;
  if (nextState === 'approved') pushEvent(bucket, 'approved', 'sound', evtWord, s.meaning);
  else if (nextState === 'revised') pushEvent(bucket, 'revised', 'sound', evtWord, s.meaning);
  else if (nextState === 'rejected') pushEvent(bucket, 'rejected', 'sound', evtWord, s.meaning);
  else if (meaningChanged) pushEvent(bucket, 'renamed', 'sound', evtWord, s.meaning);
  else if (spellingChanged) pushEvent(bucket, 'renamed', 'sound', evtWord, `${old} → ${s.spelling}`);

  await saveBucket(bucket);
  return {
    sound: enrichSound(s, bucket),
    spelling_changed: spellingChanged,
    old_spelling: old,
    meaning_changed: meaningChanged,
    affected_compounds: affected.map(c => ({ id: c.id, spelling: c.spelling, meaning: c.meaning })),
    cleared_compounds: clearedCompounds,
  };
}

/**
 * Assign a base sound's meaning and/or review state.
 * Records history for undo and (optionally) clears the names of dependent compounds.
 */
export async function assignSoundMeaning(spelling, meaning, { clearAffectedCompounds = false, state } = {}) {
  return patchSound(spelling, {
    meaning,
    state,
    clear_affected_compounds: clearAffectedCompounds,
  });
}

export async function assignCompoundMeaning(id, meaning, { state, aliases } = {}) {
  const bucket = await loadBucket();
  const c = bucket.compounds.find(x => x.id === id);
  if (!c) throw new Error(`Unknown compound: ${id}`);
  const nextState = normalizeState(state);
  const prevMeaning = c.meaning;
  pushHistory(bucket, `compound ${id}`, [snapshotCompound(c)]);
  if (meaning !== undefined) {
    c.meaning = meaning?.trim() || null;
    c.named_at = meaning?.trim() ? new Date().toISOString() : null;
    markDdaStale(c);
    markDescendantsDdaStale(c.id, bucket);
  }
  if (aliases !== undefined) {
    const normalized = normalizeCompoundAliases(aliases);
    c.aliases = normalized.length ? normalized : undefined;
  }
  if (nextState) {
    c.state = nextState;
    if (nextState === 'approved') {
      markDdaStale(c);
      if (c.generator_hint) {
        c.generator_hint = null;
        c.created_by = 'user';
      }
    }
  }
  const meaningChanged = meaning !== undefined && (prevMeaning ?? '') !== (meaning?.trim() ?? '');
  if (nextState === 'approved') pushEvent(bucket, 'approved', 'compound', c.spelling, c.meaning);
  else if (nextState === 'revised') pushEvent(bucket, 'revised', 'compound', c.spelling, c.meaning);
  else if (nextState === 'rejected') pushEvent(bucket, 'rejected', 'compound', c.spelling, c.meaning);
  else if (meaningChanged) pushEvent(bucket, 'renamed', 'compound', c.spelling, c.meaning);
  await saveBucket(bucket);
  const soundsBySpelling = Object.fromEntries(bucket.sounds.map(s => [s.spelling, s]));
  return enrichCompound(c, bucket, soundsBySpelling);
}

/** Set the review state of a sound or compound without touching its meaning. */
export async function setReviewState(kind, id, state) {
  const next = normalizeState(state);
  if (!next) throw new Error('state is required');
  if (kind === 'sound') {
    return (await assignSoundMeaning(id, undefined, { state: next })).sound;
  }
  if (kind === 'compound') {
    return assignCompoundMeaning(id, undefined, { state: next });
  }
  throw new Error(`Unknown kind: ${kind}`);
}

/** Compounds whose names may break if this base sound's meaning changes. */
export async function previewSoundImpact(spelling) {
  const bucket = await loadBucket();
  const s = bucket.sounds.find(x => x.spelling === spelling);
  if (!s) throw new Error(`Unknown sound: ${spelling}`);
  const affected = compoundsUsingSound(bucket, spelling);
  return {
    spelling,
    affected: affected.map(c => ({
      id: c.id,
      spelling: c.spelling,
      meaning: c.meaning ?? null,
      named: Boolean(c.meaning?.trim()),
      state: effectiveState(c),
    })),
    named_count: affected.filter(c => c.meaning?.trim()).length,
  };
}

/** Revert the most recent change recorded in history. */
export async function undoLast() {
  const bucket = await loadBucket();
  const entry = (bucket.history ?? []).pop();
  if (!entry) return { reverted: false };
  (bucket.events ?? []).pop();
  for (const snap of entry.snapshots) {
    if (snap.kind === 'sound') {
      if (snap.removed) {
        bucket.sounds = bucket.sounds.filter(s => s.spelling !== snap.spelling);
      } else {
        const s = bucket.sounds.find(x => x.spelling === snap.spelling);
        if (s) { s.meaning = snap.meaning; s.state = snap.state ?? undefined; s.named_at = snap.named_at; }
      }
    } else if (snap.kind === 'sound_full') {
      bucket.sounds = bucket.sounds.filter(x => x.spelling !== snap.newSpelling);
      if (!bucket.sounds.some(x => x.spelling === snap.prev.spelling)) {
        bucket.sounds.push(snap.prev);
      }
      bucket.sounds.sort((a, b) => a.spelling.localeCompare(b.spelling));
    } else if (snap.kind === 'compound_full') {
      const i = bucket.compounds.findIndex(c => c.id === snap.findId);
      if (i >= 0) bucket.compounds[i] = snap.prev;
      else bucket.compounds.push(snap.prev);
    } else if (snap.kind === 'compound') {
      if (snap.removed) {
        bucket.compounds = bucket.compounds.filter(c => c.id !== snap.id);
      } else {
        const c = bucket.compounds.find(x => x.id === snap.id);
        if (c) {
          c.meaning = snap.meaning;
          c.state = snap.state ?? undefined;
          c.named_at = snap.named_at;
          c.aliases = snap.aliases ? [...snap.aliases] : undefined;
        }
      }
    }
  }
  await saveBucket(bucket);
  return { reverted: true, label: entry.label, at: entry.at };
}

/**
 * Change which components build a compound. Accepts parts[] or components[].
 */
export async function recomposeCompound(id, input = {}) {
  const bucket = await loadBucket();
  const c = bucket.compounds.find(x => x.id === id);
  if (!c) throw new Error(`Unknown compound: ${id}`);

  const components = normalizeComponents(input);
  validateComponents(components, bucket, {
    targetWordId: id,
    allowUnapprovedWords: Boolean(input.allow_unapproved),
  });
  const spelling = resolveSpelling(components, bucket);
  const newId = `cmp-${spelling}`;
  if (spelling !== c.spelling && bucket.compounds.some(x => x.spelling === spelling)) {
    throw new Error(`Another word already spells ${spelling}`);
  }

  pushHistory(bucket, `recipe ${c.spelling}`, [{ kind: 'compound_full', findId: newId, prev: { ...c } }]);

  c.components = components;
  c.parts = resolvePartSpellings(components, bucket, { flatOnly: true });
  c.spelling = spelling;
  c.id = newId;
  c.derivation = buildDerivationTree(components, bucket);
  c.phonetic = { form: spelling };
  if (input.meaning !== undefined) {
    c.meaning = input.meaning?.trim() || null;
    c.named_at = input.meaning?.trim() ? new Date().toISOString() : null;
  }
  markDdaStale(c);
  markDescendantsDdaStale(c.id, bucket);
  pushEvent(bucket, 'recipe', 'compound', spelling, c.meaning);

  await saveBucket(bucket);
  const soundsBySpelling = Object.fromEntries(bucket.sounds.map(s => [s.spelling, s]));
  return enrichCompound(c, bucket, soundsBySpelling);
}

export async function addSound({ spelling, meaning, concept_id = null }) {
  const sp = spelling?.trim().toLowerCase();
  if (!sp) throw new Error('spelling required');
  const syl = parseSyllable(sp);
  if (!syl || syl.unparsed) throw new Error(`Not a valid Fonoran syllable: ${sp}`);

  const bucket = await loadBucket();
  if (bucket.sounds.some(s => s.spelling === sp)) {
    throw new Error(`Root already exists: ${sp}`);
  }

  const entry = {
    id: `snd-custom-${sp}`,
    spelling: sp,
    meaning: meaning?.trim() || null,
    concept_id: concept_id?.trim() || null,
    state: 'needs_review',
    generator_hint: null,
    created_by: 'user',
    named_at: meaning?.trim() ? new Date().toISOString() : null,
    dda: emptyDda(),
  };
  normalizeSoundRecord(entry);
  bucket.sounds.push(entry);
  bucket.sounds.sort((a, b) => a.spelling.localeCompare(b.spelling));
  pushHistory(bucket, `add sound ${sp}`, [{ kind: 'sound', spelling: sp, removed: true }]);
  pushEvent(bucket, 'created', 'sound', sp, entry.meaning);
  await saveBucket(bucket);
  return enrichSound(entry, bucket);
}

/** Move every sound and word back to needs_review without clearing meanings. */
export async function resetReviewStates() {
  const bucket = await loadBucket();
  let sounds = 0;
  let compounds = 0;
  const snapshots = [];

  for (const s of bucket.sounds) {
    if (effectiveState(s) !== 'needs_review') {
      snapshots.push(snapshotSound(s));
      s.state = 'needs_review';
      sounds += 1;
    }
  }
  for (const c of bucket.compounds) {
    if (effectiveState(c) !== 'needs_review') {
      snapshots.push(snapshotCompound(c));
      c.state = 'needs_review';
      compounds += 1;
    }
  }

  if (snapshots.length) {
    pushHistory(bucket, 'reset review states', snapshots);
    pushEvent(bucket, 'reset', 'lab', 'all', `${sounds} roots, ${compounds} words`);
  }
  await saveBucket(bucket);
  return { sounds_reset: sounds, compounds_reset: compounds };
}

export async function addCompound(input) {
  const bucket = await loadBucket();
  const components = normalizeComponents(input);
  validateComponents(components, bucket, {
    allowUnapprovedWords: Boolean(input.allow_unapproved),
  });
  const parts = resolvePartSpellings(components, bucket, { flatOnly: true });
  const boundary = checkCompoundBoundary(parts);
  if (!boundary.valid) {
    throw new Error(boundary.violations.map(v => v.reason).join('; '));
  }
  const spelling = resolveSpelling(components, bucket);
  const existing = bucket.compounds.find(c => c.spelling === spelling);
  if (existing) {
    if (existing.generator_hint) {
      pushHistory(bucket, `claim compound ${spelling}`, [snapshotCompound(existing)]);
      existing.components = components;
      existing.parts = resolvePartSpellings(components, bucket, { flatOnly: true });
      existing.derivation = buildDerivationTree(components, bucket);
      existing.meaning = input.meaning?.trim() || null;
      const aliases = normalizeCompoundAliases(input.aliases);
      existing.aliases = aliases.length ? aliases : undefined;
      existing.state = normalizeState(input.state) ?? (input.meaning?.trim() ? 'needs_review' : effectiveState(existing));
      existing.generator_hint = null;
      existing.created_by = 'user';
      existing.named_at = input.meaning?.trim() ? new Date().toISOString() : null;
      markDdaStale(existing);
      pushEvent(bucket, 'created', 'compound', spelling, existing.meaning);
      await saveBucket(bucket);
      const soundsBySpelling = Object.fromEntries(bucket.sounds.map(s => [s.spelling, s]));
      return enrichCompound(existing, bucket, soundsBySpelling);
    }
    throw new Error(`Word already exists: ${spelling}`);
  }
  const entry = {
    id: `cmp-${spelling}`,
    spelling,
    components: [...components],
    parts: resolvePartSpellings(components, bucket, { flatOnly: true }),
    derivation: buildDerivationTree(components, bucket),
    phonetic: { form: spelling },
    meaning: input.meaning?.trim() || null,
    aliases: (() => {
      const list = normalizeCompoundAliases(input.aliases);
      return list.length ? list : undefined;
    })(),
    state: normalizeState(input.state) ?? (input.meaning?.trim() ? 'needs_review' : 'draft'),
    generator_hint: null,
    created_by: 'user',
    named_at: input.meaning?.trim() ? new Date().toISOString() : null,
    dda: emptyDda(),
  };
  bucket.compounds.push(entry);
  pushHistory(bucket, `add compound ${spelling}`, [{ kind: 'compound', id: entry.id, removed: true }]);
  pushEvent(bucket, 'created', 'compound', spelling, entry.meaning);
  await saveBucket(bucket);
  const soundsBySpelling = Object.fromEntries(bucket.sounds.map(s => [s.spelling, s]));
  return enrichCompound(entry, bucket, soundsBySpelling);
}

/** Empty lab + refreshed English lexicon (reference only, no sounds or words). */
export async function seedBucket() {
  await writeEnglishLexicon();
  const bucket = {
    version: '2.0-blank-slate',
    philosophy: 'Build from scratch. English lexicon is reference only, not assigned to sounds.',
    seeded_from: null,
    updated_at: new Date().toISOString(),
    sounds: [],
    compounds: [],
    history: [],
    events: [],
  };
  await writeBucketRaw(bucket);
  return bucket;
}

const SCORE_EXPLAIN = {
  learnability: 'How easy the language is to learn, penalised when many sounds look or sound alike.',
  pronounceability: 'How easy the words are to say out loud, long words and consonant pile-ups hurt this.',
  memorability: 'How easy words are to remember, rhyming clusters and look-alike roots make this harder.',
  parseability: 'How reliably a word splits back into its parts, lower when one word can be read two ways.',
  compoundLength: 'Average characters per compound word. Shorter is usually friendlier.',
  algorithmicFeel: 'Share of roots whose spellings were adjusted by coordinate-grid repair during generation. Lower feels more human-chosen; 0% means no repaired roots in the current inventory.',
};

const WARNING_LABELS = {
  similar_roots: 'Look-alike sounds',
  prefix_overlap: 'One sound hides inside another',
  phonetic_cluster: 'Rhyming cluster',
  compound_length: 'Long word',
  segmentation_ambiguity: 'Word can be read two ways',
  pronunciation: 'Hard to pronounce',
  algorithmic_repair: 'Machine-adjusted spelling',
};

export async function getHealth() {
  const bucket = await loadBucket();

  const inventory = bucket.sounds
    .filter(s => effectiveState(s) !== 'rejected')
    .map(s => ({
      root: s.spelling,
      id: s.spelling,
      gloss: s.meaning ?? s.legacy_label ?? s.spelling,
      coordinates: s.dda?.coordinates
        ? { A: s.dda.A, manner: s.dda.M, D: s.dda.D }
        : {},
      repair_steps: s.repair_steps ?? 0,
    }));

  const derivations = bucket.compounds
    .filter(c => effectiveState(c) !== 'rejected')
    .map(c => ({
      compound: c.spelling,
      concept: c.meaning ?? c.id,
      composition: c.components
        ? c.components.map(comp => comp.type === 'root' ? comp.ref : comp.ref)
        : (c.parts ?? []),
    }));

  const warnings = analyzeAmbiguity(inventory, derivations);
  const scores = auditScores(inventory, derivations, warnings);

  const dimensions = [
    'learnability', 'pronounceability', 'memorability', 'parseability',
  ].map(key => ({ key, label: key, score: scores[key], explain: SCORE_EXPLAIN[key] }));

  return {
    generated_at: new Date().toISOString(),
    scores,
    dimensions,
    metrics: [
      { key: 'compoundLength', value: scores.compoundLength, explain: SCORE_EXPLAIN.compoundLength },
      { key: 'algorithmicFeel', value: scores.algorithmicFeel, suffix: '%', explain: SCORE_EXPLAIN.algorithmicFeel },
    ],
    warnings: warnings.map(w => ({
      ...w,
      label: WARNING_LABELS[w.type] ?? w.type,
    })),
    warning_summary: {
      total: warnings.length,
      high: warnings.filter(w => w.severity === 'high').length,
    },
    dda: ddaSummary(bucket),
  };
}

export async function getLabGraph(kind, ref) {
  const bucket = await loadBucket();
  const payload = buildGraphPayload(bucket, kind, ref);
  const graph = buildMermaidGraph(bucket, {
    kind,
    ref,
    usedIn: payload.used_in,
    related: payload.related,
  });
  payload.mermaid = graph.source;
  payload.graph_nodes = graph.nodes;
  return payload;
}

export async function getLabGraphPreview(input) {
  const bucket = await loadBucket();
  const components = normalizeComponents(input);
  const spelling = input.spelling?.trim() || resolveSpelling(components, bucket);
  const derivation = buildDerivationTree(components, bucket);
  const graph = buildPreviewMermaidGraph(bucket, {
    spelling,
    meaning: input.meaning ?? null,
    components,
  });
  return {
    focus: {
      kind: 'word',
      spelling,
      meaning: input.meaning ?? null,
      state: 'draft',
      components,
      derivation,
    },
    used_in: [],
    related: [],
    mermaid: graph.source,
    graph_nodes: graph.nodes,
  };
}

export async function parseCompoundLive(spelling) {
  const bucket = await loadBucket();
  const inventory = [];

  for (const s of bucket.sounds.filter(x => effectiveState(x) !== 'rejected')) {
    inventory.push({
      root: s.spelling,
      id: s.spelling,
      gloss: s.meaning ?? s.spelling,
      coordinates: s.dda?.coordinates ?? {},
    });
  }

  for (const c of bucket.compounds.filter(x => effectiveState(x) !== 'rejected')) {
    inventory.push({
      root: c.spelling,
      id: c.id,
      gloss: c.meaning ?? c.spelling,
      coordinates: c.dda?.coordinates ?? {},
    });
  }

  inventory.sort((a, b) => b.root.length - a.root.length);

  const segs = segmentCompound(spelling.trim(), inventory);
  return {
    spelling: spelling.trim(),
    segmentations: segs,
    count: segs.length,
    ambiguous: segs.length > 1,
  };
}

export async function runDda(scope = 'pending') {
  const bucket = await loadBucket();
  const result = await runDdaBatch(bucket, { scope });
  await saveBucket(bucket);
  return { ...result, dda: ddaSummary(bucket) };
}
