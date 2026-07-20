/**
 * Fonoran reading practice: recognize meaning from roman or Fonora script prompt.
 *
 * Uses hybrid curriculum (full ring vocabulary, then domain phrases) when course
 * phrases are available; falls back to ring-only when they are not.
 */
import {
  loadFonoranPracticeEntries,
  meaningChoicesForEntry,
} from './fonoran-practice-words.js';
import { loadDomainCurriculum, meaningChoicesForCourseEntry } from './fonoran-course-phrases.js';
import { createCurriculum, createHybridCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranDisplayMode, setupFonoranDisplayModeToggle } from './learning-display-mode.js';
import {
  createLearnSession,
  finishMcqAnswer,
  learnChoiceHtml,
  markChoiceStates,
} from './learn-session-ui.js';
import { mountPromptHear } from './learn-hear-ui.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { escapeHtml } from './utils.js';

/** @type {Array<import('./fonoran-practice-words.js').PracticeEntry | import('./fonoran-course-phrases.js').CourseEntry>} */
let entries = [];
/** @type {Array<import('./fonoran-practice-words.js').PracticeEntry | import('./fonoran-course-phrases.js').CourseEntry>} */
let pool = [];
/** @type {ReturnType<typeof createCurriculum> | null} */
let curriculum = null;
/** @type {boolean} */
let usingPhrases = false;
let currentIndex = 0;
/** @type {string[]} */
let currentChoices = [];
let answered = false;
/** @type {'roman' | 'script'} */
let displayMode = 'roman';

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

/** @type {object | null} */
let rulesRef = null;

/** @type {(() => void) | null} */
let unbindHear = null;

function speakTextForEntry(entry) {
  if (!entry || !rulesRef) return '';
  if (entry.script) return entry.script;
  if (entry.parts?.length) {
    const { phrase } = romanToFonoraScript(entry.parts, rulesRef);
    return phrase || '';
  }
  return '';
}

function wirePromptHear() {
  unbindHear?.();
  const prompt = document.getElementById('fonoran-reading-prompt');
  unbindHear = mountPromptHear({
    promptEl: prompt,
    panelId: 'tab-fonoran-reading',
    rules: rulesRef,
    ariaLabel: 'Listen to word',
    getSpeakText: () => speakTextForEntry(entries[currentIndex]),
  });
}

function renderPrompt() {
  const entry = entries[currentIndex];
  const prompt = document.getElementById('fonoran-reading-prompt');
  if (!entry || !prompt) return;

  if (displayMode === 'script') {
    prompt.innerHTML = `<span class="symbol-text fonoran-reading-prompt__script">${escapeHtml(entry.script)}</span>`;
  } else {
    prompt.textContent = entry.spelling;
  }
  wirePromptHear();
}

function renderChoices() {
  const entry = entries[currentIndex];
  const container = document.getElementById('fonoran-reading-choices');
  if (!entry || !container) return;

  const isPhrase = entry?.itemType === 'phrase' || entry?.domainId != null;
  currentChoices = isPhrase
    ? meaningChoicesForCourseEntry(/** @type {any} */ (entry), /** @type {any[]} */ (pool.length ? pool : entries))
    : meaningChoicesForEntry(/** @type {any} */ (entry), pool.length ? pool : entries);
  answered = false;
  session?.setContinueVisible('fonoran-reading-next', false);

  container.innerHTML = currentChoices
    .map((choice, index) => learnChoiceHtml(choice, index))
    .join('');
}

function nextQuestion() {
  if (!entries.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % entries.length;
  renderPrompt();
  renderChoices();
}

function onChoice(index) {
  if (answered || session?.isComplete) return;
  const entry = entries[currentIndex];
  if (!entry) return;

  const choice = currentChoices[index];
  const correct = choice === entry.meaning;
  answered = true;

  curriculum?.recordResult(entry, correct);
  markChoiceStates('#fonoran-reading-choices .learn-choice', currentChoices, entry.meaning, index);
  if (session) {
    finishMcqAnswer(session, {
      continueButtonId: 'fonoran-reading-next',
      correct,
      beforeAdvance: () => {
        answered = false;
      },
    });
  }
}

/**
 * @param {object} rules
 */
export async function setupFonoranReading(rules) {
  rulesRef = rules;
  displayMode = loadFonoranDisplayMode();
  setupFonoranDisplayModeToggle('fonoran-reading-mode', (mode) => {
    displayMode = mode;
    renderPrompt();
  }, 'fonoran-reading-display-mode');

  session = createLearnSession('fonoran-reading', {
    panelId: 'tab-fonoran-reading',
    answerType: 'mcq',
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      if (entries.length) nextQuestion();
    },
    onSessionReset: () => {
      entries = curriculum?.currentLessonEntries() ?? entries;
      currentIndex = 0;
      renderPrompt();
      renderChoices();
    },
  });
  session.bindContinue('fonoran-reading-next', () => {
    answered = false;
  });

  try {
    const [labEntries, courseData] = await Promise.all([
      loadFonoranPracticeEntries(rules),
      loadDomainCurriculum(rules).catch(() => null),
    ]);
    if (courseData?.phraseItems?.length) {
      usingPhrases = true;
      curriculum = createHybridCurriculum(
        'fonoran-reading',
        labEntries,
        courseData.phraseItems,
        courseData.domains,
      );
    } else {
      usingPhrases = false;
      curriculum = createCurriculum('fonoran-reading', labEntries);
    }
    pool = curriculum.ordered;
    entries = curriculum.currentLessonEntries();
  } catch {
    curriculum = null;
    pool = [];
    entries = [];
    usingPhrases = false;
  }

  const status = document.getElementById('fonoran-reading-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice content loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.';
  }

  document.getElementById('fonoran-reading-choices')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-choice-index]');
    if (!btn) return;
    onChoice(Number(btn.dataset.choiceIndex));
  });

  currentIndex = 0;
  renderPrompt();
  renderChoices();
}

export function onFonoranReadingTabActivated() {
  if (entries.length && !session?.isComplete) {
    renderPrompt();
    renderChoices();
  }
}
