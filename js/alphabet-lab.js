import {
  getPrimarySymbolEntries,
  applyPrimarySymbols,
} from './symbol-compose.js';
import { escapeHtml } from './utils.js';
import { buildPhonemeInventory } from './rules.js';
import {
  loadAlphabetOverrides,
  saveAlphabetOverrides,
  clearAlphabetOverrides,
  hasAlphabetOverrides,
} from './alphabet-overrides.js';

function renderInventoryRows(rows) {
  return rows
    .map(
      (row) => `
      <tr>
        <td class="alphabet-inventory-key">${escapeHtml(row.key)}</td>
        <td class="symbol-text alphabet-inventory-symbol">${escapeHtml(row.symbols)}</td>
        <td>${escapeHtml(row.ipa)}</td>
        <td class="alphabet-inventory-notes">${escapeHtml(row.notes)}</td>
      </tr>`,
    )
    .join('');
}

/**
 * @param {object} opts
 * @param {() => object} opts.getRules, active rules (with overrides applied)
 * @param {() => Record<string, string>} opts.getMarkdownPrimarySymbols, symbols from language-rules.md
 * @param {(overrides: Record<string, string>) => void} opts.onApplyOverrides
 */
export function setupAlphabetLab({ getRules, getMarkdownPrimarySymbols, onApplyOverrides }) {
  const panel = document.getElementById('tab-alphabet');
  if (!panel) return;

  const gridEl = document.getElementById('alphabet-primary-grid');
  const consonantsBody = document.getElementById('alphabet-inventory-consonants');
  const derivedBody = document.getElementById('alphabet-inventory-derived');
  const vowelsBody = document.getElementById('alphabet-inventory-vowels');
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
        renderPhonemeInventory();
      });

      gridEl.appendChild(card);
    }
  }

  function renderPhonemeInventory() {
    const { consonants, derived, vowels } = buildPhonemeInventory(previewRules());
    if (consonantsBody) consonantsBody.innerHTML = renderInventoryRows(consonants);
    if (derivedBody) derivedBody.innerHTML = renderInventoryRows(derived);
    if (vowelsBody) vowelsBody.innerHTML = renderInventoryRows(vowels);
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
        : 'No overrides, using markdown symbols only.',
      'success',
    );
    renderPrimaryEditor();
    renderPhonemeInventory();
  });

  document.getElementById('alphabet-reset-draft')?.addEventListener('click', () => {
    draftOverrides = { ...loadAlphabetOverrides() };
    renderPrimaryEditor();
    renderPhonemeInventory();
    setStatus('Draft reset to last saved overrides.', 'info');
  });

  document.getElementById('alphabet-clear')?.addEventListener('click', () => {
    clearAlphabetOverrides();
    draftOverrides = {};
    onApplyOverrides({});
    setStatus('Cleared overrides. Reloaded symbols from language-rules.md.', 'success');
    renderPrimaryEditor();
    renderPhonemeInventory();
  });

  if (hasAlphabetOverrides()) {
    setStatus('Alphabet overrides loaded from localStorage.', 'info');
  }

  renderPrimaryEditor();
  renderPhonemeInventory();
}
