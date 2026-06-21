import {
  MODIFIER_ROW_ORDER,
  GRID_PLACE_IDS,
  getPrimarySymbolEntries,
  formatVowelSoundExamples,
} from './symbol-compose.js';
import {
  loadLanguageRulesFromString,
  buildKeyboardMap,
  findGridCell,
  getQuizEntries,
  reverseLookup,
} from './rules.js';
import { setActiveLanguageRulesBundle } from './fonora-config.js';
import { registerIpaVowelMap, setActiveIpaVowelMap } from './ipa-normalize.js';
import { loadAlphabetOverrides } from './alphabet-overrides.js';
import { setupAlphabetLab } from './alphabet-lab.js';
import { normalizeSymbolInput, decodeSymbols, decodeText } from './decode.js';
import { encodeSounds } from './encode.js';
import { translateIpaWord, translateIpaPhrase } from './ipa-pipeline.js';
import { initEspeak, getEspeakInitError } from './ipa.js';
import { loadLanguagePreference, loadEnglishDialectPreference, saveLanguagePreference, saveEnglishDialectPreference, ENGLISH_DIALECT_OPTIONS } from './language-preferences.js';
import { loadGlossary, saveGlossary, migrateSampleGlossary, addGlossaryEntry, findDictionaryEntry, findDictionaryBySpelling } from './glossary.js';
import { escapeHtml, insertAtCursor, deleteSymbolBeforeCursor } from './utils.js';
import { setupEncoderTesting } from './encoder-testing.js';

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
      'Alphabet overrides active — language-rules.md provides defaults only; primaries come from your saved Alphabet experiment.';
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
        td.textContent = '—';
      } else {
        const ok = cell.status === 'defined';
        td.className = `grid-cell ${ok ? 'grid-cell--defined' : 'grid-cell--undefined'}`;
        td.innerHTML = `
          <div class="grid-cell-symbols symbol-text">${cell.symbols}</div>
          <div class="grid-cell-sound">${cell.sound}</div>
          <div class="grid-cell-ipa">${cell.ipa}</div>
          <div class="grid-cell-explanation">${cell.explanation}</div>
          ${ok ? '' : '<div class="grid-cell-status">undefined</div>'}`;
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
    const ok = cell.status === 'defined' || cell.status === 'experimental';
    tr.className = ok ? 'derived-row derived-row--defined' : 'derived-row derived-row--undefined';
    tr.innerHTML = columns(cell).join('');
    if (ok) bindInsertableRow(tr, cell.symbols);
    tbody.appendChild(tr);
  }
}

function renderWritingConventions() {
  const section = document.getElementById('writing-conventions-section');
  const tbody = document.getElementById('writing-conventions-body');
  const derived = rules.derivedSymbols || [];
  if (!section || !tbody) return;

  if (!derived.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  tbody.innerHTML = '';

  for (const row of derived) {
    const tr = document.createElement('tr');
    tr.className = 'derived-row derived-row--defined';
    tr.innerHTML = `
      <td class="symbol-text">${escapeHtml(row.symbol)}</td>
      <td>${escapeHtml(row.label)}</td>
      <td class="symbol-text">${escapeHtml(row.expandsTo || '—')}</td>
      <td>${escapeHtml(row.explanation)}</td>`;
    bindInsertableRow(tr, row.symbol);
    tbody.appendChild(tr);
  }
}

function renderExperimentalSections() {
  renderWritingConventions();
  renderDerivedTable('derived-sounds-section', 'derived-sounds-body', rules.specialDerivedSounds || [], (c) => [
    `<td class="symbol-text">${escapeHtml(c.symbols)}</td>`,
    `<td>${escapeHtml(c.sound)}</td>`,
    `<td>${escapeHtml(c.ipa)}</td>`,
    `<td>${escapeHtml(c.status)}</td>`,
    `<td>${escapeHtml(c.explanation)}</td>`,
  ]);

  renderDerivedTable('experimental-derived-section', 'experimental-derived-body', rules.experimentalDerivedSounds || [], (c) => [
    `<td class="symbol-text">${escapeHtml(c.symbols)}</td>`,
    `<td>${escapeHtml(c.sound)}</td>`,
    `<td>${escapeHtml(c.ipa)}</td>`,
    `<td><span class="draft-badge">Experimental</span></td>`,
    `<td>${escapeHtml(c.explanation)}</td>`,
  ]);

  const vowelSection = document.getElementById('experimental-vowels-section');
  const vowelsBody = document.getElementById('experimental-vowels-body');
  const lengthBody = document.getElementById('experimental-vowel-length-body');
  const examplesBody = document.getElementById('experimental-vowel-examples-body');
  const vowels = rules.experimentalVowels || [];

  if (!vowelSection || !vowelsBody || !vowels.length) {
    if (vowelSection) vowelSection.hidden = true;
  } else {
    vowelSection.hidden = false;

    vowelsBody.innerHTML = '';
    for (const cell of vowels) {
      const tr = document.createElement('tr');
      tr.className = 'derived-row derived-row--defined experimental-vowel-row';
      tr.innerHTML = `
        <td class="symbol-text">${escapeHtml(cell.symbols)}</td>
        <td>${escapeHtml(cell.vowel || cell.sound)}</td>
        <td>${escapeHtml(cell.description || cell.explanation || '')}</td>
        <td>${escapeHtml(cell.plane || '')} + ${escapeHtml(cell.component || '')}</td>
        <td>${escapeHtml(cell.ipa || '')}</td>
        <td>${escapeHtml(cell.approx || cell.notes || formatVowelSoundExamples(cell).join('; ') || '')}</td>`;
      bindInsertableRow(tr, cell.symbols);
      vowelsBody.appendChild(tr);
    }

    if (lengthBody) {
      const pairs = rules.experimentalVowelLengthPairs || [];
      lengthBody.innerHTML = pairs.length
        ? pairs
            .map(
              (row) =>
                `<tr>
                  <td>${escapeHtml(row.shortWord)}</td>
                  <td class="symbol-text">${escapeHtml(row.shortSpelling)}</td>
                  <td>${escapeHtml(row.longWord)}</td>
                  <td class="symbol-text">${escapeHtml(row.longSpelling)}</td>
                </tr>`,
            )
            .join('')
        : '<tr><td colspan="4"><em>No short/long vowel pairs defined.</em></td></tr>';
    }

    if (examplesBody) {
      const examples = rules.experimentalVowelExamples || [];
      examplesBody.innerHTML = examples.length
        ? examples.map((ex) => `<tr><td>${escapeHtml(ex.word)}</td><td class="symbol-text">${escapeHtml(ex.spelling)}</td></tr>`).join('')
        : '<tr><td colspan="2"><em>No examples in language rules.</em></td></tr>';
    }
  }
}

function updateDecodePanel() {
  const input = document.getElementById('symbol-input').value;
  const result = decodeText(input, rules);

  document.getElementById('decode-normalized').innerHTML = result.normalized
    ? `<span class="symbol-text">${escapeHtml(result.normalized)}</span>`
    : '<em>(empty)</em>';

  const groupsEl = document.getElementById('decode-groups');
  groupsEl.innerHTML = result.groups.length
    ? result.groups
        .map(
          (g) =>
            `<div class="decode-group"><span class="symbol-text">${escapeHtml(g.symbols)}</span> → ${escapeHtml(g.sound)} (${escapeHtml(g.ipa || '—')}) — ${escapeHtml(g.status)}${g.experimental ? ' <span class="draft-badge">Experimental</span>' : ''}</div>`
        )
        .join('')
    : '<em>(none)</em>';

  document.getElementById('decode-pronunciation').textContent = result.pronunciation || '(empty)';

  const warningsEl = document.getElementById('decode-warnings');
  warningsEl.innerHTML = result.warnings.length
    ? result.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')
    : '<em class="no-warnings">No warnings.</em>';
}

function formatIpaResult(result) {
  if (!result) return '';
  let html = '';
  if (result.source === 'dictionary') {
    html += '<span class="translate-badge translate-badge--dict">Dictionary override</span> ';
  } else {
    html += '<span class="translate-badge translate-badge--encoded">IPA Pipeline</span> ';
  }
  html += `<div class="encode-step"><strong>Original Text:</strong> ${escapeHtml(result.original || '')}</div>`;
  if (result.voice) {
    html += `<div class="encode-step"><strong>eSpeak Voice:</strong> <code>${escapeHtml(result.voice)}</code></div>`;
  }
  html += `<div class="encode-step"><strong>IPA Output:</strong> <code>${escapeHtml(result.ipa || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Normalized Fonora Phonemes:</strong> <code>${escapeHtml(result.normalizedPhonemes || result.normalized || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Decoded Back:</strong> <code>${escapeHtml(result.decoded || '')}</code></div>`;
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
  let wordApplyGeneration = 0;
  let phraseApplyGeneration = 0;

  document.querySelectorAll('.sub-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.subTab;
      document.querySelectorAll('.sub-tab-btn').forEach((b) => b.classList.toggle('sub-tab-btn--active', b.dataset.subTab === id));
      document.querySelectorAll('.sub-tab-panel').forEach((p) => {
        p.hidden = p.dataset.subTabPanel !== id;
        p.classList.toggle('sub-tab-panel--active', p.dataset.subTabPanel === id);
      });
    });
  });

  const wordInput = document.getElementById('word-translate-input');
  const wordOutput = document.getElementById('word-translate-output');
  const wordPron = document.getElementById('word-translate-pronunciation');
  const wordMeta = document.getElementById('word-translate-meta');
  const wordDetailsToggle = document.getElementById('word-translate-show-details');
  const wordDecode = document.getElementById('word-translate-decode');
  const wordActions = document.getElementById('word-translate-actions');
  const wordStatus = document.getElementById('word-translate-status');
  const wordLang = document.getElementById('word-translate-lang');
  const wordDialectWrap = document.getElementById('word-translate-dialect-wrap');
  const wordDialect = document.getElementById('word-translate-dialect');
  let wordDirty = false;

  wordLang.value = savedPrefs.lang;
  if (wordDialect) {
    wordDialect.innerHTML = ENGLISH_DIALECT_OPTIONS.map(
      (opt) => `<option value="${escapeHtml(opt.code)}">${escapeHtml(opt.label)}</option>`,
    ).join('');
    wordDialect.value = savedPrefs.englishDialect;
  }

  function syncWordDialectVisibility() {
    if (!wordDialectWrap) return;
    wordDialectWrap.hidden = wordLang.value !== 'en';
  }

  function englishPipelineOptions(lang, dialectEl) {
    if (lang !== 'en') return {};
    const dialect = dialectEl?.value;
    return dialect ? { englishDialect: dialect } : {};
  }

  syncWordDialectVisibility();

  function setWordStatus(message, isError = false) {
    if (!wordStatus) return;
    if (!message) {
      wordStatus.hidden = true;
      wordStatus.textContent = '';
      return;
    }
    wordStatus.hidden = false;
    wordStatus.textContent = message;
    wordStatus.className = isError ? 'translate-status translate-status--error' : 'translate-status';
  }

  renderSymbolButtons(document.getElementById('word-translate-keyboard'), wordOutput);
  attachKeyboardShortcuts(wordOutput);

  bindTranslateDetailsToggle(wordDetailsToggle, wordMeta);

  function refreshWordActions() {
    const english = wordInput.value.trim();
    wordActions.innerHTML = '';
    if (!english) return;
    renderDictionaryActions(wordActions, {
      english,
      languageSpelling: wordOutput.value,
      pronunciation: wordPron.value,
      notes: '',
    });
  }

  async function applyWord() {
    wordActions.innerHTML = '';
    const english = wordInput.value.trim();
    const generation = ++wordApplyGeneration;

    if (!english) {
      setTranslateDetails(wordMeta, wordDetailsToggle, '');
      setWordStatus('');
      if (!wordDirty) {
        wordOutput.value = '';
        wordPron.value = '';
      }
      wordDecode.textContent = '';
      return;
    }

    const lang = wordLang.value || 'en';
    const pipelineOptions = englishPipelineOptions(lang, wordDialect);

    try {
      setWordStatus('Loading IPA…');
      const result = await translateIpaWord(english, rules, lang, pipelineOptions);

      if (generation !== wordApplyGeneration) return;

      setTranslateDetails(wordMeta, wordDetailsToggle, formatIpaResult(result));
      setWordStatus('');

      if (!wordDirty) {
        wordOutput.value = result.symbols;
        wordPron.value = result.normalizedPhonemes || result.normalized || result.sounds || '';
      }

      const dec = decodeSymbols(wordOutput.value, rules);
      wordDecode.textContent = `Decodes to: ${dec.pronunciation || '(empty)'}`;
      refreshWordActions();
    } catch (err) {
      if (generation !== wordApplyGeneration) return;
      setWordStatus(err.message || 'IPA pipeline failed.', true);
      setTranslateDetails(wordMeta, wordDetailsToggle, `<div class="warning-item">${escapeHtml(err.message || 'IPA pipeline failed.')}</div>`);
    }
  }

  wordInput.addEventListener('input', () => {
    wordDirty = false;
    applyWord();
  });

  wordLang.addEventListener('change', () => {
    saveLanguagePreference(wordLang.value);
    phraseLang.value = wordLang.value;
    phraseDialectWrap.hidden = phraseLang.value !== 'en';
    syncWordDialectVisibility();
    wordDirty = false;
    applyWord();
  });

  wordDialect?.addEventListener('change', () => {
    saveEnglishDialectPreference(wordDialect.value);
    if (phraseDialect) phraseDialect.value = wordDialect.value;
    wordDirty = false;
    applyWord();
  });

  wordOutput.addEventListener('input', () => {
    wordDirty = true;
    wordPron.value = decodeSymbols(wordOutput.value, rules).pronunciation;
    wordDecode.textContent = `Decodes to: ${wordPron.value || '(empty)'}`;
    refreshWordActions();
  });

  wordPron.addEventListener('input', () => {
    wordOutput.value = encodeSounds(wordPron.value, rules).symbols;
    wordDirty = true;
    wordDecode.textContent = `Decodes to: ${wordPron.value || '(empty)'}`;
    refreshWordActions();
  });

  document.getElementById('word-translate-normalize').addEventListener('click', () => {
    wordOutput.value = normalizeSymbolInput(wordOutput.value, rules);
    wordOutput.dispatchEvent(new Event('input'));
  });

  document.getElementById('word-translate-backspace').addEventListener('click', () => {
    deleteSymbolBeforeCursor(wordOutput);
    wordDirty = true;
  });

  const phraseInput = document.getElementById('phrase-translate-input');
  const phraseOutput = document.getElementById('phrase-translate-output');
  const phraseMeta = document.getElementById('phrase-translate-meta');
  const phraseDetailsToggle = document.getElementById('phrase-translate-show-details');
  const phraseDecode = document.getElementById('phrase-translate-decode');
  const phraseLang = document.getElementById('phrase-translate-lang');
  const phraseDialectWrap = document.getElementById('phrase-translate-dialect-wrap');
  const phraseDialect = document.getElementById('phrase-translate-dialect');
  let phraseDirty = false;

  phraseLang.value = savedPrefs.lang;
  if (phraseDialect) {
    phraseDialect.innerHTML = ENGLISH_DIALECT_OPTIONS.map(
      (opt) => `<option value="${escapeHtml(opt.code)}">${escapeHtml(opt.label)}</option>`,
    ).join('');
    phraseDialect.value = savedPrefs.englishDialect;
    phraseDialectWrap.hidden = phraseLang.value !== 'en';
  }

  renderSymbolButtons(document.getElementById('phrase-translate-keyboard'), phraseOutput);
  attachKeyboardShortcuts(phraseOutput);

  bindTranslateDetailsToggle(phraseDetailsToggle, phraseMeta);

  async function applyPhrase() {
    const text = phraseInput.value.trim();
    const generation = ++phraseApplyGeneration;

    if (!text) {
      setTranslateDetails(phraseMeta, phraseDetailsToggle, '');
      if (!phraseDirty) phraseOutput.value = '';
      phraseDecode.textContent = '';
      return;
    }

    const lang = phraseLang.value || 'en';
    const pipelineOptions = englishPipelineOptions(lang, phraseDialect);

    try {
      const result = await translateIpaPhrase(text, rules, lang, pipelineOptions);

      if (generation !== phraseApplyGeneration) return;

      setTranslateDetails(phraseMeta, phraseDetailsToggle, formatIpaResult(result));
      if (!phraseDirty) phraseOutput.value = result.symbols;
      phraseDecode.textContent = `Decodes to: ${decodeText(phraseOutput.value, rules).pronunciation || '(empty)'}`;
    } catch (err) {
      if (generation !== phraseApplyGeneration) return;
      setTranslateDetails(phraseMeta, phraseDetailsToggle, `<div class="warning-item">${escapeHtml(err.message || 'IPA pipeline failed.')}</div>`);
    }
  }

  phraseInput.addEventListener('input', () => {
    phraseDirty = false;
    applyPhrase();
  });

  phraseLang.addEventListener('change', () => {
    saveLanguagePreference(phraseLang.value);
    wordLang.value = phraseLang.value;
    wordDialectWrap.hidden = wordLang.value !== 'en';
    phraseDialectWrap.hidden = phraseLang.value !== 'en';
    phraseDirty = false;
    applyPhrase();
  });

  phraseDialect?.addEventListener('change', () => {
    saveEnglishDialectPreference(phraseDialect.value);
    if (wordDialect) wordDialect.value = phraseDialect.value;
    phraseDirty = false;
    applyPhrase();
  });

  phraseOutput.addEventListener('input', () => {
    phraseDirty = true;
    phraseDecode.textContent = `Decodes to: ${decodeText(phraseOutput.value, rules).pronunciation || '(empty)'}`;
  });

  document.getElementById('phrase-translate-normalize').addEventListener('click', () => {
    phraseOutput.value = normalizeSymbolInput(phraseOutput.value, rules);
    phraseOutput.dispatchEvent(new Event('input'));
  });

  document.getElementById('phrase-translate-backspace').addEventListener('click', () => {
    deleteSymbolBeforeCursor(phraseOutput);
    phraseDirty = true;
  });

  const lookupEn = document.getElementById('lookup-en');
  const lookupLang = document.getElementById('lookup-lang');

  lookupEn.addEventListener('input', () => {
    const q = lookupEn.value.trim();
    const out = document.getElementById('lookup-en-result');
    if (!q) {
      out.innerHTML = '';
      return;
    }
    const match = findDictionaryEntry(q);
    out.innerHTML = match
      ? `<span class="translate-badge translate-badge--dict">Found</span> <span class="symbol-text">${escapeHtml(match.languageSpelling)}</span> <span class="translate-meta">(${escapeHtml(match.pronunciation)})</span>`
      : '<em>Not in dictionary.</em>';
  });

  lookupLang.addEventListener('input', () => {
    const q = normalizeSymbolInput(lookupLang.value.trim(), rules);
    const out = document.getElementById('lookup-lang-result');
    if (!q) {
      out.innerHTML = '';
      return;
    }
    const match = findDictionaryBySpelling(q);
    out.innerHTML = match
      ? `<span class="translate-badge translate-badge--dict">Found</span> ${escapeHtml(match.english)} <span class="translate-meta">(${escapeHtml(match.pronunciation)})</span>`
      : '<em>Not in dictionary.</em>';
  });
}

function renderDictionaryActions(container, data) {
  container.innerHTML = `
    <div class="translate-actions">
      <button type="button" class="btn btn--primary btn-add-dict">Add to dictionary</button>
      <button type="button" class="btn btn-edit-dict">Edit &amp; add</button>
    </div>`;
  container.querySelector('.btn-add-dict').addEventListener('click', () => {
    if (addGlossaryEntry(data)) {
      renderGlossaryList(document.getElementById('glossary-search').value);
      container.innerHTML = '<p class="translate-saved">Saved to dictionary.</p>';
    }
  });
  container.querySelector('.btn-edit-dict').addEventListener('click', () => prefillDictionaryForm(data));
}

function prefillDictionaryForm({ english, languageSpelling, pronunciation, notes }) {
  document.getElementById('dict-english').value = english ?? '';
  document.getElementById('dict-spelling').value = languageSpelling ?? '';
  document.getElementById('dict-pronunciation').value = pronunciation ?? '';
  document.getElementById('dict-notes').value = notes ?? '';
  showTab('dictionary');
}

function setupUtilityButtons() {
  const textarea = document.getElementById('symbol-input');
  document.getElementById('btn-clear').addEventListener('click', () => {
    textarea.value = '';
    textarea.dispatchEvent(new Event('input'));
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
    textarea.dispatchEvent(new Event('input'));
  });
  document.getElementById('btn-backspace').addEventListener('click', () => deleteSymbolBeforeCursor(textarea));
  textarea.addEventListener('input', updateDecodePanel);
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
              `<div class="reverse-result"><span class="symbol-text">${escapeHtml(m.symbols)}</span><span class="reverse-meta">${escapeHtml(m.sound)} · ${escapeHtml(m.ipa || '—')} · ${escapeHtml(m.explanation || '')}${m.experimental ? ' · experimental' : ''}</span></div>`
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

function isVowelQuizCell(cell) {
  return Boolean(cell.vowel) || (cell.experimental && /^⊐/.test(cell.symbols || ''));
}

function getQuizHintLines(cell) {
  const labelMap = buildSymbolLabelMap(rules);
  const symbols = cell.symbols || '';

  if (isVowelQuizCell(cell)) {
    const lines = [];
    for (const ch of symbols) {
      const label = labelMap[ch];
      if (label) lines.push({ symbol: ch, label });
    }
    const note = cell.notes || cell.explanation;
    if (note) lines.push({ symbol: symbols, label: note, vowelNote: true });
    return lines.length ? lines : [{ symbol: symbols, label: 'Experimental vowel' }];
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
              `<div class="quiz-hint"><span class="quiz-hint-symbol symbol-text">${escapeHtml(line.symbol)}</span><span class="quiz-hint-label">— ${escapeHtml(line.label)}</span></div>`,
          )
          .join('')
      : '<em class="quiz-hint-label">No component hints for this entry.</em>'
    : '';
}

function setupTestMode() {
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
  const vowelBadge = isVowelQuizCell(currentQuiz.cell)
    ? ' <span class="draft-badge">Experimental vowel</span>'
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

function setupDictionary() {
  migrateSampleGlossary();
  renderGlossaryList();
  document.getElementById('glossary-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addGlossaryEntry({
      english: document.getElementById('dict-english').value.trim(),
      languageSpelling: document.getElementById('dict-spelling').value.trim(),
      pronunciation: document.getElementById('dict-pronunciation').value.trim(),
      notes: document.getElementById('dict-notes').value.trim(),
    });
    e.target.reset();
    renderGlossaryList(document.getElementById('glossary-search').value);
  });
  document.getElementById('glossary-search').addEventListener('input', (e) => renderGlossaryList(e.target.value));
}

function renderGlossaryList(filter = '') {
  const list = document.getElementById('glossary-list');
  const q = filter.toLowerCase();
  const filtered = loadGlossary().filter((e) => !q || [e.english, e.languageSpelling, e.pronunciation, e.notes].join(' ').toLowerCase().includes(q));
  list.innerHTML = filtered.length
    ? filtered
        .map(
          (e) => `
      <div class="glossary-entry">
        <div class="glossary-entry-main"><strong>${escapeHtml(e.english)}</strong> → <span class="symbol-text glossary-spelling">${escapeHtml(e.languageSpelling)}</span> <span class="glossary-pron">(${escapeHtml(e.pronunciation)})</span></div>
        ${e.notes ? `<div class="glossary-notes">${escapeHtml(e.notes)}</div>` : ''}
        <button type="button" class="btn btn--small btn-delete" data-id="${escapeHtml(e.id)}">Delete</button>
      </div>`
        )
        .join('')
    : '<em>No entries.</em>';

  list.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveGlossary(loadGlossary().filter((e) => e.id !== btn.dataset.id));
      renderGlossaryList(document.getElementById('glossary-search').value);
    });
  });
}

const MORE_TAB_IDS = new Set(['keyboard', 'mapping', 'dictionary', 'decode', 'reverse', 'encoder-testing']);

function closeNavDropdown() {
  const dropdown = document.getElementById('nav-more');
  const menu = document.getElementById('nav-more-menu');
  const trigger = document.getElementById('nav-more-trigger');
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.remove('nav-dropdown--open');
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function openNavDropdown() {
  const dropdown = document.getElementById('nav-more');
  const menu = document.getElementById('nav-more-menu');
  const trigger = document.getElementById('nav-more-trigger');
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.add('nav-dropdown--open');
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

function showTab(tabId) {
  document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('tab-btn--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const dropdown = document.getElementById('nav-more');
  if (dropdown) {
    dropdown.classList.toggle('nav-dropdown--child-active', MORE_TAB_IDS.has(tabId));
  }

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabId;
    panel.classList.toggle('tab-panel--active', panel.dataset.tabPanel === tabId);
  });

  closeNavDropdown();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  const trigger = document.getElementById('nav-more-trigger');
  const dropdown = document.getElementById('nav-more');
  if (trigger && dropdown) {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (dropdown.classList.contains('nav-dropdown--open')) {
        closeNavDropdown();
      } else {
        openNavDropdown();
      }
    });

    document.addEventListener('click', (event) => {
      if (!dropdown.contains(event.target)) {
        closeNavDropdown();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNavDropdown();
      }
    });
  }
}

/** @type {Record<string, string>} — primary symbols from language-rules.md before overrides */
let markdownPrimarySymbols = {};

async function initApp() {
  let loaded;
  try {
    const res = await fetch('language-rules.md');
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
  renderKeyboardSection();
  renderSoundGrid();
  renderExperimentalSections();
  setupUtilityButtons();
  setupReverseLookup();
  setupTestMode();
  setupDictionary();
  setupEncoderTesting(rules);
  setupTranslator();
  updateDecodePanel();
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

initApp();
