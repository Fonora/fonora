/**
 * Fonora text-to-speech — decode symbols and speak Fonora phonetics via Piper.
 */
import { decodeToPhonemeKeys } from './decode.js';
import { getAllSymbols } from './rules.js';
import { phonemeKeysToRecoveredIpa } from './pronunciation-validation.js';
import { cancelEspeakAudio } from './espeak-audio.js';
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

  const ipa = phonemeKeysToRecoveredIpa(word.phonemeKeys, rules, sourceIpa);
  if (!ipa || ipa.includes('?')) return null;
  return { text: ipa, mode: 'fonora-ipa', phonemeKeys: word.phonemeKeys, sourceIpa: sourceIpa || null };
}

export function cancelSpeech() {
  cancelEspeakAudio();
}

/** Speak each Fonora word using recovered IPA and Piper neural synthesis. */
export async function speakFonoraPhrase(text, rules, options = {}) {
  const {
    piperVoice = 'en_US-lessac-medium',
    onWordStart,
    onWordEnd,
    shouldCancel = () => false,
    onPrepare,
  } = options;

  const words = decodeFonoraPhrase(text, rules);
  if (!words.length) {
    return { words, spoken: 0, cancelled: false, skipped: 0 };
  }

  if (!isPiperAudioReady(piperVoice)) {
    onPrepare?.('Loading neural voice…');
  }
  const piperInit = await initPiperAudio(piperVoice, onPrepare);
  if (!piperInit.ok) {
    throw new Error(piperInit.error || 'Neural voice failed to load');
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
      await playPiperIpa(speakTarget.text, piperVoice, onPrepare);
      spoken += 1;
      onWordEnd?.(i, word, null, speakTarget);
    } catch (err) {
      onWordEnd?.(i, word, err, speakTarget);
      throw err;
    }

    if (shouldCancel()) {
      return { words, spoken, skipped, cancelled: true };
    }
  }

  return { words, spoken, skipped, cancelled: false };
}
