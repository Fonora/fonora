/**
 * Phonetic frequency analytics from gap reports and lab bucket.
 * Feeds saturation penalties in fonoran-phonetic-weights.js.
 */

import { writeFile } from 'node:fs/promises';
import { parseSyllable } from './fonoran-pronunciation.js';
import {
  rhymeFamily,
  rootEaseWeight,
  computeOnsetTierShare,
  computePhoneticScore,
  DEFAULT_RHYME_TARGETS,
} from './fonoran-phonetic-weights.js';
import { resolveDataPath } from './fonoran-data-paths.js';

function countOnsetVowel(spellings) {
  const onsetFrequency = {};
  const vowelFrequency = {};
  const rhymeFamilyCounts = {};
  let phoneticSum = 0;
  let phoneticN = 0;
  let syllableSum = 0;

  for (const spelling of spellings) {
    const syl = parseSyllable(String(spelling ?? '').toLowerCase());
    if (!syl || syl.unparsed) continue;
    if (syl.onset) onsetFrequency[syl.onset] = (onsetFrequency[syl.onset] ?? 0) + 1;
    if (syl.vowel) vowelFrequency[syl.vowel] = (vowelFrequency[syl.vowel] ?? 0) + 1;
    const fam = rhymeFamily(spelling);
    rhymeFamilyCounts[fam] = (rhymeFamilyCounts[fam] ?? 0) + 1;
    phoneticSum += rootEaseWeight(spelling);
    phoneticN += 1;
    syllableSum += syl.coda ? 2 : 1;
  }

  const totalRhyme = Object.values(rhymeFamilyCounts).reduce((a, b) => a + b, 0) || 1;
  const rhyme_family_share = {};
  for (const [fam, n] of Object.entries(rhymeFamilyCounts)) {
    rhyme_family_share[fam] = n / totalRhyme;
  }

  return {
    onsetFrequency,
    vowelFrequency,
    rhyme_family_share,
    rhyme_family_targets: { ...DEFAULT_RHYME_TARGETS },
    avg_phonetic_ease: phoneticN ? phoneticSum / phoneticN : 0,
    avg_flattened_syllables: phoneticN ? syllableSum / phoneticN : 0,
    root_token_count: phoneticN,
  };
}

/**
 * Collect root spellings from translated phrase roman output (space-separated tokens).
 * @param {object} gapReport
 */
export function extractSpellingsFromGapReport(gapReport) {
  const spellings = [];
  for (const p of gapReport?.phrases ?? []) {
    const roman = String(p.roman ?? '').trim();
    if (!roman) continue;
    for (const token of roman.split(/\s+/)) {
      const clean = token.replace(/[\[\]?]/g, '').trim();
      if (clean && /^[a-z]+$/i.test(clean)) spellings.push(clean.toLowerCase());
    }
  }
  return spellings;
}

/**
 * Collect spellings from lab bucket roots + compound surfaces.
 * @param {object|null} lab
 */
export function extractSpellingsFromLab(lab) {
  const spellings = [];
  for (const s of lab?.sounds ?? []) {
    if (s.spelling) spellings.push(String(s.spelling).toLowerCase());
  }
  for (const c of lab?.compounds ?? []) {
    if (c.spelling) spellings.push(String(c.spelling).toLowerCase());
  }
  return spellings;
}

/**
 * @param {object} gapReport
 * @param {object|null} lab
 * @param {number} [iteration]
 */
export function computePhoneticAnalytics(gapReport, lab = null, iteration = 0) {
  const fromPhrases = extractSpellingsFromGapReport(gapReport);
  const fromLab = lab ? extractSpellingsFromLab(lab) : [];
  const spellings = fromPhrases.length ? fromPhrases : fromLab;

  const stats = countOnsetVowel(spellings);
  const onset_tier_share = computeOnsetTierShare(stats.onsetFrequency);

  const joinCounts = new Map();
  for (const p of gapReport?.phrases ?? []) {
    const tokens = String(p.roman ?? '').trim().split(/\s+/).filter(t => /^[a-z]+$/i.test(t));
    for (let i = 0; i < tokens.length - 1; i++) {
      const key = `${tokens[i].toLowerCase()}|${tokens[i + 1].toLowerCase()}`;
      joinCounts.set(key, (joinCounts.get(key) ?? 0) + 1);
    }
  }
  const top_join_patterns = [...joinCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => [...k.split('|'), n]);

  return {
    generated_at: new Date().toISOString(),
    iteration,
    coverage_pct: gapReport?.coverage_pct ?? null,
    distinct_gaps: gapReport?.distinct_gaps ?? null,
    ...stats,
    onset_tier_share,
    avg_phonetic_score: stats.avg_phonetic_ease,
    top_join_patterns,
    quality: gapReport?.quality ?? null,
  };
}

export async function savePhoneticAnalytics(doc) {
  const path = resolveDataPath('phonetic_analytics');
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return doc;
}

export async function loadPhoneticAnalytics() {
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(resolveDataPath('phonetic_analytics'), 'utf8'));
  } catch {
    return null;
  }
}
