/**
 * Fonoran grammar practice: Rule 4 basics lesson, then phrase drills.
 *
 * Lesson 1 is the hand-authored five-minute grammar (preferred order, particles,
 * serial want+go, bare destinations, casual Actor drop). Later lessons mix
 * reorder / particle / translation drills from course phrases.
 *
 * Question UI switches per item: typed answer (existing input) or MCQ
 * (same learn-choice grid as Reading/Hearing).
 */
import { learningPrompt } from './learning-locale.js';
import {
  createLearnSession,
  finishTypingAnswer,
  finishMcqAnswer,
  learnChoiceHtml,
  markChoiceStates,
  setLearnVerdict,
} from './learn-session-ui.js';
import { createCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranPracticeLab } from './fonoran-practice-words.js';
import { buildGrammarExercises } from './fonoran-grammar-generate.js';
import { loadDomainCurriculum } from './fonoran-course-phrases.js';
import {
  buildGrammarPhraseExercises,
  grammarPhraseExerciseMatches,
  grammarPhraseForcesFonoran,
  grammarPhrasePrompt,
} from './fonoran-grammar-phrase-exercises.js';
import { loadGrammarLessonExercises } from './fonoran-grammar-lessons.js';
import { speakFonoraPhrase, speakFonoraSlow, cancelSpeech } from './fonora-tts.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';

/** @typedef {import('./fonoran-grammar-phrase-exercises.js').GrammarPhraseExercise} GrammarExercise */

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

/** @type {string[]} */
let currentChoices = [];

/** @type {object | null} */
let rulesRef = null;

/** Bumps when a new play starts so stale async playback can bail out. */
let playGeneration = 0;

function isMcqExercise(exercise) {
  return exercise?.kind === 'choose' && Array.isArray(exercise.choices) && exercise.choices.length >= 2;
}

function resetAnswerState() {
  checked = false;
  const feedback = document.getElementById('fonoran-grammar-feedback');
  if (feedback) {
    feedback.textContent = '';
    feedback.classList.remove('is-visible');
  }
}

/**
 * @param {import('./fonoran-course-phrases.js').CourseEntry} entry
 */
function courseEntryToBase(entry) {
  return {
    id: entry.id,
    meaning: entry.meaning,
    spelling: entry.spelling,
    parts: entry.parts,
    tierRank: Math.max(1, entry.tierRank ?? 1),
    domainIndex: entry.domainIndex,
    itemType: /** @type {'phrase'} */ ('phrase'),
  };
}

/**
 * @returns {Promise<{ exercises: GrammarExercise[] }>}
 */
async function loadExercisePool() {
  const basics = await loadGrammarLessonExercises();

  const courseData = await loadDomainCurriculum(null);
  if (courseData?.phraseItems?.length) {
    const phraseEntries = courseData.phraseItems.map(courseEntryToBase);
    const phraseDrills = buildGrammarPhraseExercises(phraseEntries).map((ex) => ({
      ...ex,
      tierRank: Math.max(1, ex.tierRank ?? 1),
      spelling: ex.answerRoman,
      tip: tipForPhraseKind(ex.kind),
    }));
    return { exercises: [...basics, ...phraseDrills] };
  }

  try {
    const bootstrap = await loadFonoranPracticeLab();
    const particles = await fetch('/data/fonoran-grammar-particles.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const generated = buildGrammarExercises(bootstrap.lab, particles).map((ex) => ({
      ...ex,
      kind: /** @type {'translate-to-fonoran'} */ ('translate-to-fonoran'),
      tierRank: Math.max(1, ex.tierRank ?? 1),
      spelling: ex.answerRoman,
    }));
    if (generated.length) return { exercises: [...basics, ...generated] };
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch('/data/fonoran-grammar-practice.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const seeds = (data.exercises ?? []).map((ex) => ({
      ...ex,
      kind: /** @type {'translate-to-fonoran'} */ ('translate-to-fonoran'),
      tierRank: 1,
      spelling: ex.answerRoman,
    }));
    return { exercises: [...basics, ...seeds] };
  } catch {
    return { exercises: basics };
  }
}

function tipForPhraseKind(kind) {
  if (kind === 'reorder') return 'Preferred order: Actor → Action → Target → Place. Type the full roman phrase.';
  if (kind === 'particles') return 'Closed particles only: mi, ta, sa, no, ya, von.';
  return 'Compile meaning — not English word order.';
}

function phrasePartsForExercise(exercise) {
  if (!exercise) return [];
  if (exercise.parts?.length) return exercise.parts.filter(Boolean);
  return String(exercise.answerRoman || exercise.spelling || '')
    .split(/\s+/)
    .filter(Boolean);
}

function setPlayControlsPlaying(playing) {
  document.getElementById('fonoran-grammar-play')?.toggleAttribute('disabled', playing);
  document.getElementById('fonoran-grammar-play-slow')?.toggleAttribute('disabled', playing);
  document.getElementById('fonoran-grammar-play')?.classList.toggle('learn-play-btn--playing', playing);
  document.getElementById('fonoran-grammar-play-slow')?.classList.toggle('learn-play-btn--playing', playing);
}

/**
 * @param {{ slow?: boolean }} [opts]
 */
async function playCurrentPhrase(opts = {}) {
  const { slow = false } = opts;
  const exercise = exercises[currentIndex];
  const status = document.getElementById('fonoran-grammar-play-status');
  if (!exercise || !rulesRef) return;

  const parts = phrasePartsForExercise(exercise);
  const { phrase } = romanToFonoraScript(parts, rulesRef);
  if (!phrase) {
    if (status) status.textContent = 'No audio for this phrase';
    return;
  }

  const generation = ++playGeneration;
  cancelSpeech();
  setPlayControlsPlaying(true);
  if (status) status.textContent = slow ? 'Playing slowly…' : 'Playing…';

  try {
    if (slow) {
      await speakFonoraSlow(phrase, rulesRef, { parts, engine: 'piper' });
    } else {
      await speakFonoraPhrase(phrase, rulesRef, { engine: 'piper' });
    }
    if (generation !== playGeneration) return;
    if (status) {
      status.textContent = slow ? 'Tap turtle to replay slowly' : 'Tap to listen again';
    }
  } catch (err) {
    if (generation !== playGeneration) return;
    if (status) status.textContent = String(err?.message || err);
  } finally {
    if (generation === playGeneration) setPlayControlsPlaying(false);
  }
}

function resetPlayHint() {
  const status = document.getElementById('fonoran-grammar-play-status');
  if (status) status.textContent = 'Tap to listen';
}

function renderTip(exercise) {
  const tipEl = document.getElementById('fonoran-grammar-tip');
  if (!tipEl) return;
  const tip = exercise?.tip?.trim();
  tipEl.hidden = !tip;
  tipEl.textContent = tip || '';
}

function activeDirection(exercise) {
  if (grammarPhraseForcesFonoran(exercise)) return 'to-fonoran';
  return direction;
}

function setAnswerMode(mcq) {
  const typing = document.getElementById('fonoran-grammar-typing');
  const choices = document.getElementById('fonoran-grammar-choices');
  const mcqActions = document.getElementById('fonoran-grammar-mcq-actions');
  if (typing) typing.hidden = mcq;
  if (choices) choices.hidden = !mcq;
  if (mcqActions) mcqActions.hidden = !mcq;
}

function renderMcqChoices(exercise) {
  const container = document.getElementById('fonoran-grammar-choices');
  if (!container) return;
  currentChoices = [...(exercise.choices ?? [])];
  // Keep correct answer position slightly shuffled for variety.
  for (let i = currentChoices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentChoices[i], currentChoices[j]] = [currentChoices[j], currentChoices[i]];
  }
  container.innerHTML = currentChoices
    .map((choice, index) => learnChoiceHtml(choice, index))
    .join('');
  session?.setContinueVisible('fonoran-grammar-mcq-next', false);
}

function renderExercise() {
  const exercise = exercises[currentIndex];
  const promptEl = document.getElementById('fonoran-grammar-prompt');
  const labelEl = document.getElementById('fonoran-grammar-answer-label');
  const input = document.getElementById('fonoran-grammar-answer');
  const checkBtn = document.getElementById('fonoran-grammar-check');
  if (!exercise || !promptEl) return;

  playGeneration += 1;
  cancelSpeech();
  setPlayControlsPlaying(false);

  const mcq = isMcqExercise(exercise);
  setAnswerMode(mcq);
  resetAnswerState();
  setLearnVerdict('fonoran-grammar-verdict', null);
  renderTip(exercise);

  const dir = activeDirection(exercise);
  if (mcq) {
    promptEl.textContent = exercise.promptLang;
    renderMcqChoices(exercise);
    session?.setContinueVisible('fonoran-grammar-next', false);
  } else {
    if (!input || !labelEl) return;
    const { prompt, label } = grammarPhrasePrompt(exercise, dir);
    promptEl.textContent = prompt;
    labelEl.textContent = dir === 'to-lang' ? learningPrompt(label) : label;
    input.value = '';
    input.disabled = false;
    session?.setContinueVisible('fonoran-grammar-next', false);
    session?.setContinueVisible('fonoran-grammar-mcq-next', false);
    if (checkBtn) checkBtn.hidden = false;
    input.focus();
  }

  resetPlayHint();
}

function checkTypedAnswer() {
  if (checked || session?.isComplete) return;
  const exercise = exercises[currentIndex];
  if (isMcqExercise(exercise)) return;
  const input = document.getElementById('fonoran-grammar-answer');
  const feedback = document.getElementById('fonoran-grammar-feedback');
  if (!exercise || !input || !session) return;

  const dir = activeDirection(exercise);
  const correct = grammarPhraseExerciseMatches(exercise, dir, input.value);
  checked = true;
  input.disabled = true;

  curriculum?.recordResult(exercise, correct);
  setLearnVerdict('fonoran-grammar-verdict', correct);

  if (feedback) {
    if (correct) {
      feedback.textContent = exercise.tip ? `Nice. ${exercise.tip}` : 'Nice.';
    } else {
      const expected = dir === 'to-lang' ? exercise.answerLang : exercise.answerRoman;
      feedback.textContent = `Answer: ${expected}${exercise.tip ? ` — ${exercise.tip}` : ''}`;
    }
    feedback.classList.add('is-visible');
  }

  finishTypingAnswer(session, {
    checkButtonId: 'fonoran-grammar-check',
    continueButtonId: 'fonoran-grammar-next',
    correct,
    beforeAdvance: resetAnswerState,
  });
}

function onMcqChoice(index) {
  if (checked || session?.isComplete) return;
  const exercise = exercises[currentIndex];
  if (!isMcqExercise(exercise) || !session) return;

  const choice = currentChoices[index];
  const correct = grammarPhraseExerciseMatches(exercise, 'to-fonoran', choice);
  checked = true;

  curriculum?.recordResult(exercise, correct);
  markChoiceStates(
    '#fonoran-grammar-choices .learn-choice',
    currentChoices,
    exercise.answerRoman,
    index,
  );

  const feedback = document.getElementById('fonoran-grammar-feedback');
  if (feedback) {
    feedback.textContent = correct
      ? (exercise.tip ? `Nice. ${exercise.tip}` : 'Nice.')
      : `Answer: ${exercise.answerRoman}${exercise.tip ? ` — ${exercise.tip}` : ''}`;
    feedback.classList.add('is-visible');
  }

  finishMcqAnswer(session, {
    continueButtonId: 'fonoran-grammar-mcq-next',
    correct,
    beforeAdvance: resetAnswerState,
  });
}

function nextExercise() {
  if (!exercises.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % exercises.length;
  renderExercise();
}

export async function setupFonoranGrammar(rules) {
  rulesRef = rules ?? null;
  session = createLearnSession('fonoran-grammar', {
    panelId: 'tab-fonoran-grammar',
    answerType: 'typing',
    lessonLabel: () => {
      const label = curriculum?.lessonLabel() ?? '';
      const lessonIndex = Number(String(label).split('/')[0]) || 1;
      if (lessonIndex <= 1 && !label.startsWith('Review')) return 'Basics · 1';
      return label ? `Practice · ${label}` : '';
    },
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
  session.bindContinue('fonoran-grammar-mcq-next', () => {
    resetAnswerState();
  });

  try {
    const pool = await loadExercisePool();
    curriculum = createCurriculum('fonoran-grammar', pool.exercises, {
      keyOf: (item) => item.id ?? item.spelling ?? item.answerRoman ?? '',
    });
    exercises = curriculum.currentLessonEntries();
  } catch {
    curriculum = null;
    exercises = [];
  }

  const status = document.getElementById('fonoran-grammar-status');
  if (status) {
    status.hidden = exercises.length > 0;
    status.textContent = exercises.length ? '' : 'Grammar lessons could not be loaded.';
  }

  document.querySelectorAll('[name="fonoran-grammar-direction"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      direction = radio.value === 'to-lang' ? 'to-lang' : 'to-fonoran';
      renderExercise();
    });
  });

  document.getElementById('fonoran-grammar-check')?.addEventListener('click', checkTypedAnswer);
  const grammarInput = document.getElementById('fonoran-grammar-answer');
  grammarInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkTypedAnswer();
  });

  document.getElementById('fonoran-grammar-choices')?.addEventListener('click', (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest?.('[data-choice-index]');
    if (!btn) return;
    onMcqChoice(Number(btn.dataset.choiceIndex));
  });

  document.getElementById('fonoran-grammar-play')?.addEventListener('click', () => {
    void playCurrentPhrase();
  });
  document.getElementById('fonoran-grammar-play-slow')?.addEventListener('click', () => {
    void playCurrentPhrase({ slow: true });
  });

  currentIndex = 0;
  renderExercise();
}

export function onFonoranGrammarTabActivated() {
  if (exercises.length && !session?.isComplete) renderExercise();
}
