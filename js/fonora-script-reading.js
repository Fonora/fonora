/**
 * Fonora Script reading — words: Fonora script → type source-language word.
 */
import { runIpaPipeline } from './ipa-pipeline.js';
import { initEspeak } from './ipa.js';
import { loadLanguagePreference, learningPrompt } from './learning-locale.js';
import {
  setupLearningLanguageSelect,
  ensureLearningLanguageSelect,
  updateLearningLanguageNote,
} from './learning-language-select.js';
import { showBreakdownFeedback, hideBreakdownFeedback } from './breakdown-feedback.js';
import { createLearnSession, setLearnVerdict } from './learn-session-ui.js';
import { escapeHtml } from './utils.js';

/** @typedef {{ text: string, accept: string[], symbols: string }} ScriptReadingWord */

/** @type {ScriptReadingWord[]} */
let readingWords = [];
let currentIndex = 0;
let wired = false;
/** @type {object | null} */
let rulesRef = null;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;
let checked = false;

async function loadWordBank() {
  const res = await fetch('/data/fonora-script-practice-words.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.words ?? [];
}

function normalizeAnswer(text) {
  return String(text ?? '').trim().toLowerCase();
}

function showWordPrompt() {
  const word = readingWords[currentIndex];
  const prompt = document.getElementById('script-reading-word-prompt');
  const input = document.getElementById('script-reading-word-answer');
  const feedback = document.getElementById('script-reading-word-feedback');
  const breakdown = document.getElementById('script-reading-word-breakdown');
  if (!word || !prompt || !input) return;

  prompt.innerHTML = `<span class="symbol-text learn-exercise__prompt-glyphs">${escapeHtml(word.symbols)}</span>`;
  input.value = '';
  checked = false;
  input.disabled = false;
  setLearnVerdict('script-reading-word-verdict', null);
  session?.setContinueVisible('script-reading-word-next', false);
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'learn-exercise__feedback quiz-feedback';
  }
  hideBreakdownFeedback(breakdown);
  input.focus();
}

function nextWord() {
  if (!readingWords.length || session?.isComplete) return;
  currentIndex = (currentIndex + 1) % readingWords.length;
  showWordPrompt();
}

function checkWordAnswer() {
  if (checked || session?.isComplete) return;
  const word = readingWords[currentIndex];
  const input = document.getElementById('script-reading-word-answer');
  const feedback = document.getElementById('script-reading-word-feedback');
  const breakdown = document.getElementById('script-reading-word-breakdown');
  if (!word || !input || !feedback || !rulesRef) return;

  const answer = normalizeAnswer(input.value);
  const accepted = (word.accept ?? [word.text]).map(normalizeAnswer);
  const correct = accepted.includes(answer);
  checked = true;
  input.disabled = true;

  setLearnVerdict('script-reading-word-verdict', correct);
  feedback.className = correct
    ? 'learn-exercise__feedback quiz-feedback quiz-feedback--ok'
    : 'learn-exercise__feedback quiz-feedback quiz-feedback--miss';
  feedback.textContent = correct ? '' : `Expected: ${word.accept?.[0] || word.text}`;

  if (correct) {
    hideBreakdownFeedback(breakdown);
  } else {
    void showBreakdownFeedback(breakdown, word.text, rulesRef);
  }

  session?.afterAnswer('script-reading-word-next', { correct });
}

async function reloadScriptReadingWords(rules) {
  await initEspeak();
  const bank = await loadWordBank();
  const lang = loadLanguagePreference();
  readingWords = [];

  for (const item of bank) {
    const result = await runIpaPipeline(item.text, rules, { lang, testMode: 'practice' });
    if (!result?.symbols || result.symbols.includes('?')) continue;
    readingWords.push({
      text: item.text,
      accept: item.accept ?? [item.text],
      symbols: result.symbols,
    });
  }

  const status = document.getElementById('script-reading-word-status');
  if (status) {
    status.hidden = readingWords.length > 0;
    status.textContent = readingWords.length
      ? ''
      : 'No reading words loaded. Check /data/fonora-script-practice-words.json.';
  }

  currentIndex = 0;
  showWordPrompt();
}

/**
 * @param {object} rules
 */
export async function setupScriptReadingWords(rules) {
  rulesRef = rules;

  session = createLearnSession('script-words', {
    panelId: 'tab-script-reading-words',
    answerType: 'typing',
    onQuestionStart: () => {
      if (readingWords.length) nextWord();
    },
    onSessionReset: () => {
      currentIndex = 0;
      showWordPrompt();
    },
  });
  session.bindContinue('script-reading-word-next', () => {
    checked = false;
  });

  const label = document.getElementById('script-reading-word-label');
  if (label) {
    label.textContent = learningPrompt('Your answer ({language} word)');
  }

  if (!wired) {
    wired = true;
    document.getElementById('script-reading-word-check')?.addEventListener('click', checkWordAnswer);
    document.getElementById('script-reading-word-answer')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') checkWordAnswer();
    });
    setupLearningLanguageSelect('script-reading-language', async () => {
      updateLearningLanguageNote('script-reading-language-note');
      if (rulesRef) await reloadScriptReadingWords(rulesRef);
    });
  }

  updateLearningLanguageNote('script-reading-language-note');
  await reloadScriptReadingWords(rules);
}

export function onScriptReadingTabActivated() {
  ensureLearningLanguageSelect('script-reading-language');
  updateLearningLanguageNote('script-reading-language-note');
  if (readingWords.length && !session?.isComplete) showWordPrompt();
  else if (rulesRef) void setupScriptReadingWords(rulesRef);
}
