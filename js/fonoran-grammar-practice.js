/**
 * Fonoran grammar practice: sentence translation drills.
 *
 * Prefers phrase-derived exercises from the domain curriculum when translated
 * course phrases are available; falls back to dynamically-generated SVO drills
 * (or the static seed file) when course phrases are absent.
 *
 * Grammar practice always uses phrase-level items only (not single-word vocabulary),
 * so it passes phrasesOnly: true to createDomainCurriculum.
 */
import { learningPrompt } from './learning-locale.js';
import { createLearnSession, finishTypingAnswer, setLearnVerdict } from './learn-session-ui.js';
import { createCurriculum, createDomainCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranPracticeLab } from './fonoran-practice-words.js';
import { buildGrammarExercises } from './fonoran-grammar-generate.js';
import { loadDomainCurriculum } from './fonoran-course-phrases.js';

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
 * Map a CourseEntry (phrase item) to a GrammarExercise for bidirectional drills.
 * domainIndex and itemType are preserved so createDomainCurriculum can bucket correctly.
 * @param {import('./fonoran-course-phrases.js').CourseEntry} entry
 * @returns {GrammarExercise & { domainIndex: number, itemType: 'phrase' }}
 */
function courseEntryToExercise(entry) {
  return {
    id: entry.id,
    promptLang: entry.meaning,
    answerRoman: entry.spelling,
    promptFonoran: entry.spelling,
    answerLang: entry.meaning,
    parts: entry.parts,
    spelling: entry.spelling,
    tierRank: entry.tierRank,
    domainIndex: entry.domainIndex,
    itemType: /** @type {'phrase'} */ ('phrase'),
  };
}

/**
 * Build the exercise pool from course phrases (preferred) or fall back to
 * dynamically-generated SVO drills / static seed file.
 * @returns {Promise<{ exercises: GrammarExercise[], domains?: import('./fonoran-course-phrases.js').CourseDomain[] }>}
 */
async function loadExercisePool() {
  const courseData = await loadDomainCurriculum(null);
  if (courseData) {
    return {
      exercises: courseData.phraseItems.map(courseEntryToExercise),
      domains: courseData.domains,
    };
  }

  try {
    const bootstrap = await loadFonoranPracticeLab();
    const particles = await fetch('/data/fonoran-grammar-particles.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const generated = buildGrammarExercises(bootstrap.lab, particles);
    if (generated.length) return { exercises: generated };
  } catch {
    /* fall through to static seeds */
  }

  try {
    const res = await fetch('/data/fonoran-grammar-practice.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { exercises: data.exercises ?? [] };
  } catch {
    return { exercises: [] };
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
    if (pool.domains) {
      curriculum = createDomainCurriculum('fonoran-grammar', pool.exercises, pool.domains, {
        phrasesOnly: true,
      });
    } else {
      curriculum = createCurriculum('fonoran-grammar', pool.exercises, { keyOf: (item) => item.id });
    }
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
