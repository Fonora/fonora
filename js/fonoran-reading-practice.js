/**
 * Fonoran reading practice: recognize meaning from roman or Fonora script prompt.
 */
import {
  loadFonoranPracticeEntries,
  meaningChoicesForEntry,
  shuffleEntries,
} from './fonoran-practice-words.js';
import { loadFonoranDisplayMode, setupFonoranDisplayModeToggle } from './learning-display-mode.js';
import {
  createLearnSession,
  learnChoiceHtml,
  markChoiceStates,
} from './learn-session-ui.js';
import { escapeHtml } from './utils.js';

/** @type {import('./fonoran-practice-words.js').PracticeEntry[]} */
let entries = [];
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
  const feedback = document.getElementById('fonoran-reading-feedback');
  if (!entry || !container) return;

  currentChoices = meaningChoicesForEntry(entry, entries);
  answered = false;
  feedback.textContent = '';
  feedback.className = 'learn-exercise__feedback quiz-feedback';
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
  const feedback = document.getElementById('fonoran-reading-feedback');
  if (!entry || !feedback) return;

  const choice = currentChoices[index];
  const correct = choice === entry.meaning;
  answered = true;

  feedback.className = correct
    ? 'learn-exercise__feedback quiz-feedback quiz-feedback--ok'
    : 'learn-exercise__feedback quiz-feedback quiz-feedback--miss';
  feedback.textContent = correct ? 'Correct!' : `Expected: ${entry.meaning}`;

  markChoiceStates('.learn-choice', currentChoices, entry.meaning, index);
  session?.afterAnswer('fonoran-reading-next', { correct, autoAdvanceMs: 800 });
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
    onQuestionStart: () => {
      if (entries.length) nextQuestion();
    },
    onSessionReset: () => {
      currentIndex = 0;
      renderPrompt();
      renderChoices();
    },
  });
  session.bindContinue('fonoran-reading-next', () => {
    answered = false;
  });

  try {
    entries = shuffleEntries(await loadFonoranPracticeEntries(rules, { coreOnly: true }));
  } catch {
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
