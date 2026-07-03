/**
 * Fonora Script writing: source-language word → type Fonora script.
 */
import { createTypingPractice } from './fonora-typing-practice.js';
import { runIpaPipeline } from './ipa-pipeline.js';
import { initEspeak } from './ipa.js';
import { loadLanguagePreference } from './learning-locale.js';
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
  feedback: 'script-writing-breakdown-feedback',
};

/** @type {ReturnType<typeof createTypingPractice> | null} */
let practice = null;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

/** @type {{ text: string, accept: string[] }[]} */
let wordBank = [];

async function loadWordBank() {
  if (wordBank.length) return wordBank;
  const res = await fetch('/data/fonora-script-practice-words.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  wordBank = data.words ?? [];
  return wordBank;
}

/**
 * @param {object} rules
 */
async function buildScriptWritingWords(rules) {
  await initEspeak();
  const bank = await loadWordBank();
  const lang = loadLanguagePreference();
  const words = [];

  for (const item of bank) {
    const result = await runIpaPipeline(item.text, rules, { lang, testMode: 'practice' });
    if (!result?.symbols || result.symbols.includes('?')) continue;
    words.push({
      spelling: item.text,
      meaning: '',
      expected: result.symbols,
    });
  }

  return words;
}

/**
 * @param {object} rules
 */
export async function setupScriptWriting(rules) {
  const feedbackEl = document.getElementById(IDS.feedback);

  session = createLearnSession('script-writing', {
    panelId: 'tab-script-writing',
    answerType: 'typing',
    onQuestionStart: () => {
      practice?.advanceWord();
    },
    onSessionReset: () => {
      practice?.restartWords();
    },
  });
  practice?.destroy();
  setupLearningLanguageSelect('script-writing-language', () => {
    updateLearningLanguageNote('script-writing-language-note');
    void practice?.setup();
  });
  updateLearningLanguageNote('script-writing-language-note');

  practice = createTypingPractice({
    rules,
    ids: IDS,
    tabId: 'script-writing',
    loadWords: () => buildScriptWritingWords(rules),
    emptyMessage: 'No script writing words loaded. Check /data/fonora-script-practice-words.json.',
    getSession: () => session,
    continueButtonId: 'script-writing-continue',
    promptActionButton: true,
    onAnswer: (match, word) => {
      if (match) {
        hideBreakdownFeedback(feedbackEl);
        return;
      }
      void showBreakdownFeedback(feedbackEl, word.spelling, rules);
    },
  });
  await practice.setup();
}

export function refreshScriptWriting(rules) {
  practice?.refresh(rules);
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
