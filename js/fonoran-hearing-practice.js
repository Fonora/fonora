/**
 * Fonoran hearing practice: listen to a Fonoran word, pick the meaning.
 */
import {
  loadFonoranPracticeEntries,
  meaningChoicesForEntry,
  shuffleEntries,
} from './fonoran-practice-words.js';
import { speakFonoraPhrase, speakFonoraSlow, cancelSpeech } from './fonora-tts.js';
import {
  createLearnSession,
  learnChoiceHtml,
  markChoiceStates,
} from './learn-session-ui.js';

/** @type {import('./fonoran-practice-words.js').PracticeEntry[]} */
let entries = [];
let currentIndex = 0;
/** @type {string[]} */
let currentChoices = [];
let answered = false;
/** @type {object | null} */
let rulesRef = null;

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
  const feedback = document.getElementById('fonoran-hearing-feedback');
  if (!entry || !container) return;

  currentChoices = meaningChoicesForEntry(entry, entries);
  answered = false;
  feedback.textContent = '';
  feedback.className = 'learn-exercise__feedback quiz-feedback';
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
        engine: 'auto',
      });
    } else {
      await speakFonoraPhrase(entry.script, rulesRef, { engine: 'auto' });
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
  const feedback = document.getElementById('fonoran-hearing-feedback');
  if (!entry || !feedback) return;

  const choice = currentChoices[index];
  const correct = choice === entry.meaning;
  answered = true;

  feedback.className = correct
    ? 'learn-exercise__feedback quiz-feedback quiz-feedback--ok'
    : 'learn-exercise__feedback quiz-feedback quiz-feedback--miss';
  feedback.textContent = correct ? 'Correct!' : `Expected: ${entry.meaning}`;

  markChoiceStates('.learn-choice', currentChoices, entry.meaning, index);
  session?.afterAnswer('fonoran-hearing-next', { correct, autoAdvanceMs: 800 });
}

/**
 * @param {object} rules
 */
export async function setupFonoranHearing(rules) {
  rulesRef = rules;

  session = createLearnSession('fonoran-hearing', {
    panelId: 'tab-fonoran-hearing',
    answerType: 'mcq',
    onQuestionStart: () => {
      if (entries.length) nextQuestion();
    },
    onSessionReset: () => {
      currentIndex = 0;
      renderChoices();
      void playCurrentWord();
    },
  });
  session.bindContinue('fonoran-hearing-next', () => {
    answered = false;
  });

  try {
    entries = shuffleEntries(await loadFonoranPracticeEntries(rules, { coreOnly: true }));
  } catch {
    entries = [];
  }

  const status = document.getElementById('fonoran-hearing-status');
  if (status) {
    status.hidden = entries.length > 0;
    status.textContent = entries.length
      ? ''
      : 'No practice words loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.';
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
