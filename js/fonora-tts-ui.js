import { escapeHtml } from './utils.js';
import {
  ENGLISH_DIALECT_OPTIONS,
  LANGUAGE_OPTIONS,
  loadLanguagePreferences,
  saveLanguagePreference,
  saveEnglishDialectPreference,
  resolveEspeakVoice,
} from './language-preferences.js';
import {
  tokenizeFonoraPhrase,
  speakFonoraPhrase,
  speakFonoraFluid,
  cancelSpeech,
  getReaderWordSources,
  setReaderWordSources,
} from './fonora-tts.js';
import { createFonoraKeyboard } from './fonora-keyboard-ui.js';
import { romanToFonoraScript, fonoraWordToRoman, pauseMsForPunctuation } from '../tools/fonoran-fonora-bridge.js';
import { parseSyllable, toSpeakable, compoundPhoneticKey, romanToIpa } from '../tools/fonoran-pronunciation.js';
import { getPiperVoiceForLang, PIPER_VOICE_OPTIONS } from './piper-audio.js';
import { primeAudioContext } from './espeak-audio.js';
import { initPiperAudio, isPiperAudioReady } from './piper-audio.js';
import { setPlayButtonLabel, setPlayButtonText } from './play-button-ui.js';

let rulesRef = null;
let playing = false;
let cancelRequested = false;
let playbackUiBound = false;
let currentSymbols = '';
let currentRoman = '';
/** @type {string[]} */
let currentRomanWords = [];
/** @type {Array<{ kind: 'word', symbols: string, roman: string } | { kind: 'pause', char: string }>} */
let currentFonoranTokens = [];

/** @type {Array<object | null>} */
let currentFonoranWordSources = null;
let currentFonoranStrictOk = true;

export const FONORAN_TRANSLITERATE_LANG = 'fonoran';
export const FONORAN_ROMAN_LANG = 'fonoran-roman';

/** @type {ReturnType<typeof createFonoraKeyboard> | null} */
let transliterateKeyboard = null;
let transliterateKeyboardOpen = false;
/** @type {(() => void) | null} */
let transliterateApplyHandler = null;

const TRANSLITERATE_LANGUAGE_OPTIONS = [
  ...LANGUAGE_OPTIONS,
  { code: FONORAN_TRANSLITERATE_LANG, label: 'Fonoran (Fonora)' },
  { code: FONORAN_ROMAN_LANG, label: 'Fonoran (Roman)' },
];

const EMPTY_OUTPUT_HTML =
  '<span class="tts-empty">Words appear here as you type. Press Listen to hear them spoken.</span>';

const EMPTY_FONORAN_OUTPUT_HTML =
  '<span class="tts-empty">Roman spelling appears here as you paste Fonora script. Press Listen to hear it read aloud.</span>';

const EMPTY_FONORAN_ROMAN_OUTPUT_HTML =
  '<span class="tts-empty">Fonora script appears here as you type roman spelling. Press Listen to hear it read aloud.</span>';

const TRANSLITERATE_SPEED_KEY = 'fonora:transliterate:speed';
const TRANSLITERATE_SYLLABLE_MODE_KEY = 'fonora:transliterate:syllable-by-syllable';
const TRANSLITERATE_FLUIDITY_KEY = 'fonora:transliterate:fluidity';
const TRANSLITERATE_PERIOD_PAUSE_KEY = 'fonora:transliterate:period-pause';
/** @deprecated migrated to TRANSLITERATE_FLUIDITY_KEY */
const TRANSLITERATE_FLUID_MODE_KEY = 'fonora:transliterate:fluid';

const DEFAULT_FLUIDITY = 85;
const DEFAULT_PERIOD_PAUSE = 100;
const FLUIDITY_FULL_CLAUSE = 92;
const FLUIDITY_WORD_BY_WORD = 8;

function getTranslateLang() {
  return document.getElementById('translate-lang')?.value || 'en';
}

export function isFonoranScriptMode() {
  return getTranslateLang() === FONORAN_TRANSLITERATE_LANG;
}

export function isFonoranRomanMode() {
  return getTranslateLang() === FONORAN_ROMAN_LANG;
}

export function isFonoranTransliterateMode() {
  return isFonoranScriptMode() || isFonoranRomanMode();
}

function syncFonoraKeyboardDockBodyClass() {
  document.body.classList.toggle(
    'fonora-keyboard-dock-open',
    Boolean(document.querySelector('.fonora-keyboard-dock:not([hidden])')),
  );
}

function isTransliterateKeyboardActive() {
  return transliterateKeyboardOpen
    && isFonoranScriptMode()
    && document.documentElement.getAttribute('data-fonora-tab') === 'translator';
}

function syncTransliterateKeyboardToggle() {
  const fonoraMode = isFonoranScriptMode();
  const toggle = document.getElementById('translate-keyboard-toggle');
  if (toggle) {
    toggle.hidden = !fonoraMode;
    toggle.setAttribute('aria-pressed', transliterateKeyboardOpen && fonoraMode ? 'true' : 'false');
    toggle.textContent = transliterateKeyboardOpen && fonoraMode ? 'Hide keyboard' : 'Keyboard';
  }
  const dock = document.getElementById('translate-keyboard-dock');
  if (dock) dock.hidden = !(transliterateKeyboardOpen && fonoraMode);
  syncFonoraKeyboardDockBodyClass();
}

function ensureTransliterateKeyboard() {
  const input = document.getElementById('translate-input');
  const container = document.getElementById('translate-keyboard');
  if (!input || !container || !rulesRef) return null;
  if (transliterateKeyboard) {
    transliterateKeyboard.refresh(rulesRef);
    transliterateKeyboard.setTarget(input);
    return transliterateKeyboard;
  }
  transliterateKeyboard = createFonoraKeyboard({
    rules: rulesRef,
    container,
    target: input,
    isActive: isTransliterateKeyboardActive,
    layout: 'practice',
    enterKeyLabel: 'go',
    onEnter: () => { transliterateApplyHandler?.(); },
  });
  return transliterateKeyboard;
}

export function setTransliterateKeyboardOpen(open) {
  if (open && !isFonoranScriptMode()) open = false;
  if (open) {
    ensureTransliterateKeyboard();
    transliterateKeyboardOpen = true;
    transliterateKeyboard?.activate();
  } else {
    transliterateKeyboardOpen = false;
    transliterateKeyboard?.deactivate();
  }
  syncTransliterateKeyboardToggle();
}

export function isFonoranRomanListenAllowed() {
  return !isFonoranRomanMode() || currentFonoranStrictOk;
}

export function setFonoranWordSources(sources, { strictOk = true } = {}) {
  currentFonoranWordSources = Array.isArray(sources) ? sources : null;
  currentFonoranStrictOk = strictOk;
}

function getOutputDisplay() {
  return document.getElementById('translate-output');
}

export function getTranslateSymbols() {
  return currentSymbols;
}

export function setTranslateSymbols(text) {
  currentSymbols = String(text || '').trim();
  if (!isFonoranTransliterateMode()) {
    currentRoman = '';
    currentRomanWords = [];
    currentFonoranTokens = [];
  }
  renderTranslateOutput();
}

export function setTransliterateFonoranOutput(symbols, roman, tokens = [], { strictOk = true, wordSources = null } = {}) {
  currentSymbols = String(symbols || '').trim();
  currentRoman = String(roman || '').trim();
  currentFonoranTokens = Array.isArray(tokens) ? tokens : [];
  currentRomanWords = currentFonoranTokens
    .filter((item) => item.kind === 'word')
    .map((item) => item.roman);
  setFonoranWordSources(wordSources, { strictOk });
  renderTranslateOutput();
}

function readTransliterateSpeed() {
  const el = document.getElementById('translate-speed');
  const raw = el ? parseFloat(el.value) : parseFloat(localStorage.getItem(TRANSLITERATE_SPEED_KEY));
  return Number.isFinite(raw) ? Math.max(0.45, Math.min(1, raw)) : 1;
}

function syncTransliterateSpeedLabel() {
  const val = document.getElementById('translate-speed-val');
  const slider = document.getElementById('translate-speed');
  const speed = readTransliterateSpeed();
  if (val) val.textContent = `${Math.round(speed * 100)}%`;
  if (slider) slider.setAttribute('aria-valuenow', String(speed));
}

function readTransliterateSyllableMode() {
  return document.getElementById('translate-syllable-by-syllable')?.checked === true;
}

function readTransliterateFluidity() {
  const el = document.getElementById('translate-fluidity');
  let raw = el ? parseFloat(el.value) : NaN;
  if (!Number.isFinite(raw)) {
    raw = parseFloat(localStorage.getItem(TRANSLITERATE_FLUIDITY_KEY));
  }
  if (!Number.isFinite(raw)) {
    const legacy = localStorage.getItem(TRANSLITERATE_FLUID_MODE_KEY);
    if (legacy === '0') return 0;
    return DEFAULT_FLUIDITY;
  }
  return Math.max(0, Math.min(100, raw));
}

function syncTransliterateFluidityLabel() {
  const val = document.getElementById('translate-fluidity-val');
  const slider = document.getElementById('translate-fluidity');
  const fluidity = readTransliterateFluidity();
  if (val) val.textContent = `${Math.round(fluidity)}%`;
  if (slider) slider.setAttribute('aria-valuenow', String(Math.round(fluidity)));
}

function readTransliteratePeriodPause() {
  const el = document.getElementById('translate-period-pause');
  let raw = el ? parseFloat(el.value) : NaN;
  if (!Number.isFinite(raw)) {
    raw = parseFloat(localStorage.getItem(TRANSLITERATE_PERIOD_PAUSE_KEY));
  }
  if (!Number.isFinite(raw)) return DEFAULT_PERIOD_PAUSE;
  return Math.max(0, Math.min(200, raw));
}

function readTransliteratePeriodPauseScale() {
  return readTransliteratePeriodPause() / 100;
}

function syncTransliteratePeriodPauseLabel() {
  const val = document.getElementById('translate-period-pause-val');
  const slider = document.getElementById('translate-period-pause');
  const periodPause = readTransliteratePeriodPause();
  if (val) val.textContent = `${Math.round(periodPause)}%`;
  if (slider) slider.setAttribute('aria-valuenow', String(Math.round(periodPause)));
}

/** Split a clause into fluid playback chunks; lower fluidity → smaller groups. */
export function chunkSymbolWordsForFluidity(symbolWords, fluidity = DEFAULT_FLUIDITY) {
  const words = symbolWords.filter(Boolean);
  const n = words.length;
  if (n === 0) return [];
  if (fluidity >= FLUIDITY_FULL_CLAUSE) return [words.slice()];
  if (fluidity <= FLUIDITY_WORD_BY_WORD) return words.map((word) => [word]);

  const wordsPerGroup = Math.max(2, Math.min(n, Math.floor((100 - fluidity) / 8) + 2));
  const groups = [];
  for (let i = 0; i < n; i += wordsPerGroup) {
    groups.push(words.slice(i, i + wordsPerGroup));
  }
  return groups;
}

function groupGapMsForFluidity(fluidity, playbackRate = 1) {
  if (fluidity >= FLUIDITY_FULL_CLAUSE) return 0;
  const rate = Math.max(0.45, Math.min(1, Number(playbackRate) || 1));
  const base = Math.round(40 + (100 - fluidity) * 2.4);
  return Math.round(base + (1 - rate) * 70);
}

function sentencePauseScaleForFluidity(fluidity) {
  return 1 + ((100 - fluidity) * 0.005);
}

function syncTransliteratePlaybackModes() {
  const syllableEl = document.getElementById('translate-syllable-by-syllable');
  const fluidityEl = document.getElementById('translate-fluidity');
  if (fluidityEl) fluidityEl.disabled = syllableEl?.checked === true;
}

function restoreTransliteratePlaybackPrefs() {
  const speedEl = document.getElementById('translate-speed');
  const savedSpeed = parseFloat(localStorage.getItem(TRANSLITERATE_SPEED_KEY));
  if (speedEl && Number.isFinite(savedSpeed)) {
    speedEl.value = String(Math.max(0.45, Math.min(1, savedSpeed)));
  }

  const syllableEl = document.getElementById('translate-syllable-by-syllable');
  const savedSyllable = localStorage.getItem(TRANSLITERATE_SYLLABLE_MODE_KEY);
  if (syllableEl && savedSyllable != null) {
    syllableEl.checked = savedSyllable === '1';
  }

  const fluidityEl = document.getElementById('translate-fluidity');
  const savedFluidity = parseFloat(localStorage.getItem(TRANSLITERATE_FLUIDITY_KEY));
  if (fluidityEl) {
    if (Number.isFinite(savedFluidity)) {
      fluidityEl.value = String(Math.max(0, Math.min(100, savedFluidity)));
    } else {
      const legacy = localStorage.getItem(TRANSLITERATE_FLUID_MODE_KEY);
      fluidityEl.value = legacy === '0' ? '0' : String(DEFAULT_FLUIDITY);
    }
  }

  const periodPauseEl = document.getElementById('translate-period-pause');
  const savedPeriodPause = parseFloat(localStorage.getItem(TRANSLITERATE_PERIOD_PAUSE_KEY));
  if (periodPauseEl && Number.isFinite(savedPeriodPause)) {
    periodPauseEl.value = String(Math.max(0, Math.min(200, savedPeriodPause)));
  }

  syncTransliterateSpeedLabel();
  syncTransliterateFluidityLabel();
  syncTransliteratePeriodPauseLabel();
  syncTransliteratePlaybackModes();
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTransliterateWordSource(symbols, parts, original) {
  const cleanParts = parts.filter(Boolean);
  const phonemeKeys = cleanParts.length > 1
    ? compoundPhoneticKey(cleanParts)
    : toSpeakable(cleanParts[0] || original || '');
  const ipaHint = cleanParts.map((part) => romanToIpa(part).replace(/^\/+|\/+$/g, '')).join('');
  return {
    symbols,
    normalizedPhonemes: phonemeKeys,
    ipa: ipaHint ? `/${ipaHint}/` : '',
    original: original ?? cleanParts.join(''),
    input: cleanParts.join(' '),
  };
}

function romanPartsForWord(symbols, wordIndex, romanWords, syllableBySyllable) {
  if (!syllableBySyllable) return null;

  const sources = getReaderWordSources();
  const source = sources?.[wordIndex];
  if (source?.input?.includes(' ')) {
    return source.input.split(/\s+/).filter(Boolean);
  }

  const roman = romanWords[wordIndex] || fonoraWordToRoman(symbols, rulesRef).roman;
  if (!roman) return null;

  const parsed = parseSyllable(roman);
  if (parsed && !parsed.unparsed) return [roman];
  return null;
}

function buildTransliterateSegments(text, { syllableBySyllable = false } = {}) {
  const symbolWords = tokenizeFonoraPhrase(text);
  const romanWords = isFonoranTransliterateMode()
    ? currentRomanWords
    : symbolWords.map((word) => fonoraWordToRoman(word, rulesRef).roman);
  /** @type {{ symbols: string, wordIndex: number, wordSource: object }[]} */
  const segments = [];

  for (let i = 0; i < symbolWords.length; i++) {
    const symbols = symbolWords[i];
    const parts = romanPartsForWord(symbols, i, romanWords, syllableBySyllable);
    const sources = getReaderWordSources();

    if (syllableBySyllable && parts && parts.length > 1) {
      for (const part of parts) {
        const { phrase } = romanToFonoraScript([part], rulesRef);
        if (!phrase) continue;
        segments.push({
          symbols: phrase,
          wordIndex: i,
          wordSource: buildTransliterateWordSource(phrase, [part], part),
        });
      }
      continue;
    }

    segments.push({
      symbols,
      wordIndex: i,
      wordSource: sources?.[i] || buildTransliterateWordSource(symbols, [romanWords[i] || ''], romanWords[i]),
    });
  }

  return segments;
}

function getReaderLang() {
  const lang = getTranslateLang();
  return (lang === FONORAN_TRANSLITERATE_LANG || lang === FONORAN_ROMAN_LANG) ? 'en' : lang;
}

function getReaderEnglishDialect() {
  return document.getElementById('translate-dialect')?.value || undefined;
}

function getReaderPiperVoice(lang = getReaderLang()) {
  if (lang === 'en') {
    return document.getElementById('translate-piper-voice')?.value || getPiperVoiceForLang('en');
  }
  return getPiperVoiceForLang(lang);
}

function getReaderPlaybackOptions() {
  const lang = getReaderLang();
  const englishDialect = getReaderEnglishDialect();
  return {
    lang,
    engine: 'piper',
    piperVoice: getReaderPiperVoice(lang),
    espeakVoice: resolveEspeakVoice(lang, { englishDialect }),
    playbackRate: readTransliterateSpeed(),
  };
}

function populateLanguageSelect() {
  const sel = document.getElementById('translate-lang');
  if (!sel) return;
  const saved = loadLanguagePreferences();
  const savedLang = (saved.lang === FONORAN_TRANSLITERATE_LANG || saved.lang === FONORAN_ROMAN_LANG)
    ? 'en'
    : saved.lang;
  sel.innerHTML = TRANSLITERATE_LANGUAGE_OPTIONS.map(
    (item) => `<option value="${escapeHtml(item.code)}"${item.code === savedLang ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
}

export function syncTransliterateModeUi() {
  const fonoranScript = isFonoranScriptMode();
  const fonoranRoman = isFonoranRomanMode();
  const fonoran = fonoranScript || fonoranRoman;
  const panel = document.getElementById('tab-translator');
  const desc = panel?.querySelector('.section-desc');
  const inputLabel = panel?.querySelector('label[for="translate-input"]');
  const outputLabel = document.getElementById('translate-output-label');
  const input = document.getElementById('translate-input');
  const output = document.getElementById('translate-output');
  const detailsSection = panel?.querySelector('.translate-details-section');

  if (desc) {
    if (fonoranScript) {
      desc.textContent = 'Paste Fonora script to see Roman spelling, then press Listen to hear it read aloud.';
    } else if (fonoranRoman) {
      desc.textContent = 'Type Fonoran roman spelling (phonemic, not English spelling — a = cup, ae = cat), then press Listen to hear it read aloud.';
    } else {
      desc.textContent = 'Type text to transliterate into Fonora, then press Listen to hear it with a matching neural or eSpeak voice.';
    }
  }
  if (inputLabel) {
    inputLabel.textContent = fonoranScript
      ? 'Fonora script'
      : fonoranRoman
        ? 'Fonoran roman spelling'
        : 'Text';
  }
  if (outputLabel) {
    outputLabel.textContent = fonoranScript
      ? 'Roman spelling'
      : fonoranRoman
        ? 'Fonora script'
        : 'Fonora spelling';
  }
  if (input) {
    input.placeholder = fonoranScript
      ? 'Paste Fonora script here…'
      : fonoranRoman
        ? 'Type Fonoran roman spelling (a = cup, ae = cat)…'
        : 'e.g. knife, hola, the big dog';
    input.classList.toggle('symbol-text', fonoranScript);
  }
  if (output) output.classList.toggle('symbol-text', fonoranRoman || !fonoran);
  if (detailsSection) detailsSection.hidden = fonoranScript;
  if (!fonoranScript && transliterateKeyboardOpen) {
    setTransliterateKeyboardOpen(false);
  } else {
    syncTransliterateKeyboardToggle();
  }
}

function populateDialectSelect() {
  const sel = document.getElementById('translate-dialect');
  if (!sel) return;
  const savedDialect = loadLanguagePreferences().englishDialect;
  sel.innerHTML = ENGLISH_DIALECT_OPTIONS.map(
    (item) => `<option value="${escapeHtml(item.code)}"${item.code === savedDialect ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
}

function populatePiperVoiceSelect() {
  const sel = document.getElementById('translate-piper-voice');
  if (!sel) return;
  sel.innerHTML = PIPER_VOICE_OPTIONS.map(
    (item, index) => `<option value="${escapeHtml(item.id)}"${index === 0 ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
}

export function syncTranslatePlaybackControls() {
  const lang = getReaderLang();
  const fonoran = isFonoranTransliterateMode();
  const dialectWrap = document.getElementById('translate-dialect-wrap');
  const piperWrap = document.getElementById('translate-piper-voice-wrap');
  const periodPauseWrap = document.getElementById('translate-period-pause-wrap');
  const voiceNote = document.getElementById('translate-voice-note');

  if (dialectWrap) dialectWrap.hidden = lang !== 'en';
  if (piperWrap) piperWrap.hidden = lang !== 'en';
  if (periodPauseWrap) periodPauseWrap.hidden = !fonoran;

  if (!voiceNote) return;
  if (fonoran) {
    voiceNote.hidden = false;
    voiceNote.textContent = 'Fluidity controls how continuously sentences are read; Period pause sets the break length at full stops.';
    return;
  }
  if (lang === 'en') {
    voiceNote.hidden = true;
    voiceNote.textContent = '';
    return;
  }

  const piperVoice = getPiperVoiceForLang(lang);
  voiceNote.hidden = false;
  if (piperVoice) {
    voiceNote.textContent = `Neural voice: ${piperVoice.replace(/_/g, ' ')}.`;
  } else {
    voiceNote.textContent = 'No Piper neural voice for this language.';
  }
}

export function renderTranslateOutput() {
  const display = getOutputDisplay();
  if (!display) return;

  const fonoranScript = isFonoranScriptMode();
  const fonoranRoman = isFonoranRomanMode();
  const fonoran = fonoranScript || fonoranRoman;
  display.classList.toggle('symbol-text', fonoranRoman || !fonoran);
  display.classList.toggle('translate-output--script', fonoranRoman);

  if (fonoran && currentFonoranTokens.length) {
    let wordIndex = 0;
    display.innerHTML = currentFonoranTokens.map((item) => {
      if (item.kind === 'pause') {
        return `<span class="tts-punct" aria-hidden="true">${escapeHtml(item.char)}</span>`;
      }
      const index = wordIndex++;
      const text = fonoranRoman ? item.symbols : item.roman;
      return `<span class="tts-word" data-index="${index}">${escapeHtml(text)}</span>`;
    }).join(' ');
    return;
  }

  const text = fonoran ? currentRoman : currentSymbols;
  const words = tokenizeFonoraPhrase(text);

  if (!words.length) {
    display.innerHTML = fonoranRoman
      ? EMPTY_FONORAN_ROMAN_OUTPUT_HTML
      : fonoran
        ? EMPTY_FONORAN_OUTPUT_HTML
        : EMPTY_OUTPUT_HTML;
    return;
  }

  display.innerHTML = words
    .map((word, index) => `<span class="tts-word" data-index="${index}">${escapeHtml(word)}</span>`)
    .join(' ');
}

function buildFonoranPlaybackSegments({
  syllableBySyllable = false,
  playbackRate = 1,
  periodPauseScale = 1,
} = {}) {
  /** @type {Array<{ kind: 'word', symbols: string, wordIndex: number, wordSource?: object } | { kind: 'pause', char: string, pauseMs: number }>} */
  const segments = [];
  let wordIndex = 0;

  for (const item of currentFonoranTokens) {
    if (item.kind === 'pause') {
      segments.push({
        kind: 'pause',
        char: item.char,
        pauseMs: pauseMsForPunctuation(item.char, playbackRate, periodPauseScale),
      });
      continue;
    }

    const parts = romanPartsForWord(item.symbols, wordIndex, currentRomanWords, syllableBySyllable);

    if (syllableBySyllable && parts && parts.length > 1) {
      for (const part of parts) {
        const { phrase } = romanToFonoraScript([part], rulesRef);
        if (!phrase) continue;
        segments.push({
          kind: 'word',
          symbols: phrase,
          wordIndex,
          wordSource: buildTransliterateWordSource(phrase, [part], part),
        });
      }
    } else {
      const prebuilt = currentFonoranWordSources?.[wordIndex];
      segments.push({
        kind: 'word',
        symbols: item.symbols,
        wordIndex,
        wordSource: prebuilt || buildTransliterateWordSource(item.symbols, [item.roman], item.roman),
      });
    }

    wordIndex += 1;
  }

  return segments;
}

function highlightWord(index, { active = false, done = false } = {}) {
  const el = getOutputDisplay()?.querySelector(`.tts-word[data-index="${index}"]`);
  if (!el) return;
  el.classList.toggle('tts-word--active', active);
  el.classList.toggle('tts-word--done', done);
}

function highlightWords(indices, { active = false, done = false } = {}) {
  for (const index of indices) highlightWord(index, { active, done });
}

function buildFonoranFluidClauses() {
  /** @type {Array<{ kind: 'clause', symbols: string[], wordIndices: number[] } | { kind: 'pause', char: string, pauseMs: number }>} */
  const clauses = [];
  /** @type {{ symbols: string[], wordIndices: number[] }} */
  let current = { symbols: [], wordIndices: [] };
  let wordIndex = 0;

  for (const item of currentFonoranTokens) {
    if (item.kind === 'pause') {
      if (current.symbols.length) {
        clauses.push({ kind: 'clause', ...current });
        current = { symbols: [], wordIndices: [] };
      }
      clauses.push({ kind: 'pause', char: item.char, pauseMs: 0 });
      continue;
    }
    current.symbols.push(item.symbols);
    current.wordIndices.push(wordIndex);
    wordIndex += 1;
  }

  if (current.symbols.length) {
    clauses.push({ kind: 'clause', ...current });
  }

  return clauses;
}

async function playFluidSymbolGroups(symbolGroups, wordIndexGroups, playback, {
  needsLoad,
  groupGapMs = 0,
} = {}) {
  let spoken = 0;
  let skipped = 0;
  let cancelled = false;

  for (let g = 0; g < symbolGroups.length; g++) {
    if (cancelRequested) {
      cancelled = true;
      break;
    }

    const group = symbolGroups[g];
    const indices = wordIndexGroups[g] || [];
    highlightWords(indices, { active: true });

    const result = await speakFonoraFluid(group, rulesRef, {
      engine: playback.engine,
      piperVoice: playback.piperVoice,
      espeakVoice: playback.espeakVoice,
      playbackRate: playback.playbackRate,
      wordSourceOffset: indices[0] ?? 0,
      shouldCancel: () => cancelRequested,
      onPrepare: (message) => {
        if (needsLoad || (playback.piperVoice && !isPiperAudioReady(playback.piperVoice))) {
          showLoading(message);
        }
      },
    });

    hideLoading();
    spoken += result.spoken;
    skipped += result.skipped;
    cancelled = cancelled || result.cancelled;
    highlightWords(indices, { active: false, done: true });

    if (cancelRequested) {
      cancelled = true;
      break;
    }
    if (groupGapMs > 0 && g < symbolGroups.length - 1) {
      await sleepMs(groupGapMs);
    }
  }

  return { spoken, skipped, cancelled };
}

function clearWordHighlight() {
  getOutputDisplay()?.querySelectorAll('.tts-word').forEach((el) => {
    el.classList.remove('tts-word--active', 'tts-word--done');
  });
}

function setPlaybackUi(active) {
  playing = active;
  const playBtn = document.getElementById('translate-play');
  const stopBtn = document.getElementById('translate-stop');
  const input = document.getElementById('translate-input');
  if (playBtn) playBtn.disabled = active;
  if (stopBtn) stopBtn.disabled = !active;
  if (input) input.disabled = active;
}

function showLoading(message) {
  if (!playing) return;

  const loading = document.getElementById('translate-loading');
  const msg = document.getElementById('translate-loading-message');
  const playBtn = document.getElementById('translate-play');
  const display = getOutputDisplay();

  if (loading) loading.hidden = false;
  if (msg) msg.textContent = message;
  if (playBtn) setPlayButtonText(playBtn, 'Loading…');
  if (display) display.classList.add('tts-display--loading');
  showPlaybackStatus('');
}

function hideLoading() {
  const loading = document.getElementById('translate-loading');
  const playBtn = document.getElementById('translate-play');
  const display = getOutputDisplay();

  if (loading) loading.hidden = true;
  if (playBtn) setPlayButtonLabel(playBtn, 'Listen');
  if (display) display.classList.remove('tts-display--loading');
}

function showPlaybackStatus(message, { isError = false, isSuccess = false } = {}) {
  const status = document.getElementById('translate-playback-status');
  if (!status) return;
  if (!message) {
    status.hidden = true;
    status.textContent = '';
    status.className = 'translator-playback-status sans translate-playback-status';
    return;
  }
  status.hidden = false;
  status.textContent = message;
  status.className = 'translator-playback-status sans translate-playback-status';
  if (isError) status.classList.add('translator-playback-status--error');
  if (isSuccess) status.classList.remove('translator-playback-status--error');
}

export async function playTranslateOutput() {
  if (playing || !rulesRef) return;

  const text = currentSymbols;
  const words = tokenizeFonoraPhrase(text);

  if (!words.length) {
    const message = isFonoranScriptMode()
      ? 'Paste Fonora script above first.'
      : isFonoranRomanMode()
        ? 'Type Fonoran roman spelling above first.'
        : 'Type some text above to translate first.';
    showPlaybackStatus(message, { isError: true });
    return;
  }

  if (!isFonoranRomanListenAllowed()) {
    showPlaybackStatus('Fix unknown letters in your roman spelling before listening.', { isError: true });
    return;
  }

  const playback = getReaderPlaybackOptions();
  const syllableBySyllable = readTransliterateSyllableMode();
  const fluidity = readTransliterateFluidity();
  const periodPauseScale = readTransliteratePeriodPauseScale();
  const usesFluidPlayback = !syllableBySyllable && fluidity > FLUIDITY_WORD_BY_WORD;
  const groupGapMs = groupGapMsForFluidity(fluidity, playback.playbackRate);
  const wordGapMs = usesFluidPlayback
    ? 0
    : syllableBySyllable
      ? Math.round(250 + (1 - playback.playbackRate) * 450)
      : Math.round(120 + (1 - playback.playbackRate) * 80);

  primeAudioContext();

  cancelRequested = false;
  setPlaybackUi(true);
  renderTranslateOutput();
  clearWordHighlight();

  const needsLoad = playback.piperVoice && !isPiperAudioReady(playback.piperVoice);
  if (needsLoad) {
    showLoading('Preparing…');
  }

  const segments = syllableBySyllable
    ? buildTransliterateSegments(text, { syllableBySyllable: true })
    : null;

  let spoken = 0;
  let skipped = 0;
  let cancelled = false;

  try {
    if (isFonoranTransliterateMode() && currentFonoranTokens.length) {
      if (usesFluidPlayback) {
        if (isFonoranRomanMode() && currentFonoranWordSources?.length) {
          setReaderWordSources(currentFonoranWordSources);
        }
        const clauses = buildFonoranFluidClauses();
        const pauseScale = sentencePauseScaleForFluidity(fluidity);

        for (let i = 0; i < clauses.length; i++) {
          if (cancelRequested) {
            cancelled = true;
            break;
          }

          const seg = clauses[i];
          if (seg.kind === 'pause') {
            await sleepMs(Math.round(
              pauseMsForPunctuation(seg.char, playback.playbackRate, periodPauseScale) * pauseScale,
            ));
            continue;
          }

          const symbolGroups = chunkSymbolWordsForFluidity(seg.symbols, fluidity);
          const wordIndexGroups = [];
          let cursor = 0;
          for (const group of symbolGroups) {
            wordIndexGroups.push(seg.wordIndices.slice(cursor, cursor + group.length));
            cursor += group.length;
          }

          const groupResult = await playFluidSymbolGroups(symbolGroups, wordIndexGroups, playback, {
            needsLoad,
            groupGapMs,
          });
          spoken += groupResult.spoken;
          skipped += groupResult.skipped;
          cancelled = cancelled || groupResult.cancelled;
          if (cancelRequested) break;
        }
      } else {
      const segments = buildFonoranPlaybackSegments({
        syllableBySyllable,
        playbackRate: playback.playbackRate,
        periodPauseScale,
      });

      for (let i = 0; i < segments.length; i++) {
        if (cancelRequested) {
          cancelled = true;
          break;
        }

        const seg = segments[i];
        if (seg.kind === 'pause') {
          await sleepMs(seg.pauseMs);
          continue;
        }

        setReaderWordSources(seg.wordSource ? [seg.wordSource] : null);
        highlightWord(seg.wordIndex, { active: true });

        const result = await speakFonoraPhrase(seg.symbols, rulesRef, {
          engine: playback.engine,
          piperVoice: playback.piperVoice,
          espeakVoice: playback.espeakVoice,
          playbackRate: playback.playbackRate,
          wordGapMs: 0,
          shouldCancel: () => cancelRequested,
          onPrepare: (message) => {
            if (needsLoad || (playback.piperVoice && !isPiperAudioReady(playback.piperVoice))) {
              showLoading(message);
            }
          },
          onWordStart: () => hideLoading(),
        });

        hideLoading();
        spoken += result.spoken;
        skipped += result.skipped;
        cancelled = cancelled || result.cancelled;
        highlightWord(seg.wordIndex, { active: false, done: true });

        if (cancelRequested) {
          cancelled = true;
          break;
        }

        const next = segments[i + 1];
        if (next?.kind === 'word' && wordGapMs > 0) {
          await sleepMs(wordGapMs);
        }
      }
      }
      setReaderWordSources(null);
    } else if (usesFluidPlayback) {
      const symbolGroups = chunkSymbolWordsForFluidity(words, fluidity);
      const wordIndexGroups = symbolGroups.map((group, index) => {
        const start = symbolGroups.slice(0, index).reduce((sum, chunk) => sum + chunk.length, 0);
        return group.map((_, offset) => start + offset);
      });
      const groupResult = await playFluidSymbolGroups(symbolGroups, wordIndexGroups, playback, {
        needsLoad,
        groupGapMs,
      });
      spoken = groupResult.spoken;
      skipped = groupResult.skipped;
      cancelled = groupResult.cancelled;
    } else if (segments) {
      for (let i = 0; i < segments.length; i++) {
        if (cancelRequested) {
          cancelled = true;
          break;
        }

        const seg = segments[i];
        setReaderWordSources(seg.wordSource ? [seg.wordSource] : null);
        highlightWord(seg.wordIndex, { active: true });

        const result = await speakFonoraPhrase(seg.symbols, rulesRef, {
          engine: playback.engine,
          piperVoice: playback.piperVoice,
          espeakVoice: playback.espeakVoice,
          playbackRate: playback.playbackRate,
          wordGapMs: 0,
          shouldCancel: () => cancelRequested,
          onPrepare: (message) => {
            if (needsLoad || (playback.piperVoice && !isPiperAudioReady(playback.piperVoice))) {
              showLoading(message);
            }
          },
          onWordStart: () => hideLoading(),
        });

        hideLoading();
        spoken += result.spoken;
        skipped += result.skipped;
        cancelled = cancelled || result.cancelled;
        highlightWord(seg.wordIndex, { active: false, done: true });

        if (cancelRequested) {
          cancelled = true;
          break;
        }
        if (wordGapMs > 0 && i < segments.length - 1) {
          await sleepMs(wordGapMs);
        }
      }
      setReaderWordSources(null);
    } else {
      const result = await speakFonoraPhrase(text, rulesRef, {
        engine: playback.engine,
        piperVoice: playback.piperVoice,
        espeakVoice: playback.espeakVoice,
        playbackRate: playback.playbackRate,
        wordGapMs,
        shouldCancel: () => cancelRequested,
        onPrepare: (message) => {
          if (needsLoad || (playback.piperVoice && !isPiperAudioReady(playback.piperVoice))) {
            showLoading(message);
          }
        },
        onWordStart: (index) => {
          hideLoading();
          highlightWord(index, { active: true });
        },
        onWordEnd: (index) => highlightWord(index, { active: false, done: true }),
      });
      spoken = result.spoken;
      skipped = result.skipped;
      cancelled = result.cancelled;
    }

    hideLoading();
    if (cancelled) {
      showPlaybackStatus('Stopped.');
      clearWordHighlight();
    } else if (skipped > 0) {
      showPlaybackStatus(`Finished, ${spoken} spoken, ${skipped} skipped.`, { isError: true });
    } else {
      showPlaybackStatus(`Finished, ${spoken} word${spoken === 1 ? '' : 's'}.`, { isSuccess: true });
    }
  } catch (err) {
    hideLoading();
    showPlaybackStatus(err.message || String(err), { isError: true });
    clearWordHighlight();
  } finally {
    setPlaybackUi(false);
    cancelRequested = false;
    setReaderWordSources(null);
  }
}

function handleStop() {
  if (!playing) return;
  cancelRequested = true;
  cancelSpeech();
  hideLoading();
}

function warmReaderResources() {
  if (!rulesRef) return;
  const piperVoice = getReaderPiperVoice();
  if (piperVoice) initPiperAudio(piperVoice).catch(() => {});
}

function bindPlaybackUiOnce() {
  if (playbackUiBound) return;
  playbackUiBound = true;

  document.getElementById('translate-lang')?.addEventListener('change', () => {
    const lang = getTranslateLang();
    if (lang !== FONORAN_TRANSLITERATE_LANG && lang !== FONORAN_ROMAN_LANG) {
      saveLanguagePreference(lang, getReaderEnglishDialect());
    }
    syncTransliterateModeUi();
    syncTranslatePlaybackControls();
    warmReaderResources();
  });

  document.getElementById('translate-keyboard-toggle')?.addEventListener('click', () => {
    setTransliterateKeyboardOpen(!transliterateKeyboardOpen);
  });
  document.getElementById('translate-keyboard-close')?.addEventListener('click', () => {
    setTransliterateKeyboardOpen(false);
  });

  document.getElementById('translate-dialect')?.addEventListener('change', () => {
    saveEnglishDialectPreference(getReaderEnglishDialect());
  });

  document.getElementById('translate-piper-voice')?.addEventListener('change', warmReaderResources);

  document.getElementById('translate-play')?.addEventListener('click', playTranslateOutput);
  document.getElementById('translate-stop')?.addEventListener('click', handleStop);

  document.getElementById('translate-speed')?.addEventListener('input', () => {
    syncTransliterateSpeedLabel();
    localStorage.setItem(TRANSLITERATE_SPEED_KEY, String(readTransliterateSpeed()));
  });

  document.getElementById('translate-syllable-by-syllable')?.addEventListener('change', (event) => {
    const checked = /** @type {HTMLInputElement} */ (event.target).checked;
    localStorage.setItem(TRANSLITERATE_SYLLABLE_MODE_KEY, checked ? '1' : '0');
    syncTransliteratePlaybackModes();
  });

  document.getElementById('translate-fluidity')?.addEventListener('input', () => {
    syncTransliterateFluidityLabel();
    localStorage.setItem(TRANSLITERATE_FLUIDITY_KEY, String(readTransliterateFluidity()));
  });

  document.getElementById('translate-period-pause')?.addEventListener('input', () => {
    syncTransliteratePeriodPauseLabel();
    localStorage.setItem(TRANSLITERATE_PERIOD_PAUSE_KEY, String(readTransliteratePeriodPause()));
  });
}

export function setupTranslatePlayback(rules) {
  rulesRef = rules;
  populateLanguageSelect();
  populateDialectSelect();
  populatePiperVoiceSelect();
  restoreTransliteratePlaybackPrefs();
  syncTransliterateModeUi();
  syncTranslatePlaybackControls();
  hideLoading();
  warmReaderResources();
  bindPlaybackUiOnce();
  renderTranslateOutput();
  if (transliterateKeyboard) {
    transliterateKeyboard.refresh(rules);
  }
}

/** Register the live/apply handler used by Enter on the Fonora keyboard dock. */
export function setTransliterateApplyHandler(handler) {
  transliterateApplyHandler = typeof handler === 'function' ? handler : null;
}
