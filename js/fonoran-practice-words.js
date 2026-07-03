/**
 * Shared Fonoran practice vocabulary from the lab bootstrap (communicative core by default).
 */
import { buildMeaningChoices } from '../tools/fonoran-meaning-choices.js';
import { experienceMetaFor, LANGUAGE_TIERS } from '../tools/fonoran-experience-tiers.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';

/** @typedef {{ spelling: string, meaning: string, parts: string[], script: string, conceptId?: string, languageTier: string, tierRank: number }} PracticeEntry */

/** communicative_core = 0, extended_core = 1, complete = 2. */
function tierRank(languageTier) {
  const rank = LANGUAGE_TIERS.indexOf(languageTier);
  return rank < 0 ? LANGUAGE_TIERS.length - 1 : rank;
}

function meaningOf(item) {
  return (item.meaning ?? item.concept_id ?? item.gloss ?? '').toString().trim();
}

function soundTierRank(sound) {
  const conceptId = sound?.concept_id;
  if (!conceptId) return LANGUAGE_TIERS.length - 1;
  return tierRank(experienceMetaFor(conceptId).language_tier);
}

/** A compound is as advanced as its most advanced part. */
function compoundTierRank(compound, soundBySpelling) {
  const parts = compound.parts ?? [];
  if (!parts.length) return LANGUAGE_TIERS.length - 1;
  let rank = 0;
  for (const spelling of parts) {
    const snd = soundBySpelling.get(spelling);
    rank = Math.max(rank, snd ? soundTierRank(snd) : LANGUAGE_TIERS.length - 1);
  }
  return rank;
}

/**
 * Build practice entries from the lab dictionary. By default every non-rejected,
 * script-encodable root and compound is included so the Learn curriculum can walk
 * the full vocabulary from simple to complex. Pass `maxTierRank` to cap difficulty.
 * @param {object} lab
 * @param {object} rules
 * @param {{ coreOnly?: boolean, maxTierRank?: number }} [opts]
 * @returns {PracticeEntry[]}
 */
export function buildFonoranPracticeEntries(lab, rules, { coreOnly = false, maxTierRank = Infinity } = {}) {
  const cap = coreOnly ? 0 : maxTierRank;
  const sounds = lab?.sounds ?? [];
  const compounds = lab?.compounds ?? [];
  const soundBySpelling = new Map(sounds.map((s) => [s.spelling, s]));
  const entries = [];

  for (const sound of sounds) {
    if (!sound.spelling || sound.state === 'rejected') continue;
    const rank = soundTierRank(sound);
    if (rank > cap) continue;
    const meaning = meaningOf(sound);
    if (!meaning) continue;
    const { phrase } = romanToFonoraScript([sound.spelling], rules);
    if (!phrase) continue;
    entries.push({
      spelling: sound.spelling,
      meaning,
      parts: [sound.spelling],
      script: phrase,
      conceptId: sound.concept_id,
      languageTier: LANGUAGE_TIERS[rank],
      tierRank: rank,
    });
  }

  for (const compound of compounds) {
    if (!compound.spelling || compound.state === 'rejected') continue;
    const rank = compoundTierRank(compound, soundBySpelling);
    if (rank > cap) continue;
    const meaning = meaningOf(compound);
    if (!meaning) continue;
    const parts = compound.parts?.length ? compound.parts : [compound.spelling];
    const { phrase } = romanToFonoraScript(parts, rules);
    if (!phrase) continue;
    entries.push({
      spelling: compound.spelling,
      meaning,
      parts,
      script: phrase,
      conceptId: compound.concept_id,
      languageTier: LANGUAGE_TIERS[rank],
      tierRank: rank,
    });
  }

  return entries;
}

/** @param {PracticeEntry[]} entries */
export function shuffleEntries(entries) {
  const copy = [...entries];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * @param {PracticeEntry} entry
 * @param {PracticeEntry[]} pool
 */
export function meaningChoicesForEntry(entry, pool) {
  const distractorPool = pool
    .filter((item) => item.conceptId !== entry.conceptId)
    .map((item) => item.meaning);
  return buildMeaningChoices(entry.meaning, distractorPool, 4);
}

/**
 * @param {string} answer
 * @param {PracticeEntry} entry
 * @param {PracticeEntry[]} pool
 */
export function spellingMatchesEntry(answer, entry, pool) {
  const normalized = String(answer ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const candidates = new Set([entry.spelling.toLowerCase()]);
  for (const item of pool) {
    if (item.conceptId !== entry.conceptId) continue;
    candidates.add(item.spelling.toLowerCase());
  }
  return candidates.has(normalized);
}

let cachedLab = null;

export async function loadFonoranPracticeLab() {
  if (cachedLab) return cachedLab;
  const res = await fetch('/api/fonoran/bootstrap');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cachedLab = await res.json();
  return cachedLab;
}

export async function loadFonoranPracticeEntries(rules, opts = {}) {
  const data = await loadFonoranPracticeLab();
  return buildFonoranPracticeEntries(data.lab, rules, opts);
}

export { buildMeaningChoices };
