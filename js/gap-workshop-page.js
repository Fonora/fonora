/**
 * Gap Workshop — admin tab at /tools#gap-workshop
 *
 * Three-panel workflow:
 *   1. Queue (left) — gaps, open LLM proposals, playtest promotions
 *   2. Detail (right) — selected item details + action buttons
 *   3. Inline LLM analysis — runs on demand per gap
 */

import { escapeHtml } from './utils.js';
import { loadLanguageRules } from './load-language-rules.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';

const TAB_ROOT = () => document.getElementById('tab-gap-workshop');

/** @type {ResizeObserver | null} */
let stickyObserver = null;

function syncStickyOffsets() {
  const header = document.getElementById('app-header-root');
  let headerBottom = 0;
  if (header) {
    headerBottom = Math.ceil(header.getBoundingClientRect().bottom);
    document.documentElement.style.setProperty('--fonoran-header-offset', `${headerBottom}px`);
  }
  const root = TAB_ROOT();
  const toolbar = root?.querySelector('.page-toolbar-shell');
  const grid = root?.querySelector('.fonoran-split-grid');
  const gridGap = grid ? parseFloat(getComputedStyle(grid).marginTop) || 0 : 0;
  const toolbarHeight = toolbar?.offsetHeight || 0;
  document.documentElement.style.setProperty(
    '--fonoran-split-chrome-offset',
    `${headerBottom + toolbarHeight + gridGap}px`,
  );
  if (toolbar) {
    document.documentElement.style.setProperty('--page-chrome-offset', `${toolbarHeight}px`);
  }
}

function ensureStickyObserver() {
  const header = document.getElementById('app-header-root');
  const root = TAB_ROOT();
  if (!header || !root) return;
  if (!stickyObserver) {
    stickyObserver = new ResizeObserver(() => syncStickyOffsets());
    stickyObserver.observe(header);
    window.addEventListener('resize', syncStickyOffsets);
  }
  root.querySelectorAll('.page-toolbar-shell').forEach((el) => {
    if (!el.dataset.stickyObserved) {
      el.dataset.stickyObserved = '1';
      stickyObserver.observe(el);
    }
  });
  syncStickyOffsets();
  requestAnimationFrame(syncStickyOffsets);
}

function $(id) {
  return TAB_ROOT()?.querySelector(`#${id}`) ?? document.getElementById(id);
}

function toast(msg, isError = false) {
  let el = document.getElementById('gw-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gw-toast';
    el.className = 'wm-toast sans';
    TAB_ROOT()?.appendChild(el);
  }
  el.textContent = String(msg);
  el.className = `wm-toast sans${isError ? ' wm-toast--error' : ''}`;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 4000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  activeTab: 'proposals',   // 'proposals' | 'resolved' | 'playtests'
  openProposals: [],
  resolvedProposals: [],
  promotions: [],
  selectedId: null,
  analyzing: false,
  loading: false,
};

function allProposals() {
  return [...state.openProposals, ...state.resolvedProposals];
}

function findProposal(id) {
  return allProposals().find((p) => p.id === id) ?? null;
}

/** @type {object | null} */
let lab = null;
/** @type {object | null} */
let rules = null;

async function ensureLab() {
  if (!rules) {
    const bundle = await loadLanguageRules();
    rules = bundle.rules ?? null;
  }
  if (lab) return lab;
  const bootstrap = await api('/api/fonoran/bootstrap');
  lab = bootstrap.lab ?? null;
  return lab;
}

function findSound(conceptId) {
  return lab?.sounds?.find(
    (s) => s.state !== 'rejected' && (s.concept_id === conceptId || s.spelling === conceptId),
  ) ?? null;
}

function findCompound(conceptId) {
  return lab?.compounds?.find(
    (c) => c.state !== 'rejected' && (c.concept_id === conceptId || c.id === conceptId || c.spelling === conceptId),
  ) ?? null;
}

function flatSpellingsForComponent(comp) {
  if (!comp) return [];
  if (comp.type === 'word') {
    const word = findCompound(comp.ref) ?? findCompound(comp.spelling);
    if (word?.components?.length) {
      return word.components.flatMap(flatSpellingsForComponent);
    }
    if (word?.parts?.length) return word.parts;
    return [word?.spelling ?? comp.spelling ?? comp.ref.replace(/^cmp-/, '')];
  }
  const sp = comp.spelling || comp.ref;
  if (sp) return [sp];
  return [];
}

/** @param {string[]} composition concept ids or root refs */
function flatSpellingsForComposition(composition) {
  if (!Array.isArray(composition) || !composition.length) return [];
  return composition.flatMap((conceptId) => {
    const compound = findCompound(conceptId);
    if (compound) {
      if (compound.components?.length) {
        return compound.components.flatMap(flatSpellingsForComponent);
      }
      if (compound.parts?.length) return compound.parts;
      if (compound.spelling) return [compound.spelling];
    }
    const sound = findSound(conceptId);
    if (sound?.spelling) return [sound.spelling];
    return [conceptId];
  });
}

function spellingsToGlyphs(parts) {
  if (!rules || !parts?.length) return '';
  return romanToFonoraScript(parts, rules).phrase ?? '';
}

function glyphHtml(parts, className = 'gw-glyphs') {
  const glyphs = spellingsToGlyphs(parts);
  if (!glyphs) return '';
  return `<span class="${className} symbol-text fonora-script" aria-hidden="true">${escapeHtml(glyphs)}</span>`;
}

function proposalSpellings(prop) {
  if (prop.classification === 'alias' && prop.alias_proposal?.existing_concept_id) {
    return flatSpellingsForComposition([prop.alias_proposal.existing_concept_id]);
  }
  if (prop.classification === 'primitive' && prop.primitive_proposal?.suggested_id) {
    return [prop.primitive_proposal.suggested_id];
  }
  const comp = prop.valid_compositions?.[0];
  if (comp?.length) return flatSpellingsForComposition(comp);
  return [];
}

function promotionSpellings(promo) {
  if (promo.current_composition?.length) {
    return flatSpellingsForComposition(promo.current_composition);
  }
  const compound = findCompound(promo.concept_id);
  if (compound?.spelling) return flatSpellingsForComposition([promo.concept_id]);
  const sound = findSound(promo.concept_id);
  if (sound?.spelling) return [sound.spelling];
  return [];
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadProposals() {
  try {
    const [open, accepted, rejected, skipped] = await Promise.all([
      api('/api/fonoran/compound-proposals?status=open&limit=100'),
      api('/api/fonoran/compound-proposals?status=accepted&limit=100'),
      api('/api/fonoran/compound-proposals?status=rejected&limit=100'),
      api('/api/fonoran/compound-proposals?status=skipped&limit=100'),
    ]);
    state.openProposals = open?.proposals ?? [];
    state.resolvedProposals = [
      ...(accepted?.proposals ?? []),
      ...(rejected?.proposals ?? []),
      ...(skipped?.proposals ?? []),
    ].sort((a, b) => new Date(b.resolved_at ?? 0) - new Date(a.resolved_at ?? 0));
  } catch {
    state.openProposals = [];
    state.resolvedProposals = [];
  }
}

async function loadPromotions() {
  try {
    const r = await api('/api/fonoran/playtests/promotions?min_rounds=2&min_rate=0.6');
    state.promotions = r?.promotions ?? [];
  } catch {
    state.promotions = [];
  }
}

async function reloadAll() {
  state.loading = true;
  renderQueue();
  await Promise.all([loadProposals(), loadPromotions()]);
  state.loading = false;
  renderQueue();
  // Re-select if still present
  renderDetail();
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function classificationBadge(cls) {
  const colors = { compound: 'badge--blue', primitive: 'badge--purple', alias: 'badge--green', unknown: 'badge--muted' };
  return `<span class="gw-badge ${colors[cls] ?? 'badge--muted'}">${escapeHtml(cls)}</span>`;
}

function recoveryBar(rate) {
  if (rate == null) return '';
  const pct = Math.round(rate * 100);
  const color = pct >= 70 ? '#2d6a4f' : pct >= 40 ? '#c4a574' : '#9a3b3b';
  return `<span class="gw-rate" style="--gw-rate-pct:${pct}%;--gw-rate-color:${color}" title="${pct}% recovery">${pct}%</span>`;
}

// ── Queue panel ───────────────────────────────────────────────────────────────

function renderQueue() {
  const root = TAB_ROOT();
  if (!root) return;

  // Tab counts
  const tabProposals = root.querySelector('[data-gw-tab="proposals"]');
  const tabResolved = root.querySelector('[data-gw-tab="resolved"]');
  const tabPlaytests = root.querySelector('[data-gw-tab="playtests"]');
  if (tabProposals) tabProposals.dataset.count = state.openProposals.length;
  if (tabResolved) tabResolved.dataset.count = state.resolvedProposals.length;
  if (tabPlaytests) tabPlaytests.dataset.count = state.promotions.length;

  // Active tab label
  root.querySelectorAll('[data-gw-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gwTab === state.activeTab);
    const count = btn.dataset.count;
    btn.textContent = btn.dataset.gwLabel + (count > 0 ? ` (${count})` : '');
  });

  const list = root.querySelector('.gw-queue-list');
  if (!list) return;

  if (state.loading) {
    list.innerHTML = '<p class="gw-empty sans">Loading…</p>';
    return;
  }

  if (state.activeTab === 'proposals') {
    renderOpenProposalsList(list);
  } else if (state.activeTab === 'resolved') {
    renderResolvedProposalsList(list);
  } else {
    renderPromotionsList(list);
  }
  requestAnimationFrame(syncStickyOffsets);
}

function renderOpenProposalsList(list) {
  if (!state.openProposals.length) {
    list.innerHTML = '<p class="gw-empty sans">No open proposals. Run <code>npm run fonoran:vocab-survey</code> to generate compound proposals.</p>';
    return;
  }
  list.innerHTML = state.openProposals.map((p) => renderProposalItem(p)).join('');
}

function renderResolvedProposalsList(list) {
  if (!state.resolvedProposals.length) {
    list.innerHTML = '<p class="gw-empty sans">No resolved proposals yet. Accepted, rejected, and skipped items appear here.</p>';
    return;
  }
  list.innerHTML = state.resolvedProposals.map((p) => renderProposalItem(p)).join('');
}

function renderProposalItem(p) {
  const active = state.selectedId === `proposal:${p.id}` ? ' gw-item--active' : '';
  const comp = p.valid_compositions?.[0]?.join(' + ') ?? p.primitive_proposal?.suggested_id ?? '?';
  const statusBadge = p.status !== 'open'
    ? `<span class="gw-badge ${p.status === 'accepted' ? 'badge--green' : 'badge--muted'} gw-badge--sm">${p.status}</span>`
    : '';
  return `<button type="button" class="gw-item${active}" data-gw-id="proposal:${p.id}">
    <span class="gw-item__label">
      <span class="gw-item__word">${escapeHtml(p.word ?? p.concept_id ?? '?')}</span>
      ${glyphHtml(proposalSpellings(p), 'gw-item__glyphs')}
      ${statusBadge}
    </span>
    <span class="gw-item__meta sans">${classificationBadge(p.classification)} ${escapeHtml(comp)}</span>
  </button>`;
}

function renderPromotionsList(list) {
  if (!state.promotions.length) {
    list.innerHTML = '<p class="gw-empty sans">No playtest promotions ready yet. Need ≥2 rounds with ≥60% recovery rate.</p>';
    return;
  }
  list.innerHTML = state.promotions.map(p => {
    const active = state.selectedId === `promo:${p.concept_id}` ? ' gw-item--active' : '';
    return `<button type="button" class="gw-item${active}" data-gw-id="promo:${p.concept_id}">
      <span class="gw-item__label">
        <span class="gw-item__word">${escapeHtml(p.concept_id)}</span>
        ${glyphHtml(promotionSpellings(p), 'gw-item__glyphs')}
      </span>
      <span class="gw-item__meta sans">${recoveryBar(p.recovery_rate)} · ${p.rounds} rounds</span>
    </button>`;
  }).join('');
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function renderDetail() {
  const panel = $('gw-detail');
  if (!panel) return;

  if (!state.selectedId) {
    panel.innerHTML = `<div class="wm-empty-state">
      <div class="wm-empty-state__body">
        <p class="wm-empty-state__lead">Pick an item from the queue</p>
        <p class="wm-empty-state__hint">Select an open proposal to review, a resolved item to inspect, or a playtest promotion to accept.</p>
      </div>
    </div>`;
    return;
  }

  if (state.selectedId.startsWith('gap:')) {
    renderGapDetail(panel, state.selectedId.slice(4));
  } else if (state.selectedId.startsWith('proposal:')) {
    const id = state.selectedId.slice(9);
    const prop = findProposal(id);
    if (prop) renderProposalDetail(panel, prop);
  } else if (state.selectedId.startsWith('promo:')) {
    const conceptId = state.selectedId.slice(6);
    const promo = state.promotions.find(p => p.concept_id === conceptId);
    if (promo) renderPromotionDetail(panel, promo);
  }
}

function renderGapDetail(panel, word) {
  const gap = state.gaps.find(g => g.word === word);
  if (!gap) { panel.innerHTML = '<p class="gw-empty sans">Gap not found.</p>'; return; }
  const existingProposals = state.openProposals.filter(p => p.word === word);

  const samplesHtml = gap.samples?.length
    ? `<div class="gw-samples">${gap.samples.map(s => `<div class="gw-sample sans">"${escapeHtml(s)}"</div>`).join('')}</div>`
    : '';

  const existingProposalsHtml = existingProposals.length
    ? `<div class="gw-section">
        <h4 class="gw-section-title">Open proposals (${existingProposals.length})</h4>
        ${existingProposals.map(p => `
          <div class="gw-prop-preview">
            ${classificationBadge(p.classification)}
            ${p.valid_compositions?.[0] ? `<code>${p.valid_compositions[0].join(' + ')}</code>` : ''}
            <span class="sans gw-prop-preview__rationale">${escapeHtml(p.rationale ?? '')}</span>
          </div>`).join('')}
      </div>`
    : '';

  panel.innerHTML = `
    <div class="gw-detail-head">
      <h2 class="gw-detail-title">"${escapeHtml(word)}"</h2>
      <p class="gw-detail-meta sans">Role: <strong>${escapeHtml(gap.role ?? 'concept')}</strong> · Appears in <strong>${gap.count ?? 0}</strong> phrase(s)</p>
    </div>
    ${samplesHtml}
    ${existingProposalsHtml}
    <div class="gw-section gw-analyze-section">
      <h4 class="gw-section-title">LLM Analysis</h4>
      <p class="sans gw-hint">The LLM will classify this as compound, primitive, or alias and propose compositions or concept metadata.</p>
      <button type="button" class="btn btn--primary" id="gw-analyze-btn" ${state.analyzing ? 'disabled' : ''}>
        ${state.analyzing ? 'Analyzing…' : '✦ Analyze with LLM'}
      </button>
    </div>
    <div id="gw-analysis-result"></div>
  `;

  const analyzeBtn = $('gw-analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => runGapAnalysis(word, gap.role ?? 'concept'));
  }
}

async function runGapAnalysis(word, role) {
  if (state.analyzing) return;
  state.analyzing = true;
  const resultEl = $('gw-analysis-result');
  const analyzeBtn = $('gw-analyze-btn');
  if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing…'; }
  if (resultEl) resultEl.innerHTML = '<div class="gw-spinner sans">Asking LLM…</div>';

  try {
    const { analysis, proposal } = await api('/api/fonoran/gaps/suggest', {
      method: 'POST',
      body: JSON.stringify({ word, role }),
    });

    // Reload proposals so the new one shows
    await loadProposals();
    renderQueue();

    if (resultEl) {
      try {
        resultEl.innerHTML = renderAnalysisResult(analysis, proposal);
        wireProposalActions(resultEl, proposal?.id, proposal ?? analysis);
      } catch (renderErr) {
        resultEl.innerHTML = `<p class="gw-error sans">Render error: ${escapeHtml(String(renderErr))}</p>`;
        console.error('[gap-workshop] renderAnalysisResult failed:', renderErr);
      }
    }
    if (analyzeBtn) { analyzeBtn.textContent = 'Re-analyze'; analyzeBtn.disabled = false; }
  } catch (err) {
    toast(`Analysis failed: ${err.message}`, true);
    if (resultEl) resultEl.innerHTML = `<p class="gw-error sans">${escapeHtml(err.message)}</p>`;
    if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = '✦ Analyze with LLM'; }
  }
  state.analyzing = false;
}

function redundancyBadge(warning) {
  if (!warning) return '';
  const label = warning === 'edge_repeat' ? 'A…A repeat' : 'adjacent repeat';
  const title = warning === 'edge_repeat'
    ? 'First and last primitive are the same — consider redesigning this composition'
    : 'Adjacent duplicate primitive — consider redesigning this composition';
  return `<span class="gw-badge gw-badge--warn" title="${escapeHtml(title)}" style="margin-left:0.4rem">⚠ ${escapeHtml(label)}</span>`;
}

function renderCompositionList(validComps, warnings, { selectable = false, selectedIndex = 0, title = 'Valid compositions' } = {}) {
  if (!validComps.length) return '';
  const hint = selectable && validComps.length > 1
    ? '<p class="sans gw-hint gw-compositions-hint">Click a composition to choose which one to accept.</p>'
    : '';
  return `
    <div class="gw-compositions${selectable ? ' gw-compositions--selectable' : ''}"${selectable ? ' role="radiogroup"' : ''}>
      <h5 class="gw-compositions-title">${escapeHtml(title)}</h5>
      ${hint}
      ${validComps.map((comp, i) => {
        const isBest = i === 0;
        const isSelected = selectable && i === selectedIndex;
        const rowClass = [
          'gw-comp-row',
          isBest ? 'gw-comp-row--best' : '',
          selectable ? 'gw-comp-row--selectable' : '',
          isSelected ? 'gw-comp-row--selected' : '',
        ].filter(Boolean).join(' ');
        return `
          <div class="${rowClass}"${selectable ? ` role="radio" tabindex="${isSelected ? 0 : -1}" aria-checked="${isSelected}" data-comp-index="${i}"` : ''}>
            <span class="gw-comp-index sans">${isBest ? '★' : `${i + 1}.`}</span>
            <span class="gw-comp-main">
              <code class="gw-comp-code">${comp.filter(Boolean).map(escapeHtml).join(' + ')}</code>
              ${glyphHtml(flatSpellingsForComposition(comp), 'gw-comp-glyphs')}
            </span>
            ${isBest ? '<span class="gw-comp-label sans">recommended</span>' : ''}
            ${isSelected ? '<span class="gw-comp-label gw-comp-label--selected sans">selected</span>' : ''}
            ${redundancyBadge(warnings[i])}
          </div>`;
      }).join('')}
    </div>`;
}

function wireCompositionSelection(container) {
  const group = container.querySelector('.gw-compositions--selectable');
  if (!group) return;

  const selectRow = (row) => {
    group.querySelectorAll('.gw-comp-row--selectable').forEach(r => {
      const selected = r === row;
      r.classList.toggle('gw-comp-row--selected', selected);
      r.setAttribute('aria-checked', selected ? 'true' : 'false');
      r.tabIndex = selected ? 0 : -1;
      const label = r.querySelector('.gw-comp-label--selected');
      if (selected && !label) {
        const el = document.createElement('span');
        el.className = 'gw-comp-label gw-comp-label--selected sans';
        el.textContent = 'selected';
        r.querySelector('.gw-comp-code')?.after(el);
      } else if (!selected && label) {
        label.remove();
      }
    });
  };

  group.querySelectorAll('.gw-comp-row--selectable').forEach(row => {
    row.addEventListener('click', () => selectRow(row));
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      selectRow(row);
    });
  });
}

function getSelectedCompositionIndex(container) {
  const selected = container.querySelector('.gw-comp-row--selected');
  if (!selected) return 0;
  const idx = Number(selected.dataset.compIndex);
  return Number.isFinite(idx) && idx >= 0 ? idx : 0;
}

function renderAnalysisResult(analysis, proposal) {
  if (!analysis) return '';
  const cls = analysis.classification;

  let bodyHtml = '';

  const validComps = (analysis.valid_compositions ?? []).filter(Array.isArray);
  const warnings = analysis.redundancy_warnings ?? [];
  if (cls === 'compound' && validComps.length) {
    bodyHtml = renderCompositionList(validComps, warnings, {
      selectable: Boolean(proposal?.id),
      title: 'Proposed compositions',
    });
  } else if (cls === 'primitive' && analysis.primitive_proposal) {
    const pp = analysis.primitive_proposal;
    bodyHtml = `
      <div class="gw-primitive-card">
        <div class="gw-primitive-field"><span class="gw-field-label sans">id:</span> <code>${escapeHtml(pp.suggested_id)}</code> ${glyphHtml(pp.suggested_id ? [pp.suggested_id] : [], 'gw-comp-glyphs')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">gloss:</span> ${escapeHtml(pp.gloss ?? '')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">domain:</span> ${escapeHtml(pp.domain ?? '')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">priority:</span> ${escapeHtml(pp.priority_class ?? '')}</div>
        <div class="gw-primitive-field gw-primitive-field--full"><span class="gw-field-label sans">campfire:</span> ${escapeHtml(pp.campfire_rationale ?? '')}</div>
      </div>`;
  } else if (cls === 'alias' && analysis.alias_proposal) {
    const aliasId = analysis.alias_proposal.existing_concept_id;
    bodyHtml = `
      <div class="gw-alias-card">
        <p class="sans">Maps to existing concept: <code>${escapeHtml(aliasId)}</code> ${glyphHtml(flatSpellingsForComposition([aliasId]), 'gw-comp-glyphs')}</p>
        <p class="sans gw-hint">${escapeHtml(analysis.alias_proposal.rationale ?? '')}</p>
      </div>`;
  }

  const proposalId = proposal?.id;
  return `
    <div class="gw-analysis-card">
      <div class="gw-analysis-card__head">
        ${classificationBadge(cls)}
        <span class="gw-analysis-rationale sans">${escapeHtml(analysis.rationale ?? '')}</span>
      </div>
      ${bodyHtml}
      ${proposalId ? `
        <div class="gw-proposal-actions" data-proposal-id="${escapeHtml(proposalId)}">
          <span class="sans gw-proposal-id">Proposal ${escapeHtml(proposalId)}</span>
          <div class="gw-action-row">
            <button type="button" class="btn btn--sm btn--primary" data-action="accepted">Accept</button>
            <button type="button" class="btn btn--sm gw-btn--skip" data-action="skipped">Skip</button>
            <button type="button" class="btn btn--sm wm-btn--reject" data-action="rejected">Reject</button>
          </div>
        </div>` : ''}
    </div>`;
}

function renderProposalDetail(panel, prop) {
  const propValidComps = (prop.valid_compositions ?? []).filter(Array.isArray);
  const propWarnings = prop.redundancy_warnings ?? [];
  const compHtml = prop.status === 'open' && propValidComps.length
    ? renderCompositionList(propValidComps, propWarnings, { selectable: true })
    : propValidComps.length
      ? renderCompositionList(propValidComps, propWarnings)
      : '';

  const primitiveHtml = prop.primitive_proposal
    ? `<div class="gw-primitive-card">
        <div class="gw-primitive-field"><span class="gw-field-label sans">id:</span> <code>${escapeHtml(prop.primitive_proposal.suggested_id ?? '')}</code> ${glyphHtml(prop.primitive_proposal.suggested_id ? [prop.primitive_proposal.suggested_id] : [], 'gw-comp-glyphs')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">gloss:</span> ${escapeHtml(prop.primitive_proposal.gloss ?? '')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">domain:</span> ${escapeHtml(prop.primitive_proposal.domain ?? '')}</div>
        <div class="gw-primitive-field gw-primitive-field--full"><span class="gw-field-label sans">campfire:</span> ${escapeHtml(prop.primitive_proposal.campfire_rationale ?? '')}</div>
      </div>`
    : '';

  panel.innerHTML = `
    <div class="gw-detail-head">
      <h2 class="gw-detail-title">"${escapeHtml(prop.word ?? prop.concept_id ?? '?')}"</h2>
      ${glyphHtml(proposalSpellings(prop), 'gw-detail-glyphs')}
      <p class="gw-detail-meta sans">${classificationBadge(prop.classification)} · ${escapeHtml(prop.source ?? 'llm')}</p>
    </div>
    <div class="gw-section">
      <p class="sans gw-hint">${escapeHtml(prop.rationale ?? '')}</p>
      ${compHtml}
      ${primitiveHtml}
    </div>
    ${prop.status === 'open' ? `
    <div class="gw-proposal-actions" data-proposal-id="${escapeHtml(prop.id)}">
      <div class="gw-action-row">
        <button type="button" class="btn btn--primary" data-action="accepted">Accept</button>
        <button type="button" class="btn gw-btn--skip" data-action="skipped">Skip</button>
        <button type="button" class="btn wm-btn--reject" data-action="rejected">Reject</button>
      </div>
    </div>` : `
    <div class="gw-proposal-actions">
      <span class="gw-badge ${prop.status === 'accepted' ? 'badge--green' : 'badge--muted'}">${escapeHtml(prop.status)}</span>
      ${prop.resolved_at ? `<span class="sans gw-hint" style="margin-left:0.5rem">${new Date(prop.resolved_at).toLocaleString()}</span>` : ''}
    </div>`}
  `;

  wireProposalActions(panel, prop.id, prop);
}

function renderPromotionDetail(panel, promo) {
  panel.innerHTML = `
    <div class="gw-detail-head">
      <h2 class="gw-detail-title">${escapeHtml(promo.concept_id)}</h2>
      ${glyphHtml(promotionSpellings(promo), 'gw-detail-glyphs')}
      <p class="gw-detail-meta sans">Playtest authority: ${recoveryBar(promo.recovery_rate)} over ${promo.rounds} round(s)</p>
    </div>
    <div class="gw-section">
      <div class="gw-primitive-card">
        <div class="gw-primitive-field"><span class="gw-field-label sans">current source:</span> ${escapeHtml(promo.current_preferred_source)}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">composition:</span> <code>${(promo.current_composition ?? []).map(escapeHtml).join(' + ')}</code> ${glyphHtml(promotionSpellings(promo), 'gw-comp-glyphs')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">avg repair turns:</span> ${promo.avg_repair_turns ?? '–'}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">last tested:</span> ${promo.last_playtest ? new Date(promo.last_playtest).toLocaleDateString() : '–'}</div>
      </div>
      <p class="sans gw-hint">Accepting this will promote the preferred_source to "playtest" in compounds.json on the next editorial commit. This marks the current composition as human-confirmed via playtest authority.</p>
      <div class="gw-action-row">
        <button type="button" class="btn btn--primary" id="gw-promote-btn" data-concept="${escapeHtml(promo.concept_id)}">Mark as playtest-approved</button>
      </div>
    </div>`;

  panel.querySelector('#gw-promote-btn')?.addEventListener('click', async (e) => {
    const conceptId = e.target.dataset.concept;
    e.target.disabled = true;
    try {
      await api(`/api/fonoran/lab/optimize-compounds`, {
        method: 'POST',
        body: JSON.stringify({ use_llm: false }),
      });
      toast(`Marked ${conceptId} for playtest promotion. Run fonoran:optimize-compounds to apply.`);
    } catch (err) {
      toast(`Could not promote: ${err.message}`, true);
      e.target.disabled = false;
    }
  });
}

function wireProposalActions(container, proposalId, analysisOrProp) {
  if (!proposalId) return;
  wireCompositionSelection(container);
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      btn.disabled = true;
      try {
        const body = { action };
        if (action === 'accepted') {
          body.chosen_composition_index = getSelectedCompositionIndex(container);
        }
        await api(`/api/fonoran/compound-proposals/${encodeURIComponent(proposalId)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });

        // Replace action buttons with a confirmation — keep the gap selected
        const actionsEl = container.querySelector('.gw-proposal-actions');
        if (actionsEl) {
          if (action === 'accepted') {
            actionsEl.innerHTML = `
              <div class="gw-confirmation">
                <span class="gw-badge badge--green">✓ Accepted</span>
                <span class="sans gw-hint" style="margin-left:0.5rem">Run <strong>Step 4 — Regenerate dictionary</strong> in Advanced to publish this word.</span>
                <a href="/tools#advanced" class="btn btn--sm" style="margin-left:auto">Go to Advanced →</a>
              </div>`;
          } else {
            const label = action === 'rejected' ? '✗ Rejected' : '→ Skipped';
            actionsEl.innerHTML = `<span class="gw-badge badge--muted">${label}</span>`;
          }
        }
        toast(action === 'accepted' ? 'Accepted. Regenerate dictionary to publish.' : `Proposal ${action}.`);
        await loadProposals();
        renderQueue();
        // Keep selectedId — user stays on this gap and clicks the next one when ready
      } catch (err) {
        toast(`Failed: ${err.message}`, true);
        btn.disabled = false;
      }
    });
  });
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents() {
  const root = TAB_ROOT();
  if (!root) return;

  // Tab switching
  root.querySelectorAll('[data-gw-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.gwTab;
      state.selectedId = null;
      renderQueue();
      renderDetail();
    });
  });

  // Queue item clicks (delegated)
  const list = root.querySelector('.gw-queue-list');
  list?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-gw-id]');
    if (!item) return;
    state.selectedId = item.dataset.gwId;
    renderQueue();
    renderDetail();
  });

  // Refresh button
  root.querySelector('#gw-refresh')?.addEventListener('click', () => reloadAll());
}

// ── Public entry point ────────────────────────────────────────────────────────

let _initialized = false;

export async function onGapWorkshopTabActivated() {
  if (!_initialized) {
    wireEvents();
    _initialized = true;
  }
  ensureStickyObserver();
  lab = null;
  await ensureLab();
  await reloadAll();
}
