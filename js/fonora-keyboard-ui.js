import { createFonoraKeyboardComposer } from './fonora-keyboard-compose.js';
import {
  buildFonoraKeyboardModel,
  romanLetterForCode,
  getVowelIndicatorSymbol,
} from './fonora-keyboard-layout.js';
import { insertAtCursor } from './utils.js';

/** @type {Set<ReturnType<typeof createFonoraKeyboard>>} */
const keyboardInstances = new Set();

let mainKeyboardInstance = null;

/**
 * @typedef {object} FonoraKeyboardOptions
 * @property {object} rules
 * @property {HTMLElement} container
 * @property {HTMLTextAreaElement} target
 * @property {HTMLElement} [popupEl]
 * @property {HTMLElement | null} [hintEl]
 * @property {string} [tabId] Tab id when `isActive` is omitted
 * @property {() => boolean} [isActive]
 * @property {boolean} [includeEnterKey] Deprecated — use `layout: 'practice'`
 * @property {'default' | 'practice'} [layout]
 * @property {() => void} [onEnter] When set, Enter submits instead of inserting a newline
 * @property {() => void} [onTab] When set, Tab advances (e.g. next practice word)
 * @property {string} [enterKeyLabel] Corner label on the return key (default: check)
 */

/**
 * Self-contained Fonora keyboard widget: virtual keys, compose buffer, vowel popup,
 * and optional physical-key binding when active.
 *
 * @param {FonoraKeyboardOptions} options
 */
export function createFonoraKeyboard(options) {
  const {
    rules,
    container,
    target,
    popupEl = null,
    hintEl = null,
    tabId = null,
    isActive: isActiveOption,
    layout: layoutOption = 'default',
    includeEnterKey = false,
    onEnter = null,
    onTab = null,
    enterKeyLabel = 'check',
  } = options;

  const keyboardLayout = layoutOption === 'practice' || includeEnterKey ? 'practice' : 'default';

  if (!rules || !container || !target) {
    throw new Error('createFonoraKeyboard requires rules, container, and target');
  }

  const isActive = isActiveOption ?? (() =>
    tabId != null && document.documentElement.getAttribute('data-fonora-tab') === tabId);

  let composer = createFonoraKeyboardComposer(rules);
  let vowelIndicatorSymbol = getVowelIndicatorSymbol(rules);
  /** @type {Map<string, HTMLButtonElement>} */
  const keyByCode = new Map();
  const pressedCodes = new Set();
  /** @type {{ phoneme: string, symbols: string }[]} */
  let popupOptions = [];
  /** @type {HTMLButtonElement | null} */
  let popupAnchorKey = null;
  let popupRepositionHandler = null;
  /** @type {HTMLElement} */
  let vowelPopup = popupEl;
  let boundTextarea = target;
  let keydownHandler = null;
  let keyupHandler = null;
  let outsidePointerHandler = null;
  let destroyed = false;

  if (!vowelPopup) {
    vowelPopup = document.createElement('div');
    vowelPopup.className = 'fonora-vowel-popup';
    vowelPopup.hidden = true;
    vowelPopup.setAttribute('role', 'listbox');
    vowelPopup.setAttribute('aria-label', 'Sound options');
    container.insertAdjacentElement('beforebegin', vowelPopup);
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

  function dismissVowelPopup() {
    if (!isPopupOpen()) return;
    hideVowelPopup();
    setComposingKey(null);
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
    dismissVowelPopup();
    applyComposeResult(boundTextarea, composer.commitPhoneme(phoneme));
    updateKeyboardVisualState();
  }

  function showVowelPopup(anchorKey, candidates) {
    if (!vowelPopup || !composer || candidates.length < 1) {
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
    if (anchorKey?.dataset.code) {
      setComposingKey(anchorKey.dataset.code);
    }
    bindPopupReposition();
    requestAnimationFrame(() => positionVowelPopup());
  }

  function pressAlternateKey(code, letter) {
    if (!composer || !boundTextarea) return;
    const wasOpen = isPopupOpen();
    dismissVowelPopup();
    boundTextarea.focus();
    handleComposeLetter(boundTextarea, letter);
    const alternates = composer.getAlternatePhonemes(letter);
    if (alternates.length > 0 && !wasOpen) {
      showVowelPopup(keyByCode.get(code) ?? null, alternates);
    }
  }

  function updateKeyboardVisualState() {
    if (!composer) return;
    if (!isPopupOpen()) {
      setComposingKey(null);
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

  function handleComposeLetter(textarea, letter) {
    if (!composer || !letter) return;
    dismissVowelPopup();
    applyComposeResult(textarea, composer.appendLetter(letter));
  }

  function handleInsertRawSymbol(textarea, symbol, code) {
    if (!symbol) return;
    dismissVowelPopup();
    if (code) setKeyPressed(code, true);
    if (composer?.getBuffer()) {
      emitSymbols(textarea, composer.flushBuffer());
    }
    insertAtCursor(textarea, symbol);
    updateKeyboardVisualState();
  }

  function handleFlush(textarea) {
    if (!composer) return;
    dismissVowelPopup();
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
    dismissVowelPopup();
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

  function isPopupOpen() {
    return Boolean(vowelPopup && !vowelPopup.hidden);
  }

  function clearCompose() {
    composer?.clearBuffer();
    clearAllPressed();
    dismissVowelPopup();
    if (hintEl) {
      hintEl.hidden = true;
      hintEl.textContent = '';
    }
  }

  function handleEnterKey() {
    boundTextarea.focus();
    handleFlush(boundTextarea);
    if (onEnter) {
      onEnter();
      return;
    }
    insertAtCursor(boundTextarea, '\n');
    updateKeyboardVisualState();
  }

  function handleTabKey() {
    if (!onTab) return;
    boundTextarea.focus();
    handleFlush(boundTextarea);
    onTab();
  }

  function bindAlternateKey(btn, code, letter) {
    const alternates = composer.getAlternatePhonemes(letter);
    const releasePress = () => setKeyPressed(code, false);

    if (alternates.length > 0) {
      btn.classList.add('fonora-key--alternates');
    }

    btn.addEventListener('pointerdown', () => setKeyPressed(code, true));
    btn.addEventListener('pointerup', releasePress);
    btn.addEventListener('pointerleave', releasePress);
    btn.addEventListener('click', () => {
      if (alternates.length > 0) {
        pressAlternateKey(code, letter);
      } else {
        boundTextarea.focus();
        handleComposeLetter(boundTextarea, letter);
      }
    });
  }

  function renderKeyboard() {
    keyByCode.clear();
    const model = buildFonoraKeyboardModel(rules, composer.soundToSymbols, { layout: keyboardLayout });
    container.innerHTML = '';
    container.classList.toggle('fonora-keyboard--practice', keyboardLayout === 'practice');

    for (const [rowIndex, row] of model.entries()) {
      const rowEl = document.createElement('div');
      rowEl.className = 'fonora-keyboard__row';
      if (keyboardLayout === 'practice' && rowIndex === model.length - 1) {
        rowEl.classList.add('fonora-keyboard__row--practice-bottom');
      }
      rowEl.setAttribute('role', 'group');

      for (const key of row) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fonora-key';
        if (key.wide) btn.classList.add('fonora-key--wide');
        if (key.type === 'backspace') btn.classList.add('fonora-key--backspace');
        if (key.type === 'backspace' && rowIndex < model.length - 1) {
          btn.classList.add('fonora-key--backspace-inline');
        }
        if (key.type === 'enter') btn.classList.add('fonora-key--enter', 'fonora-key--return');
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
            boundTextarea.focus();
            handleFlush(boundTextarea);
            insertAtCursor(boundTextarea, ' ');
            updateKeyboardVisualState();
          });
        } else if (key.type === 'enter') {
          btn.setAttribute('aria-label', onEnter ? 'Check' : 'Enter');
          if (onEnter) {
            btn.innerHTML = [
              '<span class="fonora-key__symbol fonora-key__symbol--return" aria-hidden="true">↵</span>',
              `<span class="fonora-key__label">${enterKeyLabel}</span>`,
            ].join('');
          } else {
            btn.innerHTML = `<span class="fonora-key__label fonora-key__label--center">${key.label}</span>`;
          }
          btn.addEventListener('pointerdown', () => setKeyPressed(key.code, true));
          btn.addEventListener('pointerup', releasePress);
          btn.addEventListener('pointerleave', releasePress);
          btn.addEventListener('click', () => handleEnterKey());
        } else if (key.type === 'backspace') {
          btn.setAttribute('aria-label', 'Backspace');
          btn.innerHTML = '<span class="fonora-key__label fonora-key__label--center">⌫</span>';
          btn.addEventListener('pointerdown', () => setKeyPressed(key.code, true));
          btn.addEventListener('pointerup', releasePress);
          btn.addEventListener('pointerleave', releasePress);
          btn.addEventListener('click', () => {
            boundTextarea.focus();
            handleBackspace(boundTextarea);
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
            boundTextarea.focus();
            handleInsertRawSymbol(boundTextarea, key.insertSymbol, key.code);
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

          const letter = key.compose ?? (key.phoneme?.length === 1 ? key.phoneme : null);
          if (letter) {
            bindAlternateKey(btn, key.code, letter);
          }
        }

        rowEl.appendChild(btn);
      }

      container.appendChild(rowEl);
    }
  }

  function bindPhysicalKeyboard() {
    if (keydownHandler) return;

    keydownHandler = (e) => {
      if (!isActive() || !composer) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const targetEl = e.target;
      const isTextControl =
        targetEl instanceof HTMLTextAreaElement ||
        targetEl instanceof HTMLInputElement ||
        (targetEl instanceof HTMLElement && targetEl.isContentEditable);
      if (isTextControl && targetEl !== boundTextarea) return;

      if (e.code === 'Escape') {
        if (composer.getBuffer() || isPopupOpen()) {
          e.preventDefault();
          clearCompose();
        }
        return;
      }

      if (isPopupOpen() && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        selectPopupOption(Number(e.code.replace('Digit', '')) - 1);
        return;
      }

      if (e.code === 'Tab' && onTab) {
        e.preventDefault();
        handleTabKey();
        return;
      }

      if (e.code === 'Enter') {
        e.preventDefault();
        setKeyPressed('Enter', true);
        handleEnterKey();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setKeyPressed('Space', true);
        boundTextarea.focus();
        handleFlush(boundTextarea);
        insertAtCursor(boundTextarea, ' ');
        return;
      }

      if (e.code === 'Backspace') {
        if (boundTextarea.selectionStart !== boundTextarea.selectionEnd) {
          return;
        }
        const result = composer.backspace();
        if (result.handled) {
          e.preventDefault();
          boundTextarea.focus();
          if (result.removeSymbols) {
            removeSuffixBeforeCursor(boundTextarea, result.removeSymbols);
          }
          updateKeyboardVisualState();
        }
        return;
      }

      if (e.code === 'KeyQ' && vowelIndicatorSymbol) {
        e.preventDefault();
        boundTextarea.focus();
        handleInsertRawSymbol(boundTextarea, vowelIndicatorSymbol, 'KeyQ');
        return;
      }

      const letter = romanLetterForCode(e.code);
      if (letter) {
        e.preventDefault();
        if (e.repeat) return;
        boundTextarea.focus();
        setKeyPressed(e.code, true);
        if (composer.getAlternatePhonemes(letter).length > 0) {
          pressAlternateKey(e.code, letter);
        } else {
          handleComposeLetter(boundTextarea, letter);
        }
      }
    };

    keyupHandler = (e) => {
      if (!isActive()) return;
      if (keyByCode.has(e.code) || romanLetterForCode(e.code) || e.code === 'Space' || e.code === 'Backspace' || e.code === 'Enter' || e.code === 'Tab') {
        setKeyPressed(e.code, false);
      }
    };

    outsidePointerHandler = (e) => {
      if (!isActive() || !isPopupOpen()) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (vowelPopup?.contains(t)) return;
      if (container.contains(t)) return;
      clearCompose();
    };

    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    document.addEventListener('pointerdown', outsidePointerHandler, true);
  }

  function flushToTarget() {
    if (!composer || !boundTextarea) return;
    emitSymbols(boundTextarea, composer.flushBuffer());
  }

  function activate() {
    boundTextarea?.focus();
    updateKeyboardVisualState();
  }

  function deactivate() {
    clearCompose();
  }

  function onTabChange(activeTabId) {
    if (tabId != null) {
      if (activeTabId === tabId) activate();
      else deactivate();
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    keyboardInstances.delete(instance);
    deactivate();
    if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
    if (keyupHandler) document.removeEventListener('keyup', keyupHandler);
    if (outsidePointerHandler) document.removeEventListener('pointerdown', outsidePointerHandler, true);
    keydownHandler = null;
    keyupHandler = null;
    outsidePointerHandler = null;
    container.innerHTML = '';
    keyByCode.clear();
  }

  function refresh(newRules) {
    if (!newRules) return;
    clearCompose();
    composer = createFonoraKeyboardComposer(newRules);
    vowelIndicatorSymbol = getVowelIndicatorSymbol(newRules);
    renderKeyboard();
    updateKeyboardVisualState();
  }

  function setTarget(textarea) {
    boundTextarea = textarea;
  }

  renderKeyboard();
  bindPhysicalKeyboard();
  updateKeyboardVisualState();

  const instance = {
    activate,
    deactivate,
    destroy,
    refresh,
    setTarget,
    clearCompose,
    flushToTarget,
    onTabChange,
    get composer() {
      return composer;
    },
  };

  keyboardInstances.add(instance);
  return instance;
}

export function setupFonoraKeyboard(rules) {
  const textarea = document.getElementById('symbol-input');
  const container = document.getElementById('fonora-keyboard');
  if (!textarea || !container || !rules) return null;

  mainKeyboardInstance?.destroy();
  mainKeyboardInstance = createFonoraKeyboard({
    rules,
    container,
    target: textarea,
    popupEl: document.getElementById('fonora-vowel-popup'),
    hintEl: document.getElementById('keyboard-compose-hint'),
    tabId: 'keyboard',
  });

  if (document.documentElement.getAttribute('data-fonora-tab') === 'keyboard') {
    mainKeyboardInstance.activate();
  }

  return mainKeyboardInstance;
}

export function notifyFonoraTabChange(tabId) {
  for (const instance of keyboardInstances) {
    instance.onTabChange(tabId);
  }
  document.dispatchEvent(new CustomEvent('fonora-tab-change', { detail: { tabId } }));
}

export function refreshFonoraKeyboard(rules) {
  if (mainKeyboardInstance) {
    mainKeyboardInstance.refresh(rules);
    return;
  }
  setupFonoraKeyboard(rules);
}
