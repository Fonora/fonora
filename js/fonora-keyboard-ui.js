import { createFonoraKeyboardComposer } from './fonora-keyboard-compose.js';
import {
  buildFonoraKeyboardModel,
  romanLetterForCode,
  codeForLetter,
  POPUP_PREFIX_LETTERS,
  getVowelIndicatorSymbol,
} from './fonora-keyboard-layout.js';
import { insertAtCursor } from './utils.js';

/** @type {ReturnType<typeof createFonoraKeyboardComposer> | null} */
let composer = null;
/** @type {((tabId: string) => void) | null} */
let tabChangeHandler = null;
let keydownHandler = null;
let keyupHandler = null;
/** @type {Map<string, HTMLButtonElement>} */
const keyByCode = new Map();
/** @type {HTMLElement | null} */
let keyboardContainer = null;
/** @type {HTMLElement | null} */
let vowelPopup = null;
/** @type {HTMLTextAreaElement | null} */
let boundTextarea = null;
/** @type {{ phoneme: string, symbols: string }[]} */
let popupOptions = [];
/** @type {HTMLButtonElement | null} */
let popupAnchorKey = null;
const pressedCodes = new Set();
let popupRepositionHandler = null;
let vowelIndicatorSymbol = '⚬';

function getComposeHintEl() {
  return document.getElementById('keyboard-compose-hint');
}

function isKeyboardTabActive() {
  return document.documentElement.getAttribute('data-fonora-tab') === 'keyboard';
}

function setKeyPressed(code, pressed) {
  const key = keyByCode.get(code);
  if (!key) return;
  if (pressed) pressedCodes.add(code);
  else pressedCodes.delete(code);
  key.classList.toggle('fonora-key--pressed', pressed);
}

function clearAllPressed() {
  for (const code of [...pressedCodes]) setKeyPressed(code, false);
}

function setComposingKey(code) {
  for (const [c, key] of keyByCode) {
    key.classList.toggle('fonora-key--composing', code != null && c === code);
  }
}

function hideVowelPopup() {
  if (!vowelPopup) return;
  vowelPopup.hidden = true;
  vowelPopup.innerHTML = '';
  popupOptions = [];
  popupAnchorKey = null;
  if (popupRepositionHandler) {
    window.removeEventListener('resize', popupRepositionHandler);
    window.removeEventListener('scroll', popupRepositionHandler, true);
    popupRepositionHandler = null;
  }
}

function positionVowelPopup() {
  if (!vowelPopup || !popupAnchorKey || vowelPopup.hidden) return;

  const keyRect = popupAnchorKey.getBoundingClientRect();
  const popupWidth = vowelPopup.offsetWidth;
  const popupHeight = vowelPopup.offsetHeight;
  const gap = 8;

  let top = keyRect.top - popupHeight - gap;
  let left = keyRect.left + keyRect.width / 2 - popupWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));

  if (top < 8) {
    top = keyRect.bottom + gap;
    vowelPopup.classList.add('fonora-vowel-popup--below');
  } else {
    vowelPopup.classList.remove('fonora-vowel-popup--below');
  }

  vowelPopup.style.top = `${top}px`;
  vowelPopup.style.left = `${left}px`;
}

function bindPopupReposition() {
  if (popupRepositionHandler) return;
  popupRepositionHandler = () => positionVowelPopup();
  window.addEventListener('resize', popupRepositionHandler);
  window.addEventListener('scroll', popupRepositionHandler, true);
}

function selectPopupOption(index) {
  if (!composer || !boundTextarea || index < 0 || index >= popupOptions.length) return;
  const { phoneme } = popupOptions[index];
  emitSymbols(boundTextarea, composer.commitPhoneme(phoneme));
  updateKeyboardVisualState();
}

function showVowelPopup(anchorKey, candidates) {
  if (!vowelPopup || !composer || candidates.length < 2) {
    hideVowelPopup();
    return;
  }

  popupOptions = candidates.slice(0, 9).map((phoneme) => ({
    phoneme,
    symbols: composer.soundToSymbols[phoneme] ?? '',
  }));

  vowelPopup.innerHTML = popupOptions
    .map(
      (opt, i) => `
      <button type="button" class="fonora-vowel-popup__option" data-popup-index="${i}" aria-label="${opt.phoneme}">
        <span class="fonora-vowel-popup__symbol symbol-text">${opt.symbols}</span>
        <span class="fonora-vowel-popup__label">${opt.phoneme}</span>
        <span class="fonora-vowel-popup__num">${i + 1}</span>
      </button>`,
    )
    .join('');

  vowelPopup.hidden = false;
  vowelPopup.querySelectorAll('[data-popup-index]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectPopupOption(Number(btn.getAttribute('data-popup-index')));
    });
  });

  popupAnchorKey = anchorKey;
  bindPopupReposition();
  requestAnimationFrame(() => positionVowelPopup());
}

function updateKeyboardVisualState() {
  if (!composer) return;

  const buffer = composer.getBuffer();
  const hintEl = getComposeHintEl();

  if (!buffer) {
    setComposingKey(null);
    hideVowelPopup();
    if (hintEl) {
      hintEl.hidden = true;
      hintEl.textContent = '';
    }
    return;
  }

  const composeCode = codeForLetter(buffer[0]);
  const candidates = composer.getComposeCandidates();
  const isPopupCompose = POPUP_PREFIX_LETTERS.has(buffer[0]) && candidates.length >= 2;

  if (isPopupCompose && composeCode) {
    setComposingKey(composeCode);
    const anchorKey = keyByCode.get(composeCode);
    if (hintEl) hintEl.hidden = true;
    showVowelPopup(anchorKey, candidates);
  } else {
    // Silent digraph wait (t→th, c→ch, d→dh, etc.): no hint, no key highlight.
    setComposingKey(null);
    hideVowelPopup();
    if (hintEl) {
      hintEl.hidden = true;
      hintEl.textContent = '';
    }
  }
}

function emitSymbols(textarea, symbols) {
  for (const chunk of symbols) {
    if (chunk) insertAtCursor(textarea, chunk);
  }
  updateKeyboardVisualState();
}

function applyComposeResult(textarea, result) {
  if (!result) return;
  if (result.upgrade) {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const after = textarea.value.slice(pos);
    const { fromSymbols, toSymbols } = result.upgrade;
    if (before.endsWith(fromSymbols)) {
      const next = before.slice(0, before.length - fromSymbols.length) + toSymbols;
      textarea.value = next + after;
      const newPos = next.length;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  emitSymbols(textarea, result.inserts ?? []);
}

function handleComposeLetter(textarea, letter, code) {
  if (!composer || !letter) return;
  if (code) setKeyPressed(code, true);
  applyComposeResult(textarea, composer.appendLetter(letter));
}

function handleInsertPhoneme(textarea, phoneme, code) {
  if (!composer || !phoneme) return;
  if (code) setKeyPressed(code, true);
  emitSymbols(textarea, composer.insertPhoneme(phoneme));
}

function handleInsertRawSymbol(textarea, symbol, code) {
  if (!symbol) return;
  if (code) setKeyPressed(code, true);
  if (composer?.getBuffer()) {
    emitSymbols(textarea, composer.flushBuffer());
  }
  insertAtCursor(textarea, symbol);
  updateKeyboardVisualState();
}

function handleFlush(textarea) {
  if (!composer) return;
  emitSymbols(textarea, composer.flushBuffer());
}

function applyNativeBackspace(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start !== end) {
    textarea.value = textarea.value.slice(0, start) + textarea.value.slice(end);
    textarea.selectionStart = start;
    textarea.selectionEnd = start;
  } else if (start > 0) {
    textarea.value = textarea.value.slice(0, start - 1) + textarea.value.slice(start);
    const pos = start - 1;
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function removeSuffixBeforeCursor(textarea, suffix) {
  const pos = textarea.selectionStart;
  if (textarea.selectionStart !== textarea.selectionEnd || pos === 0) return false;
  const before = textarea.value.slice(0, pos);
  if (!before.endsWith(suffix)) return false;
  textarea.value = before.slice(0, before.length - suffix.length) + textarea.value.slice(pos);
  const newPos = before.length - suffix.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function handleBackspace(textarea) {
  if (!composer) return;
  setKeyPressed('Backspace', true);
  const result = composer.backspace();
  if (result.handled) {
    if (result.removeSymbols) {
      removeSuffixBeforeCursor(textarea, result.removeSymbols);
    }
    updateKeyboardVisualState();
    return;
  }
  applyNativeBackspace(textarea);
}

function renderFonoraKeyboard(rules, container, textarea, soundToSymbols) {
  if (!container) return;
  keyByCode.clear();
  keyboardContainer = container;

  const model = buildFonoraKeyboardModel(rules, soundToSymbols);
  container.innerHTML = '';

  vowelPopup = document.getElementById('fonora-vowel-popup');

  for (const row of model) {
    const rowEl = document.createElement('div');
    rowEl.className = 'fonora-keyboard__row';
    rowEl.setAttribute('role', 'group');

    for (const key of row) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fonora-key';
      if (key.wide) btn.classList.add('fonora-key--wide');
      if (key.type === 'backspace') btn.classList.add('fonora-key--backspace');
      if (key.type === 'vowel-indicator') btn.classList.add('fonora-key--vowel-indicator');
      btn.dataset.code = key.code;
      keyByCode.set(key.code, btn);

      const releasePress = () => setKeyPressed(key.code, false);

      if (key.type === 'space') {
        btn.classList.add('fonora-key--space');
        btn.setAttribute('aria-label', 'Space');
        btn.innerHTML = '<span class="fonora-key__label fonora-key__label--center">space</span>';
        btn.addEventListener('pointerdown', () => setKeyPressed(key.code, true));
        btn.addEventListener('pointerup', releasePress);
        btn.addEventListener('pointerleave', releasePress);
        btn.addEventListener('click', () => {
          textarea.focus();
          handleFlush(textarea);
          insertAtCursor(textarea, ' ');
          updateKeyboardVisualState();
        });
      } else if (key.type === 'backspace') {
        btn.setAttribute('aria-label', 'Backspace');
        btn.innerHTML = '<span class="fonora-key__label fonora-key__label--center">⌫</span>';
        btn.addEventListener('pointerdown', () => setKeyPressed(key.code, true));
        btn.addEventListener('pointerup', releasePress);
        btn.addEventListener('pointerleave', releasePress);
        btn.addEventListener('click', () => {
          textarea.focus();
          handleBackspace(textarea);
        });
      } else if (key.type === 'vowel-indicator') {
        btn.setAttribute('aria-label', 'Vowel indicator');
        btn.innerHTML = [
          `<span class="fonora-key__symbol symbol-text">${key.symbols}</span>`,
          `<span class="fonora-key__label">${key.label}</span>`,
        ].join('');
        btn.addEventListener('pointerdown', () => setKeyPressed(key.code, true));
        btn.addEventListener('pointerup', releasePress);
        btn.addEventListener('pointerleave', releasePress);
        btn.addEventListener('click', () => {
          textarea.focus();
          handleInsertRawSymbol(textarea, key.insertSymbol, key.code);
        });
      } else if (key.dead) {
        btn.disabled = true;
        btn.setAttribute('aria-label', 'Unassigned');
        btn.innerHTML = `<span class="fonora-key__label fonora-key__label--center">${key.label}</span>`;
      } else {
        btn.setAttribute('aria-label', key.label);
        btn.innerHTML = [
          key.symbols
            ? `<span class="fonora-key__symbol symbol-text">${key.symbols}</span>`
            : '<span class="fonora-key__symbol fonora-key__symbol--empty">·</span>',
          `<span class="fonora-key__label">${key.label}</span>`,
        ].join('');

        btn.addEventListener('pointerdown', () => setKeyPressed(key.code, true));
        btn.addEventListener('pointerup', releasePress);
        btn.addEventListener('pointerleave', releasePress);

        btn.addEventListener('click', () => {
          textarea.focus();
          const letter = key.compose ?? (key.phoneme?.length === 1 ? key.phoneme : null);
          if (letter) handleComposeLetter(textarea, letter, key.code);
        });
      }

      rowEl.appendChild(btn);
    }

    container.appendChild(rowEl);
  }
}

function bindPhysicalKeyboard(textarea) {
  if (keydownHandler) return;

  keydownHandler = (e) => {
    if (!isKeyboardTabActive() || !composer) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const target = e.target;
    const isTextControl =
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isTextControl && target !== textarea) return;

    if (!vowelPopup?.hidden && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      selectPopupOption(Number(e.code.replace('Digit', '')) - 1);
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      setKeyPressed('Space', true);
      textarea.focus();
      handleFlush(textarea);
      insertAtCursor(textarea, ' ');
      return;
    }

    if (e.code === 'Enter') {
      e.preventDefault();
      textarea.focus();
      handleFlush(textarea);
      insertAtCursor(textarea, '\n');
      return;
    }

    if (e.code === 'Backspace') {
      if (textarea.selectionStart !== textarea.selectionEnd) {
        return;
      }
      const result = composer.backspace();
      if (result.handled) {
        e.preventDefault();
        textarea.focus();
        if (result.removeSymbols) {
          removeSuffixBeforeCursor(textarea, result.removeSymbols);
        }
        updateKeyboardVisualState();
        return;
      }
      return;
    }

    if (e.code === 'KeyQ' && vowelIndicatorSymbol) {
      e.preventDefault();
      textarea.focus();
      handleInsertRawSymbol(textarea, vowelIndicatorSymbol, 'KeyQ');
      return;
    }

    const letter = romanLetterForCode(e.code);
    if (letter) {
      e.preventDefault();
      textarea.focus();
      handleComposeLetter(textarea, letter, e.code);
    }
  };

  keyupHandler = (e) => {
    if (!isKeyboardTabActive()) return;
    if (keyByCode.has(e.code) || e.code === 'Space' || e.code === 'Backspace') {
      setKeyPressed(e.code, false);
    }
  };

  document.addEventListener('keydown', keydownHandler);
  document.addEventListener('keyup', keyupHandler);
}

function onKeyboardTabActivated(textarea) {
  textarea?.focus();
  updateKeyboardVisualState();
}

export function setupFonoraKeyboard(rules) {
  const textarea = document.getElementById('symbol-input');
  const container = document.getElementById('fonora-keyboard');
  if (!textarea || !container || !rules) return;

  boundTextarea = textarea;
  vowelIndicatorSymbol = getVowelIndicatorSymbol(rules);
  composer = createFonoraKeyboardComposer(rules);
  renderFonoraKeyboard(rules, container, textarea, composer.soundToSymbols);
  bindPhysicalKeyboard(textarea);
  updateKeyboardVisualState();

  if (tabChangeHandler) {
    document.removeEventListener('fonora-tab-change', tabChangeHandler);
  }

  tabChangeHandler = () => {
    if (isKeyboardTabActive()) onKeyboardTabActivated(textarea);
    else {
      composer?.clearBuffer();
      clearAllPressed();
      hideVowelPopup();
      setComposingKey(null);
    }
    updateKeyboardVisualState();
  };

  document.addEventListener('fonora-tab-change', tabChangeHandler);

  if (isKeyboardTabActive()) onKeyboardTabActivated(textarea);
}

export function notifyFonoraTabChange(tabId) {
  document.dispatchEvent(new CustomEvent('fonora-tab-change', { detail: { tabId } }));
}

export function refreshFonoraKeyboard(rules) {
  const textarea = document.getElementById('symbol-input');
  const container = document.getElementById('fonora-keyboard');
  if (!textarea || !container || !rules) return;
  boundTextarea = textarea;
  vowelIndicatorSymbol = getVowelIndicatorSymbol(rules);
  composer = createFonoraKeyboardComposer(rules);
  renderFonoraKeyboard(rules, container, textarea, composer.soundToSymbols);
  updateKeyboardVisualState();
}
