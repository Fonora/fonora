export const MODIFIER_ROW_ORDER = ['plain', 'voice', 'friction', 'nasal', 'glide'];

import {
  parseLanguageRulesMarkdown,
  buildSymbolRegistry,
  validateSymbolRegistry,
  loadLanguageRulesFromMarkdown,
  loadLanguageRules,
  loadLanguageRulesFromString,
  collectAllSymbols,
  FULLWIDTH_EQUALS,
  ASCII_EQUALS,
} from './load-language-rules.js';
import { getVowelEntries } from './vowel-display.js';

export {
  getVowelEntries,
  getVowelPhonemeKeys,
  findVowelByKey,
  vowelPhonemeKey,
  isVowelPhonemeKey,
  vowelSymbolForKey,
  findVowelForCell,
  isVowelQuizCell,
  buildVowelByKeyMap,
} from './vowel-display.js';

export {
  parseLanguageRulesMarkdown,
  buildSymbolRegistry,
  validateSymbolRegistry,
  loadLanguageRulesFromMarkdown,
  loadLanguageRules,
  loadLanguageRulesFromString,
  collectAllSymbols,
  FULLWIDTH_EQUALS,
  ASCII_EQUALS,
};

export { loadLanguageRules as loadRules } from './load-language-rules.js';

export function getAllSymbols(r) {
  if (!r) return [];
  return collectAllSymbols(r);
}

export function getThroatSymbol(r) {
  return r.places.find((p) => p.id === 'throat')?.symbol ?? '⊃';
}

function isVoiceThroatCombo(symbols, r) {
  const voice = r.modifiers.find((m) => m.id === 'voice')?.symbol;
  const throat = getThroatSymbol(r);
  if (!voice || !throat) return false;
  const combo = `${voice}${throat}`;
  return symbols === combo || symbols.startsWith(combo);
}

export function findGridCell(r, modifierId, placeId) {
  return r.soundGrid.find((c) => c.modifierId === modifierId && c.placeId === placeId);
}

/**
 * Grid cells used by encode/decode/quiz. Plain throat may document /h/ on ⊃ in the
 * chart while vowels retain ⊃ for encoding; /h/ stays on friction+throat symbols.
 */
function getEncoderGridCells(r) {
  const defined = (r.soundGrid || []).filter((c) => c.status === 'defined');
  const plainThroat = findGridCell(r, 'plain', 'throat');
  const frictionThroat = findGridCell(r, 'friction', 'throat');

  const cells = defined.filter((c) => c.modifierId !== 'plain' || c.placeId !== 'throat');

  if (plainThroat?.sound === 'h' && frictionThroat?.status === 'reserved') {
    cells.push({
      ...frictionThroat,
      sound: 'h',
      ipa: plainThroat.ipa || '/h/',
      status: 'defined',
      explanation: frictionThroat.explanation,
    });
  }

  return cells;
}

function getDecoderGridCells(r) {
  const cells = (r.soundGrid || []).filter(
    (c) => c.status !== 'undefined' && c.status !== 'reserved',
  );
  const plainThroat = findGridCell(r, 'plain', 'throat');
  const frictionThroat = findGridCell(r, 'friction', 'throat');

  const decoderCells = cells.filter((c) => c.modifierId !== 'plain' || c.placeId !== 'throat');

  if (plainThroat?.sound === 'h' && frictionThroat?.status === 'reserved') {
    decoderCells.push({
      ...frictionThroat,
      sound: 'h',
      ipa: plainThroat.ipa || '/h/',
      status: 'defined',
    });
  }

  return decoderCells;
}

export function getDecodableEntries(r) {
  const grid = getDecoderGridCells(r);
  const derived = (r.specialDerivedSounds || []).filter((c) => c.status === 'defined');
  const expDerived = (r.experimentalDerivedSounds || []).filter((c) => c.status === 'experimental');
  const vowels = getVowelEntries(r).filter(
    (c) => c.status !== 'undefined' && !isVoiceThroatCombo(c.symbols, r),
  );
  const aliases = r.vowelSymbolAliases || [];
  return [...grid, ...derived, ...expDerived, ...vowels, ...aliases];
}

export function getEncodableEntries(r) {
  const grid = getEncoderGridCells(r);
  const derived = (r.specialDerivedSounds || []).filter((c) => c.status === 'defined');
  const expDerived = (r.experimentalDerivedSounds || []).filter((c) => c.status === 'experimental');
  const vowels = getVowelEntries(r).filter(
    (c) => c.status !== 'undefined' && !isVoiceThroatCombo(c.symbols, r),
  );
  return [...grid, ...derived, ...expDerived, ...vowels];
}

export function getQuizEntries(r) {
  return getEncodableEntries(r).filter((c) => c.sound && c.sound !== '?');
}

export function buildSoundToSymbolsMap(r) {
  const map = {};
  for (const cell of getEncodableEntries(r)) {
    if (!map[cell.sound]) map[cell.sound] = cell.symbols;
  }
  return map;
}

export function getDefinedSounds(r) {
  return [...new Set(getEncodableEntries(r).map((c) => c.sound))].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b.localeCompare(a);
  });
}

export function buildSymbolPatterns(r) {
  return getDecodableEntries(r)
    .filter((cell) => cell.symbols)
    .map((cell) => ({ symbols: cell.symbols, cell }))
    .sort((a, b) => b.symbols.length - a.symbols.length);
}

export function buildKeyboardMap(r) {
  const byNumber = {};
  const byLetter = {};
  for (const p of r.places) {
    if (p.keyNumber) byNumber[String(p.keyNumber)] = p.symbol;
    if (p.keyLetter) byLetter[p.keyLetter.toLowerCase()] = p.symbol;
  }
  for (const m of r.modifiers) {
    if (m.keyNumber) byNumber[String(m.keyNumber)] = m.symbol;
    if (m.keyLetter) byLetter[m.keyLetter.toLowerCase()] = m.symbol;
  }
  return { byNumber, byLetter };
}

export function findCellBySymbols(r, symbols) {
  return getEncodableEntries(r).find((c) => c.symbols === symbols) || null;
}

export function reverseLookup(sound, r) {
  const trimmed = sound.trim();
  if (!trimmed) return null;
  const matches = getEncodableEntries(r).filter((c) => c.sound === trimmed);
  return matches.length ? matches : null;
}
