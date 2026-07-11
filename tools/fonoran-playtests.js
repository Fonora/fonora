/**
 * Playtests + Puzzle Conversation — the human-authority layer for understandability.
 *
 * See docs/fonoran-constitution.md. A playtest "round" records whether a real root-knower
 * recovered the intended meaning of a Fonoran expression, and how many repair turns it
 * took. These rounds — not the automated score — decide whether a compound communicates.
 *
 * Puzzle Conversation operationalizes the core experiment:
 *   - one speaker expresses a meaning from roots (here: the system shows a built compound),
 *   - the other speaker, who only knows the roots, must guess the meaning,
 *   - on failure they get a repair turn (the literal root breakdown / an alternate form),
 *   - the result is recorded so the language can learn from real attempts.
 *
 * The "50-root challenge" restricts to the communicative core to measure the real question:
 *   "how much can two people communicate with only ~50 roots?"
 */

import { readDoc, writeDoc } from './fonoran-store.js';
import { loadBucket, getLab } from './fonoran-sound-bucket.js';
import { experienceMetaFor } from './fonoran-experience-tiers.js';
import { buildPuzzleBreakdown, formatSpellingDisplay } from './fonoran-puzzle-format.js';
import { buildMeaningChoices, scoreMultipleChoice } from './fonoran-meaning-choices.js';

export { buildMeaningChoices, scoreMultipleChoice };

function nowIso() {
  return new Date().toISOString();
}

function randId() {
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PUZZLE_FEEDBACK_TAGS = [
  'too_long',
  'unnatural',
  'hard_pronounce',
  'worked_well',
];

export async function loadPlaytests() {
  const doc = await readDoc('playtests');
  if (doc?.rounds) {
    if (!Array.isArray(doc.feedback)) doc.feedback = [];
    return doc;
  }
  return { version: '1.0-playtests', rounds: [], feedback: [] };
}

/** concept id → live language tier (lab-aware via concept id), with a static fallback. */
function languageTierForConceptId(id) {
  return experienceMetaFor(id).language_tier;
}

/** Is every atomic root of this compound a communicative-core root? */
function isCoreCompound(compound, soundBySpelling) {
  const parts = compound.parts ?? [];
  if (!parts.length) return false;
  return parts.every(spelling => {
    const snd = soundBySpelling.get(spelling);
    const conceptId = snd?.concept_id;
    if (!conceptId) return false;
    return languageTierForConceptId(conceptId) === 'communicative_core';
  });
}

function meaningOf(item) {
  return (item.meaning ?? item.concept_id ?? item.gloss ?? '').toString().trim();
}

/** Editorial compounds doc → meaning pool for distractors. */
export function buildMeaningPoolFromCompounds(compounds) {
  return (compounds ?? [])
    .map(c => meaningOf({
      concept_id: c.concept,
      gloss: c.preferred?.gloss ?? c.gloss,
    }))
    .filter(Boolean);
}

/**
 * Build a guess-the-meaning challenge: show a Fonoran compound + its literal root glosses,
 * ask the player to recover the intended meaning. Multiple-choice for crisp scoring.
 *
 * @param {object} opts
 * @param {object} [opts.lab]        lab snapshot (sounds + compounds); loaded if omitted.
 * @param {boolean} [opts.coreOnly]  restrict to communicative-core compounds (50-root challenge).
 * @param {string} [opts.conceptId]  request a specific concept instead of random.
 * @param {number} [opts.missedIndex]  pick from the missed-word queue (blind retest).
 */
export async function buildMissedConceptQueue({ lab = null } = {}) {
  const liveLab = lab ?? await getLab(await loadBucket());
  const compounds = (liveLab?.compounds ?? [])
    .filter(c => c.state !== 'rejected' && (c.parts?.length ?? 0) >= 2);
  const labConcepts = new Set(compounds.map(c => c.concept_id));
  const liveSpelling = new Map(compounds.map(c => [c.concept_id, c.spelling]));

  const doc = await loadPlaytests();
  const latest = new Map();
  for (const r of doc.rounds ?? []) {
    const prev = latest.get(r.concept_id);
    if (!prev || r.at > prev.at) latest.set(r.concept_id, r);
  }

  return [...latest.entries()]
    .filter(([id, r]) => {
      if (!labConcepts.has(id)) return false;
      if (!r.recovered) return true;
      const current = liveSpelling.get(id);
      return Boolean(current && r.shown_spelling && r.shown_spelling !== current);
    })
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .map(([id]) => id);
}

export async function buildPuzzleChallenge({
  lab = null,
  coreOnly = false,
  conceptId = null,
  missedIndex = null,
} = {}) {
  const liveLab = lab ?? await getLab(await loadBucket());
  const sounds = liveLab?.sounds ?? [];
  const compounds = (liveLab?.compounds ?? []).filter(c => c.state !== 'rejected' && (c.parts?.length ?? 0) >= 2 && meaningOf(c));
  const soundBySpelling = new Map(sounds.map(s => [s.spelling, s]));

  let pool = compounds;
  if (coreOnly) pool = compounds.filter(c => isCoreCompound(c, soundBySpelling));
  if (!pool.length) pool = compounds;
  if (!pool.length) {
    throw new Error('No compounds available to play. Run the converged build first.');
  }

  let puzzleMode = conceptId ? 'concept' : 'random';
  let queueIndex = null;
  let queueTotal = null;

  if (missedIndex != null && Number.isFinite(Number(missedIndex))) {
    const queue = await buildMissedConceptQueue({ lab: liveLab });
    if (!queue.length) {
      throw new Error('No missed words to retest. Play random words or clear old misses.');
    }
    queueTotal = queue.length;
    queueIndex = ((Number(missedIndex) % queue.length) + queue.length) % queue.length;
    conceptId = queue[queueIndex];
    puzzleMode = 'missed';
  }

  const target = conceptId
    ? (pool.find(c => c.concept_id === conceptId) ?? pool[0])
    : pool[Math.floor(Math.random() * pool.length)];

  // Literal root breakdown shown only on the repair turn (the hint).
  const literalParts = (target.parts ?? []).map(spelling => {
    const snd = soundBySpelling.get(spelling);
    return { spelling, meaning: snd ? meaningOf(snd) : spelling };
  });

  const answer = meaningOf(target);
  const distractorPool = compounds
    .filter(c => c.concept_id !== target.concept_id)
    .map(meaningOf)
    .filter(Boolean);
  const choices = buildMeaningChoices(answer, distractorPool, 4);

  const alternateForms = (target.alternate_forms ?? []).map(a => ({
    spelling: a.spelling,
    spelling_display: formatSpellingDisplay(a.parts ?? []),
    readable: (a.composition ?? []).join(' + '),
    understandability: a.understandability ?? null,
  }));

  const breakdown = buildPuzzleBreakdown({ compound: target, lab: liveLab });

  return {
    concept_id: target.concept_id,
    answer: meaningOf(target),
    spelling: target.spelling,
    spelling_display: breakdown.spelling_display,
    parts: target.parts ?? [],
    literal_parts: literalParts,
    composition_readable: target.composition_readable ?? null,
    breakdown,
    understandability: target.understandability ?? null,
    alternate_forms: alternateForms,
    choices,
    core_only: Boolean(coreOnly),
    puzzle_mode: puzzleMode,
    queue_index: queueIndex,
    queue_total: queueTotal,
  };
}

/**
 * Record one playtest round.
 * @param {object} round
 * @param {string} round.concept_id
 * @param {string} round.shown_spelling
 * @param {string[]} [round.shown_composition]
 * @param {boolean} round.recovered      did the guesser recover the intended meaning?
 * @param {number} [round.repair_turns]  how many extra attempts/hints were used.
 * @param {string} [round.guess]         what the guesser answered.
 * @param {string[]} [round.confusions]  meanings it was confused with.
 * @param {boolean} [round.core_only]
 * @param {string} [round.source]        'puzzle' | 'manual' | ...
 * @param {string} [round.difficulty_mode] 'easy' | 'normal' | 'hard'
 */
export async function recordPlaytestRound(round) {
  if (!round?.concept_id) throw new Error('concept_id is required');
  const doc = await loadPlaytests();
  const entry = {
    id: randId(),
    at: nowIso(),
    concept_id: round.concept_id,
    shown_spelling: round.shown_spelling ?? null,
    shown_composition: round.shown_composition ?? null,
    recovered: Boolean(round.recovered),
    repair_turns: Number.isFinite(round.repair_turns) ? round.repair_turns : 0,
    guess: round.guess ?? null,
    confusions: Array.isArray(round.confusions) ? round.confusions : [],
    core_only: Boolean(round.core_only),
    difficulty_mode: round.difficulty_mode ?? null,
    source: round.source ?? 'puzzle',
  };
  doc.rounds.push(entry);
  await writeDoc('playtests', doc);
  return { recorded: true, round: entry, summary: summarizeConcept(doc, round.concept_id) };
}

/**
 * Learner feedback on a word experience (length, intuitiveness, pronunciation, etc.).
 * @param {object} fb
 * @param {string} fb.concept_id
 * @param {string} [fb.shown_spelling]
 * @param {string} [fb.round_id]
 * @param {string[]} [fb.tags]  too_long | unnatural | hard_pronounce | worked_well
 * @param {string} [fb.note]
 * @param {string} [fb.difficulty_mode]
 */
export async function recordPlaytestFeedback(fb) {
  if (!fb?.concept_id) throw new Error('concept_id is required');
  const tags = (fb.tags ?? []).filter(t => PUZZLE_FEEDBACK_TAGS.includes(t));
  if (!tags.length) {
    throw new Error('Select a feedback tag');
  }
  const doc = await loadPlaytests();
  if (!Array.isArray(doc.feedback)) doc.feedback = [];
  const entry = {
    id: randId(),
    at: nowIso(),
    concept_id: fb.concept_id,
    shown_spelling: fb.shown_spelling ?? null,
    round_id: fb.round_id ?? null,
    tags,
    note: fb.note?.trim() || null,
    difficulty_mode: fb.difficulty_mode ?? null,
    source: 'puzzle',
  };
  doc.feedback.push(entry);
  await writeDoc('playtests', doc);
  return { recorded: true, feedback: entry };
}

function summarizeConcept(doc, conceptId) {
  const rounds = (doc.rounds ?? []).filter(r => r.concept_id === conceptId);
  const recovered = rounds.filter(r => r.recovered).length;
  return {
    concept_id: conceptId,
    rounds: rounds.length,
    recovered,
    recovery_rate: rounds.length ? Math.round((recovered / rounds.length) * 100) / 100 : null,
    avg_repair_turns: rounds.length
      ? Math.round((rounds.reduce((s, r) => s + (r.repair_turns ?? 0), 0) / rounds.length) * 100) / 100
      : null,
  };
}

/** Per-concept playtest summary plus totals. */
export async function summarizePlaytests() {
  const doc = await loadPlaytests();
  const byConcept = {};
  for (const r of doc.rounds ?? []) {
    const b = (byConcept[r.concept_id] ??= { concept_id: r.concept_id, rounds: 0, recovered: 0, repair_total: 0, last_at: null });
    b.rounds += 1;
    if (r.recovered) b.recovered += 1;
    b.repair_total += r.repair_turns ?? 0;
    if (!b.last_at || r.at > b.last_at) b.last_at = r.at;
  }
  const concepts = Object.values(byConcept).map(b => ({
    concept_id: b.concept_id,
    rounds: b.rounds,
    recovered: b.recovered,
    recovery_rate: b.rounds ? Math.round((b.recovered / b.rounds) * 100) / 100 : null,
    avg_repair_turns: b.rounds ? Math.round((b.repair_total / b.rounds) * 100) / 100 : null,
    last_at: b.last_at,
  })).sort((a, b) => (b.rounds - a.rounds) || a.concept_id.localeCompare(b.concept_id));

  const total = doc.rounds?.length ?? 0;
  const recovered = (doc.rounds ?? []).filter(r => r.recovered).length;
  return {
    total_rounds: total,
    recovered,
    overall_recovery_rate: total ? Math.round((recovered / total) * 100) / 100 : null,
    concepts,
  };
}

/**
 * Identify compound preferred forms that playtest data suggests should be promoted.
 *
 * A concept qualifies for promotion when:
 *   - it has >= minRounds playtest rounds,
 *   - its recovery_rate is >= minRecoveryRate, and
 *   - its current preferred_source is not already 'playtest' or 'human'.
 *
 * Returns a list ready for editorial review. Admins verify and call
 * optimize-compounds or directly update compounds.json.
 *
 * @param {object} [opts]
 * @param {number} [opts.minRounds=3]        minimum playtest rounds to qualify
 * @param {number} [opts.minRecoveryRate=0.7] minimum recovery_rate (0–1)
 */
export async function buildPlaytestPromotionCandidates({ minRounds = 3, minRecoveryRate = 0.7 } = {}) {
  const summary = await summarizePlaytests();
  const compoundsDoc = await readDoc('compounds');
  const compounds = compoundsDoc?.compounds ?? [];

  const promotable = [];
  for (const s of summary.concepts) {
    if (s.rounds < minRounds) continue;
    if (s.recovery_rate == null || s.recovery_rate < minRecoveryRate) continue;

    const compound = compounds.find(c => c.concept === s.concept_id);
    if (!compound) continue;
    const preferredSource = compound.preferred_source ?? compound.preferred?.preferred_source ?? 'heuristic';
    if (preferredSource === 'playtest' || preferredSource === 'human') continue;

    promotable.push({
      concept_id: s.concept_id,
      rounds: s.rounds,
      recovery_rate: s.recovery_rate,
      avg_repair_turns: s.avg_repair_turns,
      current_preferred_source: preferredSource,
      current_composition: compound.preferred?.composition ?? compound.composition ?? [],
      last_playtest: s.last_at,
      action: 'promote_to_playtest',
    });
  }

  return promotable.sort((a, b) => b.recovery_rate - a.recovery_rate || b.rounds - a.rounds);
}
