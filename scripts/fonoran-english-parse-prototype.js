#!/usr/bin/env node
/**
 * Compare the two English front ends through the SAME Fonoran renderer.
 *
 *   node scripts/fonoran-english-parse-prototype.js          disagreements only
 *   node scripts/fonoran-english-parse-prototype.js --all    every probe
 *
 * `patterns` is the original cascade of hand-written English matchers, whose slot
 * assignment falls through to word position when nothing matches, so an adjective shifts
 * every role. `pos` reads word class from a tagger (tools/fonoran-english-parse.js).
 * Both run through the real translator, so particles, `nohu` composition, tense and
 * lexicon lookup are identical on both sides and only the parse differs.
 *
 * WordNet judges whether the word in the Action slot can be a verb, so the verdict does
 * not come from the tagger that chose it. The one exemption is a copular complement:
 * "the world was young" has no verb to find and Fonoran states the quality directly, so
 * `young` in the Action slot is correct. The exemption is deliberately narrow, requiring a
 * be-form before the word with no verb and no preposition in between, which is why it
 * covers `young` and `afraid` but not the `city` of "been to the city", and it is applied
 * identically to both engines.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { translateEnglishLegacy } from '../tools/fonoran-translator.js';
import { isMainModule } from '../tools/is-main.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nlp = winkNLP(model);
const its = nlp.its;

/** WordNet is the judge, with de-inflection so "walked" counts as a verb. */
function makeVerbCheck() {
  const require = createRequire(import.meta.url);
  const wp = new (require('wordpos'))({ profile: false });
  const IRREGULAR = {
    went: 'go', gone: 'go', ran: 'run', flew: 'fly', said: 'say', been: 'be', was: 'be',
    were: 'be', saw: 'see', ate: 'eat', took: 'take', came: 'come', left: 'leave',
    felt: 'feel', held: 'hold', made: 'make', got: 'get', gave: 'give', knew: 'know',
  };
  const CLOSED = new Set([
    'i', 'me', 'you', 'we', 'us', 'they', 'them', 'he', 'him', 'she', 'her', 'it',
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'when', 'if', 'because',
    'and', 'but', 'or', 'to', 'of', 'in', 'on', 'at', 'from', 'with', 'for',
  ]);
  return async function couldBeVerb(word) {
    const w = String(word ?? '').toLowerCase().split(/\s+/)[0];
    if (!/^[a-z]+$/.test(w)) return { ok: false, why: 'not a word' };
    if (CLOSED.has(w)) return { ok: false, why: 'closed class' };
    const cands = new Set([w, IRREGULAR[w]].filter(Boolean));
    if (w.endsWith('ies')) cands.add(`${w.slice(0, -3)}y`);
    if (w.endsWith('es')) { cands.add(w.slice(0, -2)); cands.add(w.slice(0, -1)); }
    if (w.endsWith('s')) cands.add(w.slice(0, -1));
    if (w.endsWith('ed')) { cands.add(w.slice(0, -2)); cands.add(w.slice(0, -1)); }
    if (w.endsWith('ing')) { cands.add(w.slice(0, -3)); cands.add(`${w.slice(0, -3)}e`); }
    for (const c of cands) if (await wp.isVerb(c).catch(() => true)) return { ok: true };
    return { ok: false, why: 'never a verb' };
  };
}

const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);

/**
 * Is this word the complement of a copula? "was young" and "are you tired" are, so an
 * adjective in the Action slot is right there. "been to the city" is not, because the
 * preposition means the city is a landmark rather than what the subject is said to be.
 */
function isCopularComplement(sentence, word) {
  const doc = nlp.readDoc(sentence);
  const values = doc.tokens().out(its.value).map(v => v.toLowerCase());
  const tags = doc.tokens().out(its.pos);
  const target = String(word).toLowerCase();
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== target) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (tags[j] === 'VERB' || tags[j] === 'ADP') break;
      if (tags[j] === 'AUX' && BE_FORMS.has(values[j])) return true;
    }
  }
  return false;
}

/** Read the slots back off the rendered tokens, which is what the frame consumers see. */
function rolesOf(result) {
  const pick = role => result.tokens
    .filter(t => t.role === role && t.english && !t.particle && t.role !== 'punctuation')
    .map(t => String(t.english).toLowerCase());
  return {
    actor: pick('subject')[0] ?? null,
    action: pick('event')[0] ?? null,
    target: pick('object')[0] ?? null,
    place: pick('path')[0] ?? null,
    time: pick('time')[0] ?? null,
  };
}

export async function compare() {
  const probes = JSON.parse(
    await readFile(join(ROOT, 'data/fonoran-translation-probes.json'), 'utf8'),
  ).phrases;
  const couldBeVerb = makeVerbCheck();
  const rows = [];

  for (const probe of probes) {
    const patterns = await translateEnglishLegacy(probe.en, { parser: 'patterns' });
    const pos = await translateEnglishLegacy(probe.en, { parser: 'pos' });

    const hasVerb = nlp.readDoc(probe.en).tokens().out(its.pos).includes('VERB');
    const judge = async (action) => {
      if (!action) {
        return hasVerb
          ? { ok: false, why: 'no Action, though the sentence has a verb' }
          : { ok: true, note: 'verbless' };
      }
      const verdict = await couldBeVerb(action);
      if (verdict.ok) return verdict;
      if (isCopularComplement(probe.en, action)) return { ok: true, note: 'copular predicate' };
      return verdict;
    };

    const patternRoles = rolesOf(patterns);
    const posRoles = rolesOf(pos);
    rows.push({
      en: probe.en,
      status: probe.status ?? 'none',
      patternRoles,
      posRoles,
      patternAction: await judge(patternRoles.action),
      posAction: await judge(posRoles.action),
      patternRoman: patterns.surface?.roman ?? '',
      posRoman: pos.surface?.roman ?? '',
      patternGaps: patterns.unresolved ?? [],
      posGaps: pos.unresolved ?? [],
    });
  }
  return rows;
}

function fmt(roles) {
  return [
    `Actor=${roles.actor ?? '-'}`,
    `Action=${roles.action ?? '-'}`,
    `Target=${roles.target ?? '-'}`,
    `Place=${roles.place ?? '-'}`,
    `Time=${roles.time ?? '-'}`,
  ].join(' ');
}

if (isMainModule(import.meta.url)) {
  const showAll = process.argv.includes('--all');
  const rows = await compare();

  const patternBad = rows.filter(r => !r.patternAction.ok);
  const posBad = rows.filter(r => !r.posAction.ok);
  const differs = rows.filter(r => r.patternRoman !== r.posRoman);

  for (const r of showAll ? rows : patternBad) {
    console.log(`"${r.en}"  [probe status: ${r.status}]`);
    console.log(`  patterns  ${fmt(r.patternRoles)}${r.patternAction.ok ? '' : `   <- Action ${r.patternAction.why}`}`);
    console.log(`            ${r.patternRoman}${r.patternGaps.length ? `   gaps: ${r.patternGaps.join(', ')}` : ''}`);
    console.log(`  pos       ${fmt(r.posRoles)}${r.posAction.ok ? '' : `   <- Action ${r.posAction.why}`}`);
    console.log(`            ${r.posRoman}${r.posGaps.length ? `   gaps: ${r.posGaps.join(', ')}` : ''}`);
    console.log('');
  }

  const gaps = key => rows.reduce((n, r) => n + r[key].length, 0);
  console.log(`Probe sentences: ${rows.length}`);
  console.log(`Action slot cannot be a verb   patterns: ${patternBad.length}   pos: ${posBad.length}`);
  console.log(`Bracketed gaps                 patterns: ${gaps('patternGaps')}   pos: ${gaps('posGaps')}`);
  console.log(`Rendered output differs in ${differs.length} of ${rows.length}.`);
  const hidden = patternBad.filter(r => r.status === 'pass').length;
  if (hidden) {
    console.log(`${hidden} of the pattern parser's bad Action slots sit behind probe status "pass", so the suite cannot see them.`);
  }
}
