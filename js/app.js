import {
  MODIFIER_ROW_ORDER,
  loadRules,
  buildKeyboardMap,
  findGridCell,
  getQuizEntries,
  reverseLookup,
} from './rules.js';
import { normalizeSymbolInput, decodeSymbols, decodeText } from './decode.js';
import { encodeSounds, translateEnglishWord, translateEnglishPhrase } from './encode.js';
import { translateIpaWord, translateIpaPhrase } from './ipa-pipeline.js';
import { initEspeak, getEspeakInitError } from './ipa.js';
import {
  ENCODER_MODES,
  loadEncoderPreferences,
  saveEncoderPreferences,
} from './encoder-mode.js';
import { loadGlossary, saveGlossary, migrateSampleGlossary, addGlossaryEntry, findDictionaryEntry, findDictionaryBySpelling } from './glossary.js';
import { escapeHtml, insertAtCursor, deleteSymbolBeforeCursor } from './utils.js';
import { runTests } from './tests.js';
import { setupEncoderTesting } from './encoder-testing.js';

let rules = null;
let usingFallback = false;
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
  if (banner) banner.hidden = !usingFallback;
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

  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Manner</th>';
  for (const place of rules.places) {
    const th = document.createElement('th');
    th.textContent = place.label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  const labels = { plain: 'Plain', voice: 'Voice', friction: 'Friction', nasal: 'Nasal', glide: 'Glide' };

  for (const modId of MODIFIER_ROW_ORDER) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th>${labels[modId] || modId}</th>`;
    for (const place of rules.places) {
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

function renderExperimentalSections() {
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
  const collapsedBody = document.getElementById('experimental-vowel-collapsed-body');
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
        <td>${escapeHtml(cell.ipa || '')}</td>
        <td>${escapeHtml(cell.notes || cell.explanation || '')}</td>`;
      bindInsertableRow(tr, cell.symbols);
      vowelsBody.appendChild(tr);
    }

    if (collapsedBody) {
      const collapsed = rules.experimentalVowelCollapsed || [];
      collapsedBody.innerHTML = collapsed.length
        ? collapsed
            .map(
              (row) =>
                `<tr><td>${escapeHtml(row.sound)}</td><td class="symbol-text">${escapeHtml(row.symbols)}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="2"><em>Long vowels map to the same symbols as short vowels.</em></td></tr>';
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

function formatLegacyResult(result) {
  if (!result) return '';
  let html = '';
  if (result.source === 'dictionary') {
    html += '<span class="translate-badge translate-badge--dict">Dictionary override</span> ';
  } else {
    html += '<span class="translate-badge translate-badge--encoded">Legacy Encoder</span> ';
  }
  html += `<div class="encode-step"><strong>Original Text:</strong> ${escapeHtml(result.original || result.english || '')}</div>`;
  if (result.cleaned) {
    html += `<div class="encode-step"><strong>Cleaned:</strong> <code>${escapeHtml(result.cleaned)}</code></div>`;
  }
  const pronunciationForm = result.pronunciationForm ?? result.phonetic;
  if (result.pronunciationActions?.length) {
    html += `<div class="encode-step"><strong>Pronunciation rules:</strong><ul class="encode-list">${result.pronunciationActions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div>`;
  } else if (result.actions?.length && !result.conversionActions?.length) {
    html += `<div class="encode-step"><strong>Pronunciation rules:</strong><ul class="encode-list">${result.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div>`;
  }
  if (pronunciationForm) {
    html += `<div class="encode-step"><strong>Normalized sound form:</strong> <code>${escapeHtml(pronunciationForm)}</code></div>`;
  }
  html += `<div class="encode-step"><strong>Normalized Fonora Phonemes:</strong> <code>${escapeHtml(result.soundUnits || result.normalized || result.sounds || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Fonora Symbols:</strong> <span class="symbol-text">${escapeHtml(result.symbols || '')}</span></div>`;
  if (result.decoded) {
    html += `<div class="encode-step"><strong>Decoded Back:</strong> <code>${escapeHtml(result.decoded)}</code></div>`;
  }
  if (result.warnings?.length) {
    html += `<div class="encode-step"><strong>Warnings:</strong>${result.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>`;
  }
  return html;
}

function formatIpaResult(result) {
  if (!result) return '';
  let html = '<span class="translate-badge translate-badge--encoded">IPA Pipeline</span> ';
  html += `<div class="encode-step"><strong>Original Text:</strong> ${escapeHtml(result.original || '')}</div>`;
  html += `<div class="encode-step"><strong>IPA Output:</strong> <code>${escapeHtml(result.ipa || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Normalized Fonora Phonemes:</strong> <code>${escapeHtml(result.normalizedPhonemes || result.normalized || '')}</code></div>`;
  html += `<div class="encode-step"><strong>Fonora Symbols:</strong> <span class="symbol-text">${escapeHtml(result.symbols || '')}</span></div>`;
  html += `<div class="encode-step"><strong>Decoded Back:</strong> <code>${escapeHtml(result.decoded || '')}</code></div>`;
  if (result.warnings?.length) {
    html += `<div class="encode-step"><strong>Warnings:</strong>${result.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>`;
  }
  return html;
}

function formatComparePanel(ipaResult, legacyResult) {
  if (!ipaResult && !legacyResult) return '';
  const row = (label, ipaVal, legacyVal) =>
    `<tr><th>${escapeHtml(label)}</th><td><code>${escapeHtml(ipaVal || '—')}</code></td><td><code>${escapeHtml(legacyVal || '—')}</code></td></tr>`;
  return `
    <div class="encode-compare-panel">
      <strong>Compare with Legacy</strong>
      <table class="encode-compare-table">
        <thead><tr><th></th><th>IPA</th><th>Legacy</th></tr></thead>
        <tbody>
          ${row('Pronunciation', ipaResult?.ipa || ipaResult?.normalizedPhonemes, legacyResult?.normalized || legacyResult?.sounds)}
          ${row('Fonora', ipaResult?.symbols, legacyResult?.symbols)}
          ${row('Decoded', ipaResult?.decoded, legacyResult?.decoded)}
          ${row('Warnings', (ipaResult?.warnings || []).join('; '), (legacyResult?.warnings || []).join('; '))}
        </tbody>
      </table>
    </div>`;
}

function formatEncodeResult(result, mode = ENCODER_MODES.IPA) {
  if (!result) return '';
  if (mode === ENCODER_MODES.LEGACY || result.encoderMode === ENCODER_MODES.LEGACY) {
    return formatLegacyResult(result);
  }
  return formatIpaResult(result);
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
  const prefs = loadEncoderPreferences();
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
  const wordCompareLegacy = document.getElementById('word-compare-legacy');
  let wordDirty = false;

  wordLang.value = prefs.lang || 'en';
  wordCompareLegacy.checked = prefs.compareLegacy;
  document.querySelector(`input[name="word-encoder-mode"][value="${prefs.mode}"]`)?.click();

  function getWordEncoderMode() {
    return document.querySelector('input[name="word-encoder-mode"]:checked')?.value || ENCODER_MODES.IPA;
  }

  function persistWordPrefs() {
    saveEncoderPreferences({
      mode: getWordEncoderMode(),
      compareLegacy: wordCompareLegacy.checked,
      lang: wordLang.value,
    });
  }

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

    const mode = getWordEncoderMode();
    const lang = wordLang.value || 'en';
    const compare = wordCompareLegacy.checked;

    try {
      setWordStatus(mode === ENCODER_MODES.IPA ? 'Loading IPA…' : 'Encoding…');
      let result;
      let legacyResult = null;

      if (mode === ENCODER_MODES.LEGACY) {
        result = translateEnglishWord(english, rules);
      } else {
        result = await translateIpaWord(english, rules, lang);
        if (compare) legacyResult = translateEnglishWord(english, rules);
      }

      if (generation !== wordApplyGeneration) return;

      let details = formatEncodeResult(result, mode);
      if (compare && mode === ENCODER_MODES.IPA) {
        details += formatComparePanel(result, legacyResult);
      }
      setTranslateDetails(wordMeta, wordDetailsToggle, details);
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
    persistWordPrefs();
    wordDirty = false;
    applyWord();
  });

  document.querySelectorAll('input[name="word-encoder-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      persistWordPrefs();
      wordDirty = false;
      applyWord();
    });
  });

  wordCompareLegacy.addEventListener('change', () => {
    persistWordPrefs();
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
  const phraseCompareLegacy = document.getElementById('phrase-compare-legacy');
  const phraseHint = document.getElementById('phrase-encode-hint');
  let phraseDirty = false;

  phraseLang.value = prefs.lang || 'en';
  phraseCompareLegacy.checked = prefs.compareLegacy;
  document.querySelector(`input[name="phrase-encoder-mode"][value="${prefs.mode}"]`)?.click();

  function getPhraseEncoderMode() {
    return document.querySelector('input[name="phrase-encoder-mode"]:checked')?.value || ENCODER_MODES.IPA;
  }

  function updatePhraseHint() {
    if (!phraseHint) return;
    phraseHint.textContent =
      getPhraseEncoderMode() === ENCODER_MODES.LEGACY
        ? 'Phrase mode uses the Legacy Encoder (English spelling rules) word-by-word.'
        : 'Phrase mode translates word-by-word via the IPA pipeline. Switch to Legacy Encoder for English spelling rules.';
  }

  renderSymbolButtons(document.getElementById('phrase-translate-keyboard'), phraseOutput);
  attachKeyboardShortcuts(phraseOutput);

  bindTranslateDetailsToggle(phraseDetailsToggle, phraseMeta);
  updatePhraseHint();

  async function applyPhrase() {
    const text = phraseInput.value.trim();
    const generation = ++phraseApplyGeneration;

    if (!text) {
      setTranslateDetails(phraseMeta, phraseDetailsToggle, '');
      if (!phraseDirty) phraseOutput.value = '';
      phraseDecode.textContent = '';
      return;
    }

    const mode = getPhraseEncoderMode();
    const lang = phraseLang.value || 'en';

    try {
      let result;
      let legacyResult = null;

      if (mode === ENCODER_MODES.LEGACY) {
        result = translateEnglishPhrase(text, rules);
      } else {
        result = await translateIpaPhrase(text, rules, lang);
        if (phraseCompareLegacy.checked) legacyResult = translateEnglishPhrase(text, rules);
      }

      if (generation !== phraseApplyGeneration) return;

      let details = formatEncodeResult(result, mode);
      if (phraseCompareLegacy.checked && mode === ENCODER_MODES.IPA) {
        details += formatComparePanel(result, legacyResult);
      }
      setTranslateDetails(phraseMeta, phraseDetailsToggle, details);
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
    saveEncoderPreferences({
      mode: getPhraseEncoderMode(),
      compareLegacy: phraseCompareLegacy.checked,
      lang: phraseLang.value,
    });
    wordLang.value = phraseLang.value;
    phraseDirty = false;
    applyPhrase();
  });

  document.querySelectorAll('input[name="phrase-encoder-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      saveEncoderPreferences({
        mode: getPhraseEncoderMode(),
        compareLegacy: phraseCompareLegacy.checked,
        lang: phraseLang.value,
      });
      document.querySelector(`input[name="word-encoder-mode"][value="${getPhraseEncoderMode()}"]`)?.click();
      updatePhraseHint();
      phraseDirty = false;
      applyPhrase();
    });
  });

  phraseCompareLegacy.addEventListener('change', () => {
    saveEncoderPreferences({
      mode: getPhraseEncoderMode(),
      compareLegacy: phraseCompareLegacy.checked,
      lang: phraseLang.value,
    });
    wordCompareLegacy.checked = phraseCompareLegacy.checked;
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

function showTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('tab-btn--active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabId;
    panel.classList.toggle('tab-panel--active', panel.dataset.tabPanel === tabId);
  });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
}

async function initApp() {
  const loaded = await loadRules();
  rules = loaded.rules;
  usingFallback = loaded.usingFallback;

  showFallbackBanner();
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
    const { passed, total, failed } = runTests();
    console.log(`Fonora tests: ${passed}/${total} passed`);
    if (failed.length) console.table(failed);
  }
}

initApp();
