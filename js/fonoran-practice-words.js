/**
 * Shared Fonoran practice vocabulary from the lab bootstrap (communicative core by default).
 */
import { buildMeaningChoices } from '../tools/fonoran-meaning-choices.js';
import { experienceMetaFor } from '../tools/fonoran-experience-tiers.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';

/** @typedef {{ spelling: string, meaning: string, parts: string[], script: string, conceptId?: string }} PracticeEntry */

function meaningOf(item) {
  return (item.meaning ?? item.concept_id ?? item.gloss ?? '').toString().trim();
}

function isCoreSound(sound) {
  const conceptId = sound?.concept_id;
  if (!conceptId) return false;
  return experienceMetaFor(conceptId).language_tier === 'communicative_core';
}

function isCoreCompound(compound, soundBySpelling) {
  const parts = compound.parts ?? [];
  if (!parts.length) return false;
  return parts.every((spelling) => {
    const snd = soundBySpelling.get(spelling);
    if (!snd?.concept_id) return false;
    return experienceMetaFor(snd.concept_id).language_tier === 'communicative_core';
  });
}

/**
 * @param {object} lab
 * @param {object} rules
 * @param {{ coreOnly?: boolean }} [opts]
 * @returns {PracticeEntry[]}
 */
export function buildFonoranPracticeEntries(lab, rules, { coreOnly = true } = {}) {
  const sounds = lab?.sounds ?? [];
  const compounds = lab?.compounds ?? [];
  const soundBySpelling = new Map(sounds.map((s) => [s.spelling, s]));
  const entries = [];

  for (const sound of sounds) {
    if (!sound.spelling || sound.state === 'rejected') continue;
    if (coreOnly && !isCoreSound(sound)) continue;
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
    });
  }

  for (const compound of compounds) {
    if (!compound.spelling || compound.state === 'rejected') continue;
    if (coreOnly && !isCoreCompound(compound, soundBySpelling)) continue;
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
