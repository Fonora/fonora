/**
 * Markdown → Fonora symbol registry loader.
 * language-rules.md is the human-editable source of truth.
 */

import { getVowelEntries, vowelPhonemeKey } from './vowel-display.js';
import { applyPrimarySymbols, getPrimaryInventory } from './symbol-compose.js';
import { assertVowelInventoryGrammar, containsDoubleVowelMarker } from './vowel-grammar.js';

const ASCII_EQUALS = '=';
const FULLWIDTH_EQUALS = '＝';

const PLACE_ID_TO_REGISTRY_KEY = {
  lips: 'lips',
  front_tongue: 'frontTongue',
  middle_tongue: 'middleTongue',
  back_tongue: 'backTongue',
  throat: 'throat',
};

const MODIFIER_ID_TO_REGISTRY_KEY = {
  vowel: 'vowel',
  voice: 'voice',
  friction: 'friction',
  nasal: 'nasal',
  glide: 'glide',
};

function toCamelCase(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function parseTableRows(lines) {
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(toCamelCase);
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = cells[i] ?? '';
      if (h === 'keyNumber') val = parseInt(val, 10) || 0;
      obj[h] = val;
    });
    return obj;
  });
}

function splitMarkdownSections(markdown) {
  const sections = {};
  for (const part of markdown.split(/^## /m)) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    sections[title] = nl === -1 ? '' : part.slice(nl + 1);
  }
  return sections;
}

function parseTablesFromBody(body) {
  const lines = body.split('\n');
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('|')) {
      i++;
      continue;
    }
    const tableLines = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    const rows = rowsToObjects(parseTableRows(tableLines));
    if (rows.length) tables.push(rows);
  }
  return tables;
}

function parseSubsectionTable(body, titlePrefix) {
  const subparts = body.split(/^### /m);
  for (const part of subparts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    if (!title.startsWith(titlePrefix)) continue;
    return rowsToObjects(parseTableRows((nl === -1 ? '' : part.slice(nl + 1)).split('\n')));
  }
  return [];
}

function parseConfiguration(body) {
  const rows = rowsToObjects(parseTableRows(body.split('\n')));
  const config = {};
  for (const row of rows) {
    if (row.key) config[row.key] = row.value;
  }
  return config;
}

function mapDerivedWritingRow(r) {
  return {
    id: r.id,
    symbol: r.symbol || '',
    label: r.label || '',
    expandsTo: r.expandsTo || r.expands_to || '',
    explanation: r.explanation || '',
  };
}

function parseDerivedSymbolsSection(body) {
  const rows = rowsToObjects(parseTableRows(body.split('\n')));
  return rows.filter((r) => r.id && r.symbol).map(mapDerivedWritingRow);
}

function parseDerivedSoundsSection(body) {
  return rowsToObjects(parseTableRows(body.split('\n')))
    .filter((r) => r.sound)
    .map((r) =>
      mapDerivedSoundRow(r, {
        status: r.status || 'defined',
        experimental: r.status === 'experimental',
      }),
    );
}

function loadDerivedSounds(sections) {
  const sectionBody =
    sections['derived / reserved sounds'] ||
    sections['derived sounds'] ||
    '';

  if (sectionBody.trim()) {
    return parseDerivedSoundsSection(sectionBody);
  }

  const legacyDefined = rowsToObjects(
    parseTableRows((sections['special derived sounds'] || '').split('\n')),
  )
    .filter((r) => r.sound)
    .map((r) => mapDerivedSoundRow(r, { status: 'defined', experimental: false }));

  const derivedKey =
    Object.keys(sections).find((k) => k.startsWith('experimental derived sounds')) || '';
  const legacyExperimental = parseSubsectionTable(sections[derivedKey] || '', 'candidate sounds')
    .filter((r) => r.sound)
    .map((r) => mapDerivedSoundRow(r, { status: 'experimental', experimental: true }));

  return [...legacyDefined, ...legacyExperimental];
}

function splitDerivedSoundsByStatus(derivedSounds) {
  return {
    specialDerivedSounds: derivedSounds.filter((d) => d.status === 'defined'),
    experimentalDerivedSounds: derivedSounds.filter((d) => d.status === 'experimental'),
    reservedDerivedSounds: derivedSounds.filter((d) => d.status === 'reserved'),
  };
}

function mapDerivedSoundRow(r, defaults = {}) {
  return {
    symbols: r.symbols || '',
    sound: r.sound,
    ipa: r.ipa || '',
    status: r.status || defaults.status || 'defined',
    explanation: r.explanation || defaults.explanation || '',
    composition: r.composition || '',
    experimental: defaults.experimental ?? r.status === 'experimental',
  };
}

function parseRecipeTokens(recipeRaw) {
  if (!recipeRaw) return [];
  if (Array.isArray(recipeRaw)) return recipeRaw;
  return recipeRaw
    .split(/,\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseIpaTokens(ipaRaw) {
  return (ipaRaw || '')
    .split(/[,/\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function firstExampleToken(exampleRaw) {
  return (exampleRaw || '').split(/[,;]+/)[0].trim();
}

function mapVowelRow(r) {
  const key = r.key || r.vowel || r.sound;
  const tierRaw = (r.tier || r.category || '').toLowerCase();
  const tier =
    tierRaw.includes('composite') || tierRaw.includes('derived')
      ? 'composite'
      : tierRaw.includes('core')
        ? 'core'
        : r.recipe?.includes('glide')
          ? 'composite'
          : 'core';
  const recipe = r.recipe || '';
  const recipeTokens = parseRecipeTokens(recipe);
  const lexicalSet = r.lexicalSet || r.lexical_set || r.description || '';
  const example = firstExampleToken(r.example || r.approx || '');
  const ipa = r.ipa || '';
  const ipaTokens = parseIpaTokens(ipa);
  return {
    key,
    vowel: key,
    sound: key,
    symbols: r.symbol || r.symbols || '',
    lexicalSet,
    description: lexicalSet,
    ipa,
    ipaTokens,
    example,
    recipe,
    recipeTokens,
    approx: example,
    tier,
    status: r.status || 'defined',
    explanation: lexicalSet || example || `Vowel ${key}`,
    experimental: false,
  };
}

function parseVowelsSection(body) {
  const rows = [];
  const subparts = body.split(/^### /m);
  for (const part of subparts) {
    if (!part.trim()) continue;
    const nl = part.indexOf('\n');
    const title = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    const sectionBody = nl === -1 ? '' : part.slice(nl + 1);
    if (
      title.includes('core vowel') ||
      title.includes('simple vowel') ||
      title.includes('composite vowel') ||
      title.includes('diphthong') ||
      title.includes('derived / composite')
    ) {
      rows.push(...rowsToObjects(parseTableRows(sectionBody.split('\n'))));
    }
  }
  if (!rows.length) {
    rows.push(...rowsToObjects(parseTableRows(body.split('\n'))));
  }
  return rows.filter((r) => (r.key || r.vowel || r.sound) && r.recipe).map(mapVowelRow);
}

function parseSupplementalIpaMappings(body) {
  const rows = rowsToObjects(parseTableRows(body.split('\n')));
  const map = {};
  for (const row of rows) {
    if (!row.ipa || !row.fonoraPhoneme) continue;
    const phonemes = row.fonoraPhoneme.split(/,\s*/).filter(Boolean);
    map[row.ipa.trim()] = phonemes.length === 1 ? phonemes[0] : phonemes;
  }
  return map;
}

function buildIpaVowelMapFromVowels(vowelRows, supplemental = {}) {
  const map = { ...supplemental };
  for (const row of vowelRows) {
    const phoneme = row.key || row.vowel || row.sound;
    if (!phoneme || !row.ipa) continue;
    const tokens = row.ipaTokens?.length ? row.ipaTokens : parseIpaTokens(row.ipa);
    for (const token of tokens) {
      map[token] = phoneme;
    }
  }
  return map;
}

/**
 * @typedef {Object} FonoraSymbolRegistry
 * @property {{ lips: string, frontTongue: string, middleTongue: string, backTongue: string, throat: string }} places
 * @property {{ voice: string, friction: string, nasal: string, glide: string }} modifiers
 * @property {Record<string, string>} vowels
 * @property {Record<string, string>} derivedWriting
 * @property {string[]} allSymbols
 */

/**
 * @param {ReturnType<typeof parseLanguageRulesMarkdown>} rules
 * @returns {FonoraSymbolRegistry}
 */
export function buildSymbolRegistry(rules) {
  /** @type {Record<string, string>} */
  const places = {};
  for (const p of rules.places || []) {
    const key = PLACE_ID_TO_REGISTRY_KEY[p.id];
    if (key) places[key] = p.symbol;
  }

  /** @type {Record<string, string>} */
  const modifiers = {};
  for (const m of rules.modifiers || []) {
    const key = MODIFIER_ID_TO_REGISTRY_KEY[m.id];
    if (key) modifiers[key] = m.symbol;
  }

  /** @type {Record<string, string>} */
  const vowels = {};
  for (const v of getVowelEntries(rules)) {
    vowels[vowelPhonemeKey(v)] = v.symbols;
  }

  /** @type {Record<string, string>} */
  const derivedWriting = {};
  for (const d of rules.derivedSymbols || []) {
    derivedWriting[d.id] = d.symbol;
  }

  const allSymbols = collectAllSymbols(rules);

  return { places, modifiers, vowels, derivedWriting, allSymbols };
}

export function collectAllSymbols(rules) {
  const symbols = new Set(getPrimaryInventory(rules));
  for (const d of rules.derivedSymbols || []) {
    if (d.symbol) symbols.add(d.symbol);
  }
  for (const cell of [
    ...(rules.soundGrid || []),
    ...(rules.specialDerivedSounds || []),
    ...(rules.experimentalDerivedSounds || []),
    ...(rules.reservedDerivedSounds || []),
    ...(getVowelEntries(rules) || []),
    ...(rules.vowelSymbolAliases || []),
  ]) {
    if (cell.symbols) symbols.add(cell.symbols);
  }
  return [...symbols];
}

/**
 * @param {FonoraSymbolRegistry} registry
 * @param {ReturnType<typeof parseLanguageRulesMarkdown>} rules
 * @param {{ expectFullwidthLips?: boolean, relaxed?: boolean }} [options]
 */
export function validateSymbolRegistry(registry, rules, options = {}) {
  const errors = [];
  const requiredPlaces = ['lips', 'frontTongue', 'middleTongue', 'backTongue', 'throat'];
  for (const key of requiredPlaces) {
    if (!registry.places[key]) errors.push(`Missing place registry key: ${key}`);
  }
  const requiredModifiers = ['vowel', 'voice', 'friction', 'nasal', 'glide'];
  for (const key of requiredModifiers) {
    if (!registry.modifiers[key]) errors.push(`Missing modifier registry key: ${key}`);
  }
  if (!Object.keys(registry.vowels).length) {
    errors.push('No vowels loaded from markdown');
  }

  if (options.relaxed) {
    if (errors.length) {
      throw new Error(`Symbol registry validation failed:\n- ${errors.join('\n- ')}`);
    }
    return true;
  }

  if (options.expectFullwidthLips) {
    if (registry.places.lips !== FULLWIDTH_EQUALS) {
      errors.push(`Expected lips symbol ＝ (U+FF1D), got "${registry.places.lips}"`);
    }
    if (registry.places.lips === ASCII_EQUALS) {
      errors.push('Lips symbol must not be ASCII equals');
    }
  }

  for (const sym of registry.allSymbols) {
    if (sym === ASCII_EQUALS) {
      errors.push(`ASCII equals in inventory symbol set`);
    }
    if (containsDoubleVowelMarker(sym)) {
      errors.push(`Legacy double-vowel marker ⚬⚬ in symbol "${sym}"`);
    }
  }

  if ((rules.config?.fonora_version || '') === 'v3') {
    try {
      assertVowelInventoryGrammar(getVowelEntries(rules));
    } catch (err) {
      errors.push(err.message.replace(/^V3 vowel grammar violations:\n/, ''));
    }
  }

  if (errors.length) {
    throw new Error(`Symbol registry validation failed:\n- ${errors.join('\n- ')}`);
  }

  return true;
}

export function parseLanguageRulesMarkdown(markdown) {
  const sections = splitMarkdownSections(markdown);
  const config = parseConfiguration(sections.configuration || '');

  const experimentalVowels = parseVowelsSection(sections.vowels || '');
  const supplementalIpa = parseSupplementalIpaMappings(sections['ipa supplemental mappings'] || '');
  const ipaVowelMap = buildIpaVowelMapFromVowels(experimentalVowels, supplementalIpa);

  const experimentalVowelExamples = rowsToObjects(
    parseTableRows((sections['vowel examples'] || '').split('\n')),
  )
    .filter((r) => r.word)
    .map((r) => ({ word: r.word, spelling: r.spelling || '' }));

  const derivedSymbolsKey =
    Object.keys(sections).find(
      (k) => k === 'derived symbols' || k === 'writing conventions',
    ) || '';

  const derivedSounds = loadDerivedSounds(sections);
  const { specialDerivedSounds, experimentalDerivedSounds, reservedDerivedSounds } =
    splitDerivedSoundsByStatus(derivedSounds);

  return {
    config,
    places: rowsToObjects(parseTableRows((sections['places of articulation'] || '').split('\n'))),
    modifiers: rowsToObjects(parseTableRows((sections.modifiers || '').split('\n'))),
    derivedSymbols: parseDerivedSymbolsSection(sections[derivedSymbolsKey] || ''),
    soundGrid: rowsToObjects(parseTableRows((sections['sound grid'] || '').split('\n'))),
    specialDerivedSounds,
    experimentalVowels,
    vowels: experimentalVowels,
    experimentalVowelExamples,
    experimentalDerivedSounds,
    reservedDerivedSounds,
    ipaVowelMap,
    notes: (sections.notes || '')
      .split('\n')
      .map((l) => l.replace(/^[\*\-]\s*/, '').trim())
      .filter(Boolean),
  };
}

/**
 * Parse markdown and build the full runtime bundle.
 * @param {string} markdown
 * @param {{ expectFullwidthLips?: boolean, primaryOverrides?: Record<string, string>, relaxed?: boolean }} [options]
 */
export function loadLanguageRulesFromMarkdown(markdown, options = {}) {
  const parsed = parseLanguageRulesMarkdown(markdown);
  const overrides = options.primaryOverrides || {};
  const hasOverrides = Object.keys(overrides).length > 0;
  applyPrimarySymbols(parsed, overrides);
  const rules = parsed;
  const registry = buildSymbolRegistry(rules);
  validateSymbolRegistry(registry, rules, {
    expectFullwidthLips: options.expectFullwidthLips === true,
    relaxed: options.relaxed === true || hasOverrides,
  });
  return {
    rules,
    registry,
    ipaVowelMap: rules.ipaVowelMap,
    ipaVowelMode: rules.config.ipa_vowel_mode || 'default',
    fonoraVersion: rules.config.fonora_version || 'v2',
    symbolsFromOverrides: hasOverrides,
  };
}

export async function loadLanguageRules(url = 'language-rules.md') {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bundle = loadLanguageRulesFromMarkdown(await res.text());
    return { ...bundle, usingFallback: false, loadError: null };
  } catch (err) {
    return {
      rules: null,
      registry: null,
      ipaVowelMap: null,
      ipaVowelMode: 'default',
      fonoraVersion: 'v2',
      usingFallback: true,
      loadError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Parse markdown string and build validated registry bundle. */
export function loadLanguageRulesFromString(markdown, options = {}) {
  return loadLanguageRulesFromMarkdown(markdown, options);
}

export { FULLWIDTH_EQUALS, ASCII_EQUALS };

