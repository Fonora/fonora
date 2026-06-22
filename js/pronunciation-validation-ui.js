import { escapeHtml } from './utils.js';
import { getActiveLanguageRulesBundle } from './fonora-config.js';
import { ENGLISH_DIALECT_CODES } from './language-preferences.js';
import {
  DEFAULT_VALIDATION_WORDS,
  validatePronunciation,
  validatePronunciationBatch,
  summarizeValidationResults,
  speakOriginal,
  speakFonoraReadback,
  speechLangFromDialect,
} from './pronunciation-validation.js';
import {
  validateVowelArchitectureSet,
  summarizeVowelArchitectureRows,
} from './vowel-architecture-validation.js';

let rulesRef = null;
let bundleRef = null;
let lastSingleResult = null;
let lastBatchResults = [];

function matchBadge(match) {
  return match
    ? '<span class="pv-status pv-status--match">✓ Match</span>'
    : '<span class="pv-status pv-status--mismatch">✗ Mismatch</span>';
}

function renderSummary(summary) {
  const el = document.getElementById('pv-dashboard');
  if (!el) return;
  el.innerHTML = `
    <div class="encoder-stat"><span class="encoder-stat-label">Words tested</span><span class="encoder-stat-value">${summary.wordsTested}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Exact IPA matches</span><span class="encoder-stat-value encoder-stat-value--ok">${summary.exactIpaMatches}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Mismatches</span><span class="encoder-stat-value encoder-stat-value--bad">${summary.mismatches}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Phoneme key mismatches</span><span class="encoder-stat-value encoder-stat-value--warn">${summary.phonemeKeyMismatches}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Collision warnings</span><span class="encoder-stat-value encoder-stat-value--warn">${summary.collisionWarnings}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Recovery success rate</span><span class="encoder-stat-value">${summary.recoverySuccessRate}%</span></div>
    ${summary.errors ? `<div class="encoder-stat encoder-stat--wide"><span class="encoder-stat-label">Errors</span><span class="encoder-stat-value encoder-stat-value--bad">${summary.errors}</span></div>` : ''}
  `;
}

function renderCollisionWarnings(warnings) {
  if (!warnings?.length) return '';
  return `
    <div class="pv-collision-warnings">
      ${warnings.map((w) => `<div class="warning-item pv-collision-item">⚠ ${escapeHtml(w.message)}</div>`).join('')}
    </div>`;
}

function renderMismatchInvestigation(result) {
  if (result.ipaMatch && result.phonemeKeysMatch) return '';

  return `
    <details class="pv-investigation" open>
      <summary>Mismatch investigation</summary>
      <dl class="encoder-pipeline encoder-pipeline--compact">
        <div><dt>Original phoneme keys</dt><dd><code>${escapeHtml(result.sourcePhonemeKeys || '—')}</code></dd></div>
        <div><dt>Recovered phoneme keys</dt><dd><code>${escapeHtml(result.recoveredPhonemeKeys || '—')}</code></dd></div>
        <div><dt>Original symbols</dt><dd><span class="symbol-text">${escapeHtml(result.symbols || '—')}</span></dd></div>
        <div><dt>Decoder path</dt><dd><code class="pv-decoder-path">${escapeHtml(result.decoderPath || '—')}</code></dd></div>
        <div><dt>Pipeline decoded keys</dt><dd><code>${escapeHtml(result.pipelineDecodedKeys || '—')}</code></dd></div>
      </dl>
      ${result.mismatchNotes?.length ? `
        <ul class="pv-notes-list">
          ${result.mismatchNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
        </ul>` : ''}
      ${renderCollisionWarnings(result.collisionWarnings)}
    </details>`;
}

function renderSingleResult(result) {
  const el = document.getElementById('pv-single-result');
  if (!el) return;

  if (!result) {
    el.innerHTML = '<p class="pv-empty">Enter a word and run validation.</p>';
    return;
  }

  if (result.error) {
    el.innerHTML = `<div class="warning-item">${escapeHtml(result.error)}</div>`;
    return;
  }

  el.innerHTML = `
    <article class="pv-card${result.ipaMatch ? ' pv-card--match' : ' pv-card--mismatch'}">
      <header class="pv-card-header">
        <h3 class="pv-word">${escapeHtml(result.word)}</h3>
        <div class="pv-audio-row">
          <button type="button" class="btn btn--sm pv-play-original" data-word="${escapeHtml(result.word)}">▶ Original</button>
          <button type="button" class="btn btn--sm pv-play-fonora" data-keys="${escapeHtml(result.recoveredPhonemeKeys || '')}">▶ Fonora Readback</button>
        </div>
      </header>

      <section class="pv-section">
        <h4>Input</h4>
        <p><code>${escapeHtml(result.word)}</code></p>
      </section>

      <section class="pv-section">
        <h4>Source Analysis</h4>
        <dl class="encoder-pipeline encoder-pipeline--compact">
          <div><dt>IPA (eSpeak)</dt><dd><code>${escapeHtml(result.sourceIpa || '—')}</code></dd></div>
          <div><dt>Fonora phoneme keys</dt><dd><code>${escapeHtml(result.sourcePhonemeKeys || '—')}</code></dd></div>
          <div><dt>Fonora symbols</dt><dd><span class="symbol-text">${escapeHtml(result.symbols || '—')}</span></dd></div>
        </dl>
      </section>

      <section class="pv-section">
        <h4>Recovery Analysis</h4>
        <dl class="encoder-pipeline encoder-pipeline--compact">
          <div><dt>Recovered phoneme keys</dt><dd><code>${escapeHtml(result.recoveredPhonemeKeys || '—')}</code></dd></div>
        <div><dt>Recovered IPA</dt><dd><code>${escapeHtml(result.recoveredIpa || '—')}</code></dd></div>
        ${result.recoveredIpaFromCells && result.recoveredIpaFromCells !== result.recoveredIpa ? `<div><dt>Cell metadata IPA</dt><dd><code>${escapeHtml(result.recoveredIpaFromCells)}</code> <span class="pv-meta-note">(all variants — diagnostic)</span></dd></div>` : ''}
        <div><dt>Decoder path</dt><dd><code class="pv-decoder-path">${escapeHtml(result.decoderPath || '—')}</code></dd></div>
        </dl>
      </section>

      <section class="pv-section pv-comparison">
        <h4>Comparison</h4>
        <div class="pv-comparison-grid">
          <div><span class="pv-comparison-label">Original IPA:</span> <code>${escapeHtml(result.sourceIpa || '—')}</code></div>
          <div><span class="pv-comparison-label">Recovered IPA:</span> <code>${escapeHtml(result.recoveredIpa || '—')}</code></div>
          <div><span class="pv-comparison-label">Status:</span> ${matchBadge(result.ipaMatch)}</div>
        </div>
        ${!result.phonemeKeysMatch ? `<div class="pv-key-note">Phoneme keys: ${matchBadge(result.phonemeKeysMatch)}</div>` : ''}
      </section>

      ${renderCollisionWarnings(result.collisionWarnings)}
      ${renderMismatchInvestigation(result)}

      ${result.encodeWarnings?.length ? `
        <div class="pv-warnings">
          ${result.encodeWarnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}
        </div>` : ''}
    </article>
  `;

  bindAudioButtons(el);
}

function renderBatchTable(results) {
  const el = document.getElementById('pv-batch-table');
  if (!el) return;

  if (!results?.length) {
    el.innerHTML = '<p class="pv-empty">Run batch validation to see results.</p>';
    return;
  }

  const rows = results.map((r) => {
    if (r.error) {
      return `<tr class="pv-row--error"><td>${escapeHtml(r.word)}</td><td colspan="3"><span class="warning-item">${escapeHtml(r.error)}</span></td></tr>`;
    }
    const rowClass = r.ipaMatch ? 'pv-row--match' : 'pv-row--mismatch';
    const warn = r.collisionWarnings?.length ? ' ⚠' : '';
    return `<tr class="${rowClass}" data-word="${escapeHtml(r.word)}">
      <td><button type="button" class="pv-word-link">${escapeHtml(r.word)}${warn}</button></td>
      <td><code>${escapeHtml(r.sourceIpa || '—')}</code></td>
      <td><code>${escapeHtml(r.recoveredIpa || '—')}</code></td>
      <td>${matchBadge(r.ipaMatch)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-wrap">
      <table class="data-table pv-batch-table">
        <thead><tr><th>Word</th><th>Source IPA</th><th>Recovered IPA</th><th>Match</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  el.querySelectorAll('.pv-word-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const word = row?.dataset.word;
      if (!word) return;
      document.getElementById('pv-single-input').value = word;
      const found = lastBatchResults.find((r) => r.word === word);
      if (found && !found.error) {
        lastSingleResult = found;
        renderSingleResult(found);
      } else {
        runSingleValidation(word);
      }
    });
  });
}

function bindAudioButtons(container) {
  container.querySelector('.pv-play-original')?.addEventListener('click', (e) => {
    const word = e.currentTarget.dataset.word;
    const dialect = document.getElementById('pv-dialect')?.value || 'en-us';
    speakOriginal(word, speechLangFromDialect(dialect));
  });

  container.querySelector('.pv-play-fonora')?.addEventListener('click', (e) => {
    const keys = e.currentTarget.dataset.keys;
    const dialect = document.getElementById('pv-dialect')?.value || 'en-us';
    speakFonoraReadback(keys, speechLangFromDialect(dialect));
  });
}

function getValidationOptions() {
  const dialect = document.getElementById('pv-dialect')?.value || 'en-us';
  return { lang: 'en', englishDialect: dialect, voice: dialect };
}

async function runSingleValidation(word) {
  const status = document.getElementById('pv-single-status');
  if (status) {
    status.hidden = false;
    status.textContent = 'Validating…';
  }

  try {
    lastSingleResult = await validatePronunciation(word, rulesRef, bundleRef, getValidationOptions());
    renderSingleResult(lastSingleResult);
    if (status) status.hidden = true;
  } catch (err) {
    lastSingleResult = { word, error: err.message || String(err) };
    renderSingleResult(lastSingleResult);
    if (status) {
      status.textContent = err.message || String(err);
    }
  }
}

async function runBatchValidation() {
  const textarea = document.getElementById('pv-batch-input');
  const status = document.getElementById('pv-batch-status');
  const words = (textarea?.value || '')
    .split(/\n+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (!words.length) return;

  if (status) {
    status.hidden = false;
    status.textContent = `Validating ${words.length} words…`;
  }

  lastBatchResults = await validatePronunciationBatch(words, rulesRef, bundleRef, getValidationOptions());
  renderBatchTable(lastBatchResults);
  renderSummary(summarizeValidationResults(lastBatchResults));

  if (status) status.hidden = true;
}

function renderVowelArchitectureSummary(summary) {
  const el = document.getElementById('pv-vowel-architecture-summary');
  if (!el) return;
  el.innerHTML = `
    <div class="encoder-stat"><span class="encoder-stat-label">Words tested</span><span class="encoder-stat-value">${summary.wordsTested}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Grammar pass</span><span class="encoder-stat-value encoder-stat-value--ok">${summary.grammarPass}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">⚬⚬ hits</span><span class="encoder-stat-value encoder-stat-value--bad">${summary.doubleVowelHits}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Errors</span><span class="encoder-stat-value encoder-stat-value--warn">${summary.errors}</span></div>
  `;
}

function renderVowelArchitectureTable(rows) {
  const el = document.getElementById('pv-vowel-architecture-table');
  if (!el) return;

  if (!rows?.length) {
    el.innerHTML = '<p class="pv-empty">Run the vowel architecture test to see results.</p>';
    return;
  }

  const body = rows.map((r) => {
    if (r.error) {
      return `<tr class="pv-row--error"><td>${escapeHtml(r.word)}</td><td colspan="5"><span class="warning-item">${escapeHtml(r.error)}</span></td></tr>`;
    }
    const rowClass = r.grammarOk && !r.hasDoubleVowel ? 'pv-row--match' : 'pv-row--mismatch';
    return `<tr class="${rowClass}">
      <td>${escapeHtml(r.word)}</td>
      <td><code>${escapeHtml(r.ipa || '—')}</code></td>
      <td><code>${escapeHtml(r.phonemes || '—')}</code></td>
      <td><span class="symbol-text">${escapeHtml(r.symbols || '—')}</span></td>
      <td><code>${escapeHtml(r.decoded || '—')}</code></td>
      <td>${r.grammarOk && !r.hasDoubleVowel ? matchBadge(true) : matchBadge(false)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="table-wrap">
      <table class="data-table pv-batch-table">
        <thead><tr><th>Word</th><th>IPA</th><th>Phonemes</th><th>Fonora symbols</th><th>Decoded</th><th>Grammar</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

async function runVowelArchitectureValidation() {
  const status = document.getElementById('pv-vowel-architecture-status');
  if (status) {
    status.hidden = false;
    status.textContent = 'Running vowel architecture test…';
  }

  try {
    const rows = await validateVowelArchitectureSet(rulesRef, bundleRef, getValidationOptions());
    renderVowelArchitectureSummary(summarizeVowelArchitectureRows(rows));
    renderVowelArchitectureTable(rows);
    if (status) status.hidden = true;
  } catch (err) {
    if (status) status.textContent = err.message || String(err);
  }
}

function populateDialectSelect() {
  const sel = document.getElementById('pv-dialect');
  if (!sel) return;
  sel.innerHTML = ENGLISH_DIALECT_CODES.map(
    (code) => `<option value="${escapeHtml(code)}"${code === 'en-us' ? ' selected' : ''}>${escapeHtml(code)}</option>`,
  ).join('');
}

export function setupPronunciationValidation(rules) {
  rulesRef = rules;
  bundleRef = getActiveLanguageRulesBundle();

  populateDialectSelect();

  const batchInput = document.getElementById('pv-batch-input');
  if (batchInput && !batchInput.value.trim()) {
    batchInput.value = DEFAULT_VALIDATION_WORDS.join('\n');
  }

  renderSummary({
    wordsTested: 0,
    exactIpaMatches: 0,
    mismatches: 0,
    phonemeKeyMismatches: 0,
    collisionWarnings: 0,
    recoverySuccessRate: 0,
    errors: 0,
  });
  renderSingleResult(null);
  renderBatchTable([]);

  renderVowelArchitectureSummary({
    wordsTested: 0,
    grammarPass: 0,
    doubleVowelHits: 0,
    errors: 0,
  });
  renderVowelArchitectureTable([]);

  document.getElementById('pv-validate-single')?.addEventListener('click', () => {
    const word = document.getElementById('pv-single-input')?.value.trim();
    if (word) runSingleValidation(word);
  });

  document.getElementById('pv-single-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const word = e.target.value.trim();
      if (word) runSingleValidation(word);
    }
  });

  document.getElementById('pv-run-batch')?.addEventListener('click', runBatchValidation);

  document.getElementById('pv-load-default-words')?.addEventListener('click', () => {
    const ta = document.getElementById('pv-batch-input');
    if (ta) ta.value = DEFAULT_VALIDATION_WORDS.join('\n');
  });

  document.getElementById('pv-run-vowel-architecture')?.addEventListener('click', runVowelArchitectureValidation);
}
