/**
 * Shared 10-question learn session UI + gamification wiring.
 */
import {
  awardXp,
  recordSessionComplete,
  XP_MCQ,
  XP_TYPING,
  loadProgress,
} from './learn-gamification.js';
import { icon } from './learn-icons.js';
import { escapeHtml } from './utils.js';

export const SESSION_LENGTH = 10;

/** @type {Record<import('./learn-gamification.js').LearnSkillId, string>} */
export const LEARN_SKILL_TITLES = {
  'script-sounds': 'Symbol Sounds',
  'script-writing': 'Writing',
  'script-words': 'Read Words',
  'fonoran-reading': 'Reading',
  'fonoran-writing': 'Writing',
  'fonoran-hearing': 'Hearing',
  'fonoran-grammar': 'Grammar',
};

const LEARN_HOME_SCROLL_KEY = 'fonora-learn-home-scroll-y';

let learnHomeScrollY = 0;

function readStoredLearnHomeScroll() {
  try {
    const stored = sessionStorage.getItem(LEARN_HOME_SCROLL_KEY);
    if (stored == null) return 0;
    const y = Number(stored);
    return Number.isFinite(y) && y > 0 ? y : 0;
  } catch {
    return 0;
  }
}

function clearStoredLearnHomeScroll() {
  try {
    sessionStorage.removeItem(LEARN_HOME_SCROLL_KEY);
  } catch {
    /* ignore */
  }
}

/** Remember Learn home scroll before opening a lesson. */
export function saveLearnHomeScroll() {
  learnHomeScrollY = window.scrollY;
  if (learnHomeScrollY <= 0) {
    clearStoredLearnHomeScroll();
    return;
  }
  try {
    sessionStorage.setItem(LEARN_HOME_SCROLL_KEY, String(learnHomeScrollY));
  } catch {
    /* ignore */
  }
}

/** Restore Learn home scroll after backing out of a lesson. */
export function restoreLearnHomeScroll() {
  const y = learnHomeScrollY > 0 ? learnHomeScrollY : readStoredLearnHomeScroll();
  if (y <= 0) return;

  const apply = () => window.scrollTo({ top: y, left: 0, behavior: 'auto' });

  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
      if (Math.abs(window.scrollY - y) <= 2) {
        learnHomeScrollY = 0;
        clearStoredLearnHomeScroll();
      }
    });
  });
}

/** Navigate back to the Learn hub. */
function goToLearnHome() {
  if (typeof window !== 'undefined' && typeof window.showTab === 'function') {
    window.showTab('learn-home');
    return;
  }
  const hub = document.querySelector('[data-learn-tab="learn-home"]');
  if (hub instanceof HTMLElement) {
    hub.click();
  }
}

/** @type {Map<string, { updateBar: () => void, track: 'script' | 'language', title: string }>} */
const sessionRegistry = new Map();
let backButtonBound = false;

function bindSessionBackButton() {
  if (backButtonBound) return;
  const btn = document.getElementById('learn-session-back');
  if (!btn) return;
  btn.addEventListener('click', goToLearnHome);
  backButtonBound = true;
}

/**
 * Show or hide the global session bar for a given lesson panel and sync it to
 * that lesson's session state. Called on tab activation.
 * @param {string} domPanelId  e.g. "tab-fonoran-reading"
 */
export function syncLearnSessionBar(domPanelId) {
  const bar = document.getElementById('learn-session-bar');
  if (!bar) return;
  const entry = sessionRegistry.get(domPanelId);
  if (entry) {
    bar.hidden = false;
    bar.setAttribute('data-track', entry.track);
    entry.updateBar();
  } else {
    bar.hidden = true;
    bar.removeAttribute('data-track');
  }
}

/** @typedef {'mcq' | 'typing'} LearnAnswerType */

/**
 * @param {LearnAnswerType} type
 * @param {boolean} correct
 */
export function xpForAnswer(type, correct) {
  if (!correct) return 0;
  return type === 'mcq' ? XP_MCQ : XP_TYPING;
}

/**
 * @typedef {object} LearnSessionOptions
 * @property {string} panelId — section element id (e.g. tab-fonoran-reading)
 * @property {import('./learn-gamification.js').LearnSkillId} skillId
 * @property {LearnAnswerType} [answerType='typing']
 * @property {() => void} [onQuestionStart] — called when a new question begins
 * @property {() => void} [onSessionReset] — called when session restarts after summary
 */

/**
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {LearnSessionOptions} options
 */
export function createLearnSession(skillId, options) {
  const { panelId, answerType = 'typing', onQuestionStart, onSessionReset } = options;
  const panel = document.getElementById(panelId);

  const sessionBar = document.getElementById('learn-session-bar');
  const progressFill = sessionBar?.querySelector('.learn-session__progress-fill');
  const progressBar = sessionBar?.querySelector('.learn-session__progress');
  const lessonEl = sessionBar?.querySelector('.learn-session__lesson');
  const questionEl = sessionBar?.querySelector('.learn-session__question');
  const accuracyEl = null;
  const summaryEl = panel?.querySelector('.learn-session-summary');
  const track = skillId.startsWith('script-') ? 'script' : 'language';
  const lessonTitle = LEARN_SKILL_TITLES[skillId] ?? 'Lesson';

  bindSessionBackButton();

  let questionIndex = 0;
  let sessionCorrect = 0;
  let sessionAttempts = 0;
  let sessionXp = 0;
  let currentAnswered = false;
  let summaryVisible = false;

  function updateBar() {
    const pct = summaryVisible
      ? 100
      : Math.round((questionIndex / SESSION_LENGTH) * 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressBar) {
      progressBar.setAttribute('aria-valuenow', String(summaryVisible ? SESSION_LENGTH : questionIndex));
      progressBar.setAttribute('aria-valuemax', String(SESSION_LENGTH));
    }
    if (lessonEl) lessonEl.textContent = lessonTitle;
    if (questionEl) {
      questionEl.textContent = summaryVisible
        ? 'Complete'
        : `${Math.min(questionIndex + 1, SESSION_LENGTH)} / ${SESSION_LENGTH}`;
    }
    if (accuracyEl) {
      const acc = sessionAttempts
        ? Math.round((sessionCorrect / sessionAttempts) * 100)
        : 0;
      accuracyEl.textContent = sessionAttempts ? `${acc}%` : '';
    }
  }

  function hideSummary() {
    summaryVisible = false;
    if (summaryEl) summaryEl.hidden = true;
    panel?.classList.remove('learn-exercise--session-complete');
    sessionBar?.classList.remove('learn-session--complete');
  }

  function renderSummary() {
    if (!summaryEl) return;
    summaryVisible = true;
    const acc = sessionAttempts
      ? Math.round((sessionCorrect / sessionAttempts) * 100)
      : 0;
    const streak = loadProgress().streak;
    summaryEl.hidden = false;
    panel?.classList.add('learn-exercise--session-complete');
    sessionBar?.classList.add('learn-session--complete');
    summaryEl.innerHTML = `
      <div class="learn-session-summary__card">
        <span class="learn-session-summary__seal">${icon('award')}</span>
        <h3 class="learn-session-summary__title">Session complete</h3>
        <dl class="learn-session-summary__stats">
          <div><dt>Accuracy</dt><dd>${acc}%</dd></div>
          <div><dt>XP earned</dt><dd>+${sessionXp}</dd></div>
          <div><dt>Streak</dt><dd>${streak} day${streak === 1 ? '' : 's'}</dd></div>
        </dl>
        <div class="button-row learn-session-summary__actions">
          <button type="button" class="btn btn--primary learn-session-summary__continue">Practice again</button>
          <button type="button" class="btn learn-session-summary__home">Back to Learn</button>
        </div>
      </div>`;

    summaryEl.querySelector('.learn-session-summary__continue')?.addEventListener('click', () => {
      hideSummary();
      resetSession();
    });
    summaryEl.querySelector('.learn-session-summary__home')?.addEventListener('click', () => {
      goToLearnHome();
    });
    updateBar();
  }

  function resetSession() {
    questionIndex = 0;
    sessionCorrect = 0;
    sessionAttempts = 0;
    sessionXp = 0;
    currentAnswered = false;
    hideSummary();
    updateBar();
    onSessionReset?.();
  }

  /**
   * @param {{ correct: boolean }} result
   * @returns {number} xp awarded this answer
   */
  function onAnswer(result) {
    if (currentAnswered || summaryVisible) return 0;
    currentAnswered = true;
    sessionAttempts += 1;
    if (result.correct) sessionCorrect += 1;

    const xp = xpForAnswer(answerType, result.correct);
    if (xp) {
      awardXp(skillId, xp);
      sessionXp += xp;
    }
    updateBar();
    return xp;
  }

  function canAdvance() {
    return currentAnswered && !summaryVisible;
  }

  function advance() {
    if (!canAdvance()) return false;

    currentAnswered = false;
    questionIndex += 1;

    if (questionIndex >= SESSION_LENGTH) {
      const bonus = recordSessionComplete(skillId);
      sessionXp += bonus;
      renderSummary();
      return true;
    }

    updateBar();
    onQuestionStart?.();
    return true;
  }

  /**
   * Show/hide a continue button within the panel.
   * @param {string} buttonId
   * @param {boolean} visible
   */
  function setContinueVisible(buttonId, visible) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.hidden = !visible;
    btn.classList.toggle('btn--primary', visible);
  }

  /**
   * Wire continue button to advance session.
   * @param {string} buttonId
   * @param {() => void} [beforeAdvance]
   */
  function bindContinue(buttonId, beforeAdvance) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.hidden = true;
    btn.addEventListener('click', () => {
      if (!canAdvance()) return;
      beforeAdvance?.();
      advance();
      btn.hidden = true;
    });
  }

  /**
   * After answering, reveal continue (and optionally auto-advance on correct MCQ).
   * @param {string} continueButtonId
   * @param {{ correct: boolean, autoAdvanceMs?: number }} opts
   */
  function afterAnswer(continueButtonId, opts) {
    onAnswer({ correct: opts.correct });
    setContinueVisible(continueButtonId, true);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      opts.correct &&
      answerType === 'mcq' &&
      opts.autoAdvanceMs &&
      !reducedMotion
    ) {
      window.setTimeout(() => {
        if (canAdvance()) {
          const btn = document.getElementById(continueButtonId);
          btn?.click();
        }
      }, opts.autoAdvanceMs);
    }
  }

  updateBar();

  sessionRegistry.set(panelId, { updateBar, track, title: lessonTitle });
  if (panel && !panel.hidden) {
    syncLearnSessionBar(panelId);
  }

  return {
    get questionIndex() {
      return questionIndex;
    },
    get isComplete() {
      return summaryVisible;
    },
    get sessionXp() {
      return sessionXp;
    },
    onAnswer,
    canAdvance,
    advance,
    resetSession,
    setContinueVisible,
    bindContinue,
    afterAnswer,
    updateBar,
  };
}

/**
 * Set verdict badge text/state on a typing exercise.
 * @param {string} badgeId
 * @param {boolean | null} match
 */
export function setLearnVerdict(badgeId, match) {
  const badge = document.getElementById(badgeId);
  const prompt = badge?.closest('.learn-exercise__card, .typing-practice__prompt');
  if (!badge) return;

  if (match === null) {
    badge.textContent = '';
    badge.className = 'typing-practice__verdict-badge learn-exercise__verdict';
    badge.hidden = true;
    prompt?.classList.remove('learn-exercise__card--ok', 'learn-exercise__card--miss');
    return;
  }

  badge.hidden = false;
  badge.className = `typing-practice__verdict-badge typing-practice__verdict-badge--${match ? 'ok' : 'miss'} learn-exercise__verdict`;
  badge.innerHTML = `${icon(match ? 'check' : 'x')}<span>${match ? 'Correct!' : 'Not quite'}</span>`;
  if (prompt) {
    prompt.classList.toggle('learn-exercise__card--ok', match);
    prompt.classList.toggle('learn-exercise__card--miss', !match);
  }
}

/**
 * Build learn-choice button HTML.
 * @param {string} choice
 * @param {number} index
 * @param {string} [extraClass]
 */
export function learnChoiceHtml(choice, index, extraClass = '') {
  return `<button type="button" class="learn-choice ${extraClass}" data-choice-index="${index}">${escapeHtml(choice)}</button>`;
}

/**
 * Mark MCQ choice states after answer.
 * @param {string} selector
 * @param {string[]} choices
 * @param {string} correctChoice
 * @param {number} pickedIndex
 */
export function markChoiceStates(selector, choices, correctChoice, pickedIndex) {
  document.querySelectorAll(selector).forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove('learn-choice--correct', 'learn-choice--wrong');
    if (choices[i] === correctChoice) btn.classList.add('learn-choice--correct');
    else if (i === pickedIndex) btn.classList.add('learn-choice--wrong');
  });
}
