/**
 * Puzzle Conversation on /learn#puzzle.
 */

import { createPuzzlePage } from '../language/pages/puzzle-page.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { speakFonoraPhrase, cancelSpeech } from './fonora-tts.js';
import { getPiperVoiceForLang } from './piper-audio.js';
import { escapeHtml } from './utils.js';

const puzzleState = {
  challenge: null,
  coreOnly: false,
  difficultyMode: 'normal',
  repairTurns: 0,
  revealed: false,
  busy: false,
  recorded: false,
  lastRoundId: null,
  feedbackSent: false,
  feedbackTags: [],
  feedbackNote: '',
  session: { played: 0, recovered: 0 },
  summary: null,
  missedMode: false,
  missedIndex: null,
};

/** @type {(() => object | null) | null} */
let getRulesRef = null;

/** @type {(() => void) | null} */
let renderPuzzleRef = null;

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Sign in required');
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function ensureRules() {
  const rules = getRulesRef?.();
  if (!rules) throw new Error('Language rules not loaded');
}

async function speakNeural(parts) {
  const rules = getRulesRef?.();
  const list = Array.isArray(parts) ? parts : [parts];
  if (!rules || !list.length) return;
  const { phrase } = romanToFonoraScript(list, rules);
  if (!phrase) return;
  cancelSpeech();
  await speakFonoraPhrase(phrase, rules, {
    engine: 'piper',
    piperVoice: getPiperVoiceForLang('en'),
  });
}

/**
 * @param {() => object | null} getRules
 */
export function setupPuzzleLearn(getRules) {
  getRulesRef = getRules;
  const { renderPuzzle } = createPuzzlePage({
    getState: () => ({
      rules: getRulesRef?.() ?? null,
      puzzle: puzzleState,
      ready: true,
    }),
    api,
    $: (id) => document.getElementById(id),
    escapeHtml,
    toast,
    ensureRules,
    romanToFonoraScript,
    speakNeural,
  });
  renderPuzzleRef = renderPuzzle;
}

export function onPuzzleTabActivated() {
  renderPuzzleRef?.();
}
