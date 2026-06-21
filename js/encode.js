import { buildSoundToSymbolsMap, getDefinedSounds } from './rules.js';

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
