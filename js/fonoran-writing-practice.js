/**
 * Fonoran writing practice (roman mode): meaning → type Fonoran roman spelling.
 *
 * Uses hybrid curriculum (full ring vocabulary, then domain phrases) when course
 * phrases are available; falls back to ring-only when they are not.
 */
import {
  loadFonoranPracticeEntries,
  spellingMatchesEntry,
} from './fonoran-practice-words.js';
import { loadDomainCurriculum, spellingMatchesCourseEntry } from './fonoran-course-phrases.js';
import { createCurriculum, createHybridCurriculum } from './fonoran-learn-curriculum.js';
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
import { mountPromptHear } from './learn-hear-ui.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';

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

/** @type {object | null} */
let rulesRef = null;

/** @type {(() => void) | null} */
let unbindHear = null;

function resetAnswerState() {
  checked = false;
}

function wireRomanHear() {
  unbindHear?.();
  const entry = entries[currentIndex];
  const meaningEl = document.getElementById('fonoran-writing-roman-meaning');
  unbindHear = mountPromptHear({
    promptEl: meaningEl,
    panelId: 'tab-spelling-practice',
    rules: rulesRef,
    ariaLabel: 'Listen to Fonoran word',
    getSpeakText: () => {
      if (!entry || !rulesRef) return '';
      if (entry.script) return entry.script;
      const parts = entry.parts?.length ? entry.parts : [entry.spelling];
      const { phrase } = romanToFonoraScript(parts, rulesRef);
      return phrase || '';
    },
  });
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
  wireRomanHear();
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

  const isPhrase = entry?.itemType === 'phrase' || entry?.domainId != null;
  const correct = isPhrase
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
  if (mode === 'roman') {
    showRomanPrompt();
    getSpellingPractice()?.onTabActivated();
  } else {
    onSpellingPracticeTabActivated();
  }
}

/**
 * @param {object} rules
 */
export async function setupFonoranWriting(rules) {
  rulesRef = rules;
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
    const [labEntries, courseData] = await Promise.all([
      loadFonoranPracticeEntries(rules),
      loadDomainCurriculum(rules).catch(() => null),
    ]);
    if (courseData?.phraseItems?.length) {
      usingPhrases = true;
      curriculum = createHybridCurriculum(
        'fonoran-writing',
        labEntries,
        courseData.phraseItems,
        courseData.domains,
      );
    } else {
      usingPhrases = false;
      curriculum = createCurriculum('fonoran-writing', labEntries);
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
      : 'No practice content loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.';
  }

  document.getElementById('fonoran-writing-roman-check')?.addEventListener('click', checkRomanAnswer);
  const romanInput = document.getElementById('fonoran-writing-roman-input');
  romanInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    if (checked) {
      const continueBtn = document.getElementById('fonoran-writing-roman-next');
      if (continueBtn && !continueBtn.hidden) {
        continueBtn.click();
        return;
      }
    }
    checkRomanAnswer();
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
