/**
 * Shared suggestion / alternate composition panel markup.
 */

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.hint]
 * @param {Array<{ composition: string[], readable?: string, understandability?: number, label?: string }>} opts.candidates
 * @param {string} opts.prefix - id prefix for action buttons
 * @param {(c: object, index: number) => string} [opts.extraMeta]
 */
export function buildSuggestionPanelHtml({
  title,
  hint,
  candidates = [],
  prefix,
  extraMeta,
  emptyMessage = 'No suggestions yet. Click the button above to generate options.',
}) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  if (!candidates.length) {
    return `<div class="dict-alternates-panel dict-alternates-panel--empty wm-suggestions" id="${esc(prefix)}-panel">
      <header class="dict-alternates-panel__head"><h4>${esc(title)}</h4></header>
      <p class="sans dict-alternates-panel__empty">${esc(emptyMessage)}</p>
    </div>`;
  }

  const items = candidates.map((c, i) => {
    const pct = c.understandability != null ? Math.round(c.understandability * 100) : null;
    const readable = c.readable ?? (c.composition ?? []).join(' + ');
    const meta = extraMeta?.(c, i) ?? '';
    return `<li class="dict-alt wm-suggestion" data-suggestion-index="${i}">
      <div class="dict-alt__main">
        <span class="dict-alt__spelling mono">${esc(readable)}</span>
        ${c.label ? `<span class="dict-alt__pill">${esc(c.label)}</span>` : ''}
        ${meta}
      </div>
      <div class="dict-alt__meta">
        ${pct != null ? `<div class="dict-alt__score-row" title="Understandability (advisory)">
          <span class="dict-alt__bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
          <span class="dict-alt__score">${pct}%</span>
        </div>` : ''}
        <button type="button" class="btn btn--sm btn--primary" data-suggestion-use="${i}">Use this</button>
        <button type="button" class="btn btn--sm" data-suggestion-edit="${i}">Edit</button>
      </div>
    </li>`;
  }).join('');

  return `<div class="dict-alternates-panel wm-suggestions" id="${esc(prefix)}-panel">
    <header class="dict-alternates-panel__head">
      <h4>${esc(title)}</h4>
      ${hint ? `<p class="dict-alternates-panel__hint sans graph-hint">${esc(hint)}</p>` : ''}
    </header>
    <ul class="dict-alternates-list">${items}</ul>
  </div>`;
}

/**
 * @param {object} opts
 * @param {Array<{ spelling: string, pronunciation_ease?: number, generation?: object }>} opts.candidates
 * @param {string} opts.prefix
 */
export function buildRootSoundPanelHtml({ candidates = [], prefix, title = 'Sound options' }) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  if (!candidates.length) {
    return `<div class="dict-alternates-panel dict-alternates-panel--empty wm-suggestions" id="${esc(prefix)}-panel">
      <header class="dict-alternates-panel__head"><h4>${esc(title)}</h4></header>
      <p class="sans dict-alternates-panel__empty">Click Regenerate sound to see algorithmic options.</p>
    </div>`;
  }

  const items = candidates.map((c, i) => {
    const ease = c.pronunciation_ease ?? c.generation?.phonetic_cost;
    const easeLabel = typeof ease === 'number' ? `${ease}` : '';
    return `<li class="dict-alt wm-suggestion" data-sound-index="${i}">
      <div class="dict-alt__main">
        <span class="dict-alt__spelling mono">${esc(c.spelling)}</span>
        ${easeLabel ? `<span class="dict-alt__pill">ease ${esc(easeLabel)}</span>` : ''}
      </div>
      <div class="dict-alt__meta">
        <button type="button" class="btn btn--sm btn--primary" data-sound-apply="${i}">Apply</button>
      </div>
    </li>`;
  }).join('');

  return `<div class="dict-alternates-panel wm-suggestions" id="${esc(prefix)}-panel">
    <header class="dict-alternates-panel__head"><h4>${esc(title)}</h4></header>
    <ul class="dict-alternates-list">${items}</ul>
  </div>`;
}
