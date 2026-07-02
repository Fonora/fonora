import { buildSymbolPatterns } from './rules.js';

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape a value for safe insertion into a markdown table cell. */
export function escapeMarkdownTableCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\n|\r/g, ' ');
}

/** Safe error string for JSON API responses (never includes stack traces). */
export function safeApiError(err) {
  if (err instanceof Error) return err.message || 'Request failed';
  return typeof err === 'string' ? err : 'Request failed';
}

/** Strip stack traces and Error objects before serializing API JSON bodies. */
export function sanitizeForJsonResponse(body) {
  const seen = new WeakSet();
  function walk(value, depth) {
    if (depth > 8) return null;
    if (value instanceof Error) return value.message || 'Request failed';
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1));
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === 'stack' || key === 'stackTrace' || key === 'trace') continue;
      out[key] = walk(val, depth + 1);
    }
    return out;
  }
  return walk(body, 0);
}

/** @param {unknown} err */
export function errorMessage(err) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    if (typeof err.message === 'string') return err.message;
    if (typeof err.str === 'string') return err.str;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
  return String(err);
}

export function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.selectionStart = pos;
  textarea.selectionEnd = pos;
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function deleteSymbolBeforeCursor(textarea) {
  const pos = textarea.selectionStart;
  if (pos === 0 || textarea.selectionStart !== textarea.selectionEnd) return false;
  const chars = [...textarea.value.slice(0, pos)];
  if (chars.length === 0) return false;
  chars.pop();
  textarea.value = chars.join('') + textarea.value.slice(pos);
  const newPos = chars.join('').length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Delete one Fonora phoneme glyph (or whitespace) before the cursor.
 * @param {HTMLTextAreaElement} textarea
 * @param {object | null | undefined} rules
 */
export function deleteFonoraPhonemeBeforeCursor(textarea, rules) {
  const pos = textarea.selectionStart;
  if (pos === 0 || textarea.selectionStart !== textarea.selectionEnd) return false;

  const before = textarea.value.slice(0, pos);
  if (!before.length) return false;

  const last = before.at(-1);
  if (last === ' ' || last === '\n' || last === '\t') {
    textarea.value = before.slice(0, -1) + textarea.value.slice(pos);
    const newPos = pos - 1;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  if (rules) {
    const patterns = buildSymbolPatterns(rules);
    for (const { symbols } of patterns) {
      if (!symbols || !before.endsWith(symbols)) continue;
      const newBefore = before.slice(0, before.length - symbols.length);
      textarea.value = newBefore + textarea.value.slice(pos);
      const newPos = newBefore.length;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }

  return deleteSymbolBeforeCursor(textarea);
}
