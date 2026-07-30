/**
 * Grammar rules that operate on a slot frame, independent of how the frame was produced.
 *
 * These three passes used to live in fonoran-llm-grammar-brief.js, which made the
 * deterministic translator import an LLM module to apply its own grammar. The rules were
 * never model-dependent: they read the frame, the particle seed, and the temporal-scene
 * lists, and nothing else. Housing them here lets both the deterministic engine and the
 * quarantined LLM engine import the same behaviour without crossing the quarantine line.
 *
 * Authority: docs/fonoran-rulebook.md (rule 4 time fronting, rule 13 disjunction).
 */
import {
  TEMPORAL_SCENE_CONCEPT_IDS,
  TEMPORAL_SCENE_TOPIC_IDS,
  TEMPORAL_SCENE_FRONT_ORDER,
} from './fonoran-interpretation.js';
import { disjunction } from './fonoran-language-policy.js';

export function conceptIdOf(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

function sceneFrontRank(id) {
  const idx = TEMPORAL_SCENE_FRONT_ORDER.indexOf(id);
  return idx >= 0 ? idx : TEMPORAL_SCENE_FRONT_ORDER.length + 1;
}

/** Stable order inside the time slot: scene lexicon, then tense particles. */
export function sortTimeSlotConcepts(frame) {
  if (!frame?.slots || !Array.isArray(frame.slots.time)) return frame;
  const tense = new Set(['ta', 'sa']);
  const lexical = [];
  const particles = [];
  const other = [];
  for (const item of frame.slots.time) {
    const id = conceptIdOf(item);
    if (tense.has(id)) particles.push(item);
    else if (TEMPORAL_SCENE_CONCEPT_IDS.has(id) || TEMPORAL_SCENE_TOPIC_IDS.has(id)) lexical.push(item);
    else other.push(item);
  }
  lexical.sort((a, b) => sceneFrontRank(conceptIdOf(a)) - sceneFrontRank(conceptIdOf(b)));
  return {
    ...frame,
    slots: { ...frame.slots, time: [...lexical, ...other, ...particles] },
  };
}

/**
 * Move temporal scene concepts out of trailing modifiers into the time slot
 * so the renderer can front them. Also pulls scene topics (world) when a
 * temporal scene concept is already present.
 */
export function promoteTemporalSceneToTime(frame) {
  if (!frame?.slots) return frame;
  const time = [...(Array.isArray(frame.slots.time) ? frame.slots.time : [])];
  const modifiers = [...(Array.isArray(frame.slots.modifiers) ? frame.slots.modifiers : [])];
  if (!modifiers.length) {
    return sortTimeSlotConcepts({ ...frame, slots: { ...frame.slots, time } });
  }

  const present = new Set([...time, ...modifiers].map(conceptIdOf));
  const hasTemporalScene = [...present].some(id => TEMPORAL_SCENE_CONCEPT_IDS.has(id));
  const timeIds = new Set(time.map(conceptIdOf));
  const keptMods = [];
  let moved = false;

  for (const item of modifiers) {
    const id = conceptIdOf(item);
    const isScene = TEMPORAL_SCENE_CONCEPT_IDS.has(id)
      || (hasTemporalScene && TEMPORAL_SCENE_TOPIC_IDS.has(id));
    if (!isScene) {
      keptMods.push(item);
      continue;
    }
    if (!timeIds.has(id)) {
      time.push(item);
      timeIds.add(id);
      moved = true;
    }
  }

  if (!moved && keptMods.length === modifiers.length) {
    return sortTimeSlotConcepts(frame);
  }

  return sortTimeSlotConcepts({
    ...frame,
    slots: { ...frame.slots, time, modifiers: keptMods },
    reasoning: [
      frame.reasoning,
      moved ? '[Grammar repair] Promoted temporal scene concepts from modifiers into time for fronting.' : null,
    ].filter(Boolean).join(' '),
  });
}

/**
 * English words that signal disjunction rather than a missing concept.
 *
 * `either or` is kept here rather than in the seed: it is a parsing artifact of how a
 * lost connective can arrive in `unresolved[]`, not an editorial fact about the language.
 */
const DISJUNCTION_WORDS = new Set([...disjunction().english, 'either or']);

/** The quantity concept that closes a coordinated group as exclusive ("a single one"). */
const DISJUNCTION_CONCEPT_ID = disjunction().marker_concept;

/** Slots searched, in order, for the group the alternatives were parsed into. */
const DISJUNCTION_SLOT_ORDER = ['object', 'event', 'path', 'subject', 'modifiers', 'time'];

/**
 * Render `A or B` as `A B lu`, "A B, a single one".
 *
 * Bare juxtaposition already reads as conjunction, so an unmarked pair of
 * alternatives asserts both and inverts the source: `guba gamba` for "friend or
 * enemy" says the person is both. `lu` quantifies over the coordinated group and
 * restores the exclusive reading. It reuses an approved quantity root, so this
 * costs no new root and no addition to the closed particle class.
 *
 * Fires only when a lost connective is reported AND one slot actually holds the
 * alternatives. Two cases are deliberately left alone:
 *
 * - The alternatives were dropped upstream (no `girl`/`boy` roots, or skipped
 *   demonstratives), so there is nothing to mark.
 * - The parse split them across slots (`event: [tired]` + `modifiers: [sick]`).
 *
 * Both stay honest gaps rather than guessing a position. A positional fallback
 * was tried and rejected: with only a subject and a verb surviving, as in "do
 * you mean this or that?", it emits a choice the source never expressed, which
 * is the fluent-and-wrong failure this rule exists to remove.
 */
export function applyDisjunction(frame) {
  if (!frame?.slots) return frame;
  const gaps = Array.isArray(frame.unresolved) ? frame.unresolved : [];
  const isConnective = gap => DISJUNCTION_WORDS.has(String(gap ?? '').trim().toLowerCase());
  if (!gaps.some(isConnective)) return frame;

  const slotKey = DISJUNCTION_SLOT_ORDER.find((key) => {
    const items = frame.slots[key];
    return Array.isArray(items) && items.length >= 2;
  });
  if (!slotKey) return frame;

  const items = [...frame.slots[slotKey]];
  if (items.some(item => conceptIdOf(item) === DISJUNCTION_CONCEPT_ID)) return frame;
  items.push(DISJUNCTION_CONCEPT_ID);

  return {
    ...frame,
    slots: { ...frame.slots, [slotKey]: items },
    unresolved: gaps.filter(gap => !isConnective(gap)),
    reasoning: [
      frame.reasoning,
      `[Grammar repair] Marked ${slotKey} alternatives as disjunction with lu (one); bare juxtaposition would assert both.`,
    ].filter(Boolean).join(' '),
  };
}
