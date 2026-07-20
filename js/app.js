import {
  MODIFIER_ROW_ORDER,
  GRID_PLACE_IDS,
  modifierSymbol,
} from './symbol-compose.js';
import {
  getSoundGridVowelGroups,
  soundGridVowelRowHtml,
} from './vowel-display.js';
import { notifyFonoraTabChange } from './fonora-keyboard-ui.js';
import {
  setupScriptWriting,
  onScriptWritingTabActivated,
} from './fonora-script-writing.js';
import {
  setupScriptReadingWords,
  onScriptReadingTabActivated,
} from './fonora-script-reading.js';
import {
  setupScriptSounds,
  onScriptSoundsTabActivated,
} from './fonora-script-sounds-practice.js';
import {
  setupFonoranReading,
  onFonoranReadingTabActivated,
} from './fonoran-reading-practice.js';
import {
  setupFonoranWriting,
  onFonoranWritingTabActivated,
} from './fonoran-writing-practice.js';
import {
  setupFonoranHearing,
  onFonoranHearingTabActivated,
} from './fonoran-hearing-practice.js';
import {
  setupFonoranGrammar,
  onFonoranGrammarTabActivated,
} from './fonoran-grammar-practice.js';
import {
  setupFonoranSpeaking,
  onFonoranSpeakingTabActivated,
} from './fonoran-speaking-practice.js';
import {
  loadLanguageRulesFromString,
  buildKeyboardMap,
  findGridCell,
} from './rules.js';
import { setActiveLanguageRulesBundle, LANGUAGE_RULES_PATH } from './fonora-config.js';
import { registerIpaVowelMap, setActiveIpaVowelMap, registerConsonantMapFromRules } from './ipa-normalize.js';
import { renderAlphabetInventory } from './alphabet-inventory.js';
import { normalizeSymbolInput, decodeToPhonemeKeys } from './decode.js';
import { translateIpaPhrase } from './ipa-pipeline.js';
import { prepareChineseForPipeline } from './cjk-text.js';
import { initEspeak, getEspeakInitError } from './ipa.js';
import { getPiperVoiceForLang, initPiperAudio } from './piper-audio.js';
import { loadLanguagePreference } from './language-preferences.js';
import { escapeHtml, insertAtCursor, deleteSymbolBeforeCursor } from './utils.js';
import { mountSymbolSpotlight } from './symbol-spotlight.js';
import { buildPlatformPipelineData, fetchPlatformLexiconExample, mountPlatformShowcase } from './platform-showcase.js?v=lexicon-1';
import { romanToFonoraScript, fonoraScriptToRoman, romanTextToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { setupEncoderTesting } from './encoder-testing.js';
import { setupPronunciationValidation } from './pronunciation-validation-ui.js';
import { phonemeKeysToRecoveredIpa } from './pronunciation-validation.js';
import { pieceHint } from '../tools/fonoran-pronunciation.js';
import {
  setupTranslatePlayback,
  setTranslateSymbols,
  setTransliterateFonoranOutput,
  isFonoranScriptMode,
  isFonoranRomanMode,
  setTransliterateApplyHandler,
  setTransliterateKeyboardOpen,
  FONORAN_TRANSLITERATE_LANG,
  FONORAN_ROMAN_LANG,
} from './fonora-tts-ui.js';
import { setupSamples, setupHomeSample, ensureSamplesLoaded } from './samples.js';
import { setupDocsViewer, onDocsTabActivated, loadDocViewer } from './docs-viewer-ui.js';
import {
  openDocViewer,
  DEFAULT_DOC_PATH,
  TOOLS_DOCS_DEFAULT,
  docViewerHref,
  isDocsRoute,
  isToolsPath,
  toolsDocViewerHref,
} from './doc-urls.js';
import {
  initUniversalNav,
  setActiveTab,
  setNavContext,
  setNavSelectHandlers,
  closeAllNavDropdowns,
} from './universal-nav.js';
import {
  LEARN_SKILL_IDS,
  LEGACY_LEARN_HASH,
  LEARN_DEFAULT_TAB,
  LEARN_HUB_TAB,
  LEARN_LESSON_PANEL_IDS,
  LEARN_SECTION_HASHES,
  LEARN_REDIRECT_HASHES,
  normalizeLearnTab as resolveLearnTab,
  learnNavTabToHash,
  learnHashRedirectsToTools,
  toolsTabForLearnLegacyHash,
  learnTrackForTab,
} from './learn-routing.js';
import { mountSiteFooter } from './site-footer.js';
import {
  canAccessTools,
  canAccessWordManager,
  refreshAuth,
  signOut,
  handleAuthUrlErrors,
  getAuthState,
} from './auth-session.js';
import { onWordManagerTabActivated, migrateWordManagerHash } from './word-manager-page.js';
import { onGapWorkshopTabActivated } from './gap-workshop-page.js';
import { onAdvancedTabActivated } from './fonoran-advanced-page.js';
import { migrateTranslationTestHash, onTranslationTestTabActivated } from './fonoran-translation-test-page.js';
import { migrateHealthHash, onHealthTabActivated } from './fonoran-health-page.js';
import { migrateProgressHash, onLabProgressTabActivated } from './fonoran-lab-progress-page.js';
import { onUserAnalyticsTabActivated } from './fonoran-user-analytics-page.js';
import { setReaderWordSources } from './fonora-tts.js';
import { refreshLearnHomeProgress } from './learn-home-progress.js';
import { captureLearnRef } from './learn-ref.js';
import { syncLearnSessionBar, saveLearnHomeScroll, restoreLearnHomeScroll } from './learn-session-ui.js';
import { initEduDebug } from './edu-debug.js';
import {
  navigateLearnHub,
  registerLearnHubNavigateHook,
  syncLearnHubViewFromHash,
  wireLearnHubControls,
} from './learn-hub-nav.js';
import {
  setupLearningLanguageSelect,
  updateLearningLanguageNote,
} from './learning-language-select.js';

let rules = null;
let usingFallback = false;

function showFallbackBanner() {
  const banner = document.getElementById('fallback-banner');
  if (!banner) return;
  banner.hidden = !usingFallback;
}

function getSymbolInsertTarget() {
  return document.getElementById('symbol-input');
}

function bindInsertableRow(tr, symbols) {
  tr.tabIndex = 0;
  tr.setAttribute('role', 'button');
  tr.title = `Insert ${symbols}`;
  const insert = () => {
    const textarea = getSymbolInsertTarget();
    if (textarea) insertAtCursor(textarea, symbols);
  };
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
  { id: 'glide', label: 'Approximant', note: 'X → Y transition' },
];

let platformShowcaseCleanup = null;
let platformShowcaseToken = 0;

async function renderPlatformShowcase() {
  const root = document.getElementById('platform-showcase');
  if (!root || !rules) return;
  const token = ++platformShowcaseToken;
  if (platformShowcaseCleanup) {
    platformShowcaseCleanup();
    platformShowcaseCleanup = null;
  }
  const toScript = (parts) => romanToFonoraScript(parts, rules).phrase ?? '';
  const lexiconExample = await fetchPlatformLexiconExample('river');
  if (token !== platformShowcaseToken) return;
  const data = buildPlatformPipelineData(rules, toScript, lexiconExample);
  platformShowcaseCleanup = mountPlatformShowcase(root, { data });
}

function renderHomeHowItWorks() {
  const placesRoot = document.getElementById('home-symbol-spotlight-places');
  const modifiersRoot = document.getElementById('home-symbol-spotlight-modifiers');
  if (!placesRoot || !modifiersRoot || !rules) return;

  const gridPlaces = rules.places.filter((p) => GRID_PLACE_IDS.includes(p.id));

  mountSymbolSpotlight(placesRoot, {
    heading: 'Places of Articulation',
    kind: 'place',
    items: gridPlaces.map((place) => ({
      symbol: place.symbol,
      label: place.label,
    })),
  });

  mountSymbolSpotlight(modifiersRoot, {
    heading: 'Sound Modifiers',
    kind: 'manner',
    items: HOME_MANNER_ROWS.map(({ id, label, note }) => ({
      symbol: modifierSymbol(rules.modifiers, id),
      label,
      note,
    })),
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

  const labels = { plain: 'Plain', voice: 'Voice', friction: 'Friction', nasal: 'Nasal', glide: 'Approx.' };

  for (const modId of MODIFIER_ROW_ORDER) {
    const tr = document.createElement('tr');
    const rowLabel = labels[modId] || modId;
    const titleAttr = modId === 'glide' ? ' title="Approximant"' : '';
    tr.innerHTML = `<th${titleAttr}>${rowLabel}</th>`;
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
        const gridNa = 'N/A';
        const soundLabel = cell.sound || (cell.status === 'reserved' ? gridNa : '');
        const ipaLabel = cell.ipa || (cell.status === 'reserved' ? gridNa : '');
        const soundHtml = soundLabel
          ? `<div class="grid-cell-sound${soundLabel === gridNa ? ' grid-cell-sound--na' : ''}">${escapeHtml(soundLabel)}</div>`
          : '';
        const ipaHtml = ipaLabel
          ? `<div class="grid-cell-ipa ipa-text${ipaLabel === gridNa ? ' grid-cell-ipa--na' : ''}">${escapeHtml(ipaLabel)}</div>`
          : '';
        const showStatus = !ok && cell.status !== 'reserved';
        td.innerHTML = `
          <div class="grid-cell-symbols symbol-text">${cell.symbols}</div>
          ${soundHtml}
          ${ipaHtml}
          <div class="grid-cell-explanation"${cell.explanation ? ` title="${escapeHtml(cell.explanation)}"` : ''}>${escapeHtml(cell.explanation)}</div>
          ${showStatus ? `<div class="grid-cell-status">${escapeHtml(cell.status || 'undefined')}</div>` : ''}`;
        if (ok) {
          td.tabIndex = 0;
          td.setAttribute('role', 'button');
          td.addEventListener('click', () => {
            const textarea = getSymbolInsertTarget();
            if (textarea) insertAtCursor(textarea, cell.symbols);
          });
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
    `<td class="ipa-text">${escapeHtml(c.ipa)}</td>`,
    `<td>${formatDerivedStatus(c.status)}</td>`,
    `<td>${escapeHtml(c.explanation)}</td>`,
  ]);

  const vowelSection = document.getElementById('vowels-section');
  const vowelsBody = document.getElementById('vowels-body');
  const vowelGroups = getSoundGridVowelGroups(rules);
  const vowelCount = vowelGroups.reduce((n, g) => n + g.entries.length, 0);

  if (!vowelSection || !vowelsBody || !vowelCount) {
    if (vowelSection) vowelSection.hidden = true;
  } else {
    vowelSection.hidden = false;

    vowelsBody.innerHTML = '';
    for (const group of vowelGroups) {
      const header = document.createElement('tr');
      header.className = 'vowel-table-group';
      header.innerHTML = `<td colspan="6">${escapeHtml(group.label)}</td>`;
      vowelsBody.appendChild(header);

      for (const cell of group.entries) {
        const tr = document.createElement('tr');
        tr.className = 'derived-row derived-row--defined vowel-table-row';
        tr.innerHTML = soundGridVowelRowHtml(cell, escapeHtml).join('');
        bindInsertableRow(tr, cell.symbols);
        vowelsBody.appendChild(tr);
      }
    }
  }
}

function setupUtilityButtons() {
  const textarea = document.getElementById('symbol-input');
  if (!textarea) return;
  const clearBtn = document.getElementById('btn-clear');
  const copyBtn = document.getElementById('btn-copy');
  const normalizeBtn = document.getElementById('btn-normalize');
  const backspaceBtn = document.getElementById('btn-backspace');
  clearBtn?.addEventListener('click', () => {
    textarea.value = '';
  });
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
    } catch {
      textarea.select();
      document.execCommand('copy');
    }
  });
  normalizeBtn?.addEventListener('click', () => {
    textarea.value = normalizeSymbolInput(textarea.value, rules);
  });
  backspaceBtn?.addEventListener('click', () => deleteSymbolBeforeCursor(textarea));
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

function setTranslateDetails(metaEl, detailsBody, toggleEl, html) {
  metaEl.innerHTML = html || '<em class="translate-meta-empty">Type to see encoding details.</em>';
  detailsBody.hidden = !toggleEl.checked;
}

function bindTranslateDetailsToggle(toggleEl, detailsBody) {
  toggleEl.addEventListener('change', () => {
    detailsBody.hidden = !toggleEl.checked;
  });
}

function setupTranslator() {
  let applyGeneration = 0;

  const inputEl = document.getElementById('translate-input');
  const pronEl = document.getElementById('translate-pronunciation');
  const metaEl = document.getElementById('translate-meta');
  const detailsToggle = document.getElementById('translate-show-details');
  const detailsBody = document.getElementById('translate-details-body');
  const decodeEl = document.getElementById('translate-decode');
  const statusEl = document.getElementById('translate-status');
  const langEl = document.getElementById('translate-lang');
  const dialectEl = document.getElementById('translate-dialect');

  function englishPipelineOptions() {
    if (langEl.value !== 'en') return {};
    const dialect = dialectEl?.value;
    return dialect ? { englishDialect: dialect } : {};
  }

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

  function refreshDecodePreview(symbols) {
    const keys = decodeToPhonemeKeys(symbols || '', rules).phonemeKeys;
    decodeEl.textContent = `Recovered phoneme keys: ${keys || '(empty)'}`;
  }

  bindTranslateDetailsToggle(detailsToggle, detailsBody);

  function buildRomanWordSource(word, rules) {
    const ipaBody = phonemeKeysToRecoveredIpa(word.phonemeKeys, rules);
    return {
      symbols: word.symbols,
      normalizedPhonemes: word.phonemeKeys,
      ipa: ipaBody ? `/${ipaBody}/` : '',
      original: word.roman,
      input: word.roman,
    };
  }

  function formatRomanPhonemicGuide(words) {
    return words.map((word) => {
      const keys = String(word.phonemeKeys || '').split(/\s+/).filter(Boolean);
      const guide = keys.map((key) => pieceHint(key)).join(' · ');
      return `<div class="translate-detail-row"><strong>${escapeHtml(word.roman)}</strong> → ${escapeHtml(guide || word.roman)}</div>`;
    }).join('');
  }

  function applyFonoranTransliterate() {
    const text = inputEl.value.trim();
    const generation = ++applyGeneration;

    if (!text) {
      setTranslateDetails(metaEl, detailsBody, detailsToggle, '');
      setStatus('');
      setTransliterateFonoranOutput('', '');
      pronEl.value = '';
      decodeEl.textContent = '';
      setReaderWordSources(null);
      return;
    }

    try {
      const result = fonoraScriptToRoman(text, rules);

      if (generation !== applyGeneration) return;

      setTranslateDetails(metaEl, detailsBody, detailsToggle, '');
      setStatus(result.warnings.length ? `${result.warnings.length} decode warning(s).` : '');

      setTransliterateFonoranOutput(result.symbols, result.roman, result.tokens);
      pronEl.value = result.words.map((word) => word.phonemeKeys).filter(Boolean).join(' · ');
      setReaderWordSources(null);
      decodeEl.textContent = result.roman
        ? `Roman spelling: ${result.roman}`
        : '';
    } catch (err) {
      if (generation !== applyGeneration) return;
      setStatus(err.message || 'Fonora decode failed.', true);
      setTranslateDetails(metaEl, detailsBody, detailsToggle, `<div class="warning-item">${escapeHtml(err.message || 'Fonora decode failed.')}</div>`);
    }
  }

  function applyFonoranRomanTransliterate() {
    const text = inputEl.value.trim();
    const generation = ++applyGeneration;

    if (!text) {
      setTranslateDetails(metaEl, detailsBody, detailsToggle, '');
      setStatus('');
      setTransliterateFonoranOutput('', '');
      pronEl.value = '';
      decodeEl.textContent = '';
      setReaderWordSources(null);
      return;
    }

    try {
      const result = romanTextToFonoraScript(text, rules);

      if (generation !== applyGeneration) return;

      const wordSources = result.words.map((word) => buildRomanWordSource(word, rules));
      const guideHtml = formatRomanPhonemicGuide(result.words);
      setTranslateDetails(metaEl, detailsBody, detailsToggle, guideHtml);

      if (!result.strictOk) {
        setStatus(`${result.warnings.length} unknown letter(s) — fix spelling before listening.`, true);
      } else if (result.warnings.length) {
        setStatus(`${result.warnings.length} encode warning(s).`, true);
      } else {
        setStatus('');
      }

      setTransliterateFonoranOutput(result.symbols, result.roman, result.tokens, {
        strictOk: result.strictOk,
        wordSources,
      });
      setReaderWordSources(wordSources);
      pronEl.value = result.words.map((word) => word.phonemeKeys).filter(Boolean).join(' · ');
      decodeEl.textContent = result.symbols
        ? `Fonora script: ${result.symbols}`
        : '';
    } catch (err) {
      if (generation !== applyGeneration) return;
      setStatus(err.message || 'Fonoran roman encode failed.', true);
      setTranslateDetails(metaEl, detailsBody, detailsToggle, `<div class="warning-item">${escapeHtml(err.message || 'Fonoran roman encode failed.')}</div>`);
    }
  }

  async function applyTranslate() {
    if (isFonoranScriptMode()) {
      applyFonoranTransliterate();
      return;
    }

    if (isFonoranRomanMode()) {
      applyFonoranRomanTransliterate();
      return;
    }

    const text = inputEl.value.trim();
    const generation = ++applyGeneration;

    if (!text) {
      setTranslateDetails(metaEl, detailsBody, detailsToggle, '');
      setStatus('');
      setTranslateSymbols('');
      pronEl.value = '';
      decodeEl.textContent = '';
      return;
    }

    const lang = langEl.value || 'en';
    const pipelineOptions = englishPipelineOptions();
    const pipelineText = lang === 'zh' ? prepareChineseForPipeline(text).spacedText : text;

    try {
      const result = await translateIpaPhrase(pipelineText, rules, lang, pipelineOptions);

      if (generation !== applyGeneration) return;

      const detailResult = result.words?.length === 1 ? result.words[0] : result;
      setTranslateDetails(metaEl, detailsBody, detailsToggle, formatIpaResult(detailResult));
      setStatus('');

      setTranslateSymbols(result.symbols);
      pronEl.value = result.normalizedPhonemes || '';
      setReaderWordSources(result.words || null);
      refreshDecodePreview(result.symbols);
    } catch (err) {
      if (generation !== applyGeneration) return;
      setStatus(err.message || 'IPA pipeline failed.', true);
      setTranslateDetails(metaEl, detailsBody, detailsToggle, `<div class="warning-item">${escapeHtml(err.message || 'IPA pipeline failed.')}</div>`);
    }
  }

  setTransliterateApplyHandler(applyTranslate);

  inputEl.addEventListener('input', () => {
    // Fonoran (Fonora): compose with the keyboard, then press Enter / Go to apply.
    if (isFonoranScriptMode()) {
      if (!inputEl.value.trim()) applyFonoranTransliterate();
      return;
    }
    applyTranslate();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (!isFonoranScriptMode()) return;
    // Dock open: physical Enter is handled by the Fonora keyboard module (Go).
    const dock = document.getElementById('translate-keyboard-dock');
    if (dock && !dock.hidden) return;
    e.preventDefault();
    applyTranslate();
  });

  let previousTransliterateLang = langEl.value;
  langEl.addEventListener('change', () => {
    const next = langEl.value;
    const fonoranModes = new Set([FONORAN_TRANSLITERATE_LANG, FONORAN_ROMAN_LANG]);
    if (previousTransliterateLang !== next && (fonoranModes.has(previousTransliterateLang) || fonoranModes.has(next))) {
      inputEl.value = '';
    }
    previousTransliterateLang = next;
    applyTranslate();
  });

  dialectEl?.addEventListener('change', applyTranslate);
}

function migrateLegacyUrl() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '');
  if (path === '/' && hash === 'about') {
    history.replaceState(null, '', `${path}${window.location.search}`);
    return;
  }
  if (path === '/' && hash === 'learn-home') {
    history.replaceState(null, '', `/learn${window.location.search}`);
    return;
  }
  if (path === '/learn') {
    if (hash && learnHashRedirectsToTools(hash)) {
      const toolsTab = toolsTabForLearnLegacyHash(hash);
      history.replaceState(null, '', `/tools#${toolsTab}${window.location.search}`);
      return;
    }
    if (hash && LEGACY_LEARN_HASH[hash] && !learnHashRedirectsToTools(hash)) {
      const navTab = LEGACY_LEARN_HASH[hash];
      const nextHash = learnNavTabToHash(navTab);
      history.replaceState(null, '', `/learn${nextHash}${window.location.search}`);
    }
    return;
  }
  if (path === '/language' || path.startsWith('/language/')) {
    const hash = window.location.hash.replace(/^#/, '').split('?')[0];
    if (hash === 'advanced') {
      history.replaceState(null, '', `/tools#advanced${window.location.search}`);
      return;
    }
    if (hash === 'gaps' || hash === 'translation-test') {
      history.replaceState(null, '', `/tools#translation-test${window.location.search}`);
      return;
    }
    if (hash === 'health') {
      history.replaceState(null, '', `/tools#health${window.location.search}`);
      return;
    }
    if (hash === 'progress') {
      history.replaceState(null, '', `/tools#progress${window.location.search}`);
      return;
    }
    const legacy = new Set(['words', 'concepts', 'create', 'review', 'roots', 'root-review']);
    if (legacy.has(hash)) {
      history.replaceState(null, '', `/tools#word-manager${window.location.search}`);
      return;
    }
  }
  if (path === '/tools') {
    if (hash === 'listening') {
      history.replaceState(null, '', `/tools#samples${window.location.search}`);
      return;
    }
    // Tools-native tabs (e.g. samples) should stay on /tools — avoid /learn ↔ /tools churn.
    if (hash && BUILDER_TOOLS_TAB_IDS.has(hash)) {
      return;
    }
    if (hash && LEARN_REDIRECT_HASHES.includes(hash)) {
      const navTab =
        hash === LEARN_DEFAULT_TAB
          ? LEARN_DEFAULT_TAB
          : LEARN_SKILL_IDS.has(hash)
            ? hash
            : LEGACY_LEARN_HASH[hash] ?? LEARN_DEFAULT_TAB;
      const nextHash = learnNavTabToHash(navTab);
      history.replaceState(null, '', `/learn${nextHash}${window.location.search}`);
      return;
    }
  }
  if (path === '/' && (hash === 'home' || (hash && hash !== 'about' && hash !== 'docs' && document.querySelector(`[data-tab-panel="${hash}"]`)))) {
    const nextHash = hash === 'home' ? '' : `#${hash}`;
    history.replaceState(null, '', `/script${nextHash}${window.location.search}`);
  }
}

function isScriptAppPath() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === '/script';
}

// Learn = learner-facing practice; Tools = QA/debugging (sign-in required when OAuth is configured).
function normalizeLearnTab(tabId) {
  if (!isLearnPath()) return { navTab: tabId, panelId: tabId };
  return resolveLearnTab(tabId);
}

const BUILDER_TOOLS_TAB_IDS = new Set([
  'tools-home',
  'word-manager',
  'gap-workshop',
  'translation-test',
  'user-analytics',
  'health',
  'progress',
  'advanced',
  'docs',
  'encoder-testing',
  'pronunciation-validation',
  'samples',
]);

/** Tabs that live under /tools — keep Tools platform context even if pathname lagged. */
function requiresToolsPath(tabId) {
  if (tabId === 'docs') return isToolsPath();
  return BUILDER_TOOLS_TAB_IDS.has(tabId);
}

function navContextForTab(tabId) {
  if (requiresToolsPath(tabId)) return 'tools';
  return currentNavContext();
}

function basePathForTab(tabId) {
  if (requiresToolsPath(tabId)) return '/tools';
  if (isLearnPath()) return '/learn';
  if (isToolsPath()) return '/tools';
  return '/script';
}

function isLearnPath() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path === '/learn';
}

function currentNavContext() {
  if (isLearnPath()) return 'learn';
  if (isToolsPath()) return 'tools';
  if (isScriptAppPath()) return 'script';
  return 'platform';
}

function defaultTabForBase(base) {
  if (base === '/learn') return LEARN_DEFAULT_TAB;
  if (base === '/tools') return 'tools-home';
  return 'home';
}

function scrollLearnHomeToSection() {
  syncLearnHubViewFromHash();
}

function getTabFromHash() {
  migrateLegacyUrl();
  if (isToolsPath()) {
    const id = window.location.hash.replace(/^#/, '');
    if (id === 'docs' || new URLSearchParams(window.location.search).has('path')) return 'docs';
    if (id && BUILDER_TOOLS_TAB_IDS.has(id)) return id;
    return defaultTabForBase('/tools');
  }
  if (isDocsRoute()) return 'docs';
  if (isLearnPath()) {
    const id = window.location.hash.replace(/^#/, '');
    if (id && LEARN_SECTION_HASHES.has(id)) return LEARN_DEFAULT_TAB;
    if (id && (LEARN_SKILL_IDS.has(id) || id === LEARN_DEFAULT_TAB)) return id;
    if (id && LEGACY_LEARN_HASH[id]) return LEGACY_LEARN_HASH[id];
    return defaultTabForBase('/learn');
  }
  if (isScriptAppPath()) {
    const id = window.location.hash.replace(/^#/, '');
    if (id === 'reader') return 'translator';
    if (id) {
      const panel = document.querySelector(`[data-tab-panel="${id}"]`);
      if (panel) return id;
    }
    return defaultTabForBase('/script');
  }
  const id = window.location.hash.replace(/^#/, '');
  if (id === 'about') return 'platform';
  return 'platform';
}

function isPlatformTab(tabId) {
  return tabId === 'platform' || tabId === 'docs';
}

function setHashForTab(tabId) {
  if (tabId === 'tools-auth-gate') return;

  if (isPlatformTab(tabId)) {
    if (tabId === 'platform') {
      const next = `/${window.location.search}`;
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
        history.replaceState(null, '', next);
      }
      return;
    }
    if (tabId === 'docs') {
      if (isToolsPath()) {
        if (window.location.hash === '#docs' && new URLSearchParams(window.location.search).has('path')) return;
        const next = toolsDocViewerHref(TOOLS_DOCS_DEFAULT);
        if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
          history.replaceState(null, '', next);
        }
        return;
      }
      if (isDocsRoute()) return;
      const next = docViewerHref(DEFAULT_DOC_PATH);
      if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
        history.replaceState(null, '', next);
      }
      return;
    }
    return;
  }

  const base = basePathForTab(tabId);
  const currentHash = window.location.hash.replace(/^#/, '');
  let hashSuffix = '';
  if (tabId !== defaultTabForBase(base)) {
    hashSuffix = `#${tabId}`;
  } else if (
    base === '/learn'
    && (currentHash === 'fonora-script' || currentHash === 'fonoran-language' || currentHash === 'learn-progress')
  ) {
    hashSuffix = `#${currentHash}`;
  }
  const next = `${base}${hashSuffix}${window.location.search}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    history.replaceState(null, '', next);
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

function isGatedToolsTab(tabId) {
  return BUILDER_TOOLS_TAB_IDS.has(tabId) && tabId !== 'docs';
}

function resolveTabForAuth(tabId) {
  if (tabId === 'word-manager' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (tabId === 'gap-workshop' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (tabId === 'translation-test' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (tabId === 'advanced' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (tabId === 'health' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (tabId === 'progress' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (tabId === 'user-analytics' && !canAccessWordManager()) {
    return 'tools-auth-gate';
  }
  if (isToolsPath() && !canAccessTools() && (isGatedToolsTab(tabId) || tabId === 'tools-home')) {
    return 'tools-auth-gate';
  }
  return tabId;
}

function showTab(tabId) {
  tabId = resolveTabForAuth(tabId);
  const previousPanel = document.querySelector('.tab-panel--active')?.dataset.tabPanel;
  const context = navContextForTab(tabId);
  const { navTab, panelId } = normalizeLearnTab(tabId);
  const goingLearnHome = panelId === LEARN_HUB_TAB;
  const leftLearnHome = previousPanel === LEARN_HUB_TAB && !goingLearnHome;
  const returningFromLesson = goingLearnHome && previousPanel && LEARN_LESSON_PANEL_IDS.has(previousPanel);

  // Capture scroll before hiding Learn home — once the panel is display:none, scrollY resets.
  if (leftLearnHome) {
    saveLearnHomeScroll();
  }

  document.documentElement.setAttribute('data-fonora-nav', context);
  document.documentElement.setAttribute('data-fonora-tab', navTab);
  if (context === 'learn') {
    document.documentElement.setAttribute('data-learn-track', learnTrackForTab(navTab));
  } else {
    document.documentElement.removeAttribute('data-learn-track');
  }

  setNavContext(context);
  setActiveTab(navTab);

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== panelId;
    panel.classList.toggle('tab-panel--active', panel.dataset.tabPanel === panelId);
  });

  setHashForTab(isLearnPath() ? navTab : tabId);
  closeAllNavDropdowns();

  if (previousPanel !== panelId) {
    if (returningFromLesson) {
      // restoreLearnHomeScroll runs at end of showTab after layout settles
    } else if (goingLearnHome && LEARN_SECTION_HASHES.has(window.location.hash.replace(/^#/, ''))) {
      scrollLearnHomeToSection();
    } else if (!goingLearnHome) {
      window.scrollTo(0, 0);
    }
  }

  syncLearnSessionBar(`tab-${panelId}`);

  if (panelId === 'learn-home') {
    refreshLearnHomeProgress(rules);
    if (!returningFromLesson) {
      scrollLearnHomeToSection();
    }
  }

  if (panelId === 'word-manager') {
    void onWordManagerTabActivated();
  }

  if (panelId === 'gap-workshop') {
    void onGapWorkshopTabActivated();
  }

  if (panelId === 'translation-test') {
    void onTranslationTestTabActivated();
  }

  if (panelId === 'health') {
    void onHealthTabActivated();
  }

  if (panelId === 'progress') {
    void onLabProgressTabActivated();
  }

  if (panelId === 'user-analytics') {
    void onUserAnalyticsTabActivated();
  }

  if (panelId === 'advanced') {
    void onAdvancedTabActivated();
  }

  if (panelId === 'samples') {
    ensureSamplesLoaded().catch(() => {});
  }

  if (panelId === 'spelling-practice') {
    onFonoranWritingTabActivated();
  }

  if (panelId === 'script-writing') {
    onScriptWritingTabActivated();
  }

  if (panelId === 'script-reading-words') {
    onScriptReadingTabActivated();
  }

  if (panelId === 'quiz') {
    onScriptSoundsTabActivated(rules);
  }

  if (panelId === 'fonoran-reading') {
    onFonoranReadingTabActivated();
  }

  if (panelId === 'fonoran-hearing') {
    onFonoranHearingTabActivated();
  }

  if (panelId === 'fonoran-grammar') {
    onFonoranGrammarTabActivated();
  }

  if (panelId === 'fonoran-speaking') {
    onFonoranSpeakingTabActivated();
  }

  if (panelId !== 'translator') {
    setTransliterateKeyboardOpen(false);
  }

  const spellingDock = document.getElementById('spelling-practice-keyboard-dock');
  const scriptWritingDock = document.getElementById('script-writing-keyboard-dock');
  const spellingScriptPanel = document.getElementById('fonoran-writing-script-panel');
  const showSpellingDock = panelId === 'spelling-practice'
    && Boolean(spellingScriptPanel && !spellingScriptPanel.hidden);
  const showScriptWritingDock = panelId === 'script-writing';
  if (spellingDock) spellingDock.hidden = !showSpellingDock;
  if (scriptWritingDock) scriptWritingDock.hidden = !showScriptWritingDock;
  document.body.classList.toggle(
    'fonora-keyboard-dock-open',
    Boolean(document.querySelector('.fonora-keyboard-dock:not([hidden])')),
  );

  notifyFonoraTabChange(panelId);

  if (tabId === 'docs') {
    onDocsTabActivated();
  }

  requestAnimationFrame(syncAppHeaderOffset);

  if (returningFromLesson) {
    restoreLearnHomeScroll();
  }
}

window.showTab = showTab;
window.openDocViewer = openDocViewer;
window.loadDocViewer = loadDocViewer;

function handleNavTabSelect(tab) {
  if (tab === 'docs') {
    openDocViewer(isToolsPath() ? TOOLS_DOCS_DEFAULT : DEFAULT_DOC_PATH);
    return;
  }
  showTab(tab);
}

setNavSelectHandlers({
  onTab: handleNavTabSelect,
  onPlatformTab: handleNavTabSelect,
  onLearnHub: (view) => {
    if (view === 'hub' || view === 'script' || view === 'fonoran' || view === 'progress') {
      navigateLearnHub(view);
      refreshLearnHomeProgress(rules);
    }
  },
  onSignOut: () => {
    signOut().then(() => showTab(getTabFromHash()));
  },
});

let shellNavWired = false;

function setupTabs() {
  if (shellNavWired) return;
  shellNavWired = true;

  document.querySelectorAll('main [data-tab], .home-page [data-tab], .platform-home [data-tab], [data-learn-tab]').forEach((el) => {
    el.addEventListener('click', (event) => {
      if (el.tagName === 'A') event.preventDefault();
      const docPath = el.getAttribute('data-doc-path');
      if (docPath && el.dataset.tab === 'docs') {
        openDocViewer(docPath);
        return;
      }
      if (el.dataset.learnTab) {
        showTab(el.dataset.learnTab);
        return;
      }
      showTab(el.dataset.tab);
    });
  });

  wireLearnHubControls();
  registerLearnHubNavigateHook(() => setActiveTab(LEARN_HUB_TAB));

  refreshAuth().then(() => {
    syncWordManagerNav();
    syncGapWorkshopNav();
    syncTranslationTestNav();
    syncAdvancedNav();
    migrateWordManagerHash();
    migrateTranslationTestHash();
    migrateHealthHash();
    migrateProgressHash();
    showTab(getTabFromHash());
  });
  handleAuthUrlErrors();

  window.addEventListener('hashchange', () => showTab(getTabFromHash()));
  window.addEventListener('popstate', () => showTab(getTabFromHash()));
}

function syncWordManagerNav() {
  const btn = document.getElementById('nav-word-manager');
  if (!btn) return;
  const show = canAccessWordManager();
  btn.hidden = !show;
  btn.removeAttribute('aria-hidden');
}

function syncGapWorkshopNav() {
  const btn = document.getElementById('nav-gap-workshop');
  if (!btn) return;
  const show = canAccessWordManager(); // same admin gate
  btn.hidden = !show;
  btn.removeAttribute('aria-hidden');
}

function syncTranslationTestNav() {
  const btn = document.getElementById('nav-translation-test');
  if (!btn) return;
  const show = canAccessWordManager();
  btn.hidden = !show;
  btn.removeAttribute('aria-hidden');
}

function syncAdvancedNav() {
  const btn = document.getElementById('nav-advanced');
  if (!btn) return;
  const show = canAccessWordManager();
  btn.hidden = !show;
  btn.removeAttribute('aria-hidden');
}

async function initApp() {
  void initEduDebug();
  let loaded;
  try {
    const res = await fetch(LANGUAGE_RULES_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markdownSource = await res.text();
    loaded = loadLanguageRulesFromString(markdownSource);
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
    setupTabs();
    return;
  }

  showFallbackBanner();
  setupTabs();
  void renderPlatformShowcase();
  renderHomeHowItWorks();
  renderSoundGrid();
  renderSupplementalSoundTables();
  setupUtilityButtons();
  setupScriptSounds(rules);
  setupEncoderTesting(rules);
  setupPronunciationValidation(rules);
  setupTranslatePlayback(rules);
  setupSamples(rules);
  setupHomeSample(rules);
  if (document.querySelector('.tab-panel--active[data-tab-panel="samples"]')) {
    void ensureSamplesLoaded();
  }
  void setupScriptWriting(rules);
  void setupScriptReadingWords(rules);
  void setupFonoranReading(rules);
  void setupFonoranWriting(rules);
  void setupFonoranHearing(rules);
  void setupFonoranGrammar(rules);
  void setupFonoranSpeaking(rules);
  setupLearningLanguageSelect('learn-language-global', () => {
    updateLearningLanguageNote('script-writing-language-note');
    updateLearningLanguageNote('script-reading-language-note');
  });
  setupDocsViewer();
  setupTranslator();
  renderAlphabetInventory(rules);

  initEspeak().then((result) => {
    if (!result.ok) {
      const banner = document.getElementById('fallback-banner');
      if (banner) {
        banner.hidden = false;
        banner.textContent = `eSpeak NG failed to load: ${getEspeakInitError() || result.error}. IPA pipeline unavailable.`;
      }
    }
  });

  const piperVoice = getPiperVoiceForLang(loadLanguagePreference()) || 'en_US-lessac-medium';
  initPiperAudio(piperVoice).catch(() => {});

  if (new URLSearchParams(window.location.search).has('test')) {
    import('./tests-core.js').then(({ runTests }) => {
      const { passed, total, failed } = runTests({ bundle: loaded });
      console.log(`Fonora tests: ${passed}/${total} passed`);
      if (failed.length) console.table(failed);
    });
  }
}

function bootstrapShell() {
  captureLearnRef();
  const initialNavTab = resolveTabForAuth(getTabFromHash());
  const { navTab, panelId } = normalizeLearnTab(initialNavTab);
  initUniversalNav({
    context: navContextForTab(initialNavTab),
    activeTab: isLearnPath() ? navTab : initialNavTab,
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const active = panel.dataset.tabPanel === (isLearnPath() ? panelId : initialNavTab);
    panel.hidden = !active;
    panel.classList.toggle('tab-panel--active', active);
  });
  setupTabs();
  if (isLearnPath() && panelId === LEARN_HUB_TAB) {
    syncLearnHubViewFromHash();
    refreshLearnHomeProgress(rules);
  }
  ensureAppHeaderOffsetObserver();
}

bootstrapShell();
mountSiteFooter();
initApp();
