/**
 * IPA normalization audit helpers — token inventory and corpus coverage.
 */
import {
  ENGLISH_IPA_VOWEL_NORMALIZATION,
  getConsonantMap,
  lookupIpaTokenMapping,
  mergeEnglishVowelNormalization,
  normalizeIpa,
  IPA_MULTIGRAPHS,
} from './ipa-normalize.js';

const STRIP_CHARS = /[ˈˌˑ\.˞ˤ˥˦˧˨˥˩ⁿʰʲʷ\u0303\u031E\u032A\u1D5D-]/g;

export function stripStressAndMarks(ipa) {
  return String(ipa || '').replace(STRIP_CHARS, '').replace(/\d/g, '');
}

function sortedTokenKeys(vowelMap) {
  const consonantMap = getConsonantMap();
  const keys = new Set([
    ...Object.keys(consonantMap),
    ...Object.keys(vowelMap),
    ...IPA_MULTIGRAPHS,
    ...Object.keys(ENGLISH_IPA_VOWEL_NORMALIZATION),
    'ᵻ',
  ]);
  return [...keys].sort((a, b) => b.length - a.length);
}

/**
 * Tokenize cleaned IPA using longest-match inventory keys.
 * @param {string} cleaned
 * @param {string[]} multigraphs
 * @returns {string[]}
 */
export function tokenizeCleanedIpa(cleaned, multigraphs) {
  const tokens = [];
  let i = 0;
  while (i < cleaned.length) {
    if (/\s/.test(cleaned[i])) {
      i++;
      continue;
    }
    let matched = false;
    for (const graph of multigraphs) {
      if (cleaned.slice(i, i + graph.length) !== graph) continue;
      tokens.push(graph);
      i += graph.length;
      matched = true;
      break;
    }
    if (!matched) {
      tokens.push(cleaned[i]);
      i++;
    }
  }
  return tokens;
}

function mappingLabel(phonemes) {
  if (!phonemes.length) return '—';
  return phonemes.join('+');
}

function currentMappingBeforeEngineering(token, rulesVowelMap) {
  const consonantMap = getConsonantMap();
  if (consonantMap[token]) return mappingLabel([consonantMap[token]]);
  if (rulesVowelMap[token]) {
    const mapped = rulesVowelMap[token];
    return mappingLabel(Array.isArray(mapped) ? mapped : [mapped]);
  }
  return '?';
}

/**
 * Build audit rows for IPA tokens observed in a corpus.
 * @param {Map<string, number>} tokenCounts
 * @param {Record<string, string | string[]>} rulesVowelMap
 */
export function buildIpaTokenAuditRows(tokenCounts, rulesVowelMap) {
  const lookupOptions = { vowelMap: rulesVowelMap };
  const rows = [];

  for (const [token, count] of [...tokenCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const before = currentMappingBeforeEngineering(token, rulesVowelMap);
    const lookup = lookupIpaTokenMapping(token, lookupOptions);
    const after = mappingLabel(lookup.phonemes);
    rows.push({
      token,
      count,
      currentMapping: before,
      targetMapping: after,
      unmappedBefore: before === '?',
      unmappedAfter: lookup.source === 'fallback',
    });
  }

  return rows;
}

/**
 * Collect IPA token counts from raw IPA strings.
 * @param {string[]} ipaStrings
 * @param {Record<string, string | string[]>} rulesVowelMap
 */
export function collectIpaTokenCounts(ipaStrings, rulesVowelMap) {
  const vowelMap = mergeEnglishVowelNormalization(rulesVowelMap);
  const multigraphs = sortedTokenKeys(vowelMap);
  const counts = new Map();

  for (const ipa of ipaStrings) {
    const tokens = tokenizeCleanedIpa(stripStressAndMarks(ipa), multigraphs);
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return counts;
}

/**
 * Diagnostic row for one word.
 * @param {string} word
 * @param {string} ipa
 * @param {object} bundle
 * @param {(phonemes: string, rules: object) => { symbols: string, decoded?: string, warnings?: string[] }} encodeFn
 */
export function buildDiagnosticRow(word, ipa, bundle, encodeFn) {
  const normalized = normalizeIpa(ipa, {
    vowelMode: bundle.ipaVowelMode,
    vowelMap: bundle.ipaVowelMap,
  });
  const encoded = encodeFn(normalized.phonemeString, bundle.rules);
  return {
    word,
    ipa,
    normalizedIpa: normalized.normalizedIpa || normalized.ipaFromSegments,
    fonoraPhonemes: normalized.display,
    fonoraSymbols: encoded.symbols,
    decoded: encoded.decoded || '',
    warnings: [...normalized.warnings, ...(encoded.warnings || [])],
    unmapped: normalized.unmapped,
    hasQuestionMark:
      normalized.phonemeString.includes('?') || (encoded.symbols || '').includes('?'),
  };
}

export function summarizeAuditRows(rows) {
  const unmappedBefore = rows.filter((r) => r.unmappedBefore);
  const stillUnmapped = rows.filter((r) => r.unmappedAfter);
  return {
    uniqueTokens: rows.length,
    unmappedBeforeCount: unmappedBefore.length,
    stillUnmappedCount: stillUnmapped.length,
    unmappedBefore,
    stillUnmapped,
  };
}

export function formatAuditMarkdown(rows, meta = {}) {
  const summary = summarizeAuditRows(rows);
  const lines = [
    '# IPA Vowel Normalization Audit',
    '',
    `Generated: ${meta.generatedAt || new Date().toISOString()}`,
    `Dialect: ${meta.dialect || 'en-us'}`,
    `Corpus words: ${meta.wordCount ?? '—'}`,
    `Unique IPA tokens: ${summary.uniqueTokens}`,
    `Unmapped before engineering table: ${summary.unmappedBeforeCount}`,
    `Still unmapped (fallback only): ${summary.stillUnmappedCount}`,
    '',
    '## Token inventory',
    '',
    '| IPA symbol | Occurrences | Current mapping | Target mapping |',
    '| --- | ---: | --- | --- |',
  ];

  for (const row of rows) {
    const mark = row.unmappedBefore ? ' ⚠' : '';
    lines.push(
      `| ${row.token} | ${row.count} | ${row.currentMapping}${mark} | ${row.targetMapping} |`,
    );
  }

  if (summary.unmappedBefore.length) {
    lines.push('');
    lines.push('## Previously unmapped (now covered)');
    lines.push('');
    for (const row of summary.unmappedBefore) {
      lines.push(`- \`${row.token}\` (${row.count}×): ${row.currentMapping} → ${row.targetMapping}`);
    }
  }

  if (summary.stillUnmapped.length) {
    lines.push('');
    lines.push('## Fallback-only tokens');
    lines.push('');
    for (const row of summary.stillUnmapped) {
      lines.push(`- \`${row.token}\` (${row.count}×) → fallback \`${row.targetMapping}\``);
    }
  }

  lines.push('');
  lines.push('## Engineering normalization table');
  lines.push('');
  lines.push('| IPA | Fonora phoneme |');
  lines.push('| --- | --- |');
  for (const [ipa, phoneme] of Object.entries(ENGLISH_IPA_VOWEL_NORMALIZATION)) {
    lines.push(`| ${ipa} | ${phoneme} |`);
  }

  return lines.join('\n');
}

export function formatDiagnosticsMarkdown(rows, meta = {}) {
  const lines = [
    '# IPA Normalization Diagnostics',
    '',
    `Generated: ${meta.generatedAt || new Date().toISOString()}`,
    `Dialect: ${meta.dialect || 'en-us'}`,
    `Words: ${rows.length}`,
    '',
    '| Word | IPA | Normalized IPA | Fonora phonemes | Fonora symbols | Decoded | Warnings |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    const warn = row.warnings?.length ? row.warnings.join('; ') : '—';
    lines.push(
      `| ${row.word} | ${escapeCell(row.ipa)} | ${escapeCell(row.normalizedIpa)} | ${escapeCell(row.fonoraPhonemes)} | ${escapeCell(row.fonoraSymbols)} | ${escapeCell(row.decoded)} | ${escapeCell(warn)} |`,
    );
  }

  const failures = rows.filter((r) => r.unmapped?.length);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Words with \`?\` in phonemes or symbols: ${rows.filter((r) => r.hasQuestionMark).length}`);
  lines.push(`- Words with unmapped IPA warnings: ${failures.length}`);

  return lines.join('\n');
}

function escapeCell(value) {
  return String(value || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
