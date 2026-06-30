/**
 * Shared roman-prompt typing practice: prompt → Fonora keyboard → check → next word.
 */
import { createFonoraKeyboard } from './fonora-keyboard-ui.js';
import { normalizeSymbolInput } from './decode.js';

/** @typedef {{ spelling: string, meaning?: string, expected: string }} PracticeWord */

/**
 * @typedef {object} TypingPracticeIds
 * @property {string} status
 * @property {string} verdict
 * @property {string} promptWord
 * @property {string} [promptMeaning]
 * @property {string} compare
 * @property {string} userGlyphs
 * @property {string} expectedGlyphs
 * @property {string} input
 * @property {string} keyboard
 * @property {string} popup
 */

/**
 * @param {TypingPracticeIds} ids
 * @param {string} suffix
 */
function el(ids, suffix) {
  return document.getElementById(ids[suffix]);
}

/**
 * @param {object} options
 * @param {object} options.rules
 * @param {TypingPracticeIds} options.ids
 * @param {string} options.tabId
 * @param {() => Promise<PracticeWord[]> | PracticeWord[]} options.loadWords
 * @param {string} [options.emptyMessage]
 */
export function createTypingPractice({ rules, ids, tabId, loadWords, emptyMessage }) {
  /** @type {PracticeWord[]} */
  let practiceWords = [];
  let currentIndex = 0;
  /** @type {ReturnType<typeof createFonoraKeyboard> | null} */
  let practiceKeyboard = null;
  let rulesRef = rules;

  function setStatus(message) {
    const status = el(ids, 'status');
    if (!status) return;
    if (message) {
      status.textContent = message;
      status.hidden = false;
    } else {
      status.textContent = '';
      status.hidden = true;
    }
  }

  /** @param {boolean | null} match */
  function setVerdict(match) {
    const badge = el(ids, 'verdict');
    const prompt = badge?.closest('.typing-practice__prompt');
    if (!badge || !prompt) return;

    if (match === null) {
      badge.textContent = '';
      badge.className = 'typing-practice__verdict-badge';
      prompt.classList.remove('typing-practice__prompt--ok', 'typing-practice__prompt--miss');
      return;
    }

    badge.className = `typing-practice__verdict-badge typing-practice__verdict-badge--${match ? 'ok' : 'miss'}`;
    badge.textContent = match ? 'Correct' : 'Incorrect';
    prompt.classList.toggle('typing-practice__prompt--ok', match);
    prompt.classList.toggle('typing-practice__prompt--miss', !match);
  }

  function hideCompare() {
    const compare = el(ids, 'compare');
    const userGlyphs = el(ids, 'userGlyphs');
    const expectedGlyphs = el(ids, 'expectedGlyphs');
    if (userGlyphs) userGlyphs.textContent = '';
    if (expectedGlyphs) expectedGlyphs.textContent = '';
    if (compare) {
      compare.classList.remove('is-visible');
      compare.setAttribute('aria-hidden', 'true');
    }
  }

  function hideResult() {
    hideCompare();
    setVerdict(null);
  }

  function showCurrentWord() {
    const word = practiceWords[currentIndex];
    const wordEl = el(ids, 'promptWord');
    const meaningEl = ids.promptMeaning ? el(ids, 'promptMeaning') : null;
    const input = el(ids, 'input');

    if (!word || !wordEl || !input) return;

    wordEl.textContent = word.spelling;
    if (meaningEl) {
      meaningEl.textContent = word.meaning || '';
    }

    input.value = '';
    hideResult();
    practiceKeyboard?.clearCompose();
    input.focus();
  }

  function renderResult(match, user, expected) {
    setVerdict(match);

    const compare = el(ids, 'compare');
    const userGlyphs = el(ids, 'userGlyphs');
    const expectedGlyphs = el(ids, 'expectedGlyphs');

    if (match || !compare || !userGlyphs || !expectedGlyphs) {
      hideCompare();
      return;
    }

    userGlyphs.textContent = user || '—';
    expectedGlyphs.textContent = expected;
    compare.classList.add('is-visible');
    compare.setAttribute('aria-hidden', 'false');
  }

  function checkAnswer() {
    const word = practiceWords[currentIndex];
    const input = el(ids, 'input');
    if (!word || !input || !rulesRef) return;

    practiceKeyboard?.flushToTarget();
    const user = normalizeSymbolInput(input.value, rulesRef);
    renderResult(user === word.expected, user, word.expected);
  }

  function nextWord() {
    if (practiceWords.length === 0) return;
    currentIndex = (currentIndex + 1) % practiceWords.length;
    showCurrentWord();
  }

  async function setup() {
    rulesRef = rulesRef ?? rules;
    const container = el(ids, 'keyboard');
    const target = el(ids, 'input');
    if (!container || !target || !rulesRef) return;

    practiceKeyboard?.destroy();
    practiceKeyboard = createFonoraKeyboard({
      rules: rulesRef,
      container,
      target,
      popupEl: el(ids, 'popup'),
      tabId,
      layout: 'practice',
      enterKeyLabel: 'check',
      onEnter: checkAnswer,
      onTab: nextWord,
    });

    setStatus('');
    practiceWords = await loadWords(rulesRef);

    if (practiceWords.length === 0) {
      setStatus(emptyMessage || 'No practice words loaded.');
      return;
    }

    currentIndex = 0;
    showCurrentWord();

    if (document.documentElement.getAttribute('data-fonora-tab') === tabId) {
      practiceKeyboard.activate();
    }
  }

  function refresh(nextRules) {
    if (nextRules) rulesRef = nextRules;
    practiceKeyboard?.refresh(rulesRef);
  }

  function onTabActivated() {
    if (practiceWords.length === 0 && rulesRef) {
      setup();
      return;
    }
    practiceKeyboard?.activate();
  }

  function destroy() {
    practiceKeyboard?.destroy();
    practiceKeyboard = null;
  }

  return {
    setup,
    refresh,
    onTabActivated,
    destroy,
    get wordCount() {
      return practiceWords.length;
    },
  };
}
