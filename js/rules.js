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

function getEncoderGridCells(r) {
  return (r.soundGrid || []).filter((c) => c.status === 'defined');
}

function getDecoderGridCells(r) {
  return (r.soundGrid || []).filter(
    (c) => c.status !== 'undefined' && c.status !== 'reserved',
  );
}

export function getDecodableEntries(r) {
  const grid = getDecoderGridCells(r);
  const derived = (r.derivedSounds || []).filter((c) => c.status === 'defined');
  const expDerived = (r.experimentalDerivedSounds || []).filter((c) => c.status === 'experimental');
  const vowels = getVowelEntries(r).filter(
    (c) => c.status !== 'undefined' && !isVoiceThroatCombo(c.symbols, r),
  );
  const aliases = r.vowelSymbolAliases || [];
  return [...grid, ...derived, ...expDerived, ...vowels, ...aliases];
}

export function getEncodableEntries(r) {
  const grid = getEncoderGridCells(r);
  const derived = (r.derivedSounds || []).filter((c) => c.status === 'defined');
  const expDerived = (r.experimentalDerivedSounds || []).filter((c) => c.status === 'experimental');
  const vowels = getVowelEntries(r).filter(
    (c) => c.status !== 'undefined' && !isVoiceThroatCombo(c.symbols, r),
  );
  return [...grid, ...derived, ...expDerived, ...vowels];
}

export function getQuizEntries(r) {
  return getEncodableEntries(r).filter((c) => c.sound && c.sound !== '?');
}

function phonemeInventoryRow(cell, category, options = {}) {
  const gridNa = 'N/A';
  if (options.reserved || cell.status === 'reserved') {
    return {
      key: cell.sound || gridNa,
      symbols: cell.symbols || '',
      ipa: cell.ipa || gridNa,
      notes: cell.explanation || '',
      category: 'reserved',
      reserved: true,
    };
  }
  return {
    key: cell.sound || cell.key || '',
    symbols: cell.symbols || '',
    ipa: cell.ipa || '',
    notes: cell.explanation || cell.lexicalSet || cell.example || '',
    category,
    reserved: false,
  };
}

/** @typedef {'articulatory' | 'alphabetical'} AlphabetInventoryOrder */

/** Grouped phoneme inventory for the Alphabet tab (consonants, derived, vowels, reserved). */
export function buildPhonemeInventory(r, options = {}) {
  const order = options.order === 'alphabetical' ? 'alphabetical' : 'articulatory';
  const encodable = getEncodableEntries(r).filter((c) => c.sound && c.sound !== '?');

  const consonants = [];
  const derived = [];
  const vowelCells = [];
  const reserved = [];

  for (const cell of r.soundGrid || []) {
    if (cell.status === 'reserved') {
      reserved.push(phonemeInventoryRow(cell, 'reserved', { reserved: true }));
    }
  }

  for (const cell of encodable) {
    if (cell.modifierId && cell.placeId) {
      if (order === 'alphabetical') {
        consonants.push(phonemeInventoryRow(cell, 'consonant'));
      }
    } else if (cell.composition) {
      if (order === 'alphabetical') {
        derived.push(phonemeInventoryRow(cell, 'derived'));
      }
    } else {
      vowelCells.push(cell);
    }
  }

  if (order === 'articulatory') {
    for (const cell of r.soundGrid || []) {
      if (cell.status === 'defined' && cell.modifierId && cell.placeId) {
        consonants.push(phonemeInventoryRow(cell, 'consonant'));
      }
    }
    for (const cell of r.derivedSounds || []) {
      if (cell.status === 'defined') {
        derived.push(phonemeInventoryRow(cell, 'derived'));
      }
    }
    for (const cell of r.experimentalDerivedSounds || []) {
      if (cell.status === 'experimental') {
        derived.push(phonemeInventoryRow(cell, 'derived'));
      }
    }
  } else {
    consonants.sort((a, b) => a.key.localeCompare(b.key));
    derived.sort((a, b) => a.key.localeCompare(b.key));
  }

  const vowelOrder = getVowelEntries(r).map((v) => v.key || v.vowel || v.sound || '');
  const vowelByKey = new Map(
    vowelCells.map((cell) => {
      const key = cell.sound || cell.key || '';
      return [key, phonemeInventoryRow(cell, 'vowel')];
    }),
  );
  let vowels = vowelOrder.filter((k) => vowelByKey.has(k)).map((k) => vowelByKey.get(k));
  for (const cell of vowelCells) {
    const key = cell.sound || cell.key || '';
    if (!vowelOrder.includes(key)) {
      vowels.push(phonemeInventoryRow(cell, 'vowel'));
    }
  }
  if (order === 'alphabetical') {
    vowels = [...vowels].sort((a, b) => a.key.localeCompare(b.key));
  }

  if (order === 'alphabetical') {
    reserved.sort((a, b) => a.symbols.localeCompare(b.symbols));
  }

  return { consonants, derived, vowels, reserved };
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
