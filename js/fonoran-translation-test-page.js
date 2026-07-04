/**
 * Translation Test — admin tab at /tools#translation-test
 * Latest English corpus run through the translator (formerly /language#gaps).
 */

import { escapeHtml } from './utils.js';
import { refreshAuth } from './auth-session.js';

const TAB_ROOT = () => document.getElementById('tab-translation-test');

const state = {
  report: null,
  expanded: {},
  loading: false,
};

function $(id) {
  return TAB_ROOT()?.querySelector(`#${id}`) ?? document.getElementById(id);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await refreshAuth();
    throw new Error('Sign in required');
  }
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

function gapCoverageColor(pct) {
  return pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--review)' : 'var(--reject)';
}

function buildGapPhraseRow(p) {
  const miss = p.unresolved.length
    ? `<div class="gap-phrase__missing">missing: ${p.unresolved.map((w) => `<span class="gap-chip">${escapeHtml(w)}</span>`).join(' ')}</div>`
    : '';
  const status = p.unresolved.length === 0
    ? '<span class="gap-status gap-status--ok">✓</span>'
    : `<span class="gap-status gap-status--bad">✗ ${p.unresolved.length}</span>`;
  return `
    <div class="gap-phrase${p.unresolved.length ? ' gap-phrase--miss' : ''}">
      <div class="gap-phrase__head">${status}<span class="gap-phrase__en">${escapeHtml(p.phrase)}</span></div>
      <div class="gap-phrase__fon mono">${escapeHtml(p.roman || '(empty)')}</div>
      ${miss}
    </div>`;
}

function buildGapReportHtml(r) {
  const summary = `
    <div class="gap-summary">
      <div class="gap-stat">
        <div class="gap-stat__value" style="color:${gapCoverageColor(r.coverage_pct)}">${r.coverage_pct}%</div>
        <div class="gap-stat__label">Coverage</div>
      </div>
      <div class="gap-stat">
        <div class="gap-stat__value">${r.clean_phrases}/${r.total_phrases}</div>
        <div class="gap-stat__label">Phrases fully resolved</div>
      </div>
      <div class="gap-stat">
        <div class="gap-stat__value" style="color:var(--reject)">${r.distinct_gaps}</div>
        <div class="gap-stat__label">Distinct missing concepts</div>
      </div>
    </div>`;

  const coverageBars = `
    <section class="gap-block">
      <h3 class="section-h">Coverage by level</h3>
      <div class="gap-levels">
        ${(r.levels ?? []).map((s) => `
          <div class="gap-level-row">
            <div class="gap-level-row__name">L${s.level} · ${escapeHtml(s.name)}</div>
            <div class="gap-level-row__bar"><span style="width:${s.coverage}%;background:${gapCoverageColor(s.coverage)}"></span></div>
            <div class="gap-level-row__pct">${s.clean}/${s.phrases}</div>
          </div>`).join('')}
      </div>
    </section>`;

  const gapList = `
    <section class="gap-block">
      <h3 class="section-h">Missing concepts <span class="gap-count">(by frequency)</span></h3>
      ${!(r.gaps ?? []).length
        ? '<p class="empty">No gaps — every phrase fully resolved.</p>'
        : `<div class="gap-list">${(r.gaps ?? []).map((g) => `
            <div class="gap-item">
              <span class="gap-item__count">${g.count}×</span>
              <span class="gap-item__word">${escapeHtml(g.word)}</span>
              <span class="gap-item__sample">${escapeHtml(g.samples[0] ?? '')}</span>
              ${(g.suggestions ?? []).length
                ? `<span class="gap-item__suggest" title="WordNet curation suggestions — approve into localizations/en.json">↳ ${g.suggestions.map((s) => `${escapeHtml(s.fonoran)}=${escapeHtml(s.concept_id)}`).join(', ')}</span>`
                : ''}
            </div>`).join('')}</div>`}
    </section>`;

  const byLevel = new Map();
  for (const p of r.phrases ?? []) {
    if (!byLevel.has(p.level)) byLevel.set(p.level, []);
    byLevel.get(p.level).push(p);
  }
  const phraseGroups = `
    <section class="gap-block">
      <h3 class="section-h">Phrase-by-phrase</h3>
      <div class="gap-groups">
        ${(r.levels ?? []).map((s) => {
          const expanded = state.expanded[s.level];
          const phrases = byLevel.get(s.level) ?? [];
          return `
            <div class="gap-group">
              <button type="button" class="gap-group__head" data-gap-level-toggle="${s.level}" aria-expanded="${expanded ? 'true' : 'false'}">
                <span class="gap-group__chevron">${expanded ? '▾' : '▸'}</span>
                <span class="gap-group__title">Level ${s.level}: ${escapeHtml(s.name)}</span>
                <span class="gap-group__meta" style="color:${gapCoverageColor(s.coverage)}">${s.coverage}%</span>
              </button>
              ${expanded ? `<div class="gap-group__body">${phrases.map(buildGapPhraseRow).join('')}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </section>`;

  return summary + coverageBars + gapList + phraseGroups;
}

function pageHtml({ r, loading }) {
  const body = loading
    ? '<div class="gap-running"><span class="gap-spinner"></span> Loading latest results…</div>'
    : r
      ? buildGapReportHtml(r)
      : '<p class="empty">No saved run yet. Run <code>npm run test:translator</code> or use <strong>Run full test</strong> above.</p>';

  const stamp = r?.generated_at
    ? `<span class="gap-controls__hint sans">Latest run ${new Date(r.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>`
    : '';

  return `
    <div class="box translation-test-page">
      <div class="gap-controls">
        ${stamp}
        <button type="button" class="btn btn--sm" id="translation-test-refresh" ${loading ? 'disabled' : ''}>↺ Refresh</button>
        <button type="button" class="btn btn--sm btn--primary" id="translation-test-run" data-write ${loading ? 'disabled' : ''}>Run full test</button>
      </div>
      ${body}
    </div>`;
}

function wireControls(root) {
  root.querySelectorAll('[data-gap-level-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lvl = Number(btn.dataset.gapLevelToggle);
      state.expanded[lvl] = !state.expanded[lvl];
      render();
    });
  });

  root.querySelector('#translation-test-refresh')?.addEventListener('click', () => {
    void loadReport(true);
  });

  root.querySelector('#translation-test-run')?.addEventListener('click', async () => {
    const btn = root.querySelector('#translation-test-run');
    if (btn) btn.disabled = true;
    state.loading = true;
    render();
    try {
      state.report = await api('/api/fonoran/translation-tests/run', { method: 'POST', body: '{}' });
    } catch (err) {
      state.report = null;
      console.error('[translation-test] run failed:', err);
    }
    state.loading = false;
    render();
  });
}

function render() {
  const el = $('translation-test-body');
  if (!el) return;
  el.innerHTML = pageHtml({ r: state.report, loading: state.loading });
  wireControls(el);
}

async function loadReport(force = false) {
  if (state.loading) {
    render();
    return;
  }
  if (state.report && !force) {
    render();
    return;
  }
  state.loading = true;
  render();
  try {
    state.report = await api('/api/fonoran/translation-tests/latest');
  } catch {
    state.report = null;
  }
  state.loading = false;
  render();
}

let wired = false;

function wireEvents() {
  if (wired) return;
  wired = true;
}

/** Redirect legacy /language#gaps (and stray #translation-test) to Tools. */
export function migrateTranslationTestHash() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  if ((path === '/language' || path.startsWith('/language/')) && (hash === 'gaps' || hash === 'translation-test')) {
    window.location.replace(`/tools#translation-test${window.location.search}`);
  }
}

export function onTranslationTestTabActivated() {
  wireEvents();
  if (state.report || state.loading) {
    render();
    if (state.report) return;
  }
  void loadReport();
}
