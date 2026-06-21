import { buildSoundToSymbolsMap, getDefinedSounds } from './rules.js';
import { normalizeEnglishText, normalizeEnglishWord } from './normalize.js';
import { findDictionaryEntry } from './glossary.js';
import { runEncoderPipeline } from './encoder-pipeline.js';

export function encodeSounds(pronunciation, rules) {
  const sounds = getDefinedSounds(rules);
  const soundToSymbols = buildSoundToSymbolsMap(rules);
  const text = pronunciation.trim();
  const groups = [];
  const warnings = [];
  let symbols = '';
  let i = 0;

  while (i < text.length) {
    if (/\s/.test(text[i])) {
      symbols += text[i];
      i++;
      continue;
    }

    let matched = false;
    for (const sound of sounds) {
      if (text.slice(i, i + sound.length) !== sound) continue;
      groups.push({ sound, symbols: soundToSymbols[sound] });
      symbols += soundToSymbols[sound];
      i += sound.length;
      matched = true;
      break;
    }

    if (!matched) {
      const ch = text[i];
      warnings.push(`Unknown sound "${ch}" at position ${i + 1}.`);
      groups.push({ sound: ch, symbols: '?' });
      symbols += '?';
      i++;
    }
  }

  return { symbols, pronunciation: text, groups, warnings };
}

export function translateEnglishWord(word, rules) {
  const result = runEncoderPipeline(word, rules, { mode: 'english' });
  if (!result) return null;

  return {
    source: result.primarySource === 'dictionary' ? 'dictionary' : 'encoded',
    original: result.original,
    english: result.original,
    cleaned: result.cleaned,
    pronunciationForm: result.pronunciationForm,
    phonetic: result.pronunciationForm,
    normalized: result.sounds,
    sounds: result.sounds,
    soundUnits: result.phoneticParse,
    symbols: result.symbols,
    decoded: result.decoded,
    pronunciationActions: result.pronunciationActions,
    conversionActions: result.conversionActions,
    actions: result.actions,
    warnings: result.warnings,
    breakdown: result.breakdown,
  };
}

export function translateEnglishPhrase(text, rules) {
  const norm = normalizeEnglishText(text);
  if (!norm.words.some((w) => w.type === 'word')) return null;

  const wordResults = norm.words
    .filter((w) => w.type === 'word')
    .map((w) => {
      const pipeline = runEncoderPipeline(w.english, rules, { mode: 'english' });
      if (pipeline.primarySource === 'dictionary') {
        return {
          source: 'dictionary',
          original: w.english,
          english: w.english,
          cleaned: pipeline.cleaned,
          pronunciationForm: pipeline.pronunciationForm,
          normalized: pipeline.sounds,
          sounds: pipeline.sounds,
          symbols: pipeline.symbols,
          actions: pipeline.actions,
          warnings: pipeline.warnings,
        };
      }
      const encoded = encodeSounds(w.sounds, rules);
      return {
        source: 'encoded',
        original: w.english,
        english: w.english,
        cleaned: w.cleaned,
        pronunciationForm: w.pronunciationForm,
        phonetic: w.pronunciationForm,
        normalized: w.sounds,
        sounds: w.sounds,
        symbols: encoded.symbols,
        actions: w.actions,
        warnings: [...w.warnings, ...encoded.warnings],
      };
    });

  const fonoraParts = [];
  let wi = 0;
  for (const w of norm.words) {
    if (w.type === 'space') fonoraParts.push(w.value);
    else fonoraParts.push(wordResults[wi++].symbols);
  }

  return {
    original: text,
    cleaned: norm.cleaned,
    pronunciationForm: norm.pronunciationForm,
    phonetic: norm.phonetic,
    normalized: norm.sounds,
    sounds: norm.sounds,
    symbols: fonoraParts.join(''),
    words: wordResults,
    pronunciationActions: norm.words
      .filter((w) => w.type === 'word')
      .flatMap((w) => w.pronunciationActions?.map((a) => `${w.english}: ${a}`) || []),
    conversionActions: norm.words
      .filter((w) => w.type === 'word')
      .flatMap((w) => w.conversionActions?.map((a) => `${w.english}: ${a}`) || []),
    actions: norm.actions,
    warnings: norm.warnings,
    source: wordResults.every((w) => w.source === 'dictionary') ? 'dictionary' : 'encoded',
  };
}
