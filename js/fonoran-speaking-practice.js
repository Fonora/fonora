/**
 * Fonoran speaking practice: English prompt → type/speak Fonoran response.
 *
 * Uses the phrase-based domain curriculum when available. Typed roman input is
 * validated against cached translations; TTS playback lets learners hear the target
 * phrase after checking (microphone recognition is planned for a future release).
 */
import { loadCourseEntries, spellingMatchesCourseEntry } from './fonoran-course-phrases.js';
import { createDomainCurriculum } from './fonoran-learn-curriculum.js';
import { speakFonoraPhrase, cancelSpeech } from './fonora-tts.js';
import {
  createLearnSession,
  finishTypingAnswer,
  setLearnVerdict,
} from './learn-session-ui.js';

/** @type {import('./fonoran-course-phrases.js').CourseEntry[]} */
let entries = [];
/** @type {ReturnType<typeof createDomainCurriculum> | null} */
let curriculum = null;
let currentIndex = 0;
/** @type {object | null} */
let rulesRef = null;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;
let checked = false;

function resetAnswerState() {
  checked = false;
}

function renderPrompt() {
  const entry = entries[currentIndex];
  const meaningEl = document.getElementById('fonoran-speaking-meaning');
  const input = document.getElementById('fonoran-speaking-answer');
  const checkBtn = document.getElementById('fonoran-speaking-check');
  const playBtn = document.getElementById('fonoran-speaking-play-answer');
  if (!entry || !meaningEl || !input) return;

  meaningEl.textContent = entry.meaning;
  input.value = '';
  resetAnswerState();
  setLearnVerdict('fonoran-speaking-verdict', null);
  session?.setContinueVisible('fonoran-speaking-next', false);
  if (checkBtn) checkBtn.hidden = false;
  if (playBtn) playBtn.hidden = true;
  input.disabled = false;
  input.focus();
}

function checkAnswer() {
  if (checked || session?.isComplete) return;
  const entry = entries[currentIndex];
  const input = document.getElementById('fonoran-speaking-answer');
  if (!entry || !input || !session) return;

  const correct = spellingMatchesCourseEntry(input.value, entry);
  checked = true;
  input.disabled = true;

  curriculum?.recordResult(entry, correct);
  setLearnVerdict('fonoran-speaking-verdict', correct);
  finishTypingAnswer(session, {
    checkButtonId: 'fonoran-speaking-check',
    continueButtonId: 'fonoran-speaking-next',
    correct,
    beforeAdvance: resetAnswerState,
  });

  const playBtn = document.getElementById('fonoran-speaking-play-answer');
  if (playBtn) playBtn.hidden = !entry.spelling;
}

async function playAnswer() {
  const entry = entries[currentIndex];
  if (!entry?.spelling || !rulesRef) return;
  cancelSpeech();
  await speakFonoraPhrase(entry.spelling, rulesRef, { parts: entry.parts });
}

function nextExercise() {
  if (!entries.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % entries.length;
  renderPrompt();
}

export async function setupFonoranSpeaking(rules) {
  rulesRef = rules;

  session = createLearnSession('fonoran-speaking', {
    panelId: 'tab-fonoran-speaking',
    answerType: 'typing',
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      if (entries.length) nextExercise();
    },
    onSessionReset: () => {
      entries = curriculum?.currentLessonEntries() ?? entries;
      currentIndex = 0;
      renderPrompt();
    },
  });
  session.bindContinue('fonoran-speaking-next', () => {
    resetAnswerState();
  });

  try {
    const courseData = await loadCourseEntries(rules);
    if (courseData) {
      curriculum = createDomainCurriculum('fonoran-speaking', courseData.entries, courseData.domains);
      entries = curriculum.currentLessonEntries();
    } else {
      curriculum = null;
      entries = [];
    }
  } catch {
    curriculum = null;
    entries = [];
  }

  const status = document.getElementById('fonoran-speaking-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice content loaded. Run npm run fonoran:course-phrases:build after warming the translation cache.';
  }

  document.getElementById('fonoran-speaking-check')?.addEventListener('click', checkAnswer);
  document.getElementById('fonoran-speaking-play-answer')?.addEventListener('click', () => {
    void playAnswer();
  });
  const input = document.getElementById('fonoran-speaking-answer');
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkAnswer();
  });

  currentIndex = 0;
  renderPrompt();
}

export function onFonoranSpeakingTabActivated() {
  if (entries.length && !session?.isComplete) renderPrompt();
}
