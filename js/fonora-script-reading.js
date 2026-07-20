/**
 * Fonora Script reading — Fonora script → type English meaning.
 * Uses hybrid curriculum (full ring vocabulary, then domain phrases).
 */
import { loadDomainCurriculum } from './fonoran-course-phrases.js';
import { createHybridCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranPracticeEntries } from './fonoran-practice-words.js';
import { showScriptReadingBreakdown, hideBreakdownFeedback } from './breakdown-feedback.js';
import {
  createLearnSession,
  finishTypingAnswer,
  setLearnVerdict,
} from './learn-session-ui.js';
import { mountPromptHear } from './learn-hear-ui.js';
import { escapeHtml } from './utils.js';

/** @typedef {import('./fonoran-course-phrases.js').CourseEntry & { accept?: string[] }} ReadingEntry */

/** @type {ReadingEntry[]} */
let readingEntries = [];
let currentIndex = 0;
let wired = false;
/** @type {object | null} */
let rulesRef = null;

/** @type {ReturnType<typeof createHybridCurriculum> | null} */
let curriculum = null;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

/** @type {(() => void) | null} */
let unbindHear = null;

let checked = false;

function resetAnswerState() {
  checked = false;
}

function normalizeAnswer(text) {
  return String(text ?? '').trim().toLowerCase();
}

function wirePromptHear() {
  unbindHear?.();
  const promptEl = document.getElementById('script-reading-word-prompt');
  const entry = readingEntries[currentIndex];
  unbindHear = mountPromptHear({
    promptEl,
    panelId: 'tab-script-reading-words',
    rules: rulesRef,
    ariaLabel: 'Listen to script',
    getSpeakText: () => entry?.script ?? '',
  });
}

function showWordPrompt() {
  const entry = readingEntries[currentIndex];
  const prompt = document.getElementById('script-reading-word-prompt');
  const input = document.getElementById('script-reading-word-answer');
  const checkBtn = document.getElementById('script-reading-word-check');
  const breakdown = document.getElementById('script-reading-word-breakdown');
  if (!entry || !prompt || !input) return;

  prompt.innerHTML = `<span class="symbol-text learn-exercise__prompt-glyphs">${escapeHtml(entry.script)}</span>`;
  input.value = '';
  resetAnswerState();
  input.disabled = false;
  setLearnVerdict('script-reading-word-verdict', null);
  session?.setContinueVisible('script-reading-word-next', false);
  if (checkBtn) checkBtn.hidden = false;
  hideBreakdownFeedback(breakdown);
  wirePromptHear();
  input.focus();
}

function nextWord() {
  if (!readingEntries.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % readingEntries.length;
  showWordPrompt();
}

function checkWordAnswer() {
  if (checked || session?.isComplete) return;
  const entry = readingEntries[currentIndex];
  const input = document.getElementById('script-reading-word-answer');
  const breakdown = document.getElementById('script-reading-word-breakdown');
  if (!entry || !input || !rulesRef || !session) return;

  const answer = normalizeAnswer(input.value);
  const accepted = (entry.accept ?? [entry.meaning]).map(normalizeAnswer);
  const correct = accepted.includes(answer);
  checked = true;
  input.disabled = true;

  setLearnVerdict('script-reading-word-verdict', correct);
  curriculum?.recordResult(entry, correct);

  if (correct) {
    hideBreakdownFeedback(breakdown);
  } else {
    void showScriptReadingBreakdown(breakdown, entry, rulesRef, input.value);
  }

  finishTypingAnswer(session, {
    checkButtonId: 'script-reading-word-check',
    continueButtonId: 'script-reading-word-next',
    correct,
    beforeAdvance: resetAnswerState,
  });
}

async function reloadLessonEntries(rules) {
  if (!curriculum) {
    const [labEntries, courseData] = await Promise.all([
      loadFonoranPracticeEntries(rules).catch(() => []),
      loadDomainCurriculum(rules).catch(() => null),
    ]);
    if (!courseData?.phraseItems?.length && !labEntries.length) {
      readingEntries = [];
      curriculum = null;
    } else {
      curriculum = createHybridCurriculum(
        'script-words',
        labEntries,
        courseData?.phraseItems ?? [],
        courseData?.domains ?? [],
      );
      readingEntries = curriculum
        .currentLessonEntries()
        .filter((entry) => entry.script)
        .map((entry) => ({
          ...entry,
          accept: [entry.meaning],
        }));
    }
  } else {
    readingEntries = curriculum
      .currentLessonEntries()
      .filter((entry) => entry.script)
      .map((entry) => ({
        ...entry,
        accept: [entry.meaning],
      }));
  }

  const status = document.getElementById('script-reading-word-status');
  if (status) {
    status.hidden = readingEntries.length > 0;
    status.textContent = readingEntries.length
      ? ''
      : 'No reading content loaded. Build course phrases with npm run fonoran:course-phrases:build.';
  }

  currentIndex = 0;
  if (readingEntries.length) showWordPrompt();
}

/**
 * @param {object} rules
 */
export async function setupScriptReadingWords(rules) {
  rulesRef = rules;
  curriculum = null;

  session = createLearnSession('script-words', {
    panelId: 'tab-script-reading-words',
    answerType: 'typing',
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      if (readingEntries.length) nextWord();
    },
    onSessionReset: () => {
      void reloadLessonEntries(rules);
    },
  });

  session.bindContinue('script-reading-word-next', () => {
    hideBreakdownFeedback(document.getElementById('script-reading-word-breakdown'));
    resetAnswerState();
  });

  const label = document.getElementById('script-reading-word-label');
  if (label) {
    label.textContent = 'Your answer (English meaning)';
  }

  if (!wired) {
    wired = true;
    document.getElementById('script-reading-word-check')?.addEventListener('click', checkWordAnswer);
    const readingInput = document.getElementById('script-reading-word-answer');
    readingInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (checked) {
        const continueBtn = document.getElementById('script-reading-word-next');
        if (continueBtn && !continueBtn.hidden) {
          continueBtn.click();
          return;
        }
      }
      checkWordAnswer();
    });
  }

  await reloadLessonEntries(rules);
}

export function onScriptReadingTabActivated() {
  if (readingEntries.length && !session?.isComplete) showWordPrompt();
  else if (rulesRef) void setupScriptReadingWords(rulesRef);
}
