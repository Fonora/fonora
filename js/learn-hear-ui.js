/**
 * Shared inline hear buttons for Learn exercises and word displays.
 */
import { speakFonoraPhrase, cancelSpeech } from './fonora-tts.js';
import { primeAudioContext } from './espeak-audio.js';
import { getPiperVoiceForLang } from './piper-audio.js';
import { resolveEspeakVoice } from './language-preferences.js';
import { escapeHtml } from './utils.js';

/** Panels where inline hear would spoil listen-then-guess exercises. */
export const HEAR_EXCLUDED_PANELS = new Set(['tab-fonoran-hearing']);

/**
 * @param {{ id?: string, label?: string, ariaLabel?: string, className?: string }} [opts]
 */
export function renderHearButton(opts = {}) {
  const id = opts.id ? ` id="${escapeHtml(opts.id)}"` : '';
  const label = opts.label ?? '▶ Listen';
  const aria = escapeHtml(opts.ariaLabel ?? 'Listen');
  const extraClass = opts.className ? ` ${escapeHtml(opts.className)}` : '';
  return `<button type="button" class="hear-min learn-hear-btn${extraClass}"${id} aria-label="${aria}">${escapeHtml(label)}</button>`;
}

/**
 * @param {HTMLElement | null | undefined} container
 * @param {string} panelId
 */
export function shouldShowInlineHear(container, panelId) {
  if (!container) return false;
  if (HEAR_EXCLUDED_PANELS.has(panelId)) return false;
  const panel = container.closest('[data-tab-panel]');
  if (panel?.id && HEAR_EXCLUDED_PANELS.has(panel.id)) return false;
  return true;
}

/**
 * Mount a hear button beside a prompt element.
 * @param {{
 *   promptEl: HTMLElement | null,
 *   panelId?: string,
 *   rules: object,
 *   getSpeakText: () => string | null | undefined,
 *   ariaLabel?: string,
 *   buttonId?: string,
 * }} opts
 * @returns {() => void} cleanup
 */
export function mountPromptHear(opts) {
  const { promptEl, rules, getSpeakText, panelId, ariaLabel, buttonId } = opts;
  if (!promptEl || !shouldShowInlineHear(promptEl, panelId ?? '')) {
    return () => {};
  }

  let row = promptEl.closest('.learn-exercise__prompt-row');
  if (!row) {
    row = document.createElement('div');
    row.className = 'learn-exercise__prompt-row';
    promptEl.parentNode?.insertBefore(row, promptEl);
    row.appendChild(promptEl);
  }

  let btn = row.querySelector('.learn-hear-btn');
  if (!btn) {
    row.insertAdjacentHTML('beforeend', renderHearButton({ id: buttonId, ariaLabel }));
    btn = row.querySelector('.learn-hear-btn');
  }

  let playing = false;
  const onClick = async () => {
    const text = getSpeakText()?.trim();
    if (!text || playing) return;
    playing = true;
    btn?.setAttribute('disabled', 'true');
    btn?.removeAttribute('title');
    primeAudioContext();
    cancelSpeech();
    const defaultLabel = btn?.textContent || '▶ Listen';
    try {
      await speakFonoraPhrase(text, rules, {
        engine: 'piper',
        piperVoice: getPiperVoiceForLang('en'),
        espeakVoice: resolveEspeakVoice('en'),
        onPrepare: (message) => {
          if (btn) btn.textContent = '…';
          if (message) btn?.setAttribute('title', message);
        },
      });
    } catch (err) {
      const message = err?.message || String(err);
      if (btn) {
        btn.textContent = 'No audio';
        btn.setAttribute('title', message);
        window.setTimeout(() => {
          if (btn.textContent === 'No audio') btn.textContent = defaultLabel;
        }, 3000);
      }
      console.error('Learn hear playback failed:', err);
    } finally {
      playing = false;
      btn?.removeAttribute('disabled');
    }
  };

  btn?.addEventListener('click', onClick);
  return () => btn?.removeEventListener('click', onClick);
}

/**
 * @param {HTMLElement | null | undefined} el
 * @param {() => void | Promise<void>} speakFn
 */
export function bindHearButton(el, speakFn) {
  if (!el) return;
  el.addEventListener('click', async () => {
    if (el.hasAttribute('disabled')) return;
    el.setAttribute('disabled', 'true');
    cancelSpeech();
    try {
      await speakFn();
    } finally {
      el.removeAttribute('disabled');
    }
  });
}

/**
 * Speak lexicon parts via Fonora script encoding.
 * @param {string[]} parts
 * @param {object} rules
 * @param {{ lang?: string }} [opts]
 */
export async function speakLexiconParts(parts, rules, opts = {}) {
  if (!parts?.length) return;
  const { phrase } = await import('../tools/fonoran-fonora-bridge.js').then((m) =>
    m.romanToFonoraScript(parts, rules),
  );
  if (!phrase) return;
  await speakFonoraPhrase(phrase, rules, {
    engine: 'piper',
    piperVoice: getPiperVoiceForLang(opts.lang ?? 'en'),
  });
}
