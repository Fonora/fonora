import {
  buildSymbolPatterns,
  getAllSymbols,
} from './rules.js';

export function normalizeSymbolInput(text, rules) {
  const symSet = new Set(getAllSymbols(rules));
  let result = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
      const prev = result.length > 0 ? [...result].pop() : null;
      const next = j < text.length ? text[j] : null;
      if (prev && next && symSet.has(prev) && symSet.has(next)) {
        i = j;
        continue;
      }
      result += text.slice(i, j);
      i = j;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

function cellToGroup(cell) {
  return {
    symbols: cell.symbols,
    sound: cell.sound,
    ipa: cell.ipa || '',
    status: cell.status,
    explanation: cell.explanation || '',
    experimental: cell.experimental || cell.status === 'experimental',
  };
}

function decodeSegment(text, rules) {
  const normalized = normalizeSymbolInput(text, rules);
  const patterns = buildSymbolPatterns(rules);
  const groups = [];
  const warnings = [];
  let pronunciation = '';
  let i = 0;

  while (i < normalized.length) {
    let matched = false;

    for (const { symbols, cell } of patterns) {
      if (normalized.slice(i, i + symbols.length) !== symbols) continue;

      const group = cellToGroup(cell);
      groups.push(group);

      if (cell.status === 'undefined') {
        warnings.push(`${symbols} is undefined.`);
        pronunciation += cell.sound === '?' ? '?' : cell.sound;
      } else {
        pronunciation += cell.sound;
      }

      i += symbols.length;
      matched = true;
      break;
    }

    if (matched) continue;

    const ch = normalized[i];
    warnings.push(`Unknown character: ${ch}`);
    groups.push({ symbols: ch, sound: '?', ipa: '?', status: 'invalid', explanation: '' });
    pronunciation += '?';
    i++;
  }

  return { normalized, groups, pronunciation, warnings };
}

/** Decode symbol string (no word spaces). */
export function decodeSymbols(text, rules) {
  return decodeSegment(text, rules);
}

/** Decode text preserving word spacing in pronunciation output. */
export function decodeText(text, rules) {
  const parts = text.split(/(\s+)/);
  const groups = [];
  const warnings = [];
  let normalized = '';
  let pronunciation = '';

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      normalized += part;
      pronunciation += part;
      continue;
    }

    const result = decodeSegment(part, rules);
    normalized += result.normalized;
    pronunciation += result.pronunciation;
    groups.push(...result.groups);
    warnings.push(...result.warnings);
  }

  return { normalized, groups, pronunciation, warnings };
}

export function reverseLookupDecode(symbols, rules) {
  return decodeSymbols(normalizeSymbolInput(symbols, rules), rules);
}
