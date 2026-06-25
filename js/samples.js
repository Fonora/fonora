import { translateIpaPhrase } from './ipa-pipeline.js';
import { escapeHtml } from './utils.js';
import { speakFonoraPhrase, cancelSpeech, setReaderWordSources, tokenizeFonoraPhrase } from './fonora-tts.js';
import { initEspeak, getEspeakInitError } from './ipa.js';
import { primeAudioContext } from './espeak-audio.js';
import { DEFAULT_ENGLISH_VOICE } from './language-preferences.js';
import { getSamplePlaybackPlan } from './piper-audio.js';

/** Split CJK samples into phrases for Fonora rendering and word-by-word playback. */
function splitCjkClauses(text, lang) {
  const pattern =
    lang === 'zh'
      ? /(?<=[。！？；，])/u
      : /(?<=[。！？])/u;
  return String(text || '')
    .split(pattern)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

async function translateSampleText(text, rules, lang) {
  const pipelineOptions = { englishDialect: DEFAULT_ENGLISH_VOICE };
  if (lang !== 'ja' && lang !== 'zh') {
    return translateIpaPhrase(text, rules, lang, pipelineOptions);
  }

  const clauses = splitCjkClauses(text, lang);
  const phraseResults = [];
  for (const clause of clauses) {
    phraseResults.push(await translateIpaPhrase(clause, rules, lang, pipelineOptions));
  }

  return {
    original: text,
    lang,
    symbols: phraseResults.map((r) => r.symbols).join(' '),
    clauses,
    words: phraseResults.flatMap((r) => r.words || []),
    warnings: phraseResults.flatMap((r) => r.warnings || []),
    source: phraseResults.some((r) => r.source === 'fallback') ? 'fallback' : 'ipa',
  };
}

/** Public-domain excerpts, Universal Declaration of Human Rights, Article 1. */
const SAMPLES = [
  {
    id: 'en',
    language: 'English',
    lang: 'en',
    experimental: false,
    source: 'Universal Declaration of Human Rights, Article 1',
    text:
      'All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood.',
  },
  {
    id: 'es',
    language: 'Spanish',
    lang: 'es',
    experimental: true,
    source: 'Declaración Universal de los Derechos Humanos, Artículo 1',
    text:
      'Todas las personas nacen libres e iguales en dignidad y derechos y, dotadas como están de razón y conciencia, deben comportarse fraternalmente los unos con los otros.',
  },
  {
    id: 'fr',
    language: 'French',
    lang: 'fr',
    experimental: true,
    source: 'Déclaration universelle des droits de l’homme, Article 1',
    text:
      'Tous les êtres humains naissent libres et égaux en dignité et en droits. Ils sont doués de raison et de conscience et doivent agir les uns envers les autres dans un esprit de fraternité.',
  },
  {
    id: 'de',
    language: 'German',
    lang: 'de',
    experimental: true,
    source: 'Allgemeine Erklärung der Menschenrechte, Artikel 1',
    text:
      'Alle Menschen sind frei und gleich an Würde und Rechten geboren. Sie sind mit Vernunft und Gewissen begabt und sollen einander im Geist der Brüderlichkeit begegnen.',
  },
  {
    id: 'ja',
    language: 'Japanese',
    lang: 'ja',
    experimental: true,
    audioEnabled: false,
    source: '世界人権宣言、第1条',
    text:
      'すべての人間は、生まれながらにして自由であり、かつ、尊厳と権利とについて平等である。人間は、理性と良心とを授けられており、互いに同胞の精神をもって行動しなければならない。',
  },
  {
    id: 'ar',
    language: 'Arabic',
    lang: 'ar',
    experimental: true,
    dir: 'rtl',
    source: 'الإعلان العالمي لحقوق الإنسان، المادة 1',
    text:
      'يولد جميع الناس أحرارًا متساوين في الكرامة والحقوق. وقد وهبوا عقلاً وضميرًا، وعليهم أن يعامل بعضهم بعضًا بروح الإخاء.',
  },
  {
    id: 'zh',
    language: 'Mandarin',
    lang: 'zh',
    experimental: true,
    source: '《世界人权宣言》第一条',
    text: '人人生而自由，在尊严和权利上一律平等。他们赋有理性和良心，并应以兄弟关系的精神相对待。',
  },
];

/** @type {Map<string, { symbols: string, words: object[] }>} */
const sampleResults = new Map();

let rulesRef = null;
let loadPromise = null;
let loadedForRules = null;
let playingId = null;
let cancelPlayback = false;
let samplesUiReady = false;

function playbackEngineLabel(sample) {
  if (sample.audioEnabled === false) return '';
  return 'Neural voice';
}

function renderSampleAudioControls(sample) {
  if (sample.audioEnabled === false) {
    return `
        <button type="button" class="btn btn--secondary sample-audio-btn sample-audio-btn--disabled" disabled aria-label="${escapeHtml(sample.language)} audio coming soon">Audio coming soon</button>`;
  }

  const engineLabel = playbackEngineLabel(sample);
  return `
        <button type="button" class="btn btn--primary sample-audio-btn" data-sample-play="${escapeHtml(sample.id)}" disabled aria-label="Listen to ${escapeHtml(sample.language)} Fonora sample">▶ Listen</button>
        <span class="sample-audio-engine">${escapeHtml(engineLabel)}</span>
        <span class="sample-audio-status" id="sample-${escapeHtml(sample.id)}-status" hidden role="status"></span>`;
}

function bindSamplesUi() {
  if (samplesUiReady) return;
  samplesUiReady = true;

  document.addEventListener('click', (event) => {
    const playBtn = event.target.closest('[data-sample-play]');
    if (!playBtn || playBtn.disabled) return;
    if (playingId === playBtn.dataset.samplePlay) {
      stopSamplePlayback();
      return;
    }
    playSample(playBtn.dataset.samplePlay);
  });
}

function getSampleFonoraElements(sampleId) {
  const elements = [];
  const pageEl = document.getElementById(`sample-${sampleId}-fonora`);
  if (pageEl) elements.push(pageEl);
  if (sampleId === 'en') {
    const homeEl = document.getElementById('home-sample-fonora');
    if (homeEl) elements.push(homeEl);
  }
  return elements;
}

function getAudioStatusElements(sampleId) {
  const elements = [];
  const pageEl = document.getElementById(`sample-${sampleId}-status`);
  if (pageEl) elements.push(pageEl);
  if (sampleId === 'en') {
    const homeEl = document.getElementById('home-sample-status');
    if (homeEl) elements.push(homeEl);
  }
  return elements;
}

function renderSampleCards(listEl) {
  listEl.innerHTML = SAMPLES.map(renderSampleCard).join('');
}

function renderSampleCard(sample) {
  const dirAttr = sample.dir ? ` dir="${sample.dir}"` : '';
  const renderingLabel = sample.experimental
    ? 'Experimental phonetic rendering'
    : 'Fonora phonetic rendering';

  return `
    <article class="sample-card" id="sample-${escapeHtml(sample.id)}" aria-labelledby="sample-${escapeHtml(sample.id)}-lang">
      <header class="sample-card__header">
        <h3 class="sample-card__lang" id="sample-${escapeHtml(sample.id)}-lang">${escapeHtml(sample.language)}</h3>
        <p class="sample-card__source">${escapeHtml(sample.source)}</p>
      </header>

      <div class="sample-card__block">
        <h4 class="sample-card__label">Original text</h4>
        <p class="sample-card__original"${dirAttr}>${escapeHtml(sample.text)}</p>
      </div>

      <div class="sample-card__block">
        <h4 class="sample-card__label">${escapeHtml(renderingLabel)}</h4>
        <div class="sample-card__fonora symbol-text" id="sample-${escapeHtml(sample.id)}-fonora" aria-live="polite">
          <span class="sample-loading">Generating Fonora rendering…</span>
        </div>
        <p class="sample-card__meta" id="sample-${escapeHtml(sample.id)}-meta" hidden></p>
      </div>

      <div class="sample-card__audio">
${renderSampleAudioControls(sample)}
      </div>
    </article>`;
}

function setFonoraOutput(sampleId, html, meta = '') {
  for (const fonoraEl of getSampleFonoraElements(sampleId)) {
    fonoraEl.innerHTML = html;
  }
  const metaEl = document.getElementById(`sample-${sampleId}-meta`);
  if (metaEl) {
    if (meta) {
      metaEl.hidden = false;
      metaEl.textContent = meta;
    } else {
      metaEl.hidden = true;
      metaEl.textContent = '';
    }
  }
}

function renderFonoraWords(sampleId, symbols) {
  const words = tokenizeFonoraPhrase(symbols);
  const html = words
    .map((word, index) => `<span class="tts-word" data-index="${index}">${escapeHtml(word)}</span>`)
    .join(' ');
  for (const fonoraEl of getSampleFonoraElements(sampleId)) {
    fonoraEl.innerHTML = html;
  }
}

function highlightSampleWord(sampleId, index, { active = false, done = false } = {}) {
  for (const fonoraEl of getSampleFonoraElements(sampleId)) {
    const el = fonoraEl.querySelector(`.tts-word[data-index="${index}"]`);
    if (!el) continue;
    el.classList.toggle('tts-word--active', active);
    el.classList.toggle('tts-word--done', done);
  }
}

function clearSampleWordHighlight(sampleId) {
  for (const fonoraEl of getSampleFonoraElements(sampleId)) {
    fonoraEl.querySelectorAll('.tts-word').forEach((el) => {
      el.classList.remove('tts-word--active', 'tts-word--done');
    });
  }
}

function setSampleFonoraPlaybackState(sampleId, { loading = false } = {}) {
  for (const fonoraEl of getSampleFonoraElements(sampleId)) {
    fonoraEl.classList.toggle('sample-card__fonora--loading', loading);
    fonoraEl.classList.toggle('home-sample-preview__fonora--loading', loading);
  }
}

function resetPlayButtons() {
  document.querySelectorAll('[data-sample-play]').forEach((btn) => {
    const sample = SAMPLES.find((item) => item.id === btn.dataset.samplePlay);
    const ready = sample?.audioEnabled !== false && sampleResults.has(btn.dataset.samplePlay);
    btn.disabled = !ready;
    btn.textContent = '▶ Listen';
  });
}

function setPlayButtonsLocked(locked, activeId = null) {
  document.querySelectorAll('[data-sample-play]').forEach((btn) => {
    const sample = SAMPLES.find((item) => item.id === btn.dataset.samplePlay);
    if (sample?.audioEnabled === false) return;
    const isActive = btn.dataset.samplePlay === activeId;
    if (locked && isActive) {
      btn.disabled = false;
      return;
    }
    btn.disabled = locked || !sampleResults.has(btn.dataset.samplePlay);
  });
}

function setAudioStatus(sampleId, message, { isError = false } = {}) {
  for (const el of getAudioStatusElements(sampleId)) {
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'sample-audio-status';
      continue;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = `sample-audio-status${isError ? ' sample-audio-status--error' : ''}`;
  }
}

async function renderSampleFonora(sample, rules) {
  try {
    const result = await translateSampleText(sample.text, rules, sample.lang);

    if (!result?.symbols) {
      setFonoraOutput(sample.id, '<span class="sample-error">No Fonora output generated.</span>');
      return;
    }

    sampleResults.set(sample.id, {
      symbols: result.symbols,
      words: result.words || [],
      clauses: result.clauses || null,
    });

    const hasFallback = result.source === 'fallback' || (result.warnings?.length ?? 0) > 0;
    const metaParts = [];
    if (sample.experimental) {
      metaParts.push('Non-English mappings are experimental and may change.');
    }
    if (sample.lang === 'ja') {
      metaParts.push('Japanese audio playback is not available yet, Fonora phonetic read-aloud requires a compatible neural voice.');
    }
    if (sample.lang === 'zh') {
      metaParts.push('Chinese is rendered in phrases (not one block) for clearer playback and highlighting.');
    }
    if (sample.audioEnabled !== false) {
      metaParts.push('Playback uses neural voices and reads recovered Fonora phonetics.');
    }
    if (hasFallback) {
      metaParts.push('Some sounds could not be mapped and appear as fallback symbols.');
    }

    setFonoraOutput(sample.id, '', metaParts.join(' '));
    renderFonoraWords(sample.id, result.symbols);

    const playBtns = document.querySelectorAll(`[data-sample-play="${sample.id}"]`);
    for (const playBtn of playBtns) {
      if (sample.audioEnabled !== false) playBtn.disabled = false;
    }
  } catch (err) {
    setFonoraOutput(
      sample.id,
      `<span class="sample-error">${escapeHtml(err.message || 'Fonora rendering failed.')}</span>`,
    );
  }
}

async function loadAllSamples(rules) {
  const espeak = await initEspeak();
  if (!espeak.ok) {
    const message = getEspeakInitError() || espeak.error || 'IPA pipeline unavailable.';
    for (const sample of SAMPLES) {
      setFonoraOutput(sample.id, `<span class="sample-error">${escapeHtml(message)}</span>`);
    }
    return;
  }

  for (const sample of SAMPLES) {
    await renderSampleFonora(sample, rules);
  }
}

async function playSample(sampleId) {
  if (!rulesRef || playingId) return;

  const sample = SAMPLES.find((item) => item.id === sampleId);
  const data = sampleResults.get(sampleId);
  if (!sample || sample.audioEnabled === false || !data?.symbols) return;

  const plan = getSamplePlaybackPlan(sample.lang);
  if (!plan) return;
  const playBtns = document.querySelectorAll(`[data-sample-play="${sampleId}"]`);

  playingId = sampleId;
  cancelPlayback = false;
  setPlayButtonsLocked(true, sampleId);
  for (const playBtn of playBtns) playBtn.textContent = 'Loading…';
  setAudioStatus(sampleId, '');

  try {
    await primeAudioContext();
    clearSampleWordHighlight(sampleId);
    setSampleFonoraPlaybackState(sampleId, { loading: true });
    for (const playBtn of playBtns) playBtn.textContent = '■ Stop';

    let result;
    setReaderWordSources(data.words);
    result = await speakFonoraPhrase(data.symbols, rulesRef, {
      engine: 'piper',
      piperVoice: plan.piperVoice,
      shouldCancel: () => cancelPlayback,
      onPrepare: (message) => setAudioStatus(sampleId, message),
      onWordStart: (index) => {
        setSampleFonoraPlaybackState(sampleId, { loading: false });
        highlightSampleWord(sampleId, index, { active: true });
      },
      onWordEnd: (index) => highlightSampleWord(sampleId, index, { active: false, done: true }),
    });
    if (!cancelPlayback) {
      const suffix = result.skipped > 0 ? ` (${result.skipped} word${result.skipped === 1 ? '' : 's'} skipped)` : '';
      setAudioStatus(sampleId, `Playback complete${suffix}.`);
    } else {
      clearSampleWordHighlight(sampleId);
    }
  } catch (err) {
    clearSampleWordHighlight(sampleId);
    setAudioStatus(sampleId, err.message || 'Playback failed.', { isError: true });
  } finally {
    setSampleFonoraPlaybackState(sampleId, { loading: false });
    playingId = null;
    cancelPlayback = false;
    resetPlayButtons();
  }
}

function stopSamplePlayback() {
  if (!playingId) return;
  const id = playingId;
  cancelPlayback = true;
  cancelSpeech();
  setAudioStatus(id, '');
  clearSampleWordHighlight(id);
  setSampleFonoraPlaybackState(id, { loading: false });
  playingId = null;
  resetPlayButtons();
}

export function ensureSamplesLoaded() {
  if (!rulesRef) return Promise.resolve();
  if (loadPromise && loadedForRules === rulesRef) return loadPromise;
  loadedForRules = rulesRef;
  loadPromise = loadAllSamples(rulesRef);
  return loadPromise;
}

function getEnglishSample() {
  return SAMPLES.find((item) => item.id === 'en');
}

async function loadHomeSample(rules) {
  const sample = getEnglishSample();
  const originalEl = document.getElementById('home-sample-original');
  const sourceEl = document.getElementById('home-sample-source');
  const fonoraEl = document.getElementById('home-sample-fonora');
  if (!sample || !fonoraEl) return;

  if (originalEl) originalEl.textContent = sample.text;
  if (sourceEl) sourceEl.textContent = sample.source;

  const espeak = await initEspeak();
  if (!espeak.ok) {
    const message = getEspeakInitError() || espeak.error || 'IPA pipeline unavailable.';
    fonoraEl.innerHTML = `<span class="sample-error">${escapeHtml(message)}</span>`;
    return;
  }

  await renderSampleFonora(sample, rules);
}

export function setupHomeSample(rules) {
  rulesRef = rules;
  bindSamplesUi();
  if (!document.getElementById('home-sample-fonora')) return;
  loadHomeSample(rules);
}

export function setupSamples(rules) {
  rulesRef = rules;
  const listEl = document.getElementById('samples-list');
  if (!listEl) return;

  renderSampleCards(listEl);
  bindSamplesUi();
  loadPromise = null;
  loadedForRules = null;
  sampleResults.clear();

  if (window.location.hash === '#samples') {
    ensureSamplesLoaded();
  }
}
