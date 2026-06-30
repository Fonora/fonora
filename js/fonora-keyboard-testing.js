/**
 * Keyboard testing: type roman phoneme prompts in Fonora script using the practice keyboard.
 */
import { createTypingPractice } from './fonora-typing-practice.js';
import { buildKeyboardTestWordList } from './keyboard-test-words.js';

const KEYBOARD_TESTING_IDS = {
  status: 'keyboard-testing-status',
  verdict: 'keyboard-testing-verdict',
  promptWord: 'keyboard-testing-prompt-word',
  promptMeaning: 'keyboard-testing-prompt-meaning',
  compare: 'keyboard-testing-answer-compare',
  userGlyphs: 'keyboard-testing-user-glyphs',
  expectedGlyphs: 'keyboard-testing-expected-glyphs',
  input: 'keyboard-testing-input',
  keyboard: 'keyboard-testing-keyboard',
  popup: 'keyboard-testing-popup',
};

/** @type {ReturnType<typeof createTypingPractice> | null} */
let keyboardTesting = null;

/**
 * @param {object} rules
 */
export async function setupKeyboardTesting(rules) {
  keyboardTesting?.destroy();
  keyboardTesting = createTypingPractice({
    rules,
    ids: KEYBOARD_TESTING_IDS,
    tabId: 'keyboard',
    loadWords: buildKeyboardTestWordList,
    emptyMessage: 'No keyboard test words could be encoded with the current language rules.',
  });
  await keyboardTesting.setup();
}

export function refreshKeyboardTesting(rules) {
  keyboardTesting?.refresh(rules);
}

export function onKeyboardTestingTabActivated() {
  keyboardTesting?.onTabActivated();
}
