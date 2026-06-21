/**
 * Readability experiment: æ→a vs ɑ/ɔ/ɒ→o (open-vowel mode).
 * Run: node scripts/vowel-normalize-experiment.js
 */
import ESpeakNg from '../vendor/espeak-ng/espeak-ng.js';
import { normalizeIpa } from '../js/ipa-normalize.js';

const WORDS = [
  'cat', 'bat', 'hat', 'man',
  'cot', 'hot', 'dog', 'fog', 'log', 'lot', 'not', 'pot',
  'caught', 'thought', 'law', 'saw', 'talk',
  'father', 'palm', 'car',
];

async function textToIpa(text, voice = 'en-us') {
  const outfile = `ipa-exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.out`;
  const espeak = await ESpeakNg({
    arguments: ['--phonout', outfile, '-q', '--ipa=3', '-v', voice, text],
  });
  try {
    return espeak.FS.readFile(outfile, { encoding: 'utf8' }).trim();
  } finally {
    try {
      espeak.FS.unlink(outfile);
    } catch {
      // ignore
    }
  }
}

const rows = [];
for (const word of WORDS) {
  const ipa = await textToIpa(word);
  const current = normalizeIpa(ipa).phonemeString;
  const experimental = normalizeIpa(ipa, { vowelMode: 'open-vowel' }).phonemeString;
  rows.push({ word, ipa, current, experimental, changed: current !== experimental });
}

console.log('| Word | IPA (eSpeak en-us) | Current Fonora | Experimental Fonora |');
console.log('| ---- | ------------------ | -------------- | ------------------- |');
for (const r of rows) {
  const mark = r.changed ? ' *' : '';
  console.log(`| ${r.word} | ${r.ipa} | ${r.current} | ${r.experimental}${mark} |`);
}

const changed = rows.filter((r) => r.changed);
console.log(`\nChanged: ${changed.length} / ${rows.length}`);
if (changed.length) {
  console.log('Changed words:', changed.map((r) => `${r.word}: ${r.current} → ${r.experimental}`).join('; '));
}
