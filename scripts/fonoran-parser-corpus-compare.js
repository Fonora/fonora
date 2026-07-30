#!/usr/bin/env node
/**
 * Score the two parse front ends against each other on the golden corpus.
 *
 * The question a golden diff cannot answer is whether a change is an improvement: 565
 * phrases render differently, and the list says nothing about which reading is better.
 * What can be counted is content. An English content word either reaches the sentence as a
 * Fonoran word, or is bracketed as a gap, or disappears. The old parser dropped what it
 * could not place and still reported no gaps, so counting kept words and honest gaps
 * separately is what separates a real gain from noise.
 *
 * Usage: node scripts/fonoran-parser-corpus-compare.js [--limit N] [--show N]
 */
import { loadTranslationCorpus } from '../tools/fonoran-translation-gaps.js';
import { translateEnglish } from '../tools/fonoran-translator.js';

const argv = process.argv.slice(2);
const numberArg = (flag, fallback) => {
  const at = argv.indexOf(flag);
  return at === -1 ? fallback : Number(argv[at + 1]);
};
const limit = numberArg('--limit', Infinity);
const show = numberArg('--show', 12);

/** Content words, so articles and auxiliaries do not count as lost. */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does',
  'did', 'has', 'have', 'had', 'will', 'shall', 'of', 'that', 'this', 'these', 'those',
  'and', 'or', 'but', 'so', 'to', 'it', 'its', 'there', 'here', 'please', 'let', 'us',
]);

const contentWords = phrase => String(phrase ?? '')
  .toLowerCase()
  .split(/[^a-z']+/)
  .filter(w => w.length > 1 && !FUNCTION_WORDS.has(w));

/**
 * How much of the English reached the output, and how much was reported missing.
 * @param {string} phrase
 * @param {'patterns'|'pos'} parser
 */
async function score(phrase, parser) {
  const result = await translateEnglish(phrase, { parser });
  const roman = result.surface?.roman ?? '';
  const kept = new Set();
  for (const token of result.tokens ?? []) {
    if (!token.resolved || !token.fonoran) continue;
    for (const word of contentWords(token.english)) kept.add(word);
  }
  return {
    roman,
    kept: kept.size,
    gaps: (result.unresolved ?? []).length,
    words: contentWords(phrase).length,
  };
}

const corpus = await loadTranslationCorpus('golden');
const all = (corpus.levels ?? []).flatMap(level => level.phrases ?? []);
const phrases = limit === Infinity ? all : all.slice(0, limit);

const tally = { better: 0, worse: 0, same: 0, gapsPatterns: 0, gapsPos: 0, keptPatterns: 0, keptPos: 0 };
const wins = [];
const losses = [];

for (const entry of phrases) {
  const phrase = typeof entry === 'string' ? entry : entry.phrase ?? entry.en;
  if (!phrase) continue;
  const patterns = await score(phrase, 'patterns');
  const pos = await score(phrase, 'pos');
  tally.keptPatterns += patterns.kept;
  tally.keptPos += pos.kept;
  tally.gapsPatterns += patterns.gaps;
  tally.gapsPos += pos.gaps;
  const delta = pos.kept - patterns.kept;
  if (delta > 0) { tally.better += 1; wins.push({ phrase, patterns, pos, delta }); } else if (delta < 0) { tally.worse += 1; losses.push({ phrase, patterns, pos, delta }); } else tally.same += 1;
}

const pct = n => `${((n / phrases.length) * 100).toFixed(1)}%`;
console.log(`phrases: ${phrases.length}`);
console.log(`content words kept   patterns ${tally.keptPatterns}   pos ${tally.keptPos}`);
console.log(`gaps reported        patterns ${tally.gapsPatterns}   pos ${tally.gapsPos}`);
console.log(`pos keeps more       ${tally.better} (${pct(tally.better)})`);
console.log(`pos keeps less       ${tally.worse} (${pct(tally.worse)})`);
console.log(`same content         ${tally.same} (${pct(tally.same)})`);

const sample = (label, rows) => {
  console.log(`\n${label}`);
  for (const row of rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, show)) {
    console.log(`  ${row.phrase}`);
    console.log(`    patterns ${row.patterns.roman}`);
    console.log(`    pos      ${row.pos.roman}`);
  }
};
sample('pos keeps more content:', wins);
sample('pos keeps less content:', losses);
