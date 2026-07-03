/**
 * Compact breakdown feedback for wrong answers in Script learning exercises.
 */
import { analyzeBreakdown, renderBreakdownHtml, renderCellBreakdownHtml } from './breakdown.js';
import { loadLanguagePreference } from './learning-locale.js';

/**
 * @param {HTMLElement | null} container
 * @param {string} text
 * @param {object} rules
 * @param {{ cell?: object }} [options]
 */
export async function showBreakdownFeedback(container, text, rules, options = {}) {
  if (!container || !rules) {
    if (container) container.hidden = true;
    return;
  }

  const { cell } = options;

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
    const lang = loadLanguagePreference();
    const analysis = await analyzeBreakdown(text.trim(), rules, lang);
    container.innerHTML = `<div class="breakdown-feedback">${renderBreakdownHtml(analysis, rules)}</div>`;
  } catch (err) {
    container.innerHTML = `<p class="breakdown-feedback__error">${String(err?.message || err)}</p>`;
  }
}

/** @param {HTMLElement | null} container */
export function hideBreakdownFeedback(container) {
  if (!container) return;
  container.hidden = true;
  container.innerHTML = '';
}
