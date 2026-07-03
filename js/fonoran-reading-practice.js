/**
 * Fonoran reading practice: recognize meaning from roman or Fonora script prompt.
 */
import {
  loadFonoranPracticeEntries,
  meaningChoicesForEntry,
} from './fonoran-practice-words.js';
import { createCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranDisplayMode, setupFonoranDisplayModeToggle } from './learning-display-mode.js';
import {
  createLearnSession,
  finishMcqAnswer,
  learnChoiceHtml,
  markChoiceStates,
} from './learn-session-ui.js';
import { escapeHtml } from './utils.js';

/** @type {import('./fonoran-practice-words.js').PracticeEntry[]} */
let entries = [];
/** @type {import('./fonoran-practice-words.js').PracticeEntry[]} */
let pool = [];
/** @type {ReturnType<typeof createCurriculum> | null} */
let curriculum = null;
let currentIndex = 0;
/** @type {string[]} */
let currentChoices = [];
let answered = false;
/** @type {'roman' | 'script'} */
let displayMode = 'roman';

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

function renderPrompt() {
  const entry = entries[currentIndex];
  const prompt = document.getElementById('fonoran-reading-prompt');
  if (!entry || !prompt) return;

  if (displayMode === 'script') {
    prompt.innerHTML = `<span class="symbol-text fonoran-reading-prompt__script">${escapeHtml(entry.script)}</span>`;
  } else {
    prompt.textContent = entry.spelling;
  }
}

function renderChoices() {
  const entry = entries[currentIndex];
  const container = document.getElementById('fonoran-reading-choices');
  if (!entry || !container) return;

  currentChoices = meaningChoicesForEntry(entry, pool.length ? pool : entries);
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
    curriculum = createCurriculum('fonoran-reading', await loadFonoranPracticeEntries(rules));
    pool = curriculum.ordered;
    entries = curriculum.currentLessonEntries();
  } catch {
    curriculum = null;
    pool = [];
    entries = [];
  }

  const status = document.getElementById('fonoran-reading-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice words loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.';
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
