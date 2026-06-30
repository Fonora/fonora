import { buildSoundToSymbolsMap, getDefinedSounds } from './rules.js';
import { POPUP_PREFIX_LETTERS } from './fonora-keyboard-layout.js';

/** Letters that print immediately and upgrade to *h digraphs when h follows. */
const RETROACTIVE_H_DIGRAPHS = {
  t: 'th',
  d: 'dh',
  s: 'sh',
  k: 'kh',
  g: 'gh',
};

function buildKeyboardSounds(baseSounds, baseSymbols) {
  const sounds = [...baseSounds];
  const soundToSymbols = { ...baseSymbols };
  sounds.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b.localeCompare(a);
  });
  return { sounds, soundToSymbols };
}

/**
 * @typedef {{ inserts: string[], upgrade?: { fromSymbols: string, toSymbols: string } }} ComposeResult
 */

/**
 * Roman-key composer for the Fonora keyboard: buffers letters and emits Fonora
 * symbol strings when phoneme keys resolve (longest-match, with digraph waiting).
 */
export function createFonoraKeyboardComposer(rules) {
  const baseSounds = getDefinedSounds(rules);
  const baseSymbols = buildSoundToSymbolsMap(rules);
  const phonemeSet = new Set(baseSounds);
  const { sounds, soundToSymbols } = buildKeyboardSounds(baseSounds, baseSymbols);
  const keyboardKeySet = new Set(sounds);

  let buffer = '';
  /** @type {{ letter: string, symbols: string } | null} */
  let pendingRetro = null;
  /** Base glyph already printed; next letter may upgrade to a submenu phoneme. */
  let pendingSubmenuLetter = null;

  function isValidPrefix(s) {
    return sounds.some((sound) => sound.startsWith(s));
  }

  function isStrictPrefix(s) {
    return sounds.some((sound) => sound.startsWith(s) && sound.length > s.length);
  }

  function symbolsFor(phoneme) {
    return soundToSymbols[phoneme] ?? '';
  }

  function clearPendingRetro() {
    pendingRetro = null;
  }

  function clearPendingSubmenu() {
    pendingSubmenuLetter = null;
  }

  function clearAllPending() {
    clearPendingRetro();
    clearPendingSubmenu();
  }

  /** Long-press alternates for a key letter (excludes the base single-letter phoneme). */
  function getAlternatePhonemes(letter) {
    if (!letter || letter.length !== 1) return [];
    // C key always maps to /ch/; ch is not a submenu alternate.
    if (letter === 'c') return [];
    const candidates = sounds.filter((sound) => sound.startsWith(letter) && sound !== letter);
    if (letter === 'n' && phonemeSet.has('ñ') && !candidates.includes('ñ')) {
      candidates.push('ñ');
    }
    return [...new Set(candidates)].sort((a, b) => a.localeCompare(b));
  }

  function hasSubmenu(letter) {
    return getAlternatePhonemes(letter).length > 0;
  }

  /** @param {string} pending @param {string} letter */
  function resolveSubmenuUpgrade(pending, letter) {
    const combo = pending + letter;
    const alts = getAlternatePhonemes(pending);
    if (pending === 'n' && letter === 'n' && phonemeSet.has('ñ')) return 'ñ';
    if (alts.includes(combo)) return combo;
    if (combo === 'ey' && alts.includes('eye')) return 'eye';
    return null;
  }

  /** @returns {ComposeResult} */
  function appendLetter(letter) {
    if (letter === 'h' && pendingRetro && RETROACTIVE_H_DIGRAPHS[pendingRetro.letter]) {
      const upgraded = RETROACTIVE_H_DIGRAPHS[pendingRetro.letter];
      const fromSymbols = pendingRetro.symbols;
      const toSymbols = symbolsFor(upgraded);
      clearAllPending();
      return { inserts: [], upgrade: { fromSymbols, toSymbols } };
    }

    if (pendingRetro) {
      pendingRetro = null;
    }

    if (pendingSubmenuLetter) {
      const upgrade = resolveSubmenuUpgrade(pendingSubmenuLetter, letter);
      if (upgrade) {
        const fromSymbols = symbolsFor(pendingSubmenuLetter);
        clearPendingSubmenu();
        return {
          inserts: [],
          upgrade: { fromSymbols, toSymbols: symbolsFor(upgrade) },
        };
      }
      clearPendingSubmenu();
    }

    if (letter === 'c') {
      const outputs = buffer.length > 0 ? flushBuffer() : [];
      if (phonemeSet.has('ch')) outputs.push(symbolsFor('ch'));
      clearAllPending();
      return { inserts: outputs };
    }

    if (buffer.length === 0 && !pendingSubmenuLetter && hasSubmenu(letter)) {
      pendingSubmenuLetter = letter;
      return { inserts: [symbolsFor(letter)] };
    }

    if (
      buffer.length === 0 &&
      (letter === 't' || letter === 'd' || letter === 's' || letter === 'k' || letter === 'g')
    ) {
      const sym = symbolsFor(letter);
      pendingRetro = { letter, symbols: sym };
      return { inserts: [sym] };
    }

    // Double-tap a popup vowel (e.g. a+a → /a/) unless a longer phoneme uses the pair.
    if (
      buffer.length === 1 &&
      buffer === letter &&
      POPUP_PREFIX_LETTERS.has(letter) &&
      keyboardKeySet.has(letter) &&
      !keyboardKeySet.has(buffer + letter) &&
      !hasSubmenu(letter)
    ) {
      const sym = symbolsFor(letter);
      buffer = '';
      return { inserts: [sym] };
    }

    buffer += letter;
    const outputs = [];

    while (buffer.length > 0) {
      if (keyboardKeySet.has(buffer) && !isStrictPrefix(buffer)) {
        outputs.push(symbolsFor(buffer));
        buffer = '';
        continue;
      }

      if (!isValidPrefix(buffer)) {
        const first = buffer[0];
        if (keyboardKeySet.has(first)) {
          outputs.push(symbolsFor(first));
          buffer = buffer.slice(1);
          continue;
        }
        buffer = buffer.slice(1);
        continue;
      }

      break;
    }

    return { inserts: outputs };
  }

  /** Insert a complete phoneme key in one step (e.g. from compose popup). */
  function insertPhoneme(phoneme) {
    clearAllPending();
    const outputs = [];
    if (buffer.length > 0) {
      outputs.push(...flushBuffer());
    }
    if (phonemeSet.has(phoneme)) {
      outputs.push(symbolsFor(phoneme));
    }
    return outputs;
  }

  /** Commit pending buffer on space/enter boundaries. */
  function flushBuffer() {
    clearAllPending();
    const outputs = [];
    let remaining = buffer;
    buffer = '';

    while (remaining.length > 0) {
      let matched = false;
      for (const sound of sounds) {
        if (!remaining.startsWith(sound)) continue;
        outputs.push(symbolsFor(sound));
        remaining = remaining.slice(sound.length);
        matched = true;
        break;
      }

      if (matched) continue;

      if (isValidPrefix(remaining) && !keyboardKeySet.has(remaining)) {
        remaining = '';
        break;
      }

      const first = remaining[0];
      if (keyboardKeySet.has(first)) {
        outputs.push(symbolsFor(first));
      }
      remaining = remaining.slice(1);
    }

    return outputs;
  }

  function backspace() {
    if (buffer.length > 0) {
      buffer = buffer.slice(0, -1);
      return { handled: true };
    }
    if (pendingSubmenuLetter) {
      const removeSymbols = symbolsFor(pendingSubmenuLetter);
      clearPendingSubmenu();
      return { handled: true, removeSymbols };
    }
    if (pendingRetro) {
      const removeSymbols = pendingRetro.symbols;
      pendingRetro = null;
      return { handled: true, removeSymbols };
    }
    return { handled: false };
  }

  function getBuffer() {
    return buffer;
  }

  function clearBuffer() {
    buffer = '';
    clearAllPending();
  }

  /** Phoneme keys that start with the current buffer (for compose picker). */
  function getComposeCandidates() {
    if (!buffer) return [];
    const candidates = sounds.filter((sound) => sound.startsWith(buffer));
    if (buffer === 'n' && phonemeSet.has('ñ') && !candidates.includes('ñ')) {
      candidates.push('ñ');
    }
    return [...new Set(candidates)].sort((a, b) => a.localeCompare(b));
  }

  /** @returns {ComposeResult} */
  function commitPhoneme(phoneme) {
    buffer = '';
    clearPendingRetro();
    if (!phonemeSet.has(phoneme)) return { inserts: [] };

    if (pendingSubmenuLetter && phoneme !== pendingSubmenuLetter) {
      const fromSymbols = symbolsFor(pendingSubmenuLetter);
      clearPendingSubmenu();
      return {
        inserts: [],
        upgrade: { fromSymbols, toSymbols: symbolsFor(phoneme) },
      };
    }

    clearPendingSubmenu();
    return { inserts: [symbolsFor(phoneme)] };
  }

  return {
    appendLetter,
    insertPhoneme,
    flushBuffer,
    backspace,
    getBuffer,
    clearBuffer,
    getComposeCandidates,
    getAlternatePhonemes,
    commitPhoneme,
    sounds,
    soundToSymbols,
  };
}
