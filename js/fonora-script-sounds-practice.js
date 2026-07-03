/**
 * Fonora Script symbol sounds quiz: decode + construct modes.
 */
import { getQuizEntries, buildKeyboardMap } from './rules.js';
import { findVowelForCell, isVowelQuizCell } from './vowel-display.js';
import { normalizeSymbolInput } from './decode.js';
import { showBreakdownFeedback, hideBreakdownFeedback } from './breakdown-feedback.js';
import {
  createLearnSession,
  finishTypingAnswer,
  setLearnVerdict,
} from './learn-session-ui.js';
import { escapeHtml, insertAtCursor } from './utils.js';

/** @type {object | null} */
let rulesRef = null;

/** @type {{ type: string, cell: object, answered: boolean } | null} */
let currentQuiz = null;

/** @type {ReturnType<typeof createLearnSession> | null} */
let session = null;

let wired = false;

const SCRIPT_SOUNDS_MODE_NAME = 'script-sounds-mode';

function getScriptSoundsMode() {
  return document.querySelector(`[name="${SCRIPT_SOUNDS_MODE_NAME}"]:checked`)?.value || 'decode';
}

function setupScriptSoundsModeToggle(onChange) {
  const container = document.getElementById('script-sounds-mode');
  if (!container) return;

  container.querySelectorAll(`input[type="radio"][name="${SCRIPT_SOUNDS_MODE_NAME}"]`).forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener('change', () => {
      if (!input.checked || session?.isComplete) return;
      onChange(input.value);
    });
  });
}

function buildSymbolLabelMap(r) {
  const map = {};
  for (const p of r.places) map[p.symbol] = p.label;
  for (const m of r.modifiers) map[m.symbol] = m.label;
  return map;
}

function getQuizHintLines(cell) {
  const labelMap = buildSymbolLabelMap(rulesRef);
  const symbols = cell.symbols || '';
  const vowelDef = findVowelForCell(rulesRef, cell);

  if (vowelDef || isVowelQuizCell(rulesRef, cell)) {
    const lines = [];
    for (const ch of symbols) {
      const label = labelMap[ch];
      if (label) lines.push({ symbol: ch, label });
    }
    if (vowelDef?.example) {
      lines.push({ symbol: symbols, label: `as in ${vowelDef.example}`, vowelNote: true });
    }
    const note = cell.notes || cell.explanation;
    if (note && note !== vowelDef?.lexicalSet) {
      lines.push({ symbol: symbols, label: note, vowelNote: true });
    }
    return lines.length ? lines : [{ symbol: symbols, label: 'Vowel' }];
  }

  const seen = new Set();
  const lines = [];

  for (const ch of symbols) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    const label = labelMap[ch];
    if (label) lines.push({ symbol: ch, label });
  }

  if (!lines.length && cell.explanation) {
    lines.push({ symbol: symbols, label: cell.explanation });
  }

  return lines;
}

function updateQuizHints() {
  const hintsEl = document.getElementById('quiz-hints');
  const showHints = document.getElementById('quiz-show-hints')?.checked ?? true;
  if (!hintsEl || !currentQuiz?.cell) return;

  const lines = getQuizHintLines(currentQuiz.cell);
  hintsEl.hidden = !showHints;
  hintsEl.innerHTML = showHints
    ? lines.length
      ? lines
          .map(
            (line) =>
              `<div class="quiz-hint"><span class="quiz-hint-symbol symbol-text">${escapeHtml(line.symbol)}</span><span class="quiz-hint-label">: ${escapeHtml(line.label)}</span></div>`,
          )
          .join('')
      : '<em class="quiz-hint-label">No component hints for this entry.</em>'
    : '';
}

function renderSymbolButtons(container, textarea) {
  if (!container || !textarea || !rulesRef) return;
  container.innerHTML = '';
  const allKeys = [
    ...rulesRef.places.map((p) => ({ symbol: p.symbol, label: p.label, type: 'place' })),
    ...rulesRef.modifiers.map((m) => ({ symbol: m.symbol, label: m.label, type: 'modifier' })),
  ];
  for (const item of allKeys) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `symbol-btn symbol-btn--${item.type}`;
    btn.title = item.label;
    btn.innerHTML = `<span class="symbol-text">${item.symbol}</span><span class="symbol-btn-label">${item.label}</span>`;
    btn.addEventListener('click', () => insertAtCursor(textarea, item.symbol));
    container.appendChild(btn);
  }
}

function attachKeyboardShortcuts(textarea) {
  const map = buildKeyboardMap(rulesRef);
  textarea.onkeydown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let symbol = null;
    if (e.key >= '1' && e.key <= '9') symbol = map.byNumber[e.key];
    else if (e.key.length === 1) symbol = map.byLetter[e.key.toLowerCase()];
    if (symbol) {
      e.preventDefault();
      insertAtCursor(textarea, symbol);
    }
  };
}

function pickRandomQuizCell() {
  const cells = getQuizEntries(rulesRef);
  return cells[Math.floor(Math.random() * cells.length)];
}

function startQuiz(type) {
  if (session?.isComplete) return;
  currentQuiz = { type, cell: pickRandomQuizCell(), answered: false };
  setLearnVerdict('quiz-verdict', null);
  session?.setContinueVisible('quiz-next', false);
  const checkBtn = document.getElementById('quiz-check');
  if (checkBtn) checkBtn.hidden = false;

  hideBreakdownFeedback(document.getElementById('quiz-symbol-breakdown'));
  document.getElementById('quiz-answer-decode').value = '';
  document.getElementById('quiz-answer-construct').value = '';

  const decodeAnswer = document.getElementById('quiz-decode-answer');
  const constructAnswer = document.getElementById('quiz-construct-answer');
  const vowelBadge = isVowelQuizCell(rulesRef, currentQuiz.cell)
    ? ' <span class="draft-badge">Vowel</span>'
    : '';

  if (type === 'decode') {
    document.getElementById('quiz-prompt').innerHTML =
      `<span class="symbol-text">${escapeHtml(currentQuiz.cell.symbols)}</span>${vowelBadge}`;
    decodeAnswer.hidden = false;
    constructAnswer.hidden = true;
    document.getElementById('quiz-answer-decode')?.focus();
  } else {
    document.getElementById('quiz-prompt').innerHTML =
      `${escapeHtml(currentQuiz.cell.sound)}${vowelBadge}`;
    decodeAnswer.hidden = true;
    constructAnswer.hidden = false;
  }
  updateQuizHints();
}

function checkQuizAnswer() {
  if (!currentQuiz || currentQuiz.answered || session?.isComplete) return;

  let correct = false;
  if (currentQuiz.type === 'decode') {
    correct = document.getElementById('quiz-answer-decode').value.trim() === currentQuiz.cell.sound;
  } else {
    correct =
      normalizeSymbolInput(document.getElementById('quiz-answer-construct').value, rulesRef) ===
      currentQuiz.cell.symbols;
  }

  currentQuiz.answered = true;
  setLearnVerdict('quiz-verdict', correct);

  const breakdownEl = document.getElementById('quiz-symbol-breakdown');
  if (correct) {
    hideBreakdownFeedback(breakdownEl);
  } else if (breakdownEl && currentQuiz.cell) {
    void showBreakdownFeedback(breakdownEl, currentQuiz.cell.sound, rulesRef, { cell: currentQuiz.cell });
  } else {
    hideBreakdownFeedback(breakdownEl);
  }

  if (session) {
    finishTypingAnswer(session, {
      checkButtonId: 'quiz-check',
      continueButtonId: 'quiz-next',
      correct,
      beforeAdvance: () => {
        currentQuiz = null;
      },
    });
  }
}

/**
 * @param {object} rules
 */
export function setupScriptSounds(rules) {
  rulesRef = rules;

  session = createLearnSession('script-sounds', {
    panelId: 'tab-quiz',
    answerType: 'typing',
    onQuestionStart: () => {
      startQuiz(getScriptSoundsMode());
    },
    onSessionReset: () => {
      startQuiz(getScriptSoundsMode());
    },
  });
  session.bindContinue('quiz-next', () => {
    currentQuiz = null;
  });

  setupScriptSoundsModeToggle((mode) => startQuiz(mode));

  if (!wired) {
    wired = true;
    const constructInput = document.getElementById('quiz-answer-construct');
    const decodeInput = document.getElementById('quiz-answer-decode');
    renderSymbolButtons(document.getElementById('quiz-keyboard'), constructInput);
    attachKeyboardShortcuts(constructInput);

    document.getElementById('quiz-show-hints')?.addEventListener('change', updateQuizHints);
    document.getElementById('quiz-check')?.addEventListener('click', checkQuizAnswer);
    decodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') checkQuizAnswer();
    });
    constructInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        checkQuizAnswer();
      }
    });
  }

  startQuiz('decode');
}

export function onScriptSoundsTabActivated() {
  document.getElementById('quiz-answer-decode')?.focus();
}
