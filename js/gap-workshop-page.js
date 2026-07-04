/**
 * Gap Workshop — admin tab at /tools#gap-workshop
 *
 * Three-panel workflow:
 *   1. Queue (left) — gaps, open LLM proposals, playtest promotions
 *   2. Detail (right) — selected item details + action buttons
 *   3. Inline LLM analysis — runs on demand per gap
 */

import { escapeHtml } from './utils.js';

const TAB_ROOT = () => document.getElementById('tab-gap-workshop');

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
  activeTab: 'proposals',   // 'proposals' | 'playtests'
  proposals: [],
  promotions: [],
  selectedId: null,
  analyzing: false,
  loading: false,
};

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadProposals() {
  try {
    // Load open + recently resolved so the user can see accepted work
    const [open, recent] = await Promise.all([
      api('/api/fonoran/compound-proposals?status=open&limit=100'),
      api('/api/fonoran/compound-proposals?status=accepted&limit=20'),
    ]);
    const openList = open?.proposals ?? [];
    const recentList = (recent?.proposals ?? []).filter(p => !openList.some(o => o.id === p.id));
    state.proposals = [...openList, ...recentList];
  } catch {
    state.proposals = [];
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
  const color = pct >= 70 ? '#4caf50' : pct >= 40 ? '#ff9800' : '#f44336';
  return `<span class="gw-rate" style="--gw-rate-pct:${pct}%;--gw-rate-color:${color}" title="${pct}% recovery">${pct}%</span>`;
}

// ── Queue panel ───────────────────────────────────────────────────────────────

function renderQueue() {
  const root = TAB_ROOT();
  if (!root) return;

  // Tab counts
  const tabGaps = root.querySelector('[data-gw-tab="gaps"]');
  const tabProposals = root.querySelector('[data-gw-tab="proposals"]');
  const tabPlaytests = root.querySelector('[data-gw-tab="playtests"]');
  if (tabGaps) tabGaps.dataset.count = state.gaps.length;
  if (tabProposals) tabProposals.dataset.count = state.proposals.length;
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
    renderProposalsList(list);
  } else {
    renderPromotionsList(list);
  }
}

function renderProposalsList(list) {
  if (!state.proposals.length) {
    list.innerHTML = '<p class="gw-empty sans">No proposals yet. Run <code>npm run fonoran:vocab-survey</code> to generate compound proposals.</p>';
    return;
  }
  const open = state.proposals.filter(p => p.status === 'open');
  const resolved = state.proposals.filter(p => p.status !== 'open');
  const items = [
    ...open.map(p => renderProposalItem(p)),
    ...(resolved.length ? [`<div class="gw-queue-divider sans">Recently resolved</div>`] : []),
    ...resolved.map(p => renderProposalItem(p)),
  ];
  list.innerHTML = items.join('');
}

function renderProposalItem(p) {
  const active = state.selectedId === `proposal:${p.id}` ? ' gw-item--active' : '';
  const comp = p.valid_compositions?.[0]?.join(' + ') ?? p.primitive_proposal?.suggested_id ?? '?';
  const statusBadge = p.status !== 'open'
    ? `<span class="gw-badge ${p.status === 'accepted' ? 'badge--green' : 'badge--muted'} gw-badge--sm">${p.status}</span>`
    : '';
  return `<button type="button" class="gw-item${active}" data-gw-id="proposal:${p.id}">
    <span class="gw-item__label">${escapeHtml(p.word ?? p.concept_id ?? '?')} ${statusBadge}</span>
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
      <span class="gw-item__label">${escapeHtml(p.concept_id)}</span>
      <span class="gw-item__meta sans">${recoveryBar(p.recovery_rate)} · ${p.rounds} rounds</span>
    </button>`;
  }).join('');
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function renderDetail() {
  const panel = $('gw-detail');
  if (!panel) return;

  if (!state.selectedId) {
    panel.innerHTML = `<div class="gw-empty-state">
      <p class="gw-empty-state__lead">Pick an item from the queue</p>
      <p class="gw-empty-state__hint">Select an open proposal to review, or a playtest promotion to accept.</p>
    </div>`;
    return;
  }

  if (state.selectedId.startsWith('gap:')) {
    renderGapDetail(panel, state.selectedId.slice(4));
  } else if (state.selectedId.startsWith('proposal:')) {
    const id = state.selectedId.slice(9);
    const prop = state.proposals.find(p => p.id === id);
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
  const existingProposals = state.proposals.filter(p => p.word === word);

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

function renderAnalysisResult(analysis, proposal) {
  if (!analysis) return '';
  const cls = analysis.classification;

  let bodyHtml = '';

  const validComps = (analysis.valid_compositions ?? []).filter(Array.isArray);
  const warnings = analysis.redundancy_warnings ?? [];
  if (cls === 'compound' && validComps.length) {
    bodyHtml = `
      <div class="gw-compositions">
        <h5 class="gw-compositions-title">Proposed compositions</h5>
        ${validComps.map((comp, i) => `
          <div class="gw-comp-row${i === 0 ? ' gw-comp-row--best' : ''}">
            <span class="gw-comp-index sans">${i === 0 ? '★' : `${i + 1}.`}</span>
            <code class="gw-comp-code">${comp.filter(Boolean).map(escapeHtml).join(' + ')}</code>
            ${i === 0 ? '<span class="gw-comp-label sans">best</span>' : ''}
            ${redundancyBadge(warnings[i])}
          </div>`).join('')}
      </div>`;
  } else if (cls === 'primitive' && analysis.primitive_proposal) {
    const pp = analysis.primitive_proposal;
    bodyHtml = `
      <div class="gw-primitive-card">
        <div class="gw-primitive-field"><span class="gw-field-label sans">id:</span> <code>${escapeHtml(pp.suggested_id)}</code></div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">gloss:</span> ${escapeHtml(pp.gloss ?? '')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">domain:</span> ${escapeHtml(pp.domain ?? '')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">priority:</span> ${escapeHtml(pp.priority_class ?? '')}</div>
        <div class="gw-primitive-field gw-primitive-field--full"><span class="gw-field-label sans">campfire:</span> ${escapeHtml(pp.campfire_rationale ?? '')}</div>
      </div>`;
  } else if (cls === 'alias' && analysis.alias_proposal) {
    bodyHtml = `
      <div class="gw-alias-card">
        <p class="sans">Maps to existing concept: <code>${escapeHtml(analysis.alias_proposal.existing_concept_id)}</code></p>
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
  const compHtml = propValidComps.length
    ? `<div class="gw-compositions">
        <h5 class="gw-compositions-title">Valid compositions</h5>
        ${propValidComps.map((comp, i) => `
          <div class="gw-comp-row${i === 0 ? ' gw-comp-row--best' : ''}">
            <span class="gw-comp-index sans">${i === 0 ? '★' : `${i + 1}.`}</span>
            <code class="gw-comp-code">${comp.filter(Boolean).map(escapeHtml).join(' + ')}</code>
            ${redundancyBadge(propWarnings[i])}
          </div>`).join('')}
      </div>`
    : '';

  const primitiveHtml = prop.primitive_proposal
    ? `<div class="gw-primitive-card">
        <div class="gw-primitive-field"><span class="gw-field-label sans">id:</span> <code>${escapeHtml(prop.primitive_proposal.suggested_id ?? '')}</code></div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">gloss:</span> ${escapeHtml(prop.primitive_proposal.gloss ?? '')}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">domain:</span> ${escapeHtml(prop.primitive_proposal.domain ?? '')}</div>
        <div class="gw-primitive-field gw-primitive-field--full"><span class="gw-field-label sans">campfire:</span> ${escapeHtml(prop.primitive_proposal.campfire_rationale ?? '')}</div>
      </div>`
    : '';

  panel.innerHTML = `
    <div class="gw-detail-head">
      <h2 class="gw-detail-title">"${escapeHtml(prop.word ?? prop.concept_id ?? '?')}"</h2>
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
      <p class="gw-detail-meta sans">Playtest authority: ${recoveryBar(promo.recovery_rate)} over ${promo.rounds} round(s)</p>
    </div>
    <div class="gw-section">
      <div class="gw-primitive-card">
        <div class="gw-primitive-field"><span class="gw-field-label sans">current source:</span> ${escapeHtml(promo.current_preferred_source)}</div>
        <div class="gw-primitive-field"><span class="gw-field-label sans">composition:</span> <code>${(promo.current_composition ?? []).map(escapeHtml).join(' + ')}</code></div>
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
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      btn.disabled = true;
      try {
        await api(`/api/fonoran/compound-proposals/${encodeURIComponent(proposalId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        });

        // Replace action buttons with a confirmation — keep the gap selected
        const actionsEl = container.querySelector('.gw-proposal-actions');
        if (actionsEl) {
          if (action === 'accepted') {
            actionsEl.innerHTML = `
              <div class="gw-confirmation">
                <span class="gw-badge badge--green">✓ Accepted</span>
                <span class="sans gw-hint" style="margin-left:0.5rem">Run <strong>Step 4 — Regenerate dictionary</strong> in Advanced to publish this word.</span>
                <a href="/language#advanced" class="btn btn--sm" target="_blank" style="margin-left:auto">Go to Advanced →</a>
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
  await reloadAll();
}
