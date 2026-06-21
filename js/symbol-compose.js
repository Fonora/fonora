/**
 * Compose derived Fonora symbols from primary place/modifier glyphs.
 * Edit primaries once (markdown or Alphabet lab) — sound grid, vowels, and examples follow.
 */

const MODIFIER_ROW_ORDER = ['plain', 'voice', 'friction', 'nasal', 'glide'];

/** Place ids that appear as sound-grid columns (excludes derived writing symbols). */
export const GRID_PLACE_IDS = [
  'lips',
  'front_tongue',
  'middle_tongue',
  'back_tongue',
  'throat',
];

/**
 * Reversed place+modifier orderings (not standard grid modifier+place).
 * Keys match the `composition` column in language-rules.md derived tables.
 */
const DERIVED_COMPOSITIONS = {
  reverse_front_tongue_friction: (places, modifiers) =>
    `${placeSymbol(places, 'front_tongue')}${modifierSymbol(modifiers, 'friction')}`,
  reverse_front_tongue_voice: (places, modifiers) =>
    `${placeSymbol(places, 'front_tongue')}${modifierSymbol(modifiers, 'voice')}`,
  reverse_lips_voice: (places, modifiers) =>
    `${placeSymbol(places, 'lips')}${modifierSymbol(modifiers, 'voice')}`,
  reverse_friction_voice: (_places, modifiers) =>
    `${modifierSymbol(modifiers, 'friction')}${modifierSymbol(modifiers, 'voice')}`,
};

/**
 * @param {string} composition
 * @param {Array<{ id: string, symbol: string }>} places
 * @param {Array<{ id: string, symbol: string }>} modifiers
 */
export function composeDerivedSymbol(composition, places, modifiers) {
  const recipe = DERIVED_COMPOSITIONS[composition];
  return recipe ? recipe(places, modifiers) : null;
}

/** Primary alphabet only: 5 places + 4 modifiers (9-symbol core). */
export function getPrimaryInventory(rules) {
  return new Set([
    ...(rules.places || []).map((p) => p.symbol),
    ...(rules.modifiers || []).map((m) => m.symbol),
  ]);
}

/**
 * @param {object} rules
 * @param {string} [id='vowel_carrier']
 */
export function getDerivedSymbol(rules, id = 'vowel_carrier') {
  return rules.derivedSymbols?.find((d) => d.id === id)?.symbol ?? '';
}

function composeDerivedSounds(list, places, modifiers) {
  for (const derived of list || []) {
    if (!derived.composition) continue;
    const composed = composeDerivedSymbol(derived.composition, places, modifiers);
    if (!composed) {
      throw new Error(`Unknown derived composition: ${derived.composition} (${derived.sound})`);
    }
    derived.symbols = composed;
  }
}

/** @typedef {'primary' | 'alternate'} VowelPlane */

/**
 * @param {Array<{ id: string, symbol: string }>} places
 * @param {string} placeId
 */
export function placeSymbol(places, placeId) {
  return places.find((p) => p.id === placeId)?.symbol ?? '?';
}

/**
 * @param {Array<{ id: string, symbol: string }>} modifiers
 * @param {string} modifierId
 */
export function modifierSymbol(modifiers, modifierId) {
  if (modifierId === 'plain') return '';
  return modifiers.find((m) => m.id === modifierId)?.symbol ?? '?';
}

/**
 * @param {string} modifierId
 * @param {string} placeId
 * @param {Array<{ id: string, symbol: string }>} places
 * @param {Array<{ id: string, symbol: string }>} modifiers
 */
export function composeGridSymbol(modifierId, placeId, places, modifiers) {
  const p = placeSymbol(places, placeId);
  const m = modifierSymbol(modifiers, modifierId);
  if (modifierId === 'plain') return p;
  return `${m}${p}`;
}

/**
 * @param {VowelPlane} plane
 * @param {string} componentPlaceId
 * @param {Array<{ id: string, symbol: string }>} places
 * @param {object} rules — for derived writing symbols (vowel carrier)
 */
export function composeVowelSymbol(plane, componentPlaceId, places, rules = {}) {
  const throat = placeSymbol(places, 'throat');
  const component = placeSymbol(places, componentPlaceId);
  const longMarker = getDerivedSymbol(rules, 'vowel_carrier') || '⊇';

  if (plane === 'alternate') {
    if (componentPlaceId === 'throat') {
      return longMarker;
    }
    return `${longMarker}${component}`;
  }

  if (componentPlaceId === 'throat') {
    return throat;
  }

  return `${throat}${component}`;
}

/**
 * @param {object} rules — parsed rules; mutated in place
 * @param {Record<string, string>} [primaryOverrides] — id → symbol for places/modifiers
 */
export function applyPrimarySymbols(rules, primaryOverrides = {}) {
  applyOverridesToPrimaries(rules, primaryOverrides);

  const { places, modifiers } = rules;

  for (const cell of rules.soundGrid || []) {
    if (!cell.modifierId || !cell.placeId) continue;
    cell.symbols = composeGridSymbol(cell.modifierId, cell.placeId, places, modifiers);
  }

  for (const vowel of rules.experimentalVowels || []) {
    if (vowel.plane && vowel.component) {
      vowel.symbols = composeVowelSymbol(vowel.plane, vowel.component, places, rules);
    }
  }

  rules.experimentalVowelExamples = composeCvExamples(rules);
  rules.experimentalVowelLengthPairs = composeVowelLengthPairs(rules);

  composeDerivedSounds(rules.specialDerivedSounds, places, modifiers);
  composeDerivedSounds(rules.experimentalDerivedSounds, places, modifiers);

  rules.vowelSymbolAliases = [];

  return rules;
}

function applyOverridesToPrimaries(rules, overrides) {
  for (const place of rules.places || []) {
    if (overrides[place.id]) place.symbol = overrides[place.id];
  }
  for (const mod of rules.modifiers || []) {
    if (overrides[mod.id]) mod.symbol = overrides[mod.id];
  }
}

/** Example word for an IPA token in "v as in word" vowel sound lines. */
const IPA_AS_IN_WORD = {
  'ʌ': 'cup',
  'ə': 'about',
  'ɐ': 'arena',
  'a': 'father',
  'æ': 'apple',
  'ɛ': 'bed',
  'e': 'café',
  'ɜ': 'bird',
  'ɪ': 'bit',
  'i': 'see',
  'y': 'suite',
  'ɨ': 'roses',
  'ɑ': 'hot',
  'ɒ': 'lot',
  'ɔ': 'caught',
  'o': 'no',
  'ø': 'peu',
  'œ': 'peu',
  'ʊ': 'book',
  'u': 'flute',
  'ʉ': 'boot',
  'ɯ': 'good',
  'eː': 'day',
  'iː': 'see',
  'yː': 'suite',
  'oː': 'go',
  'ɔː': 'law',
  'ɑː': 'father',
  'uː': 'boot',
};

/** Per-vowel teaching examples (IPA-aligned; from language-rules.md). */
const VOWEL_APPROX_WORDS = {
  a: ['cup', 'about'],
  ā: ['Saal'],
  e: ['bed', 'cat'],
  ē: [],
  i: ['bit'],
  ī: ['see'],
  o: ['hot'],
  ō: ['father', 'law'],
  u: ['book'],
  ū: ['boot'],
};

/**
 * @param {{ vowel?: string, sound?: string, description?: string, approx?: string, ipa?: string }} vowelRow
 * @returns {string[]} e.g. ["Open vowel ≈ cup", "Open vowel ≈ about"]
 */
export function formatVowelSoundExamples(vowelRow) {
  const desc = vowelRow.description || vowelRow.explanation || vowelRow.vowel || vowelRow.sound || '';
  const letter = vowelRow.vowel || vowelRow.sound || '';
  const fromApprox = (vowelRow.approx || '')
    .split(/[,;]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const words = fromApprox.length
    ? fromApprox
    : VOWEL_APPROX_WORDS[letter]
      ?? (vowelRow.ipa || '')
        .split(/[,/\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((token) => IPA_AS_IN_WORD[token])
        .filter(Boolean);
  return words.map((word) => `${desc} ≈ ${word}`);
}

/** Standard CV demo words — short vs long pairs for length distinction. */
const CV_EXAMPLE_WORDS = [
  { word: 'pa', vowel: 'a' },
  { word: 'pe', vowel: 'e' },
  { word: 'pi', vowel: 'i' },
  { word: 'po', vowel: 'o' },
  { word: 'pu', vowel: 'u' },
  { word: 'pay', vowel: 'ā' },
  { word: 'pee', vowel: 'ē' },
  { word: 'pie', vowel: 'ī' },
  { word: 'poe', vowel: 'ō' },
  { word: 'pew', vowel: 'ū' },
];

const VOWEL_LENGTH_PAIRS = [
  { short: 'a', long: 'ā', demoShort: 'pa', demoLong: 'pay' },
  { short: 'e', long: 'ē', demoShort: 'pe', demoLong: 'pee' },
  { short: 'i', long: 'ī', demoShort: 'pi', demoLong: 'pie' },
  { short: 'o', long: 'ō', demoShort: 'po', demoLong: 'poe' },
  { short: 'u', long: 'ū', demoShort: 'pu', demoLong: 'pew' },
];

export function composeVowelLengthPairs(rules) {
  const lips = placeSymbol(rules.places, 'lips');
  const vowelBySound = Object.fromEntries(
    (rules.experimentalVowels || []).map((v) => [v.vowel || v.sound, v.symbols]),
  );
  return VOWEL_LENGTH_PAIRS.filter((p) => vowelBySound[p.short] && vowelBySound[p.long]).map((p) => ({
    shortSound: p.short,
    longSound: p.long,
    shortSymbols: vowelBySound[p.short],
    longSymbols: vowelBySound[p.long],
    shortWord: p.demoShort,
    longWord: p.demoLong,
    shortSpelling: `${lips}${vowelBySound[p.short]}`,
    longSpelling: `${lips}${vowelBySound[p.long]}`,
  }));
}

export function composeCvExamples(rules) {
  const lips = placeSymbol(rules.places, 'lips');
  const vowelBySound = Object.fromEntries(
    (rules.experimentalVowels || []).map((v) => [v.vowel || v.sound, v.symbols]),
  );
  return CV_EXAMPLE_WORDS.filter((ex) => vowelBySound[ex.vowel]).map((ex) => ({
    word: ex.word,
    spelling: `${lips}${vowelBySound[ex.vowel]}`,
  }));
}

/** The 9 primary symbols (5 places + 4 modifiers) for the Alphabet lab. */
export function getPrimarySymbolEntries(rules) {
  const placeIds = GRID_PLACE_IDS;
  const modifierIds = ['voice', 'friction', 'nasal', 'glide'];
  const entries = [];

  for (const id of placeIds) {
    const row = rules.places.find((p) => p.id === id);
    if (row) {
      entries.push({
        id,
        symbol: row.symbol,
        label: row.label,
        kind: 'place',
        keyNumber: row.keyNumber,
        keyLetter: row.keyLetter,
      });
    }
  }
  for (const id of modifierIds) {
    const row = rules.modifiers.find((m) => m.id === id);
    if (row) {
      entries.push({
        id,
        symbol: row.symbol,
        label: row.label,
        kind: 'modifier',
        keyNumber: row.keyNumber,
        keyLetter: row.keyLetter,
      });
    }
  }

  return entries;
}

export function buildSubstitutionMap(baseRules, overrides) {
  const before = getPrimarySymbolEntries(baseRules);
  const map = {};
  for (const entry of before) {
    const next = overrides[entry.id];
    if (next && next !== entry.symbol) {
      map[entry.symbol] = next;
    }
  }
  return map;
}

/** Replace primary glyphs throughout a symbol string (longest first). */
export function substituteSymbols(text, substitutionMap) {
  if (!text || !substitutionMap || !Object.keys(substitutionMap).length) return text;
  const keys = Object.keys(substitutionMap).sort((a, b) => b.length - a.length);
  let out = text;
  for (const from of keys) {
    out = out.split(from).join(substitutionMap[from]);
  }
  return out;
}

export { MODIFIER_ROW_ORDER };
