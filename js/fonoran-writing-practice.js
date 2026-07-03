/**
 * Fonoran writing practice (roman mode): meaning → type Fonoran roman spelling.
 */
import {
  loadFonoranPracticeEntries,
  shuffleEntries,
  spellingMatchesEntry,
} from './fonoran-practice-words.js';
import { setupFonoranDisplayModeToggle, loadFonoranDisplayMode } from './learning-display-mode.js';
import {
  onSpellingPracticeTabActivated,
  setupSpellingPractice,
  bindSpellingSession,
  getSpellingPractice,
} from './fonora-spelling-practice.js';
import { createLearnSession, setLearnVerdict } from './learn-session-ui.js';

/** @type {import('./fonoran-practice-words.js').PracticeEntry[]} */
let entries = [];
let currentIndex = 0;
/** @type {'roman' | 'script'} */
let displayMode = 'roman';

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;
let checked = false;

function showRomanPrompt() {
  const entry = entries[currentIndex];
  const meaningEl = document.getElementById('fonoran-writing-roman-meaning');
  const input = document.getElementById('fonoran-writing-roman-input');
  const feedback = document.getElementById('fonoran-writing-roman-feedback');
  if (!entry || !meaningEl || !input) return;

  meaningEl.textContent = entry.meaning;
  input.value = '';
  checked = false;
  setLearnVerdict('fonoran-writing-roman-verdict', null);
  session?.setContinueVisible('fonoran-writing-roman-next', false);
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'learn-exercise__feedback quiz-feedback';
  }
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
  const feedback = document.getElementById('fonoran-writing-roman-feedback');
  if (!entry || !input || !feedback) return;

  const correct = spellingMatchesEntry(input.value, entry, entries);
  checked = true;
  input.disabled = true;

  setLearnVerdict('fonoran-writing-roman-verdict', correct);
  feedback.className = correct
    ? 'learn-exercise__feedback quiz-feedback quiz-feedback--ok'
    : 'learn-exercise__feedback quiz-feedback quiz-feedback--miss';
  feedback.textContent = correct ? '' : `Expected: ${entry.spelling}`;

  session?.afterAnswer('fonoran-writing-roman-next', { correct });
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
    onQuestionStart: () => {
      if (displayMode === 'roman' && entries.length) nextRomanWord();
      else getSpellingPractice()?.advanceWord();
    },
    onSessionReset: () => {
      currentIndex = 0;
      if (displayMode === 'roman') showRomanPrompt();
      else getSpellingPractice()?.restartWords();
    },
  });
  bindSpellingSession(session);
  session.bindContinue('fonoran-writing-roman-next', () => {
    checked = false;
  });
  session.bindContinue('spelling-practice-continue', () => {});

  setupFonoranDisplayModeToggle('fonoran-writing-mode', applyDisplayMode, 'fonoran-writing-display-mode');

  try {
    entries = shuffleEntries(await loadFonoranPracticeEntries(rules, { coreOnly: true }));
  } catch {
    entries = [];
  }

  const status = document.getElementById('fonoran-writing-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice words loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.';
  }

  document.getElementById('fonoran-writing-roman-check')?.addEventListener('click', checkRomanAnswer);
  document.getElementById('fonoran-writing-roman-input')?.addEventListener('keydown', (event) => {
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
