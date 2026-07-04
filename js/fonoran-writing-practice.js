/**
 * Fonoran writing practice (roman mode): meaning → type Fonoran roman spelling.
 *
 * Prefers the phrase-based domain curriculum when translated phrases are available;
 * falls back to the word-based ring curriculum.
 */
import {
  loadFonoranPracticeEntries,
  spellingMatchesEntry,
} from './fonoran-practice-words.js';
import { loadDomainCurriculum, spellingMatchesCourseEntry } from './fonoran-course-phrases.js';
import { createCurriculum, createDomainCurriculum } from './fonoran-learn-curriculum.js';
import { setupFonoranDisplayModeToggle, loadFonoranDisplayMode } from './learning-display-mode.js';
import {
  onSpellingPracticeTabActivated,
  setupSpellingPractice,
  bindSpellingSession,
  getSpellingPractice,
} from './fonora-spelling-practice.js';
import {
  createLearnSession,
  finishTypingAnswer,
  setLearnVerdict,
} from './learn-session-ui.js';

/** @type {Array<import('./fonoran-practice-words.js').PracticeEntry | import('./fonoran-course-phrases.js').CourseEntry>} */
let entries = [];
/** @type {Array<import('./fonoran-practice-words.js').PracticeEntry | import('./fonoran-course-phrases.js').CourseEntry>} */
let pool = [];
/** @type {ReturnType<typeof createCurriculum> | null} */
let curriculum = null;
let currentIndex = 0;
/** @type {'roman' | 'script'} */
let displayMode = 'roman';
/** @type {boolean} */
let usingPhrases = false;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;
let checked = false;

function resetAnswerState() {
  checked = false;
}

function showRomanPrompt() {
  const entry = entries[currentIndex];
  const meaningEl = document.getElementById('fonoran-writing-roman-meaning');
  const input = document.getElementById('fonoran-writing-roman-input');
  const checkBtn = document.getElementById('fonoran-writing-roman-check');
  if (!entry || !meaningEl || !input) return;

  meaningEl.textContent = entry.meaning;
  input.value = '';
  resetAnswerState();
  setLearnVerdict('fonoran-writing-roman-verdict', null);
  session?.setContinueVisible('fonoran-writing-roman-next', false);
  if (checkBtn) checkBtn.hidden = false;
  input.disabled = false;
  input.focus();
}

function nextRomanWord() {
  if (!entries.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % entries.length;
  showRomanPrompt();
}

function checkRomanAnswer() {
  if (checked || session?.isComplete) return;
  const entry = entries[currentIndex];
  const input = document.getElementById('fonoran-writing-roman-input');
  if (!entry || !input) return;

  const correct = usingPhrases
    ? spellingMatchesCourseEntry(input.value, /** @type {any} */ (entry))
    : spellingMatchesEntry(input.value, /** @type {any} */ (entry), pool.length ? pool : entries);
  checked = true;
  input.disabled = true;

  curriculum?.recordResult(entry, correct);
  setLearnVerdict('fonoran-writing-roman-verdict', correct);
  if (session) {
    finishTypingAnswer(session, {
      checkButtonId: 'fonoran-writing-roman-check',
      continueButtonId: 'fonoran-writing-roman-next',
      correct,
      beforeAdvance: resetAnswerState,
    });
  }
}

function syncPanelVisibility(mode) {
  const roman = mode === 'roman';
  document.getElementById('fonoran-writing-roman-panel')?.toggleAttribute('hidden', !roman);
  document.getElementById('fonoran-writing-script-panel')?.toggleAttribute('hidden', roman);
  document.getElementById('tab-spelling-practice')?.classList.toggle('fonoran-writing--script-mode', !roman);
}

function applyDisplayMode(mode) {
  displayMode = mode;
  syncPanelVisibility(mode);
  if (mode === 'roman') showRomanPrompt();
  else onSpellingPracticeTabActivated();
}

/**
 * @param {object} rules
 */
export async function setupFonoranWriting(rules) {
  session = createLearnSession('fonoran-writing', {
    panelId: 'tab-spelling-practice',
    answerType: 'typing',
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      if (displayMode === 'roman' && entries.length) nextRomanWord();
      else getSpellingPractice()?.advanceWord();
    },
    onSessionReset: () => {
      entries = curriculum?.currentLessonEntries() ?? entries;
      currentIndex = 0;
      if (displayMode === 'roman') showRomanPrompt();
      else getSpellingPractice()?.restartWords();
    },
  });
  bindSpellingSession(session);
  session.bindContinue('fonoran-writing-roman-next', () => {
    resetAnswerState();
  });
  session.bindContinue('spelling-practice-continue', () => {});

  setupFonoranDisplayModeToggle('fonoran-writing-mode', applyDisplayMode, 'fonoran-writing-display-mode');

  try {
    const courseData = await loadDomainCurriculum(rules);
    if (courseData) {
      usingPhrases = true;
      curriculum = createDomainCurriculum('fonoran-writing', courseData.items, courseData.domains);
    } else {
      usingPhrases = false;
      curriculum = createCurriculum('fonoran-writing', await loadFonoranPracticeEntries(rules));
    }
    pool = curriculum.ordered;
    entries = curriculum.currentLessonEntries();
  } catch {
    curriculum = null;
    pool = [];
    entries = [];
    usingPhrases = false;
  }

  const status = document.getElementById('fonoran-writing-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice content loaded. Run the dev server and build course phrases with npm run fonoran:course-phrases:build.';
  }

  document.getElementById('fonoran-writing-roman-check')?.addEventListener('click', checkRomanAnswer);
  const romanInput = document.getElementById('fonoran-writing-roman-input');
  romanInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkRomanAnswer();
  });

  await setupSpellingPractice(rules);
  currentIndex = 0;
  applyDisplayMode(loadFonoranDisplayMode());
}

export function refreshFonoranWriting(rules) {
  setupSpellingPractice(rules);
}

export function onFonoranWritingTabActivated() {
  syncPanelVisibility(displayMode);
  if (displayMode === 'roman') showRomanPrompt();
  else onSpellingPracticeTabActivated();
}
