/**
 * Fonoran hearing practice: listen to a Fonoran phrase, pick the meaning.
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
import { speakFonoraPhrase, speakFonoraSlow, cancelSpeech } from './fonora-tts.js';
import {
  createLearnSession,
  finishMcqAnswer,
  learnChoiceHtml,
  markChoiceStates,
} from './learn-session-ui.js';

/** @type {Array<import('./fonoran-practice-words.js').PracticeEntry | import('./fonoran-course-phrases.js').CourseEntry>} */
let entries = [];
/** @type {Array<import('./fonoran-practice-words.js').PracticeEntry | import('./fonoran-course-phrases.js').CourseEntry>} */
let pool = [];
/** @type {ReturnType<typeof createCurriculum> | null} */
let curriculum = null;
let currentIndex = 0;
/** @type {string[]} */
let currentChoices = [];
let answered = false;
/** @type {object | null} */
let rulesRef = null;
/** @type {boolean} */
let usingPhrases = false;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

/** Bumps when a new play starts so stale async playback can bail out. */
let playGeneration = 0;

function setPlayControlsPlaying(playing) {
  document.getElementById('fonoran-hearing-play')?.toggleAttribute('disabled', playing);
  document.getElementById('fonoran-hearing-play-slow')?.toggleAttribute('disabled', playing);
  document.getElementById('fonoran-hearing-play')?.classList.toggle('learn-play-btn--playing', playing);
  document.getElementById('fonoran-hearing-play-slow')?.classList.toggle('learn-play-btn--playing', playing);
}

function renderChoices() {
  const entry = entries[currentIndex];
  const container = document.getElementById('fonoran-hearing-choices');
  if (!entry || !container) return;

  const isPhrase = entry?.itemType === 'phrase' || entry?.domainId != null;
  currentChoices = isPhrase
    ? meaningChoicesForCourseEntry(/** @type {any} */ (entry), /** @type {any[]} */ (pool.length ? pool : entries))
    : meaningChoicesForEntry(/** @type {any} */ (entry), pool.length ? pool : entries);
  answered = false;
  session?.setContinueVisible('fonoran-hearing-next', false);

  container.innerHTML = currentChoices
    .map((choice, index) => learnChoiceHtml(choice, index))
    .join('');
}

/**
 * @param {{ slow?: boolean }} [opts]
 */
async function playCurrentWord(opts = {}) {
  const { slow = false } = opts;
  const entry = entries[currentIndex];
  const status = document.getElementById('fonoran-hearing-play-status');
  if (!entry || !rulesRef) return;

  const generation = ++playGeneration;
  cancelSpeech();
  setPlayControlsPlaying(true);
  if (status) status.textContent = slow ? 'Playing slowly…' : 'Playing…';

  try {
    if (slow) {
      await speakFonoraSlow(entry.script, rulesRef, {
        parts: entry.parts,
        engine: 'piper',
      });
    } else {
      await speakFonoraPhrase(entry.script, rulesRef, { engine: 'piper' });
    }
    if (generation !== playGeneration) return;
    if (status) {
      status.textContent = slow ? 'Tap turtle to replay slowly' : 'Tap to listen again';
    }
  } catch (err) {
    if (generation !== playGeneration) return;
    if (status) status.textContent = String(err?.message || err);
  } finally {
    if (generation === playGeneration) {
      setPlayControlsPlaying(false);
    }
  }
}

function nextQuestion() {
  if (!entries.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % entries.length;
  renderChoices();
  const status = document.getElementById('fonoran-hearing-play-status');
  if (status) status.textContent = 'Get ready…';
  window.setTimeout(() => {
    if (!session?.isComplete) void playCurrentWord();
  }, 500);
}

function onChoice(index) {
  if (answered || session?.isComplete) return;
  const entry = entries[currentIndex];
  if (!entry) return;

  const choice = currentChoices[index];
  const correct = choice === entry.meaning;
  answered = true;

  curriculum?.recordResult(entry, correct);
  markChoiceStates('#fonoran-hearing-choices .learn-choice', currentChoices, entry.meaning, index);
  if (session) {
    finishMcqAnswer(session, {
      continueButtonId: 'fonoran-hearing-next',
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
export async function setupFonoranHearing(rules) {
  rulesRef = rules;

  session = createLearnSession('fonoran-hearing', {
    panelId: 'tab-fonoran-hearing',
    answerType: 'mcq',
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      if (entries.length) nextQuestion();
    },
    onSessionReset: () => {
      entries = curriculum?.currentLessonEntries() ?? entries;
      currentIndex = 0;
      renderChoices();
      void playCurrentWord();
    },
  });
  session.bindContinue('fonoran-hearing-next', () => {
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
        'fonoran-hearing',
        labEntries,
        courseData.phraseItems,
        courseData.domains,
      );
    } else {
      usingPhrases = false;
      curriculum = createCurriculum('fonoran-hearing', labEntries);
    }
    pool = curriculum.ordered;
    entries = curriculum.currentLessonEntries();
  } catch {
    curriculum = null;
    pool = [];
    entries = [];
    usingPhrases = false;
  }

  const status = document.getElementById('fonoran-hearing-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice content loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.';
  }

  document.getElementById('fonoran-hearing-play')?.addEventListener('click', () => {
    void playCurrentWord();
  });
  const slowPlayBtn = document.getElementById('fonoran-hearing-play-slow');
  slowPlayBtn?.addEventListener('click', () => {
    void playCurrentWord({ slow: true });
  });
  document.getElementById('fonoran-hearing-choices')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-choice-index]');
    if (!btn) return;
    onChoice(Number(btn.dataset.choiceIndex));
  });

  currentIndex = 0;
  renderChoices();
}

export function onFonoranHearingTabActivated() {
  if (entries.length && !session?.isComplete) {
    renderChoices();
    void playCurrentWord();
  }
}
