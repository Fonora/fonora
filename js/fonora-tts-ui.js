import { escapeHtml, deleteSymbolBeforeCursor } from './utils.js';
import { normalizeSymbolInput } from './decode.js';
import { ENGLISH_DIALECT_OPTIONS } from './language-preferences.js';
import {
  tokenizeFonoraPhrase,
  speakFonoraPhrase,
  cancelSpeech,
  looksLikePhonemeKeyText,
  setReaderWordSources,
} from './fonora-tts.js';
import { PIPER_VOICE_OPTIONS } from './piper-audio.js';
import { primeAudioContext } from './espeak-audio.js';
import { initPiperAudio, isPiperAudioReady } from './piper-audio.js';

let rulesRef = null;
let playing = false;
let cancelRequested = false;

function populateDialectSelect() {
  const sel = document.getElementById('tts-dialect');
  if (!sel) return;
  sel.innerHTML = ENGLISH_DIALECT_OPTIONS.map(
    (item) => `<option value="${escapeHtml(item.code)}"${item.code === 'en-us' ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
}

function populatePiperVoiceSelect() {
  const sel = document.getElementById('tts-piper-voice');
  if (!sel) return;
  sel.innerHTML = PIPER_VOICE_OPTIONS.map(
    (item, index) => `<option value="${escapeHtml(item.id)}"${index === 0 ? ' selected' : ''}>${escapeHtml(item.label)}</option>`,
  ).join('');
}

function renderWordDisplay(text) {
  const display = document.getElementById('tts-display');
  if (!display) return;

  const words = tokenizeFonoraPhrase(text);
  if (!words.length) {
    display.innerHTML = '<span class="tts-empty">Words appear here as you type. Press Play to hear them spoken.</span>';
    return;
  }

  display.innerHTML = words
    .map((word, index) => `<span class="tts-word" data-index="${index}">${escapeHtml(word)}</span>`)
    .join(' ');
}

function highlightWord(index, { active = false, done = false } = {}) {
  const el = document.getElementById('tts-display')?.querySelector(`.tts-word[data-index="${index}"]`);
  if (!el) return;
  el.classList.toggle('tts-word--active', active);
  el.classList.toggle('tts-word--done', done);
}

function clearWordHighlight() {
  document.getElementById('tts-display')?.querySelectorAll('.tts-word').forEach((el) => {
    el.classList.remove('tts-word--active', 'tts-word--done');
  });
}

function setPlaybackUi(active) {
  playing = active;
  const playBtn = document.getElementById('tts-play');
  const stopBtn = document.getElementById('tts-stop');
  const input = document.getElementById('tts-input');
  if (playBtn) playBtn.disabled = active;
  if (stopBtn) stopBtn.disabled = !active;
  if (input) input.disabled = active;
}

function showLoading(message) {
  if (!playing) return;

  const loading = document.getElementById('tts-loading');
  const msg = document.getElementById('tts-loading-message');
  const playBtn = document.getElementById('tts-play');
  const display = document.getElementById('tts-display');

  if (loading) loading.hidden = false;
  if (msg) msg.textContent = message;
  if (playBtn) playBtn.textContent = 'Loading…';
  if (display) display.classList.add('tts-display--loading');
  showStatus('');
}

function hideLoading() {
  const loading = document.getElementById('tts-loading');
  const playBtn = document.getElementById('tts-play');
  const display = document.getElementById('tts-display');

  if (loading) loading.hidden = true;
  if (playBtn) playBtn.textContent = '▶ Play';
  if (display) display.classList.remove('tts-display--loading');
}

function showStatus(message, { isError = false, isSuccess = false } = {}) {
  const status = document.getElementById('tts-status');
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

async function handlePlay() {
  if (playing || !rulesRef) return;

  const input = document.getElementById('tts-input');
  const text = input?.value.trim() || '';
  const words = tokenizeFonoraPhrase(text);

  if (!words.length) {
    showStatus('Enter Fonora text to play.', { isError: true });
    return;
  }

  if (looksLikePhonemeKeyText(text, rulesRef)) {
    showStatus('This looks like phoneme keys (dh a s a n…). Paste Fonora symbols from the Translator “Fonora spelling” field, or use Read in Reader.', { isError: true });
    return;
  }

  const piperVoice = document.getElementById('tts-piper-voice')?.value || 'en_US-lessac-medium';

  primeAudioContext();

  cancelRequested = false;
  setPlaybackUi(true);
  renderWordDisplay(text);
  clearWordHighlight();

  const needsLoad = !isPiperAudioReady(piperVoice);
  if (needsLoad) {
    showLoading('Preparing…');
  }

  try {
    const result = await speakFonoraPhrase(text, rulesRef, {
      piperVoice,
      shouldCancel: () => cancelRequested,
      onPrepare: (message) => {
        if (needsLoad || !isPiperAudioReady(piperVoice)) showLoading(message);
      },
      onWordStart: (index) => {
        hideLoading();
        highlightWord(index, { active: true });
      },
      onWordEnd: (index) => highlightWord(index, { active: false, done: true }),
    });

    hideLoading();
    if (result.cancelled) {
      showStatus('Stopped.');
      clearWordHighlight();
    } else if (result.skipped > 0) {
      showStatus(`Finished — ${result.spoken} spoken, ${result.skipped} skipped.`, { isError: true });
    } else {
      showStatus(`Finished — ${result.spoken} word${result.spoken === 1 ? '' : 's'}.`, { isSuccess: true });
    }
  } catch (err) {
    hideLoading();
    showStatus(err.message || String(err), { isError: true });
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
  const piperVoice = document.getElementById('tts-piper-voice')?.value || 'en_US-lessac-medium';
  initPiperAudio(piperVoice).catch(() => {});
}

export function loadReaderFromTranslation(symbols, wordSources) {
  const input = document.getElementById('tts-input');
  if (input) {
    input.value = symbols || '';
    renderWordDisplay(input.value);
  }
  if (wordSources) {
    setReaderWordSources(wordSources);
  }
  hideLoading();
  showStatus('');
}

export function setupFonoraReader(rules) {
  rulesRef = rules;
  populateDialectSelect();
  populatePiperVoiceSelect();
  hideLoading();
  warmReaderResources();

  document.getElementById('tts-piper-voice')?.addEventListener('change', warmReaderResources);

  const input = document.getElementById('tts-input');
  if (input && !input.value.trim()) {
    input.value = '';
  }

  renderWordDisplay(input?.value || '');

  input?.addEventListener('input', () => {
    if (!playing) renderWordDisplay(input.value);
  });

  document.getElementById('tts-play')?.addEventListener('click', handlePlay);
  document.getElementById('tts-stop')?.addEventListener('click', handleStop);

  document.getElementById('tts-normalize')?.addEventListener('click', () => {
    if (!input || playing) return;
    input.value = normalizeSymbolInput(input.value, rulesRef);
    renderWordDisplay(input.value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  document.getElementById('tts-backspace')?.addEventListener('click', () => {
    if (!input || playing) return;
    deleteSymbolBeforeCursor(input);
    renderWordDisplay(input.value);
  });
}
