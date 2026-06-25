import {
  MODIFIER_ROW_ORDER,
  GRID_PLACE_IDS,
  getPrimarySymbolEntries,
  modifierSymbol,
} from './symbol-compose.js';
import {
  getVowelEntries,
  soundGridVowelRowHtml,
  findVowelForCell,
  isVowelQuizCell,
} from './vowel-display.js';
import {
  loadLanguageRulesFromString,
  buildKeyboardMap,
  findGridCell,
  getQuizEntries,
  reverseLookup,
} from './rules.js';
import { setActiveLanguageRulesBundle, LANGUAGE_RULES_PATH } from './fonora-config.js';
import { registerIpaVowelMap, setActiveIpaVowelMap, registerConsonantMapFromRules } from './ipa-normalize.js';
import { loadAlphabetOverrides } from './alphabet-overrides.js';
import { setupAlphabetLab } from './alphabet-lab.js';
import { normalizeSymbolInput, decodeToPhonemeKeys } from './decode.js';
import { encodeSounds } from './encode.js';
import { translateIpaPhrase } from './ipa-pipeline.js';
import { initEspeak, getEspeakInitError } from './ipa.js';
import { loadLanguagePreference, loadEnglishDialectPreference, saveLanguagePreference, saveEnglishDialectPreference, ENGLISH_DIALECT_OPTIONS } from './language-preferences.js';
import { escapeHtml, insertAtCursor, deleteSymbolBeforeCursor } from './utils.js';
import { setupEncoderTesting } from './encoder-testing.js';
import { setupPronunciationValidation } from './pronunciation-validation-ui.js';
import { setupFonoraReader, loadReaderFromTranslation } from './fonora-tts-ui.js';
import { setupBreakdown, prefillBreakdownFromWordSources } from './breakdown-ui.js';
import { setupSamples, setupHomeSample, ensureSamplesLoaded } from './samples.js';
import { setupOpenProblems } from './open-problems-ui.js';
import { setupDocsViewer, onDocsTabActivated, loadDocViewer } from './docs-viewer-ui.js';
import { openDocViewer, DEFAULT_DOC_PATH, docViewerHref, isDocsRoute } from './doc-urls.js';
import { initUniversalNav, setActiveTab, setNavContext, setFonoranAuth, closeNavDropdown, MORE_TAB_IDS } from './universal-nav.js';
import { setReaderWordSources } from './fonora-tts.js';

let rules = null;
let usingFallback = false;
/** @type {string | null} */
let markdownSource = null;
const quizStats = { attempts: 0, correct: 0 };
let currentQuiz = null;

function renderSymbolButtons(container, textarea) {
  if (!container || !textarea) return;
  container.innerHTML = '';
  const allKeys = [
    ...rules.places.map((p) => ({ symbol: p.symbol, label: p.label, type: 'place' })),
    ...rules.modifiers.map((m) => ({ symbol: m.symbol, label: m.label, type: 'modifier' })),
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
  const map = buildKeyboardMap(rules);
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

function showFallbackBanner() {
  const banner = document.getElementById('fallback-banner');
  if (!banner) return;
  banner.hidden = !usingFallback && !window.__fonoraAlphabetActive;
}

function updateAlphabetBanner(active) {
  window.__fonoraAlphabetActive = active;
  const banner = document.getElementById('fallback-banner');
  if (!banner || usingFallback) return;
  if (active) {
    banner.hidden = false;
    banner.textContent =
      'Alphabet overrides active. language-rules.md provides defaults only; primaries come from your saved Alphabet experiment.';
  } else {
    banner.hidden = true;
  }
}

function renderKeyboardSection() {
  const textarea = document.getElementById('symbol-input');
  renderSymbolButtons(document.getElementById('symbol-buttons'), textarea);
  attachKeyboardShortcuts(textarea);

  const mappingBody = document.getElementById('keyboard-mapping-body');
  mappingBody.innerHTML = '';
  const rows = [
    ...rules.places.map((p) => ({ num: p.keyNumber, letter: p.keyLetter, symbol: p.symbol, label: p.label, kind: 'Place' })),
    ...rules.modifiers.map((m) => ({ num: m.keyNumber, letter: m.keyLetter, symbol: m.symbol, label: m.label, kind: 'Modifier' })),
  ].sort((a, b) => a.num - b.num);

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.num}</td><td>${row.letter}</td><td class="symbol-text">${row.symbol}</td><td>${row.label}</td><td>${row.kind}</td>`;
    mappingBody.appendChild(tr);
  }
}

function bindInsertableRow(tr, symbols) {
  tr.tabIndex = 0;
  tr.setAttribute('role', 'button');
  tr.title = `Insert ${symbols}`;
  const insert = () => insertAtCursor(document.getElementById('symbol-input'), symbols);
  tr.addEventListener('click', insert);
  tr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      insert();
    }
  });
}

const HOME_MANNER_ROWS = [
  { id: 'voice', label: 'Voice' },
  { id: 'friction', label: 'Friction' },
  { id: 'nasal', label: 'Nasal' },
  { id: 'glide', label: 'Glide', note: 'X → Y transition' },
];

function renderHomeSymbolCard({ symbol, label, note, kind }) {
  const glyph = symbol
    ? `<span class="home-symbol-glyph symbol-text" aria-hidden="true">${escapeHtml(symbol)}</span>`
    : '<span class="home-symbol-glyph home-symbol-glyph--empty" aria-hidden="true">-<//span>';
  const noteHtml = note ? `<span class="home-symbol-note">${escapeHtml(note)}</span>` : '';
  return `
    <div class="home-symbol-card home-symbol-card--${kind}" role="listitem">
      ${glyph}
      <span class="home-symbol-label">${escapeHtml(label)}</span>
      ${noteHtml}
    </div>`;
}

function renderHomeHowItWorks() {
  const placesEl = document.getElementById('home-places');
  const modifiersEl = document.getElementById('home-modifiers');
  if (!placesEl || !modifiersEl || !rules) return;

  const gridPlaces = rules.places.filter((p) => GRID_PLACE_IDS.includes(p.id));

  placesEl.innerHTML = gridPlaces
    .map((place) =>
      renderHomeSymbolCard({
        symbol: place.symbol,
        label: place.label,
        kind: 'place',
      }),
    )
    .join('');

  modifiersEl.innerHTML = HOME_MANNER_ROWS.map(({ id, label, note }) =>
    renderHomeSymbolCard({
      symbol: modifierSymbol(rules.modifiers, id),
      label,
      note,
      kind: 'manner',
    }),
  ).join('');
}

function renderSoundGrid() {
  const thead = document.getElementById('sound-grid-head');
  const tbody = document.getElementById('sound-grid-body');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const gridPlaces = rules.places.filter((p) => GRID_PLACE_IDS.includes(p.id));

  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Manner</th>';
  for (const place of gridPlaces) {
    const th = document.createElement('th');
    th.innerHTML = `<span class="symbol-text">${escapeHtml(place.symbol)}</span> ${escapeHtml(place.label)}`;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  const labels = { plain: 'Plain', voice: 'Voice', friction: 'Friction', nasal: 'Nasal', glide: 'Glide' };

  for (const modId of MODIFIER_ROW_ORDER) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th>${labels[modId] || modId}</th>`;
    for (const place of gridPlaces) {
      const cell = findGridCell(rules, modId, place.id);
      const td = document.createElement('td');
      if (!cell) {
        td.className = 'grid-cell grid-cell--empty';
        td.textContent = '-';
      } else {
        const ok = cell.status === 'defined';
        const statusClass =
          cell.status === 'reserved'
            ? 'grid-cell--reserved'
            : ok
              ? 'grid-cell--defined'
              : 'grid-cell--undefined';
        td.className = `grid-cell ${statusClass}`;
        td.innerHTML = `
          <div class="grid-cell-symbols symbol-text">${cell.symbols}</div>
          <div class="grid-cell-sound">${cell.sound}</div>
          <div class="grid-cell-ipa">${cell.ipa}</div>
          <div class="grid-cell-explanation">${cell.explanation}</div>
          ${ok ? '' : `<div class="grid-cell-status">${escapeHtml(cell.status || 'undefined')}</div>`}`;
        if (ok) {
          td.tabIndex = 0;
          td.setAttribute('role', 'button');
          td.addEventListener('click', () => insertAtCursor(document.getElementById('symbol-input'), cell.symbols));
        }
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function formatDerivedStatus(status) {
  if (status === 'experimental') return '<span class="draft-badge">Experimental</span>';
  if (status === 'reserved') return '<span class="draft-badge draft-badge--reserved">Reserved</span>';
  return escapeHtml(status || '');
}

function getDerivedDisplayEntries() {
  return [
    ...(rules.derivedSounds || []),
    ...(rules.experimentalDerivedSounds || []),
    ...(rules.reservedDerivedSounds || []),
  ];
}

function renderDerivedTable(sectionId, bodyId, entries, columns) {
  const section = document.getElementById(sectionId);
  const tbody = document.getElementById(bodyId);
  if (!section || !tbody) return;

  if (!entries.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  tbody.innerHTML = '';

  for (const cell of entries) {
    const tr = document.createElement('tr');
    const insertable = cell.status === 'defined' || cell.status === 'experimental';
    tr.className = insertable
      ? 'derived-row derived-row--defined'
      : cell.status === 'reserved'
        ? 'derived-row derived-row--reserved'
        : 'derived-row derived-row--undefined';
    tr.innerHTML = columns(cell).join('');
    if (insertable) bindInsertableRow(tr, cell.symbols);
    tbody.appendChild(tr);
  }
}

function renderSupplementalSoundTables() {
  renderDerivedTable('derived-sounds-section', 'derived-sounds-body', getDerivedDisplayEntries(), (c) => [
    `<td class="symbol-text">${escapeHtml(c.symbols)}</td>`,
    `<td>${escapeHtml(c.sound)}</td>`,
    `<td>${escapeHtml(c.ipa)}</td>`,
    `<td>${formatDerivedStatus(c.status)}</td>`,
    `<td>${escapeHtml(c.explanation)}</td>`,
  ]);

  const vowelSection = document.getElementById('vowels-section');
  const vowelsBody = document.getElementById('vowels-body');
  const vowels = getVowelEntries(rules);

  if (!vowelSection || !vowelsBody || !vowels.length) {
    if (vowelSection) vowelSection.hidden = true;
  } else {
    vowelSection.hidden = false;

    vowelsBody.innerHTML = '';
    for (const cell of vowels) {
      const tr = document.createElement('tr');
      tr.className = 'derived-row derived-row--defined vowel-table-row';
      tr.innerHTML = soundGridVowelRowHtml(cell, escapeHtml).join('');
      bindInsertableRow(tr, cell.symbols);
      vowelsBody.appendChild(tr);
    }
  }
}

function setupUtilityButtons() {
  const textarea = document.getElementById('symbol-input');
  document.getElementById('btn-clear').addEventListener('click', () => {
    textarea.value = '';
  });
  document.getElementById('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
    } catch {
      textarea.select();
      document.execCommand('copy');
    }
  });
  document.getElementById('btn-normalize').addEventListener('click', () => {
    textarea.value = normalizeSymbolInput(textarea.value, rules);
  });
  document.getElementById('btn-backspace').addEventListener('click', () => deleteSymbolBeforeCursor(textarea));
}

function formatIpaResult(result) {
  if (!result) return '';
  let html = '';

  if (result.words?.length > 1) {
    html += '<span class="translate-badge translate-badge--encoded">IPA Pipeline</span> ';
    html += `<div class="encode-step"><strong>Original Text:</strong> ${escapeHtml(result.original || '')}</div>`;
    if (result.voice) {
      html += `<div class="encode-step"><strong>eSpeak Voice:</strong> <code>${escapeHtml(result.voice)}</code></div>`;
    }
    html += `<div class="encode-step"><strong>Combined IPA:</strong> <code>${escapeHtml(result.ipa || '')}</code></div>`;
    html += `<div class="encode-step"><strong>Combined Fonora Phonemes:</strong> <code>${escapeHtml(result.normalizedPhonemes || '')}</code></div>`;
    html += `<div class="encode-step"><strong>Recovered Phoneme Keys:</strong> <code>${escapeHtml(result.decoded || '')}</code></div>`;
    html += '<div class="encode-step"><strong>Per word:</strong></div>';
    for (const word of result.words) {
      html += `<div class="encode-step translate-result--nested">`;
      html += `<strong>${escapeHtml(word.original || word.input || '')}</strong>`;
      html += `<div>IPA: <code>${escapeHtml(word.ipa || '')}</code></div>`;
      html += `<div>Phonemes: <code>${escapeHtml(word.normalizedPhonemes || '')}</code></div>`;
      html += `</div>`;
    }
    if (result.warnings?.length) {
      html += `<div class="encode-step"><strong>Warnings:</strong>${result.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>`;
    }
    return html;
  }

  html += '<span class="translate-badge translate-badge--encoded">IPA Pipeline</span> ';
  html += `<div class="encode-step"><strong>Original Text:</strong> ${escapeHtml(result.original || '')}</div>`;
  if (result.voice) {
    html += `<div class="encode-step"><strong>eSpeak Voice:</strong> <code>${escapeHtml(result.voice)}</code></div>`;
  }
  html += `<div class="encode-step"><strong>IPA Output:</strong> <code>${escapeHtml(result.ipa || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Normalized Fonora Phonemes:</strong> <code>${escapeHtml(result.normalizedPhonemes || result.normalized || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Recovered Phoneme Keys:</strong> <code>${escapeHtml(result.decoded || '')}</code></div>`;
  if (result.warnings?.length) {
    html += `<div class="encode-step"><strong>Warnings:</strong>${result.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>`;
  }
  return html;
}

function setTranslateDetails(metaEl, toggleEl, html) {
  metaEl.innerHTML = html || '<em class="translate-meta-empty">Type to see encoding details.</em>';
  metaEl.hidden = !toggleEl.checked;
}

function bindTranslateDetailsToggle(toggleEl, metaEl) {
  toggleEl.addEventListener('change', () => {
    metaEl.hidden = !toggleEl.checked;
  });
}

function setupTranslator() {
  const savedPrefs = { lang: loadLanguagePreference(), englishDialect: loadEnglishDialectPreference() };
  let applyGeneration = 0;
  let outputDirty = false;
  let lastTranslateWords = null;

  const inputEl = document.getElementById('translate-input');
  const outputEl = document.getElementById('translate-output');
  const pronEl = document.getElementById('translate-pronunciation');
  const metaEl = document.getElementById('translate-meta');
  const detailsToggle = document.getElementById('translate-show-details');
  const decodeEl = document.getElementById('translate-decode');
  const statusEl = document.getElementById('translate-status');
  const langEl = document.getElementById('translate-lang');
  const dialectWrap = document.getElementById('translate-dialect-wrap');
  const dialectEl = document.getElementById('translate-dialect');

  langEl.value = savedPrefs.lang;
  if (dialectEl) {
    dialectEl.innerHTML = ENGLISH_DIALECT_OPTIONS.map(
      (opt) => `<option value="${escapeHtml(opt.code)}">${escapeHtml(opt.label)}</option>`,
    ).join('');
    dialectEl.value = savedPrefs.englishDialect;
  }

  function syncDialectVisibility() {
    if (!dialectWrap) return;
    dialectWrap.hidden = langEl.value !== 'en';
  }

  function englishPipelineOptions() {
    if (langEl.value !== 'en') return {};
    const dialect = dialectEl?.value;
    return dialect ? { englishDialect: dialect } : {};
  }

  syncDialectVisibility();

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = isError ? 'translate-status translate-status--error' : 'translate-status';
  }

  function isSingleWord(text) {
    return text.trim().split(/\s+/).filter(Boolean).length === 1;
  }

  function refreshDecodePreview() {
    const keys = decodeToPhonemeKeys(outputEl.value, rules).phonemeKeys;
    decodeEl.textContent = `Recovered phoneme keys: ${keys || '(empty)'}`;
  }

  renderSymbolButtons(document.getElementById('translate-keyboard'), outputEl);
  attachKeyboardShortcuts(outputEl);
  bindTranslateDetailsToggle(detailsToggle, metaEl);

  async function applyTranslate() {
    const text = inputEl.value.trim();
    const generation = ++applyGeneration;

    if (!text) {
      setTranslateDetails(metaEl, detailsToggle, '');
      setStatus('');
      if (!outputDirty) {
        outputEl.value = '';
        pronEl.value = '';
      }
      decodeEl.textContent = '';
      return;
    }

    const lang = langEl.value || 'en';
    const pipelineOptions = englishPipelineOptions();

    try {
      setStatus('Loading IPA…');
      const result = await translateIpaPhrase(text, rules, lang, pipelineOptions);

      if (generation !== applyGeneration) return;

      const detailResult = result.words?.length === 1 ? result.words[0] : result;
      setTranslateDetails(metaEl, detailsToggle, formatIpaResult(detailResult));
      setStatus('');

      if (!outputDirty) {
        outputEl.value = result.symbols;
        pronEl.value = result.normalizedPhonemes || '';
      }

      lastTranslateWords = result.words || null;
      setReaderWordSources(lastTranslateWords);

      refreshDecodePreview();
    } catch (err) {
      if (generation !== applyGeneration) return;
      setStatus(err.message || 'IPA pipeline failed.', true);
      setTranslateDetails(metaEl, detailsToggle, `<div class="warning-item">${escapeHtml(err.message || 'IPA pipeline failed.')}</div>`);
    }
  }

  inputEl.addEventListener('input', () => {
    outputDirty = false;
    applyTranslate();
  });

  langEl.addEventListener('change', () => {
    saveLanguagePreference(langEl.value);
    syncDialectVisibility();
    outputDirty = false;
    applyTranslate();
  });

  dialectEl?.addEventListener('change', () => {
    saveEnglishDialectPreference(dialectEl.value);
    outputDirty = false;
    applyTranslate();
  });

  outputEl.addEventListener('input', () => {
    outputDirty = true;
    if (isSingleWord(inputEl.value)) {
      pronEl.value = decodeToPhonemeKeys(outputEl.value, rules).phonemeKeys;
    }
    refreshDecodePreview();
  });

  pronEl.addEventListener('input', () => {
    if (!isSingleWord(inputEl.value)) return;
    outputEl.value = encodeSounds(pronEl.value, rules).symbols;
    outputDirty = true;
    refreshDecodePreview();
  });

  document.getElementById('translate-normalize').addEventListener('click', () => {
    outputEl.value = normalizeSymbolInput(outputEl.value, rules);
    outputEl.dispatchEvent(new Event('input'));
  });

  document.getElementById('translate-backspace').addEventListener('click', () => {
    deleteSymbolBeforeCursor(outputEl);
    outputDirty = true;
  });

  document.getElementById('translate-read-in-reader')?.addEventListener('click', () => {
    const symbols = outputEl.value.trim();
    if (!symbols) {
      setStatus('Translate some text first.', true);
      return;
    }
    loadReaderFromTranslation(symbols, lastTranslateWords, langEl.value);
    showTab('reader');
  });
}

function setupReverseLookup() {
  const input = document.getElementById('reverse-input');
  const output = document.getElementById('reverse-output');
  const run = () => {
    const matches = reverseLookup(input.value, rules);
    output.innerHTML = matches
      ? matches
          .map(
            (m) =>
              `<div class="reverse-result"><span class="symbol-text">${escapeHtml(m.symbols)}</span><span class="reverse-meta">${escapeHtml(m.sound)} · ${escapeHtml(m.ipa || '-')} · ${escapeHtml(m.explanation || '')}${m.experimental ? ' · experimental' : ''}</span></div>`
          )
          .join('')
      : '<em>No defined mapping for this sound.</em>';
  };
  input.addEventListener('input', run);
  document.getElementById('reverse-btn').addEventListener('click', run);
}

function buildSymbolLabelMap(r) {
  const map = {};
  for (const p of r.places) map[p.symbol] = p.label;
  for (const m of r.modifiers) map[m.symbol] = m.label;
  return map;
}

function getQuizHintLines(cell) {
  const labelMap = buildSymbolLabelMap(rules);
  const symbols = cell.symbols || '';
  const vowelDef = findVowelForCell(rules, cell);

  if (vowelDef || isVowelQuizCell(rules, cell)) {
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

function setupTestMode() {
  const constructInput = document.getElementById('quiz-answer-construct');
  renderSymbolButtons(document.getElementById('quiz-keyboard'), constructInput);
  attachKeyboardShortcuts(constructInput);
  document.getElementById('quiz-normalize')?.addEventListener('click', () => {
    constructInput.value = normalizeSymbolInput(constructInput.value, rules);
  });
  document.getElementById('quiz-backspace')?.addEventListener('click', () => {
    deleteSymbolBeforeCursor(constructInput);
  });

  document.querySelectorAll('[name="quiz-type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) startQuiz(radio.value);
    });
  });
  document.getElementById('quiz-show-hints')?.addEventListener('change', updateQuizHints);
  document.getElementById('quiz-check').addEventListener('click', checkQuizAnswer);
  document.getElementById('quiz-next').addEventListener('click', () => {
    startQuiz(document.querySelector('[name="quiz-type"]:checked')?.value || 'decode');
  });
  startQuiz('decode');
  updateQuizStats();
}

function pickRandomQuizCell() {
  const cells = getQuizEntries(rules);
  return cells[Math.floor(Math.random() * cells.length)];
}

function startQuiz(type) {
  currentQuiz = { type, cell: pickRandomQuizCell(), answered: false };
  document.getElementById('quiz-feedback').textContent = '';
  document.getElementById('quiz-answer-decode').value = '';
  document.getElementById('quiz-answer-construct').value = '';
  const decodeAnswer = document.getElementById('quiz-decode-answer');
  const constructAnswer = document.getElementById('quiz-construct-answer');
  const vowelBadge = isVowelQuizCell(rules, currentQuiz.cell)
    ? ' <span class="draft-badge">Vowel</span>'
    : '';
  if (type === 'decode') {
    document.getElementById('quiz-prompt').innerHTML =
      `<span class="symbol-text">${escapeHtml(currentQuiz.cell.symbols)}</span>${vowelBadge}`;
    decodeAnswer.hidden = false;
    constructAnswer.hidden = true;
  } else {
    document.getElementById('quiz-prompt').innerHTML =
      `${escapeHtml(currentQuiz.cell.sound)}${vowelBadge}`;
    decodeAnswer.hidden = true;
    constructAnswer.hidden = false;
  }
  updateQuizHints();
}

function checkQuizAnswer() {
  if (!currentQuiz || currentQuiz.answered) return;
  let correct = false;
  if (currentQuiz.type === 'decode') {
    correct = document.getElementById('quiz-answer-decode').value.trim() === currentQuiz.cell.sound;
  } else {
    correct = normalizeSymbolInput(document.getElementById('quiz-answer-construct').value, rules) === currentQuiz.cell.symbols;
  }
  quizStats.attempts++;
  if (correct) quizStats.correct++;
  currentQuiz.answered = true;
  updateQuizStats();
  const fb = document.getElementById('quiz-feedback');
  fb.className = correct ? 'quiz-feedback quiz-feedback--ok' : 'quiz-feedback quiz-feedback--miss';
  fb.innerHTML = correct
    ? 'Correct.'
    : currentQuiz.type === 'decode'
      ? `Expected: ${currentQuiz.cell.sound}`
      : `Expected: <span class="symbol-text">${escapeHtml(currentQuiz.cell.symbols)}</span>`;
}

function updateQuizStats() {
  const acc = quizStats.attempts ? Math.round((quizStats.correct / quizStats.attempts) * 100) : 0;
  document.getElementById('quiz-stats').textContent = `Attempts: ${quizStats.attempts} · Correct: ${quizStats.correct} · Accuracy: ${acc}%`;
}

function getTabFromHash() {
  if (isDocsRoute()) return 'docs';
  const id = window.location.hash.replace(/^#/, '');
  if (id === 'about') return 'platform';
  if (id === 'home') return 'home';
  if (id) {
    const panel = document.querySelector(`[data-tab-panel="${id}"]`);
    if (panel) return id;
  }
  return 'platform';
}

function isPlatformTab(tabId) {
  return tabId === 'platform' || tabId === 'open-problems' || tabId === 'docs';
}

function setHashForTab(tabId) {
  const base = window.location.pathname;
  if (tabId === 'platform') {
    const next = `${base}#about`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      history.replaceState(null, '', next);
    }
    return;
  }
  const hash = tabId === 'home' ? '#home' : `#${tabId}`;
  if (tabId === 'docs') {
    if (isDocsRoute()) return;
    const next = docViewerHref(DEFAULT_DOC_PATH);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      history.replaceState(null, '', next);
    }
    return;
  }
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== `${base}${hash}`) {
    history.replaceState(null, '', `${base}${hash}`);
  }
}

function syncAppHeaderOffset() {
  const header = document.getElementById('app-header-root');
  if (!header) return;
  const bottom = Math.ceil(header.getBoundingClientRect().bottom);
  document.documentElement.style.setProperty('--app-header-offset', `${bottom}px`);
}

let appHeaderOffsetObserver = null;

function ensureAppHeaderOffsetObserver() {
  const header = document.getElementById('app-header-root');
  if (!header) return;
  syncAppHeaderOffset();
  if (appHeaderOffsetObserver) return;
  appHeaderOffsetObserver = new ResizeObserver(() => syncAppHeaderOffset());
  appHeaderOffsetObserver.observe(header);
  window.addEventListener('resize', syncAppHeaderOffset);
}

function showTab(tabId) {
  const previousTab = document.querySelector('.tab-panel--active')?.dataset.tabPanel;
  const platform = isPlatformTab(tabId);

  document.documentElement.setAttribute('data-fonora-nav', platform ? 'platform' : 'script');
  document.documentElement.setAttribute('data-fonora-tab', tabId);

  setNavContext(platform ? 'platform' : 'script');
  setActiveTab(tabId);

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabId;
    panel.classList.toggle('tab-panel--active', panel.dataset.tabPanel === tabId);
  });

  setHashForTab(tabId);
  closeNavDropdown();

  if (previousTab !== tabId) {
    window.scrollTo(0, 0);
  }

  if (tabId === 'samples') {
    ensureSamplesLoaded().catch(() => {});
  }

  if (tabId === 'breakdown') {
    const input = document.getElementById('breakdown-input');
    if (input && !input.value.trim()) {
      prefillBreakdownFromWordSources();
    }
  }

  if (tabId === 'docs') {
    onDocsTabActivated();
  }

  requestAnimationFrame(syncAppHeaderOffset);
}

window.showTab = showTab;
window.openDocViewer = openDocViewer;

function setupTabs() {
  document.querySelectorAll('main [data-tab], .home-page [data-tab], .platform-home [data-tab]').forEach((el) => {
    el.addEventListener('click', (event) => {
      if (el.tagName === 'A') event.preventDefault();
      const docPath = el.getAttribute('data-doc-path');
      if (docPath && el.dataset.tab === 'docs') {
        openDocViewer(docPath);
        loadDocViewer(docPath).catch(() => {});
      }
      showTab(el.dataset.tab);
    });
  });

  const header = document.getElementById('app-header-root');
  header?.addEventListener('universal-nav:tab', (event) => {
    const { tab } = event.detail;
    if (tab === 'docs') {
      openDocViewer('docs/platform-overview.md');
      loadDocViewer('docs/platform-overview.md').catch(() => {});
    }
    showTab(tab);
  });

  header?.addEventListener('universal-nav:platform-tab', (event) => {
    const { tab } = event.detail;
    if (tab === 'docs') {
      openDocViewer('docs/platform-overview.md');
      loadDocViewer('docs/platform-overview.md').catch(() => {});
    }
    showTab(tab);
  });

  header?.addEventListener('universal-nav:sign-out', () => {
    signOut();
  });

  refreshAuth();
  handleAuthUrlErrors();

  window.addEventListener('hashchange', () => showTab(getTabFromHash()));
  window.addEventListener('popstate', () => showTab(getTabFromHash()));
  showTab(getTabFromHash());
}

/** @type {Record<string, string>}, primary symbols from language-rules.md before overrides */
let markdownPrimarySymbols = {};

async function initApp() {
  let loaded;
  try {
    const res = await fetch(LANGUAGE_RULES_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    markdownSource = await res.text();
    const baseBundle = loadLanguageRulesFromString(markdownSource, { primaryOverrides: {} });
    markdownPrimarySymbols = Object.fromEntries(
      getPrimarySymbolEntries(baseBundle.rules).map((e) => [e.id, e.symbol]),
    );
    loaded = loadLanguageRulesFromString(markdownSource, {
      primaryOverrides: loadAlphabetOverrides(),
    });
    loaded.usingFallback = false;
    loaded.loadError = null;
  } catch (err) {
    loaded = {
      rules: null,
      usingFallback: true,
      loadError: err instanceof Error ? err.message : String(err),
    };
  }

  applyRulesBundle(loaded);
}

function applyRulesBundle(loaded) {
  rules = loaded.rules;
  usingFallback = loaded.usingFallback ?? false;

  if (loaded.rules) {
    setActiveLanguageRulesBundle(loaded);
    registerIpaVowelMap(loaded.ipaVowelMode, loaded.ipaVowelMap);
    setActiveIpaVowelMap(loaded.ipaVowelMap);
    registerConsonantMapFromRules(loaded.rules);
  } else {
    const banner = document.getElementById('fallback-banner');
    if (banner) {
      banner.hidden = false;
      banner.textContent = `Could not load language-rules.md: ${loaded.loadError || 'unknown error'}. Check that the dev server is running.`;
    }
    return;
  }

  showFallbackBanner();
  updateAlphabetBanner(loaded.symbolsFromOverrides);
  setupTabs();
  renderHomeHowItWorks();
  renderKeyboardSection();
  renderSoundGrid();
  renderSupplementalSoundTables();
  setupUtilityButtons();
  setupReverseLookup();
  setupTestMode();
  setupEncoderTesting(rules);
  setupPronunciationValidation(rules);
  setupFonoraReader(rules);
  setupBreakdown(rules);
  setupSamples(rules);
  setupHomeSample(rules);
  setupOpenProblems();
  setupDocsViewer();
  const ttsInput = document.getElementById('tts-input');
  if (ttsInput) {
    renderSymbolButtons(document.getElementById('tts-keyboard'), ttsInput);
    attachKeyboardShortcuts(ttsInput);
  }
  setupTranslator();
  setupAlphabetLab({
    getRules: () => rules,
    getMarkdownPrimarySymbols: () => markdownPrimarySymbols,
    onApplyOverrides: (overrides) => {
      if (!markdownSource) return;
      const bundle = loadLanguageRulesFromString(markdownSource, { primaryOverrides: overrides });
      applyRulesBundle(bundle);
      updateAlphabetBanner(Object.keys(overrides).length > 0);
    },
  });

  initEspeak().then((result) => {
    if (!result.ok) {
      const banner = document.getElementById('fallback-banner');
      if (banner) {
        banner.hidden = false;
        banner.textContent = `eSpeak NG failed to load: ${getEspeakInitError() || result.error}. IPA pipeline unavailable.`;
      }
    }
  });

  if (new URLSearchParams(window.location.search).has('test')) {
    import('./tests-core.js').then(({ runTests }) => {
      const { passed, total, failed } = runTests({ bundle: loaded });
      console.log(`Fonora tests: ${passed}/${total} passed`);
      if (failed.length) console.table(failed);
    });
  }
}

function authReturnPath() {
  const path = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  return `${path}${search}${hash}` || '/';
}

async function refreshAuth() {
  try {
    const returnTo = authReturnPath();
    const res = await fetch(`/auth/session?returnTo=${encodeURIComponent(returnTo)}`, { credentials: 'include' });
    const data = await res.json();
    setFonoranAuth({
      required: Boolean(data.authRequired),
      authenticated: Boolean(data.authenticated),
      email: data.email ?? null,
      loginUrl: data.loginUrl ?? '/auth/google',
    });
  } catch {
    setFonoranAuth({ required: false, authenticated: true, email: null });
  }
}

async function signOut() {
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  await refreshAuth();
}

function handleAuthUrlErrors() {
  const params = new URLSearchParams(window.location.search);
  const err = params.get('auth_error');
  if (!err) return;
  params.delete('auth_error');
  params.delete('email');
  const next = params.toString();
  const clean = `${window.location.pathname}${window.location.hash}${next ? `?${next}` : ''}`;
  history.replaceState(null, '', clean);
}

function bootstrapShell() {
  const initialTab = getTabFromHash();
  initUniversalNav({
    context: isPlatformTab(initialTab) ? 'platform' : 'script',
    activeTab: initialTab,
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const active = panel.dataset.tabPanel === initialTab;
    panel.hidden = !active;
    panel.classList.toggle('tab-panel--active', active);
  });
  ensureAppHeaderOffsetObserver();
}

bootstrapShell();
initApp();
