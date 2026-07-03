/**
 * Fonoran grammar story practice: short sentence translation drills.
 */
import { learningPrompt } from './learning-locale.js';
import { createLearnSession, finishTypingAnswer, setLearnVerdict } from './learn-session-ui.js';
import { createCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranPracticeLab } from './fonoran-practice-words.js';
import { buildGrammarExercises } from './fonoran-grammar-generate.js';

/** @typedef {{ id: string, promptLang: string, answerRoman: string, promptFonoran: string, answerLang: string, parts?: string[], spelling?: string, tierRank?: number }} GrammarExercise */

/** @type {GrammarExercise[]} */
let exercises = [];
/** @type {ReturnType<typeof createCurriculum> | null} */
let curriculum = null;
let currentIndex = 0;
/** @type {'to-fonoran' | 'to-lang'} */
let direction = 'to-fonoran';

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;
let checked = false;

function resetAnswerState() {
  checked = false;
}

function normalize(text) {
  return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build the exercise pool. Prefer sentences generated from the live lab so answers always
 * match the current dictionary; fall back to the static seed file when the lab is offline.
 * @returns {Promise<GrammarExercise[]>}
 */
async function loadExercisePool() {
  try {
    const bootstrap = await loadFonoranPracticeLab();
    const particles = await fetch('/data/fonoran-grammar-particles.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const generated = buildGrammarExercises(bootstrap.lab, particles);
    if (generated.length) return generated;
  } catch {
    /* fall through to static seeds */
  }

  try {
    const res = await fetch('/data/fonoran-grammar-practice.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.exercises ?? [];
  } catch {
    return [];
  }
}

function renderExercise() {
  const exercise = exercises[currentIndex];
  const promptEl = document.getElementById('fonoran-grammar-prompt');
  const labelEl = document.getElementById('fonoran-grammar-answer-label');
  const input = document.getElementById('fonoran-grammar-answer');
  const checkBtn = document.getElementById('fonoran-grammar-check');
  if (!exercise || !promptEl || !input || !labelEl) return;

  if (direction === 'to-fonoran') {
    promptEl.textContent = exercise.promptLang;
    labelEl.textContent = 'Your Fonoran answer (roman spelling)';
  } else {
    promptEl.textContent = exercise.promptFonoran;
    labelEl.textContent = learningPrompt('Your {language} translation');
  }

  input.value = '';
  resetAnswerState();
  input.disabled = false;
  setLearnVerdict('fonoran-grammar-verdict', null);
  session?.setContinueVisible('fonoran-grammar-next', false);
  if (checkBtn) checkBtn.hidden = false;
  input.focus();
}

function checkAnswer() {
  if (checked || session?.isComplete) return;
  const exercise = exercises[currentIndex];
  const input = document.getElementById('fonoran-grammar-answer');
  if (!exercise || !input || !session) return;

  const expected = direction === 'to-fonoran' ? exercise.answerRoman : exercise.answerLang;
  const correct = normalize(input.value) === normalize(expected);
  checked = true;
  input.disabled = true;

  curriculum?.recordResult(exercise, correct);
  setLearnVerdict('fonoran-grammar-verdict', correct);
  finishTypingAnswer(session, {
    checkButtonId: 'fonoran-grammar-check',
    continueButtonId: 'fonoran-grammar-next',
    correct,
    beforeAdvance: resetAnswerState,
  });
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
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      if (exercises.length) nextExercise();
    },
    onSessionReset: () => {
      exercises = curriculum?.currentLessonEntries() ?? exercises;
      currentIndex = 0;
      renderExercise();
    },
  });
  session.bindContinue('fonoran-grammar-next', () => {
    resetAnswerState();
  });

  try {
    const pool = await loadExercisePool();
    curriculum = createCurriculum('fonoran-grammar', pool, { keyOf: (item) => item.id });
    exercises = curriculum.currentLessonEntries();
  } catch {
    curriculum = null;
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
  const grammarInput = document.getElementById('fonoran-grammar-answer');
  grammarInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkAnswer();
  });

  currentIndex = 0;
  renderExercise();
}

export function onFonoranGrammarTabActivated() {
  if (exercises.length && !session?.isComplete) renderExercise();
}
