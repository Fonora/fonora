/**
 * Lab Health — admin tab at /tools#health
 */

import { refreshAuth } from './auth-session.js';
import { buildHealthReportHtml } from './fonoran-lab-health-ui.js';

const TAB_ROOT = () => document.getElementById('tab-health');

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

const state = {
  health: null,
  loading: false,
};

function render() {
  const el = $('tools-health-body');
  if (!el) return;
  if (state.loading) {
    el.innerHTML = '<p class="empty">Loading health metrics…</p>';
    return;
  }
  if (!state.health) {
    el.innerHTML = '<p class="empty">Could not load health metrics. Start the dev server with <code>npm start</code>.</p>';
    return;
  }
  el.innerHTML = buildHealthReportHtml(state.health);
}

async function loadHealth(force = false) {
  if (state.loading) {
    render();
    return;
  }
  if (state.health && !force) {
    render();
    return;
  }
  state.loading = true;
  render();
  try {
    state.health = await api('/api/fonoran/lab/health');
  } catch {
    state.health = null;
  }
  state.loading = false;
  render();
}

/** Redirect legacy Tools links that still point at Language health. */
export function migrateHealthHash() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  if ((path === '/language' || path.startsWith('/language/')) && hash === 'health') {
    window.location.replace(`/tools#health${window.location.search}`);
  }
}

export function onHealthTabActivated() {
  void loadHealth();
}
