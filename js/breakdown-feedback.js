/**
 * Compact breakdown feedback for wrong answers in Script learning exercises.
 */
import {
  analyzeBreakdown,
  analyzeFonoranBreakdown,
  renderBreakdownHtml,
  renderCellBreakdownHtml,
} from './breakdown.js';
import { loadLanguagePreference } from './learning-locale.js';
import { escapeHtml } from './utils.js';

/**
 * @param {HTMLElement | null} container
 * @param {string} text
 * @param {object} rules
 * @param {{ cell?: object, parts?: string[], script?: string, hintHtml?: string }} [options]
 */
export async function showBreakdownFeedback(container, text, rules, options = {}) {
  if (!container || !rules) {
    if (container) container.hidden = true;
    return;
  }

  const { cell, parts, script, hintHtml } = options;

  if (cell?.symbols) {
    container.hidden = false;
    container.innerHTML = `<div class="breakdown-feedback">${renderCellBreakdownHtml(cell, rules)}</div>`;
    return;
  }

  if (!text?.trim()) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = '<p class="breakdown-feedback__loading">Analyzing sounds…</p>';

  try {
    const trimmed = text.trim();
    const fonoran = analyzeFonoranBreakdown(trimmed, rules, { parts, script });
    if (fonoran?.words?.[0]?.chunks?.length) {
      container.innerHTML = `<div class="breakdown-feedback">${hintHtml ?? ''}${renderBreakdownHtml(fonoran, rules)}</div>`;
      return;
    }

    const lang = loadLanguagePreference();
    const analysis = await analyzeBreakdown(trimmed, rules, lang);
    container.innerHTML = `<div class="breakdown-feedback">${hintHtml ?? ''}${renderBreakdownHtml(analysis, rules)}</div>`;
  } catch (err) {
    container.innerHTML = `<p class="breakdown-feedback__error">${String(err?.message || err)}</p>`;
  }
}

/**
 * Wrong-answer feedback for Script Words (script → English meaning).
 * @param {HTMLElement | null} container
 * @param {{ spelling?: string, meaning?: string, parts?: string[], script?: string }} entry
 * @param {object} rules
 * @param {string} userAnswer
 */
export async function showScriptReadingBreakdown(container, entry, rules, userAnswer) {
  if (!entry?.spelling?.trim()) {
    hideBreakdownFeedback(container);
    return;
  }

  const user = String(userAnswer ?? '').trim().toLowerCase();
  const spelling = String(entry.spelling ?? '').trim().toLowerCase();
  const hintParts = [];

  if (user && spelling && user === spelling) {
    hintParts.push(
      '<p class="breakdown-feedback__hint">This exercise asks for the <strong>English meaning</strong>, not the roman spelling.</p>',
    );
  }
  if (entry.meaning) {
    hintParts.push(
      `<p class="breakdown-feedback__answer">Correct answer: <strong>${escapeHtml(entry.meaning)}</strong></p>`,
    );
  }
  hintParts.push(
    `<p class="breakdown-feedback__roman sans">How to say it (<span class="mono">${escapeHtml(entry.spelling)}</span>):</p>`,
  );

  await showBreakdownFeedback(container, entry.spelling, rules, {
    parts: entry.parts,
    script: entry.script,
    hintHtml: hintParts.join(''),
  });
}

/** @param {HTMLElement | null} container */
export function hideBreakdownFeedback(container) {
  if (!container) return;
  container.hidden = true;
  container.innerHTML = '';
}
