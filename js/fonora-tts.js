/**
 * Fonora text-to-speech, decode symbols and speak Fonora phonetics via Piper or eSpeak IPA.
 */
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { decodeToPhonemeKeys } from './decode.js';
import { getAllSymbols } from './rules.js';
import { phonemeKeysToRecoveredIpa } from './pronunciation-validation.js';
import {
  cancelEspeakAudio,
  initEspeakAudio,
  synthesizeEspeakIpa,
  playEspeakSamples,
} from './espeak-audio.js';
import { initPiperAudio, isPiperAudioReady, playPiperIpa } from './piper-audio.js';

export function tokenizeFonoraPhrase(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

export function decodeFonoraWord(word, rules) {
  const decoded = decodeToPhonemeKeys(word, rules);
  return {
    symbols: word,
    phonemeKeys: decoded.phonemeKeys,
    groups: decoded.groups,
    warnings: decoded.warnings || [],
  };
}

export function decodeFonoraPhrase(text, rules) {
  return tokenizeFonoraPhrase(text).map((word) => decodeFonoraWord(word, rules));
}

/** True when pasted text looks like ASCII phoneme keys, not Fonora symbols. */
export function looksLikePhonemeKeyText(text, rules) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;

  const symSet = new Set(getAllSymbols(rules));
  for (const ch of trimmed.replace(/\s/g, '')) {
    if (symSet.has(ch)) return false;
  }

  return /^[a-z]+(\s+[a-z]+)+$/i.test(trimmed);
}

let readerWordSources = null;

/** Remember per-word source IPA from the Translator (index-aligned with symbol words). */
export function setReaderWordSources(words) {
  readerWordSources = (words || []).map((word) => ({
    symbols: word.symbols,
    phonemeKeys: word.normalizedPhonemes,
    sourceIpa: word.ipa || '',
    sourceWord: word.original || word.input || '',
  }));
}

export function getReaderWordSources() {
  return readerWordSources;
}

/** Map decoded phoneme keys to IPA for synthesis (prefers encode-time source IPA when aligned). */
export function resolveFonoraPhoneticText(word, rules, index = -1) {
  const source = readerWordSources?.[index];
  let sourceIpa = '';
  if (source && (source.phonemeKeys === word.phonemeKeys || source.symbols === word.symbols)) {
    sourceIpa = source.sourceIpa || '';
  }

  const recovered = phonemeKeysToRecoveredIpa(word.phonemeKeys, rules, sourceIpa);
  const sourceClean = String(sourceIpa || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\u200d\u200c\u2060\ufeff]/g, '')
    .trim();

  let ipa = recovered;
  let mode = 'fonora-ipa';
  if ((!ipa || ipa.includes('?')) && sourceClean && !sourceClean.includes('?')) {
    ipa = sourceClean;
    mode = 'source-ipa';
  }

  if (!ipa || ipa.includes('?')) return null;
  return { text: ipa, mode, phonemeKeys: word.phonemeKeys, sourceIpa: sourceIpa || null };
}

export function cancelSpeech() {
  cancelEspeakAudio();
}

async function speakIpaWithEngine(ipa, { engine, piperVoice, espeakVoice, onPrepare, piperReady, espeakReady, playbackRate }) {
  const tryPiper = (engine === 'piper' || engine === 'auto') && piperVoice && piperReady;

  if (tryPiper) {
    try {
      await playPiperIpa(ipa, piperVoice, onPrepare, { playbackRate });
      return;
    } catch (err) {
      if (engine !== 'auto') throw err;
    }
  }

  if ((engine === 'espeak' || engine === 'auto') && espeakReady) {
    const samples = await synthesizeEspeakIpa(ipa, espeakVoice);
    if (!samples?.length) {
      throw new Error('No audio generated from recovered IPA');
    }
    await playEspeakSamples(samples, 22050, { playbackRate });
    return;
  }

  throw new Error('Speech synthesis unavailable for recovered IPA');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Speak each Fonora word using recovered IPA.
 * @param {object} options
 * @param {'piper'|'espeak'|'auto'} [options.engine='piper']
 * @param {string} [options.piperVoice]
 * @param {string} [options.espeakVoice='en-us']
 */
export async function speakFonoraPhrase(text, rules, options = {}) {
  const {
    engine = 'piper',
    piperVoice = 'en_US-lessac-medium',
    espeakVoice = 'en-us',
    playbackRate = 1,
    wordGapMs = 0,
    onWordStart,
    onWordEnd,
    shouldCancel = () => false,
    onPrepare,
  } = options;

  const words = decodeFonoraPhrase(text, rules);
  if (!words.length) {
    return { words, spoken: 0, cancelled: false, skipped: 0 };
  }

  let piperReady = false;
  if ((engine === 'piper' || engine === 'auto') && piperVoice) {
    if (!isPiperAudioReady(piperVoice)) {
      onPrepare?.('Loading neural voice…');
    }
    const piperInit = await initPiperAudio(piperVoice, onPrepare);
    piperReady = piperInit.ok;
    if (engine === 'piper' && !piperInit.ok) {
      throw new Error(piperInit.error || 'Neural voice failed to load');
    }
  }

  let espeakReady = false;
  if (engine === 'espeak' || engine === 'auto') {
    const espeakInit = await initEspeakAudio();
    espeakReady = espeakInit.ok;
    if (engine === 'espeak' && !espeakInit.ok) {
      throw new Error(espeakInit.error || 'eSpeak audio failed to load');
    }
  }

  if (engine === 'auto' && !piperReady && !espeakReady) {
    throw new Error('No speech engine available');
  }

  let spoken = 0;
  let skipped = 0;

  for (let i = 0; i < words.length; i++) {
    if (shouldCancel()) {
      return { words, spoken, skipped, cancelled: true };
    }

    const word = words[i];
    const speakTarget = resolveFonoraPhoneticText(word, rules, i);

    if (!speakTarget?.text) {
      skipped += 1;
      onWordEnd?.(i, word, new Error(`Could not recover IPA for phoneme keys: ${word.phonemeKeys}`));
      continue;
    }

    try {
      onWordStart?.(i, word, speakTarget);
      await speakIpaWithEngine(speakTarget.text, {
        engine,
        piperVoice,
        espeakVoice,
        onPrepare,
        piperReady,
        espeakReady,
        playbackRate,
      });
      spoken += 1;
      onWordEnd?.(i, word, null, speakTarget);
    } catch (err) {
      skipped += 1;
      onWordEnd?.(i, word, err, speakTarget);
      if (engine === 'piper') {
        throw err;
      }
    }

    if (shouldCancel()) {
      return { words, spoken, skipped, cancelled: true };
    }

    if (wordGapMs > 0 && i < words.length - 1) {
      await sleep(wordGapMs);
      if (shouldCancel()) {
        return { words, spoken, skipped, cancelled: true };
      }
    }
  }

  if (spoken === 0 && skipped > 0) {
    throw new Error('Could not speak any words from Fonora rendering');
  }

  return { words, spoken, skipped, cancelled: false };
}

const SLOW_PLAYBACK_RATE = 0.72;
const SLOW_SYLLABLE_GAP_MS = 480;

/**
 * Slow playback for hearing practice — one syllable/part at a time when possible.
 * @param {string} text Fonora script for the full word
 * @param {object} rules
 * @param {object} [options]
 * @param {string[]} [options.parts] Roman syllable/morpheme parts from lexicon
 * @param {'piper'|'espeak'|'auto'} [options.engine='auto']
 */
export async function speakFonoraSlow(text, rules, options = {}) {
  const {
    parts = [],
    engine = 'auto',
    playbackRate = SLOW_PLAYBACK_RATE,
    syllableGapMs = SLOW_SYLLABLE_GAP_MS,
    shouldCancel = () => false,
    ...rest
  } = options;

  cancelSpeech();

  /** @type {string[]} */
  const chunks = [];
  if (parts.length > 1) {
    for (const part of parts) {
      const { phrase } = romanToFonoraScript([part], rules);
      if (phrase) chunks.push(phrase);
    }
  }

  const script = String(text || '').trim();
  if (!chunks.length && script) {
    chunks.push(script);
  }

  if (!chunks.length) {
    return { spoken: 0, cancelled: false };
  }

  let spoken = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (shouldCancel()) {
      return { spoken, cancelled: true };
    }

    await speakFonoraPhrase(chunks[i], rules, {
      engine,
      playbackRate,
      wordGapMs: 0,
      shouldCancel,
      ...rest,
    });
    spoken += 1;

    if (i < chunks.length - 1) {
      await sleep(syllableGapMs);
    }
  }

  return { spoken, cancelled: shouldCancel() };
}
