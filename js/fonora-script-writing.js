/**
 * Fonora Script writing: English prompt → type Fonora script.
 * Uses hybrid curriculum (full ring vocabulary, then domain phrases).
 */
import { createTypingPractice } from './fonora-typing-practice.js';
import { loadDomainCurriculum } from './fonoran-course-phrases.js';
import { createHybridCurriculum } from './fonoran-learn-curriculum.js';
import { loadFonoranPracticeEntries } from './fonoran-practice-words.js';
import {
  setupLearningLanguageSelect,
  ensureLearningLanguageSelect,
  updateLearningLanguageNote,
} from './learning-language-select.js';
import { showBreakdownFeedback, hideBreakdownFeedback } from './breakdown-feedback.js';
import { createLearnSession } from './learn-session-ui.js';

const IDS = {
  status: 'script-writing-status',
  verdict: 'script-writing-verdict',
  promptWord: 'script-writing-prompt-word',
  compare: 'script-writing-answer-compare',
  userGlyphs: 'script-writing-user-glyphs',
  expectedGlyphs: 'script-writing-expected-glyphs',
  input: 'script-writing-input',
  keyboard: 'script-writing-keyboard',
  popup: 'script-writing-vowel-popup',
  dock: 'script-writing-keyboard-dock',
  feedback: 'script-writing-breakdown-feedback',
};

/** @type {ReturnType<typeof createTypingPractice> | null} */
let practice = null;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

/** @type {ReturnType<typeof createHybridCurriculum> | null} */
let curriculum = null;

/** @type {object | null} */
let rulesRef = null;

/**
 * @param {import('./fonoran-course-phrases.js').CourseEntry} entry
 */
function entryToPracticeWord(entry) {
  return {
    spelling: entry.meaning,
    meaning: entry.itemType === 'phrase' ? entry.spelling : '',
    expected: entry.script,
    entry,
  };
}

/**
 * @param {object} rules
 */
async function loadLessonWords(rules) {
  if (!curriculum) {
    const [labEntries, courseData] = await Promise.all([
      loadFonoranPracticeEntries(rules).catch(() => []),
      loadDomainCurriculum(rules).catch(() => null),
    ]);
    if (!courseData?.phraseItems?.length && !labEntries.length) return [];
    curriculum = createHybridCurriculum(
      'script-writing',
      labEntries,
      courseData?.phraseItems ?? [],
      courseData?.domains ?? [],
    );
  }
  return curriculum
    .currentLessonEntries()
    .filter((entry) => entry.script)
    .map(entryToPracticeWord);
}

/**
 * @param {object} rules
 */
export async function setupScriptWriting(rules) {
  rulesRef = rules;
  curriculum = null;

  session = createLearnSession('script-writing', {
    panelId: 'tab-script-writing',
    answerType: 'typing',
    lessonLabel: () => curriculum?.lessonLabel() ?? '',
    onComplete: (stats) => curriculum?.complete(stats) ?? {},
    onQuestionStart: () => {
      practice?.advanceWord();
    },
    onSessionReset: () => {
      void practice?.reloadLesson();
    },
  });
  session.bindContinue('script-writing-continue', () => {});
  practice?.destroy();
  setupLearningLanguageSelect('script-writing-language', () => {
    updateLearningLanguageNote('script-writing-language-note');
    curriculum = null;
    void practice?.reloadLesson();
  });
  updateLearningLanguageNote('script-writing-language-note');

  const feedbackEl = document.getElementById(IDS.feedback);

  practice = createTypingPractice({
    rules,
    ids: IDS,
    tabId: 'script-writing',
    loadWords: () => loadLessonWords(rules),
    emptyMessage: 'No script writing content loaded. Build course phrases with npm run fonoran:course-phrases:build.',
    getSession: () => session,
    continueButtonId: 'script-writing-continue',
    keyboardCheckOnly: true,
    hear: {
      panelId: 'tab-script-writing',
      rules,
      getSpeakText: (word) => word.expected,
    },
    onAnswer: (match, word) => {
      if (match) {
        hideBreakdownFeedback(feedbackEl);
        return;
      }
      const roman = word.entry?.spelling || word.spelling;
    void showBreakdownFeedback(feedbackEl, roman, rules, {
      parts: word.entry?.parts,
      script: word.entry?.script ?? word.expected,
    });
    },
  });
  await practice.setup();
}

export function refreshScriptWriting(rules) {
  rulesRef = rules;
  curriculum = null;
  practice?.refresh(rules);
  void practice?.reloadLesson();
}

export function onScriptWritingTabActivated() {
  ensureLearningLanguageSelect('script-writing-language');
  updateLearningLanguageNote('script-writing-language-note');

  if (!practice || practice.wordCount === 0) {
    void practice?.setup();
    return;
  }
  practice.onTabActivated();
}
