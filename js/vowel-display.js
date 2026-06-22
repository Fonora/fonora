/**
 * Shared vowel data access and UI helpers — single source from language-rules.md
 * (`rules.experimentalVowels` / `rules.vowels`).
 */

export function getVowelEntries(rules) {
  return rules?.experimentalVowels || rules?.vowels || [];
}

export function vowelPhonemeKey(v) {
  return v.key || v.vowel || v.sound || '';
}

export function findVowelByKey(rules, key) {
  if (!key) return null;
  return getVowelEntries(rules).find((v) => vowelPhonemeKey(v) === key) ?? null;
}

export function getVowelPhonemeKeys(rules) {
  return getVowelEntries(rules).map(vowelPhonemeKey).filter(Boolean);
}

export function isVowelPhonemeKey(rules, key) {
  return getVowelPhonemeKeys(rules).includes(key);
}

export function vowelSymbolForKey(rules, key) {
  const entry = findVowelByKey(rules, key);
  return entry?.symbols ?? null;
}

export function buildVowelByKeyMap(rules) {
  return Object.fromEntries(
    getVowelEntries(rules).map((v) => [vowelPhonemeKey(v), v.symbols]),
  );
}

/** Match a grid/encoder cell to its vowel definition (by phoneme key or symbols). */
export function findVowelForCell(rules, cell) {
  if (!cell) return null;
  const key = cell.key || cell.vowel || cell.sound;
  if (key) {
    const byKey = findVowelByKey(rules, key);
    if (byKey) return byKey;
  }
  if (cell.symbols) {
    return getVowelEntries(rules).find((v) => v.symbols === cell.symbols) ?? null;
  }
  return null;
}

export function isVowelQuizCell(rules, cell) {
  return Boolean(findVowelForCell(rules, cell))
    || (cell?.experimental && /^⊐/.test(cell.symbols || ''));
}

/** Technical / linguistic row cells for the Sound Grid vowel table. */
export function soundGridVowelRowHtml(cell, escapeHtml) {
  const key = vowelPhonemeKey(cell);
  return [
    `<td class="symbol-text">${escapeHtml(cell.symbols)}</td>`,
    `<td>${escapeHtml(key)}</td>`,
    `<td>${escapeHtml(cell.lexicalSet || cell.description || '')}</td>`,
    `<td class="recipe-cell">${escapeHtml(cell.recipe || '')}</td>`,
    `<td>${escapeHtml(cell.ipa || '')}</td>`,
    `<td>${escapeHtml(cell.example || '')}</td>`,
  ];
}

/** Learner-friendly row cells for the Alphabet vowels preview. */
export function alphabetVowelRowHtml(cell, escapeHtml) {
  const key = vowelPhonemeKey(cell);
  return [
    `<td>${escapeHtml(key)}</td>`,
    `<td class="symbol-text">${escapeHtml(cell.symbols)}</td>`,
    `<td>${escapeHtml(cell.example || '')}</td>`,
  ];
}
