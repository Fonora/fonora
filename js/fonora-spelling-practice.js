/**
 * Fonoran spelling practice: roman prompt → type Fonora script with keyboard → check.
 */
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { createTypingPractice } from './fonora-typing-practice.js';

/** @typedef {{ spelling: string, meaning: string, parts: string[], expected: string }} PracticeWord */

const SPELLING_IDS = {
  status: 'spelling-practice-status',
  verdict: 'spelling-verdict',
  promptWord: 'spelling-prompt-word',
  promptMeaning: 'spelling-prompt-meaning',
  compare: 'spelling-answer-compare',
  userGlyphs: 'spelling-user-glyphs',
  expectedGlyphs: 'spelling-expected-glyphs',
  input: 'spelling-practice-input',
  keyboard: 'spelling-practice-keyboard',
  popup: 'spelling-vowel-popup',
};

/** @type {ReturnType<typeof createTypingPractice> | null} */
let spellingPractice = null;

/**
 * @param {object} lab
 * @param {object} rules
 * @returns {PracticeWord[]}
 */
export function buildPracticeWordList(lab, rules) {
  const words = [];

  for (const sound of lab?.sounds ?? []) {
    if (!sound.spelling || sound.state === 'rejected') continue;
    const { phrase, warnings } = romanToFonoraScript([sound.spelling], rules);
    if (!phrase || warnings?.length) continue;
    words.push({
      spelling: sound.spelling,
      meaning: sound.gloss || sound.meaning || '',
      parts: [sound.spelling],
      expected: phrase,
    });
  }

  for (const compound of lab?.compounds ?? []) {
    if (!compound.spelling) continue;
    const parts = compound.parts?.length ? compound.parts : [compound.spelling];
    const { phrase, warnings } = romanToFonoraScript(parts, rules);
    if (!phrase || warnings?.length) continue;
    words.push({
      spelling: compound.spelling,
      meaning: compound.gloss || compound.meaning || compound.composition_readable || '',
      parts,
      expected: phrase,
    });
  }

  for (let i = words.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  return words;
}

async function loadPracticeWords(rules) {
  try {
    const res = await fetch('/api/fonoran/bootstrap');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return buildPracticeWordList(data.lab, rules);
  } catch {
    return [];
  }
}

/**
 * @param {object} rules
 */
export async function setupSpellingPractice(rules) {
  spellingPractice?.destroy();
  spellingPractice = createTypingPractice({
    rules,
    ids: SPELLING_IDS,
    tabId: 'spelling-practice',
    loadWords: loadPracticeWords,
    emptyMessage:
      'No practice words loaded. Run the dev server so /api/fonoran/bootstrap can supply the lab dictionary.',
  });
  await spellingPractice.setup();
}

export function refreshSpellingPractice(rules) {
  spellingPractice?.refresh(rules);
}

export function onSpellingPracticeTabActivated() {
  spellingPractice?.onTabActivated();
}
