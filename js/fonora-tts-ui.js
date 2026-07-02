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
  cancelSpeech,
} from './fonora-tts.js';
import { getPiperVoiceForLang, PIPER_VOICE_OPTIONS } from './piper-audio.js';
import { primeAudioContext } from './espeak-audio.js';
import { initPiperAudio, isPiperAudioReady } from './piper-audio.js';

let rulesRef = null;
let playing = false;
let cancelRequested = false;
let playbackUiBound = false;
let currentSymbols = '';

const EMPTY_OUTPUT_HTML =
  '<span class="tts-empty">Words appear here as you type. Press Play to hear them spoken.</span>';

function getOutputDisplay() {
  return document.getElementById('translate-output');
}

export function getTranslateSymbols() {
  return currentSymbols;
}

export function setTranslateSymbols(text) {
  currentSymbols = String(text || '').trim();
  renderTranslateOutput(currentSymbols);
}

function getReaderLang() {
  return document.getElementById('translate-lang')?.value || 'en';
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
    engine: 'auto',
    piperVoice: getReaderPiperVoice(lang),
    espeakVoice: resolveEspeakVoice(lang, { englishDialect }),
  };
}

function populateLanguageSelect() {
  const sel = document.getElementById('translate-lang');
  if (!sel) return;
  const saved = loadLanguagePreferences();
  sel.innerHTML = LANGUAGE_OPTIONS.map(
    (item) => `<option value="${escapeHtml(item.code)}"${item.code === saved.lang ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
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
  const dialectWrap = document.getElementById('translate-dialect-wrap');
  const piperWrap = document.getElementById('translate-piper-voice-wrap');
  const voiceNote = document.getElementById('translate-voice-note');

  if (dialectWrap) dialectWrap.hidden = lang !== 'en';
  if (piperWrap) piperWrap.hidden = lang !== 'en';

  if (!voiceNote) return;
  if (lang === 'en') {
    voiceNote.hidden = true;
    voiceNote.textContent = '';
    return;
  }

  const piperVoice = getPiperVoiceForLang(lang);
  voiceNote.hidden = false;
  if (piperVoice) {
    voiceNote.textContent = `Neural voice: ${piperVoice.replace(/_/g, ' ')}. Falls back to eSpeak IPA if the voice fails to load.`;
  } else {
    voiceNote.textContent = 'No Piper neural voice for this language, playback uses eSpeak IPA.';
  }
}

export function renderTranslateOutput(text = currentSymbols) {
  const display = getOutputDisplay();
  if (!display) return;

  const words = tokenizeFonoraPhrase(text);
  if (!words.length) {
    display.innerHTML = EMPTY_OUTPUT_HTML;
    return;
  }

  display.innerHTML = words
    .map((word, index) => `<span class="tts-word" data-index="${index}">${escapeHtml(word)}</span>`)
    .join(' ');
}

function highlightWord(index, { active = false, done = false } = {}) {
  const el = getOutputDisplay()?.querySelector(`.tts-word[data-index="${index}"]`);
  if (!el) return;
  el.classList.toggle('tts-word--active', active);
  el.classList.toggle('tts-word--done', done);
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
  if (playBtn) playBtn.textContent = 'Loading…';
  if (display) display.classList.add('tts-display--loading');
  showPlaybackStatus('');
}

function hideLoading() {
  const loading = document.getElementById('translate-loading');
  const playBtn = document.getElementById('translate-play');
  const display = getOutputDisplay();

  if (loading) loading.hidden = true;
  if (playBtn) playBtn.textContent = '▶ Play';
  if (display) display.classList.remove('tts-display--loading');
}

function showPlaybackStatus(message, { isError = false, isSuccess = false } = {}) {
  const status = document.getElementById('translate-playback-status');
  if (!status) return;
  if (!message) {
    status.hidden = true;
    status.textContent = '';
    status.className = 'tts-status';
    return;
  }
  status.hidden = false;
  status.textContent = message;
  status.className = 'tts-status';
  if (isError) status.classList.add('tts-status--error');
  if (isSuccess) status.classList.add('tts-status--success');
}

export async function playTranslateOutput() {
  if (playing || !rulesRef) return;

  const text = currentSymbols;
  const words = tokenizeFonoraPhrase(text);

  if (!words.length) {
    showPlaybackStatus('Type some text above to translate first.', { isError: true });
    return;
  }

  const playback = getReaderPlaybackOptions();

  primeAudioContext();

  cancelRequested = false;
  setPlaybackUi(true);
  renderTranslateOutput(text);
  clearWordHighlight();

  const needsLoad = playback.piperVoice && !isPiperAudioReady(playback.piperVoice);
  if (needsLoad) {
    showLoading('Preparing…');
  }

  try {
    const result = await speakFonoraPhrase(text, rulesRef, {
      engine: playback.engine,
      piperVoice: playback.piperVoice,
      espeakVoice: playback.espeakVoice,
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

    hideLoading();
    if (result.cancelled) {
      showPlaybackStatus('Stopped.');
      clearWordHighlight();
    } else if (result.skipped > 0) {
      showPlaybackStatus(`Finished, ${result.spoken} spoken, ${result.skipped} skipped.`, { isError: true });
    } else {
      showPlaybackStatus(`Finished, ${result.spoken} word${result.spoken === 1 ? '' : 's'}.`, { isSuccess: true });
    }
  } catch (err) {
    hideLoading();
    showPlaybackStatus(err.message || String(err), { isError: true });
    clearWordHighlight();
  } finally {
    setPlaybackUi(false);
    cancelRequested = false;
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
    saveLanguagePreference(getReaderLang(), getReaderEnglishDialect());
    syncTranslatePlaybackControls();
    warmReaderResources();
  });

  document.getElementById('translate-dialect')?.addEventListener('change', () => {
    saveEnglishDialectPreference(getReaderEnglishDialect());
  });

  document.getElementById('translate-piper-voice')?.addEventListener('change', warmReaderResources);

  document.getElementById('translate-play')?.addEventListener('click', playTranslateOutput);
  document.getElementById('translate-stop')?.addEventListener('click', handleStop);
}

export function setupTranslatePlayback(rules) {
  rulesRef = rules;
  populateLanguageSelect();
  populateDialectSelect();
  populatePiperVoiceSelect();
  syncTranslatePlaybackControls();
  hideLoading();
  warmReaderResources();
  bindPlaybackUiOnce();
  renderTranslateOutput('');
}
