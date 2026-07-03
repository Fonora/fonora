/**
 * Fonoran grammar story practice: short sentence translation drills.
 */
import { learningPrompt } from './learning-locale.js';
import { createLearnSession, setLearnVerdict } from './learn-session-ui.js';

/** @typedef {{ id: string, promptLang: string, answerRoman: string, promptFonoran: string, answerLang: string }} GrammarExercise */

/** @type {GrammarExercise[]} */
let exercises = [];
let currentIndex = 0;
/** @type {'to-fonoran' | 'to-lang'} */
let direction = 'to-fonoran';

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;
let checked = false;

function normalize(text) {
  return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function loadExercises() {
  if (exercises.length) return exercises;
  const res = await fetch('/data/fonoran-grammar-practice.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  exercises = data.exercises ?? [];
  return exercises;
}

function renderExercise() {
  const exercise = exercises[currentIndex];
  const promptEl = document.getElementById('fonoran-grammar-prompt');
  const labelEl = document.getElementById('fonoran-grammar-answer-label');
  const input = document.getElementById('fonoran-grammar-answer');
  const feedback = document.getElementById('fonoran-grammar-feedback');
  if (!exercise || !promptEl || !input || !labelEl) return;

  if (direction === 'to-fonoran') {
    promptEl.textContent = exercise.promptLang;
    labelEl.textContent = 'Your Fonoran answer (roman spelling)';
  } else {
    promptEl.textContent = exercise.promptFonoran;
    labelEl.textContent = learningPrompt('Your {language} translation');
  }

  input.value = '';
  checked = false;
  input.disabled = false;
  setLearnVerdict('fonoran-grammar-verdict', null);
  session?.setContinueVisible('fonoran-grammar-next', false);
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'learn-exercise__feedback quiz-feedback';
  }
  input.focus();
}

function checkAnswer() {
  if (checked || session?.isComplete) return;
  const exercise = exercises[currentIndex];
  const input = document.getElementById('fonoran-grammar-answer');
  const feedback = document.getElementById('fonoran-grammar-feedback');
  if (!exercise || !input || !feedback) return;

  const expected = direction === 'to-fonoran' ? exercise.answerRoman : exercise.answerLang;
  const correct = normalize(input.value) === normalize(expected);
  checked = true;
  input.disabled = true;

  setLearnVerdict('fonoran-grammar-verdict', correct);
  feedback.className = correct
    ? 'learn-exercise__feedback quiz-feedback quiz-feedback--ok'
    : 'learn-exercise__feedback quiz-feedback quiz-feedback--miss';
  feedback.textContent = correct ? '' : `Expected: ${expected}`;

  session?.afterAnswer('fonoran-grammar-next', { correct });
}

function nextExercise() {
  if (!exercises.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % exercises.length;
  renderExercise();
}

export async function setupFonoranGrammar() {
  session = createLearnSession('fonoran-grammar', {
    panelId: 'tab-fonoran-grammar',
    answerType: 'typing',
    onQuestionStart: () => {
      if (exercises.length) nextExercise();
    },
    onSessionReset: () => {
      currentIndex = 0;
      renderExercise();
    },
  });
  session.bindContinue('fonoran-grammar-next', () => {
    checked = false;
  });

  try {
    await loadExercises();
  } catch {
    exercises = [];
  }

  const status = document.getElementById('fonoran-grammar-status');
  if (status) {
    status.hidden = exercises.length > 0;
    status.textContent = exercises.length ? '' : 'Grammar practice stories could not be loaded.';
  }

  document.querySelectorAll('[name="fonoran-grammar-direction"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      direction = radio.value === 'to-lang' ? 'to-lang' : 'to-fonoran';
      renderExercise();
    });
  });

  document.getElementById('fonoran-grammar-check')?.addEventListener('click', checkAnswer);
  document.getElementById('fonoran-grammar-answer')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkAnswer();
  });

  currentIndex = 0;
  renderExercise();
}

export function onFonoranGrammarTabActivated() {
  if (exercises.length && !session?.isComplete) renderExercise();
}
