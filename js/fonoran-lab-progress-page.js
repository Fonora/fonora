/**
 * Lab progress — admin tab at /tools#progress
 */

import { escapeHtml } from './utils.js';
import { refreshAuth, canAccessWordManager } from './auth-session.js';

const TAB_ROOT = () => document.getElementById('tab-progress');

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

const isOpen = (st) => st === 'draft' || st === 'needs_review';
const reviewed = (st) => st === 'approved' || st === 'revised' || st === 'rejected';

function reviewItems(lab) {
  const sounds = (lab?.sounds ?? []).filter((s) => s.state !== 'rejected');
  const compounds = (lab?.compounds ?? []).filter((c) => !c.generator_hint && c.state !== 'rejected');
  return [
    ...sounds.map((s) => ({ ...s, reviewKind: 'sound' })),
    ...compounds.map((c) => ({ ...c, reviewKind: 'compound' })),
  ];
}

function buildReviewProgressHtml(lab, rootCandidates) {
  const tracks = [];
  const labAll = reviewItems(lab);
  if (labAll.length) {
    const done = labAll.filter((i) => reviewed(i.state)).length;
    const pct = Math.round((done / labAll.length) * 100);
    const open = labAll.filter((i) => isOpen(i.state)).length;
    tracks.push({
      label: 'Roots & words reviewed',
      done,
      total: labAll.length,
      pct,
      note: open ? `${open} need review` : '',
    });
  }
  const roots = (rootCandidates?.candidates ?? []).filter((c) => c.status === 'pending' || c.status === 'rejected');
  if (roots.length) {
    const done = roots.filter((x) => x.status === 'approved' || x.status === 'rejected').length;
    const pct = Math.round((done / roots.length) * 100);
    const pending = roots.filter((x) => x.status === 'pending').length;
    tracks.push({
      label: 'Root queue decided',
      done,
      total: roots.length,
      pct,
      note: pending ? `${pending} pending` : '',
    });
  }
  if (!tracks.length) return '';
  return `<div class="health-review-stats">${tracks.map((t) => `
    <div class="health-review-stat">
      <p class="health-review-stat__label">${escapeHtml(t.label)}</p>
      <div class="progress"><span style="width:${t.pct}%"></span></div>
      <p class="progress-label">${t.done} of ${t.total} (${t.pct}%)${t.note ? ` · ${escapeHtml(t.note)}` : ''}</p>
    </div>`).join('')}</div>`;
}

function buildTimelineHtml(events) {
  if (!events.length) {
    return '<p class="empty" style="padding:0.75rem">No changes yet. Approve a sound to start your timeline.</p>';
  }
  const verbs = {
    approved: ['✓', 'Approved'],
    revised: ['✎', 'Revised'],
    renamed: ['✎', 'Renamed'],
    rejected: ['✕', 'Rejected'],
    created: ['+', 'Created'],
    recipe: ['⟲', 'Changed recipe of'],
  };
  const dayKey = (iso) => {
    const d = new Date(iso);
    const t = new Date();
    const y = new Date();
    y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const groups = [];
  for (const ev of events) {
    const k = dayKey(ev.at);
    let g = groups.find((x) => x.k === k);
    if (!g) {
      g = { k, items: [] };
      groups.push(g);
    }
    g.items.push(ev);
  }
  return groups.map((g) => `<div class="tl-day">${g.k}</div>${g.items.map((ev) => {
    const [icon, verb] = verbs[ev.action] ?? ['·', ev.action];
    const time = new Date(ev.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `<div class="tl-item"><span class="tl-icon">${icon}</span><span>${verb} <strong>${escapeHtml(ev.detail || ev.word)}</strong> <span class="mono" style="color:var(--muted)">${escapeHtml(ev.word)}</span></span><span class="tl-when">${time}</span></div>`;
  }).join('')}`).join('');
}

function pageHtml({ lab, rootCandidates, loading, error = null }) {
  if (loading) return '<p class="empty">Loading lab progress…</p>';
  if (error) return `<p class="empty">${escapeHtml(error)}</p>`;
  if (!lab) return '<p class="empty">Could not load lab data.</p>';

  const undoDisabled = !lab.can_undo || !canAccessWordManager();
  return `
    <div class="box progress-page">
      <div class="health-progress-header">
        <h2 class="section-h">Your progress</h2>
        <button type="button" class="health-undo-btn" id="tools-progress-undo"${undoDisabled ? ' disabled' : ''} data-write>↶ Undo</button>
      </div>
      ${buildReviewProgressHtml(lab, rootCandidates)}
      <div id="tools-progress-timeline">${buildTimelineHtml(lab.events ?? [])}</div>
    </div>`;
}

const state = {
  lab: null,
  rootCandidates: null,
  loading: false,
  error: null,
};

function wireControls(root) {
  root.querySelector('#tools-progress-undo')?.addEventListener('click', async () => {
    if (!canAccessWordManager()) return;
    try {
      const res = await api('/api/fonoran/lab/undo', { method: 'POST', body: '{}' });
      alert(res.reverted ? `Undid: ${res.label}` : 'Nothing to undo');
      state.lab = null;
      state.rootCandidates = null;
      void loadProgress(true);
    } catch (err) {
      alert(err.message);
    }
  });
}

function render() {
  const el = document.getElementById('tools-progress-body');
  if (!el) return;
  el.innerHTML = pageHtml({
    lab: state.lab,
    rootCandidates: state.rootCandidates,
    loading: state.loading,
    error: state.error,
  });
  wireControls(el);
}

async function loadProgress(force = false) {
  if (state.loading) {
    render();
    return;
  }
  if (state.lab && !force) {
    render();
    return;
  }
  state.loading = true;
  state.error = null;
  render();
  try {
    const [bootstrap, rootCandidates] = await Promise.all([
      api('/api/fonoran/bootstrap'),
      api('/api/fonoran/roots/candidates').catch(() => ({ candidates: [] })),
    ]);
    state.lab = bootstrap.lab;
    state.rootCandidates = rootCandidates;
  } catch (err) {
    state.lab = null;
    state.rootCandidates = null;
    state.error = err.message || 'Could not load lab data.';
  }
  state.loading = false;
  render();
}

/** Redirect legacy Tools links that still point at Language progress. */
export function migrateProgressHash() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  if ((path === '/language' || path.startsWith('/language/')) && hash === 'progress') {
    window.location.replace(`/tools#progress${window.location.search}`);
  }
}

export function onLabProgressTabActivated() {
  void loadProgress();
}
