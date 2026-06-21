import {
  getPrimarySymbolEntries,
  composeGridSymbol,
  composeCvExamples,
  formatVowelSoundExamples,
  applyPrimarySymbols,
  MODIFIER_ROW_ORDER,
} from './symbol-compose.js';
import { encodeSounds } from './encode.js';
import { escapeHtml } from './utils.js';
import {
  loadAlphabetOverrides,
  saveAlphabetOverrides,
  clearAlphabetOverrides,
  hasAlphabetOverrides,
} from './alphabet-overrides.js';

/**
 * @param {object} opts
 * @param {() => object} opts.getRules — active rules (with overrides applied)
 * @param {() => Record<string, string>} opts.getMarkdownPrimarySymbols — symbols from language-rules.md
 * @param {(overrides: Record<string, string>) => void} opts.onApplyOverrides
 */
export function setupAlphabetLab({ getRules, getMarkdownPrimarySymbols, onApplyOverrides }) {
  const panel = document.getElementById('tab-alphabet');
  if (!panel) return;

  const gridEl = document.getElementById('alphabet-primary-grid');
  const previewGrid = document.getElementById('alphabet-preview-grid');
  const previewVowels = document.getElementById('alphabet-preview-vowels');
  const previewWords = document.getElementById('alphabet-preview-words');
  const sampleInput = document.getElementById('alphabet-sample-input');
  const sampleOutput = document.getElementById('alphabet-sample-output');
  const statusEl = document.getElementById('alphabet-status');

  /** @type {Record<string, string>} */
  let draftOverrides = { ...loadAlphabetOverrides() };

  function markdownBase(id) {
    return getMarkdownPrimarySymbols()?.[id] ?? '';
  }

  function effectiveSymbol(id, rulesEntry) {
    if (Object.hasOwn(draftOverrides, id)) return draftOverrides[id];
    const stored = loadAlphabetOverrides()[id];
    if (stored) return stored;
    return markdownBase(id) || rulesEntry.symbol;
  }

  function previewRules() {
    const stored = loadAlphabetOverrides();
    const md = getMarkdownPrimarySymbols();
    const base = structuredClone(getRules());

    for (const place of base.places) {
      const id = place.id;
      if (Object.hasOwn(draftOverrides, id)) {
        place.symbol = draftOverrides[id];
      } else {
        place.symbol = stored[id] ?? md[id] ?? place.symbol;
      }
    }
    for (const mod of base.modifiers) {
      const id = mod.id;
      if (Object.hasOwn(draftOverrides, id)) {
        mod.symbol = draftOverrides[id];
      } else {
        mod.symbol = stored[id] ?? md[id] ?? mod.symbol;
      }
    }
    applyPrimarySymbols(base);
    return base;
  }

  function setStatus(msg, kind = 'info') {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind;
    statusEl.hidden = !msg;
  }

  function renderPrimaryEditor() {
    const rules = getRules();
    const entries = getPrimarySymbolEntries(rules);
    gridEl.innerHTML = '';

    for (const entry of entries) {
      const card = document.createElement('div');
      card.className = `alphabet-card alphabet-card--${entry.kind}`;
      const mdSym = markdownBase(entry.id);
      const current = effectiveSymbol(entry.id, entry);
      const changed = current !== mdSym;

      card.innerHTML = `
        <div class="alphabet-card-head">
          <span class="alphabet-card-label">${escapeHtml(entry.label)}</span>
          <span class="alphabet-card-id">${escapeHtml(entry.id)}</span>
        </div>
        <div class="alphabet-card-markdown" title="Value in language-rules.md">
          MD: <span class="symbol-text">${escapeHtml(mdSym)}</span>
        </div>
        <input type="text" class="alphabet-symbol-input symbol-text" maxlength="4"
          data-id="${escapeHtml(entry.id)}" value="${escapeHtml(current)}"
          aria-label="${escapeHtml(entry.label)} symbol">
        ${changed ? '<span class="alphabet-changed-badge">draft</span>' : ''}
      `;

      const input = card.querySelector('.alphabet-symbol-input');
      input.addEventListener('input', () => {
        const val = input.value.trim();
        if (!val || val === mdSym) {
          delete draftOverrides[entry.id];
        } else {
          draftOverrides[entry.id] = val;
        }
        renderPrimaryEditor();
        renderPreviews();
      });

      gridEl.appendChild(card);
    }
  }

  function renderPreviews() {
    const rules = previewRules();
    const { places, modifiers } = rules;

    previewGrid.innerHTML = '';
    const head = document.createElement('tr');
    head.innerHTML = '<th></th>' + places.map((p) =>
      `<th class="symbol-text">${escapeHtml(p.symbol)}</th>`,
    ).join('');
    previewGrid.appendChild(head);

    for (const modId of MODIFIER_ROW_ORDER) {
      const tr = document.createElement('tr');
      const modLabel = modId === 'plain' ? 'plain' : modifiers.find((m) => m.id === modId)?.symbol || modId;
      tr.innerHTML = `<th class="symbol-text">${escapeHtml(modLabel)}</th>`;
      for (const place of places) {
        const td = document.createElement('td');
        td.className = 'symbol-text';
        td.textContent = composeGridSymbol(modId, place.id, places, modifiers);
        tr.appendChild(td);
      }
      previewGrid.appendChild(tr);
    }

    previewVowels.innerHTML = '';
    for (const v of rules.experimentalVowels || []) {
      const sounds = formatVowelSoundExamples(v);
      const soundsHtml = sounds.length
        ? `<ul class="vowel-sounds-list">${sounds.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
        : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(v.vowel)}</td><td class="symbol-text">${escapeHtml(v.symbols)}</td><td>${escapeHtml(v.description || v.explanation || '')}</td><td>${escapeHtml(v.plane || '')} + ${escapeHtml(v.component || '')}</td><td class="vowel-sounds-cell">${soundsHtml}</td>`;
      previewVowels.appendChild(tr);
    }

    previewWords.innerHTML = '';
    for (const ex of composeCvExamples(rules)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(ex.word)}</td><td class="symbol-text">${escapeHtml(ex.spelling)}</td>`;
      previewWords.appendChild(tr);
    }

    updateSampleOutput(rules);
  }

  function updateSampleOutput(rules) {
    if (!sampleInput || !sampleOutput) return;
    const text = sampleInput.value.trim() || 'pa pe pi po pu';
    const encoded = encodeSounds(text.replace(/\s+/g, ''), rules);
    sampleOutput.textContent = encoded.symbols || '(empty)';
  }

  document.getElementById('alphabet-apply')?.addEventListener('click', () => {
    const clean = {};
    for (const [id, sym] of Object.entries(draftOverrides)) {
      const base = markdownBase(id);
      if (sym && sym !== base) clean[id] = sym;
    }
    saveAlphabetOverrides(clean);
    draftOverrides = { ...clean };
    onApplyOverrides(clean);
    setStatus(
      Object.keys(clean).length
        ? `Saved ${Object.keys(clean).length} override(s) to localStorage. App updated.`
        : 'No overrides — using markdown symbols only.',
      'success',
    );
    renderPrimaryEditor();
    renderPreviews();
  });

  document.getElementById('alphabet-reset-draft')?.addEventListener('click', () => {
    draftOverrides = { ...loadAlphabetOverrides() };
    renderPrimaryEditor();
    renderPreviews();
    setStatus('Draft reset to last saved overrides.', 'info');
  });

  document.getElementById('alphabet-clear')?.addEventListener('click', () => {
    clearAlphabetOverrides();
    draftOverrides = {};
    onApplyOverrides({});
    setStatus('Cleared overrides. Reloaded symbols from language-rules.md.', 'success');
    renderPrimaryEditor();
    renderPreviews();
  });

  sampleInput?.addEventListener('input', () => updateSampleOutput(previewRules()));

  if (hasAlphabetOverrides()) {
    setStatus('Alphabet overrides loaded from localStorage.', 'info');
  }

  renderPrimaryEditor();
  renderPreviews();
}
