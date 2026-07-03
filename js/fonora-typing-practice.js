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
 * @param {(match: boolean, word: PracticeWord, user: string) => void} [options.onAnswer]
 * @param {() => import('./learn-session-ui.js').createLearnSession extends Function ? ReturnType<import('./learn-session-ui.js').createLearnSession> : null} [options.getSession]
 * @param {string} [options.continueButtonId]
 * @param {boolean} [options.promptActionButton] — dual Check / Next prompt button
 */
export function createTypingPractice({
  rules,
  ids,
  tabId,
  loadWords,
  emptyMessage,
  onAnswer = null,
  getSession = null,
  continueButtonId = null,
  promptActionButton = false,
}) {
  /** @type {PracticeWord[]} */
  let practiceWords = [];
  let currentIndex = 0;
  /** @type {ReturnType<typeof createFonoraKeyboard> | null} */
  let practiceKeyboard = null;
  let rulesRef = rules;
  let answerLocked = false;
  let promptActionWired = false;

  function setPromptActionMode(mode) {
    if (!promptActionButton || !continueButtonId) return;
    const btn = document.getElementById(continueButtonId);
    if (!btn) return;
    const label = btn.querySelector('.learn-exercise__next-label');
    const kbd = btn.querySelector('.learn-exercise__next-kbd');
    if (mode === 'check') {
      btn.hidden = false;
      btn.dataset.action = 'check';
      btn.setAttribute('aria-label', 'Check answer');
      if (label) label.textContent = 'Check';
      if (kbd) {
        kbd.textContent = '↵';
        kbd.hidden = false;
      }
      return;
    }
    if (mode === 'next') {
      btn.hidden = false;
      btn.dataset.action = 'next';
      btn.setAttribute('aria-label', 'Next word');
      if (label) label.textContent = 'Next';
      if (kbd) {
        kbd.textContent = 'Tab →';
        kbd.hidden = false;
      }
      return;
    }
    btn.hidden = true;
  }

  function wirePromptActionButton() {
    if (!promptActionButton || !continueButtonId || promptActionWired) return;
    const btn = document.getElementById(continueButtonId);
    if (!btn) return;
    promptActionWired = true;
    btn.addEventListener('click', () => {
      const session = getSession?.();
      if (btn.dataset.action === 'next' && session?.canAdvance?.()) {
        session.advance();
        setPromptActionMode('check');
        return;
      }
      if (btn.dataset.action === 'check' && !answerLocked) {
        checkAnswer();
      }
    });
  }

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
    badge.textContent = match ? 'Correct!' : 'Not quite';
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
    answerLocked = false;
    hideResult();
    practiceKeyboard?.clearCompose();
    if (promptActionButton) {
      setPromptActionMode('check');
    } else if (continueButtonId) {
      getSession?.()?.setContinueVisible(continueButtonId, false);
    }
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
    if (answerLocked) return;
    const word = practiceWords[currentIndex];
    const input = el(ids, 'input');
    if (!word || !input || !rulesRef) return;

    practiceKeyboard?.flushToTarget();
    const user = normalizeSymbolInput(input.value, rulesRef);
    const match = user === word.expected;
    renderResult(match, user, word.expected);
    answerLocked = true;
    onAnswer?.(match, word, user);

    const session = getSession?.();
    if (session && continueButtonId) {
      session.afterAnswer(continueButtonId, { correct: match });
      if (promptActionButton) {
        setPromptActionMode('next');
      }
    }
  }

  function nextWord() {
    if (answerLocked) return;
    if (practiceWords.length === 0) return;
    currentIndex = (currentIndex + 1) % practiceWords.length;
    showCurrentWord();
  }

  /** Tab: advance the session if an answer was checked, else skip to next word. */
  function onTabPressed() {
    const session = getSession?.();
    if (session && continueButtonId && session.canAdvance?.()) {
      if (promptActionButton) {
        session.advance();
        setPromptActionMode('check');
      } else {
        document.getElementById(continueButtonId)?.click();
      }
      return;
    }
    nextWord();
  }

  function advanceWord() {
    if (practiceWords.length === 0) return;
    currentIndex = (currentIndex + 1) % practiceWords.length;
    showCurrentWord();
  }

  function restartWords() {
    if (practiceWords.length === 0) return;
    currentIndex = 0;
    showCurrentWord();
  }

  async function setup() {
    rulesRef = rulesRef ?? rules;
    const container = el(ids, 'keyboard');
    const target = el(ids, 'input');
    if (!container || !target || !rulesRef) return;

    const panel = target.closest('[data-tab-panel]');
    const isPracticePanelActive = () =>
      Boolean(panel && !panel.hidden && panel.classList.contains('tab-panel--active'));

    practiceKeyboard?.destroy();
    practiceKeyboard = createFonoraKeyboard({
      rules: rulesRef,
      container,
      target,
      popupEl: el(ids, 'popup'),
      tabId,
      isActive: isPracticePanelActive,
      layout: 'practice',
    enterKeyLabel: 'check',
    onEnter: checkAnswer,
    onTab: onTabPressed,
  });

    setStatus('');
    practiceWords = await loadWords(rulesRef);

    if (practiceWords.length === 0) {
      setStatus(emptyMessage || 'No practice words loaded.');
      return;
    }

    currentIndex = 0;
    showCurrentWord();

    if (isPracticePanelActive()) {
      practiceKeyboard.activate();
    }

    wirePromptActionButton();
    if (promptActionButton) {
      setPromptActionMode('check');
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
    advanceWord,
    showCurrentWord,
    restartWords,
    get wordCount() {
      return practiceWords.length;
    },
  };
}
