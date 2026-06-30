/**
 * US QWERTY layout for the Fonora script keyboard.
 * Each key shows the primary phoneme for display; digraphs compose at runtime.
 */

/** @typedef {{ code: string, label: string, phoneme?: string | null, compose?: string, dead?: boolean, type?: string, wide?: boolean, insertSymbol?: string }} LayoutKey */

/** @type {LayoutKey[][]} */
export const US_QWERTY_ROWS = [
  [
    { code: 'KeyQ', label: 'q', type: 'vowel-indicator' },
    { code: 'KeyW', label: 'w', phoneme: 'w' },
    { code: 'KeyE', label: 'e', phoneme: 'e' },
    { code: 'KeyR', label: 'r', phoneme: 'r' },
    { code: 'KeyT', label: 't', phoneme: 't' },
    { code: 'KeyY', label: 'y', phoneme: 'y' },
    { code: 'KeyU', label: 'u', phoneme: 'u' },
    { code: 'KeyI', label: 'i', phoneme: 'i' },
    { code: 'KeyO', label: 'o', phoneme: 'o' },
    { code: 'KeyP', label: 'p', phoneme: 'p' },
  ],
  [
    { code: 'KeyA', label: 'a', phoneme: 'a' },
    { code: 'KeyS', label: 's', phoneme: 's' },
    { code: 'KeyD', label: 'd', phoneme: 'd' },
    { code: 'KeyF', label: 'f', phoneme: 'f' },
    { code: 'KeyG', label: 'g', phoneme: 'g' },
    { code: 'KeyH', label: 'h', phoneme: 'h' },
    { code: 'KeyJ', label: 'j', phoneme: 'j' },
    { code: 'KeyK', label: 'k', phoneme: 'k' },
    { code: 'KeyL', label: 'l', phoneme: 'l' },
  ],
  [
    { code: 'KeyZ', label: 'z', phoneme: 'z' },
    { code: 'KeyX', label: 'x', phoneme: 'x' },
    { code: 'KeyC', label: 'ch', phoneme: 'ch', compose: 'c' },
    { code: 'KeyV', label: 'v', phoneme: 'v' },
    { code: 'KeyB', label: 'b', phoneme: 'b' },
    { code: 'KeyN', label: 'n', phoneme: 'n' },
    { code: 'KeyM', label: 'm', phoneme: 'm' },
  ],
  [
    { code: 'Space', label: 'space', type: 'space', wide: true },
    { code: 'Backspace', label: '⌫', type: 'backspace', wide: false },
  ],
];

const LETTER_BY_CODE = new Map();
for (const row of US_QWERTY_ROWS) {
  for (const key of row) {
    if (key.type || key.dead) continue;
    if (key.compose) {
      LETTER_BY_CODE.set(key.code, key.compose);
    } else if (key.phoneme?.length === 1) {
      LETTER_BY_CODE.set(key.code, key.phoneme);
    }
  }
}

/** Map KeyboardEvent.code to a single roman letter for composition. */
export function romanLetterForCode(code) {
  return LETTER_BY_CODE.get(code) ?? null;
}

const LETTER_TO_CODE = new Map();
for (const row of US_QWERTY_ROWS) {
  for (const key of row) {
    if (key.type || key.dead) continue;
    const letter = key.compose ?? (key.phoneme?.length === 1 ? key.phoneme : null);
    if (letter?.length === 1) LETTER_TO_CODE.set(letter, key.code);
  }
}

export const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Letters that show a compose popup when multiple phonemes share a prefix. */
export const POPUP_PREFIX_LETTERS = new Set([...VOWEL_LETTERS, 'n']);

export function codeForLetter(letter) {
  return LETTER_TO_CODE.get(letter) ?? null;
}

export function isVowelKeyCode(code) {
  const letter = romanLetterForCode(code);
  return letter ? VOWEL_LETTERS.has(letter) : false;
}

export function getVowelIndicatorSymbol(rules) {
  return rules?.modifiers?.find((m) => m.id === 'vowel')?.symbol ?? '⚬';
}

/** Build display model: resolve Fonora symbols for each key cap. */
export function buildFonoraKeyboardModel(rules, soundToSymbols) {
  const vowelIndicator = getVowelIndicatorSymbol(rules);
  return US_QWERTY_ROWS.map((row) =>
    row.map((key) => {
      if (key.type === 'vowel-indicator') {
        return { ...key, symbols: vowelIndicator, insertSymbol: vowelIndicator };
      }
      if (key.type === 'space' || key.type === 'backspace') {
        return { ...key, symbols: '' };
      }
      if (key.dead) {
        return { ...key, symbols: '' };
      }
      const phoneme = key.phoneme;
      const symbols = phoneme && soundToSymbols[phoneme] ? soundToSymbols[phoneme] : '';
      return { ...key, symbols };
    }),
  );
}
