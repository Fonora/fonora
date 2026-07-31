/**
 * Shared on-screen Fonora keyboard dock.
 *
 * The Transliterate view (/script) and the Translator view (/language) grew the same dock
 * independently: a toggle button that only appears in Fonora script mode, a docked keyboard
 * that hides when you leave the view, and a body class so page chrome can make room for it.
 * Both copies had drifted only in element ids, so they live here as one controller.
 */

import { createFonoraKeyboard } from './fonora-keyboard-ui.js';

/** Page chrome reads this class to leave room for whichever dock is open. */
export function syncKeyboardDockBodyClass() {
  document.body.classList.toggle(
    'fonora-keyboard-dock-open',
    Boolean(document.querySelector('.fonora-keyboard-dock:not([hidden])')),
  );
}

/**
 * @param {object} opts
 * @param {string} opts.toggleId    button that opens/closes the dock
 * @param {string} opts.dockId      dock container, hidden when closed
 * @param {string} opts.inputId     text field the keys type into
 * @param {string} opts.keyboardId  element the key grid renders into
 * @param {() => object | null | Promise<object | null>} opts.getRules  script rules, may be async
 * @param {() => boolean} opts.isFonoraMode  true when the input expects Fonora script
 * @param {() => boolean} opts.isViewActive  true when the owning view/tab is on screen
 * @param {() => void} [opts.onEnter]  Enter key on the on-screen keyboard
 */
export function createKeyboardDockController({
  toggleId,
  dockId,
  inputId,
  keyboardId,
  getRules,
  isFonoraMode,
  isViewActive,
  onEnter,
}) {
  let keyboard = null;
  let open = false;

  const isActive = () => open && isFonoraMode() && isViewActive();

  function sync() {
    const fonoraMode = isFonoraMode();
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.hidden = !fonoraMode;
      toggle.setAttribute('aria-pressed', open && fonoraMode ? 'true' : 'false');
      toggle.textContent = open && fonoraMode ? 'Hide keyboard' : 'Keyboard';
    }
    const dock = document.getElementById(dockId);
    if (dock) dock.hidden = !(open && fonoraMode);
    syncKeyboardDockBodyClass();
  }

  async function ensureKeyboard() {
    const input = document.getElementById(inputId);
    const container = document.getElementById(keyboardId);
    if (!input || !container) return null;
    const rules = await getRules();
    if (!rules) return null;
    if (keyboard) {
      keyboard.refresh(rules);
      keyboard.setTarget(input);
      return keyboard;
    }
    keyboard = createFonoraKeyboard({
      rules,
      container,
      target: input,
      isActive,
      layout: 'practice',
      enterKeyLabel: 'go',
      onEnter: () => { onEnter?.(); },
    });
    return keyboard;
  }

  async function setOpen(next) {
    const want = next && isFonoraMode();
    if (want) {
      await ensureKeyboard();
      open = true;
      keyboard?.activate();
    } else {
      open = false;
      keyboard?.deactivate();
    }
    sync();
  }

  return {
    sync,
    setOpen,
    toggle: () => setOpen(!open),
    isOpen: () => open,
    /** Re-key the rendered keys after the script rules reload. */
    refresh: (rules) => { if (keyboard && rules) keyboard.refresh(rules); },
  };
}
