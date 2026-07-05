/**
 * Cross-browser play/stop button markup — SVG icons instead of ▶/■ unicode
 * (Safari/iOS render text symbols inconsistently with serif UI fonts).
 */
import { icon } from './learn-icons.js';
import { escapeHtml } from './utils.js';

const LABEL_CLASS = 'btn-play-label';
const ICON_CLASS = 'btn-play-icon';

/**
 * @param {string} [className]
 */
export function playIconMarkup(className = ICON_CLASS) {
  return icon('play', className);
}

/**
 * @param {string} [className]
 */
export function stopIconMarkup(className = ICON_CLASS) {
  return icon('stop', className);
}

/**
 * @param {string} label
 * @param {{ iconOnly?: boolean, solo?: boolean }} [opts]
 */
export function playButtonMarkup(label, { iconOnly = false, solo = false } = {}) {
  const iconCls = solo || iconOnly ? `${ICON_CLASS} btn-play-icon--solo` : ICON_CLASS;
  if (iconOnly) return playIconMarkup(iconCls);
  return `${playIconMarkup(iconCls)}<span class="${LABEL_CLASS}">${escapeHtml(label)}</span>`;
}

/**
 * @param {string} [label]
 */
export function stopButtonMarkup(label = 'Stop') {
  return `${stopIconMarkup()}<span class="${LABEL_CLASS}">${escapeHtml(label)}</span>`;
}

/**
 * @param {HTMLElement | null | undefined} btn
 * @param {string} label
 * @param {{ iconOnly?: boolean }} [opts]
 */
export function setPlayButtonLabel(btn, label, { iconOnly = false } = {}) {
  if (!btn) return;
  btn.innerHTML = playButtonMarkup(label, { iconOnly, solo: iconOnly });
  if (label && !iconOnly) btn.dataset.playLabel = label;
}

/**
 * @param {HTMLElement | null | undefined} btn
 * @param {string} [label]
 */
export function setStopButtonLabel(btn, label = 'Stop') {
  if (!btn) return;
  btn.innerHTML = stopButtonMarkup(label);
  btn.dataset.playLabel = label;
}

/**
 * Plain text state (loading, errors) — no icon.
 * @param {HTMLElement | null | undefined} btn
 * @param {string} text
 */
export function setPlayButtonText(btn, text) {
  if (!btn) return;
  btn.textContent = text;
}

/**
 * @param {HTMLElement | null | undefined} btn
 */
export function getPlayButtonLabel(btn) {
  if (!btn) return 'Listen';
  return (
    btn.dataset.playLabel
    || btn.querySelector(`.${LABEL_CLASS}`)?.textContent?.trim()
    || btn.textContent?.replace(/^▶\s*/, '').trim()
    || 'Listen'
  );
}
