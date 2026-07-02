/**
 * Soft probe runner — structural frame checks, no golden CI assert.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateEnglish, resetTranslatorCache } from './fonoran-translator.js';

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

export async function runTranslationProbes({ lab = null } = {}) {
  const corpus = await loadTranslationProbes();
  resetTranslatorCache();
  const phrases = [];
  let framePassCount = 0;
  let committedPass = 0;
  let committedFail = 0;
  let regressions = 0;

  for (const entry of corpus.phrases) {
    const r = await translateEnglish(entry.en, lab ? { lab } : {});
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
      missing: check.missing,
    });
  }

  return {
    version: corpus.version,
    total: phrases.length,
    frame_pass: framePassCount,
    committed_pass: committedPass,
    committed_broken: committedFail,
    regressions,
    ok: regressions === 0,
    phrases,
  };
}
