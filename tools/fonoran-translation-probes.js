/**
 * Soft probe runner — structural frame checks, no golden CI assert.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateEnglish, resetTranslatorCache } from './fonoran-translator.js';
import { translate } from './fonoran-translate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBES_PATH = join(ROOT, 'data/fonoran-translation-probes.json');

export async function loadTranslationProbes() {
  return JSON.parse(await readFile(PROBES_PATH, 'utf8'));
}

/** Collect lowercase English heads from compiled slots + resolved tokens. */
function collectFrameSignals(result) {
  const signals = new Set();
  const slots = result.semantic?.slots;
  if (slots) {
    for (const key of ['subject', 'time', 'event', 'path', 'object', 'modifiers']) {
      for (const slot of slots[key] ?? []) {
        const eng = String(slot.english ?? '').toLowerCase();
        if (eng) {
          for (const part of eng.split(/\s+/)) signals.add(part);
        }
      }
    }
  }
  for (const tok of result.tokens ?? []) {
    if (tok.english) signals.add(String(tok.english).toLowerCase());
    if (tok.concept_id) signals.add(String(tok.concept_id).toLowerCase());
    if (tok.interpreted_from) signals.add(String(tok.interpreted_from).toLowerCase());
  }
  return signals;
}

/**
 * Check target_frame string (heads separated by ·) against translation signals.
 * @returns {{ pass: boolean, missing: string[], signals: string[] }}
 */
export function checkTargetFrame(targetFrame, result) {
  const required = String(targetFrame ?? '')
    .split('·')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const signals = collectFrameSignals(result);
  const missing = required.filter(head => {
    if (signals.has(head)) return false;
    for (const sig of signals) {
      if (sig.includes(head) || head.includes(sig)) return false;
    }
    return true;
  });
  return { pass: missing.length === 0, missing, signals: [...signals] };
}

/** Probes marked pass must keep their frame; broken probes are informational only. */
export function classifyProbeResult(entry, check) {
  const status = entry.status ?? 'pass';
  const framePass = check.pass;
  let regression = false;
  if (status === 'pass') regression = !framePass;
  return { status, framePass, regression };
}

/**
 * Translate one probe on the requested engine.
 *
 * `llm` is the shipped compiler and the default. `legacy` is selectable for
 * comparison only: it is @deprecated and diverges from production in ways that
 * change probe verdicts, since it does not group coordinated constituents and
 * drops WH words when a destination path is present (RN-38). Verdicts taken
 * from it do not describe what ships.
 */
async function translateProbe(en, { engine, cacheOnly, lab }) {
  if (engine === 'legacy') return translateEnglish(en, lab ? { lab } : {});
  // sourceLang must be explicit: the cache key is `${lang}|${text}`, so omitting
  // it looks up `auto|...` and misses every warmed English entry.
  return translate(en, { engine: 'llm', cacheOnly, sourceLang: 'en', ...(lab ? { lab } : {}) });
}

export async function runTranslationProbes({ lab = null, engine = 'llm', cacheOnly = true } = {}) {
  const corpus = await loadTranslationProbes();
  resetTranslatorCache();
  const phrases = [];
  const warmNeeded = [];
  let framePassCount = 0;
  let committedPass = 0;
  let committedFail = 0;
  let regressions = 0;

  for (const entry of corpus.phrases) {
    const r = await translateProbe(entry.en, { engine, cacheOnly, lab });

    // A cache miss is an infrastructure state, not a language failure: it says
    // nothing about the frame, so it is reported for warming rather than scored.
    if (r?.cache_miss) {
      warmNeeded.push(entry.en);
      phrases.push({
        en: entry.en,
        target_frame: entry.target_frame,
        status: entry.status ?? 'pass',
        note: entry.note ?? null,
        roman: '',
        unresolved: [],
        frame_pass: false,
        regression: false,
        cache_miss: true,
        missing: [],
      });
      continue;
    }

    const check = checkTargetFrame(entry.target_frame, r);
    const unresolved = r.unresolved ?? [];
    const verdict = classifyProbeResult(entry, check);
    if (check.pass) framePassCount += 1;
    if (verdict.status === 'pass') {
      committedPass += 1;
      if (verdict.regression) regressions += 1;
    } else {
      committedFail += 1;
    }
    phrases.push({
      en: entry.en,
      target_frame: entry.target_frame,
      status: verdict.status,
      note: entry.note ?? null,
      roman: r.surface?.roman ?? '',
      unresolved,
      frame_pass: verdict.framePass,
      regression: verdict.regression,
      cache_miss: false,
      missing: check.missing,
    });
  }

  return {
    version: corpus.version,
    engine,
    total: phrases.length,
    frame_pass: framePassCount,
    committed_pass: committedPass,
    committed_broken: committedFail,
    regressions,
    warm_needed: warmNeeded,
    ok: regressions === 0 && warmNeeded.length === 0,
    phrases,
  };
}
