/**
 * User analytics — admin tab at /tools#user-analytics
 */

import { escapeHtml } from './utils.js';
import { refreshAuth } from './auth-session.js';

const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all_time', label: 'All time' },
];

const state = {
  analytics: null,
  loading: false,
  error: null,
  period: 'week',
};

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
  if (res.status === 403) throw new Error(data.error || 'Admin access required');
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

function periodCount(metric, period) {
  if (period === 'day') return metric.today ?? 0;
  return metric[period] ?? 0;
}

function buildBarChartSvg(series, { color = 'var(--accent)' } = {}) {
  if (!series?.length) {
    return '<p class="ua-chart__empty">No data for this period yet.</p>';
  }
  const width = 640;
  const height = 180;
  const padX = 8;
  const padTop = 12;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;
  const barGap = 4;
  const max = Math.max(1, ...series.map((b) => b.count));
  const barW = Math.max(4, (width - padX * 2 - barGap * (series.length - 1)) / series.length);
  const bars = series.map((bucket, i) => {
    const h = Math.round((bucket.count / max) * chartH);
    const x = padX + i * (barW + barGap);
    const y = padTop + chartH - h;
    const title = `${bucket.label}: ${bucket.count}`;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${h}" rx="3" fill="${color}" opacity="0.88">
      <title>${escapeHtml(title)}</title>
    </rect>`;
  }).join('');
  const labels = series.map((bucket, i) => {
    const x = padX + i * (barW + barGap) + barW / 2;
    const show = series.length <= 12 || i % Math.ceil(series.length / 8) === 0 || i === series.length - 1;
    if (!show) return '';
    return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" class="ua-chart__label">${escapeHtml(bucket.label)}</text>`;
  }).join('');
  return `<svg class="ua-chart__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">
    ${bars}
    ${labels}
  </svg>`;
}

function periodButtons(period) {
  return PERIODS.map((p) => {
    const active = p.id === period;
    return `<button type="button" class="ua-period-btn${active ? ' ua-period-btn--active' : ''}" data-ua-period="${p.id}">
      ${escapeHtml(p.label)}
    </button>`;
  }).join('');
}

function pageHtml({ analytics, loading, error, period }) {
  if (loading) return '<p class="empty">Loading user analytics…</p>';
  if (error) return `<p class="empty">${escapeHtml(error)}</p>`;
  if (!analytics) return '<p class="empty">Could not load analytics.</p>';

  const up = analytics.upvotes;
  const users = analytics.users;
  const upSeries = up.series?.[period] ?? [];
  const signupSeries = users.series?.[period] ?? [];

  return `
    <div class="box ua-page">
      <div class="ua-summary-grid">
        <article class="ua-summary-card">
          <p class="ua-summary-card__eyebrow">Users</p>
          <p class="ua-summary-card__total">${users.total ?? 0}</p>
          <p class="ua-summary-card__hint">Total signups</p>
        </article>
        <article class="ua-summary-card">
          <p class="ua-summary-card__eyebrow">Upvotes</p>
          <p class="ua-summary-card__total">${up.all_time ?? 0}</p>
          <p class="ua-summary-card__hint">All-time community upvotes</p>
        </article>
      </div>

      <div class="ua-period-toolbar">
        <p class="ua-period-toolbar__label">Period</p>
        <div class="ua-period-row" role="group" aria-label="Analytics period">${periodButtons(period)}</div>
      </div>

      <section class="ua-section" aria-labelledby="ua-upvotes-heading">
        <div class="ua-section__head">
          <h2 class="section-h" id="ua-upvotes-heading">Upvotes</h2>
          <p class="ua-section__period-count"><strong>${periodCount(up, period)}</strong> in period</p>
        </div>
        <div class="ua-chart">${buildBarChartSvg(upSeries, { color: 'var(--color-accent)' })}</div>
      </section>

      <section class="ua-section" aria-labelledby="ua-signups-heading">
        <div class="ua-section__head">
          <h2 class="section-h" id="ua-signups-heading">User signups</h2>
          <p class="ua-section__period-count"><strong>${periodCount(users, period)}</strong> in period</p>
        </div>
        <div class="ua-chart">${buildBarChartSvg(signupSeries, { color: 'var(--color-word)' })}</div>
      </section>

      <p class="ua-footnote">Updated ${escapeHtml(new Date(analytics.generated_at).toLocaleString())} · UTC buckets</p>
    </div>`;
}

function wireControls(root) {
  root.querySelectorAll('[data-ua-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.uaPeriod;
      if (!next || next === state.period) return;
      state.period = next;
      render();
    });
  });
}

function render() {
  const el = document.getElementById('tools-user-analytics-body');
  if (!el) return;
  el.innerHTML = pageHtml({
    analytics: state.analytics,
    loading: state.loading,
    error: state.error,
    period: state.period,
  });
  wireControls(el);
}

async function loadAnalytics(force = false) {
  if (state.loading) {
    render();
    return;
  }
  if (state.analytics && !force) {
    render();
    return;
  }
  state.loading = true;
  state.error = null;
  render();
  try {
    state.analytics = await api('/api/fonoran/admin/analytics');
  } catch (err) {
    state.analytics = null;
    state.error = err.message || 'Could not load analytics.';
  }
  state.loading = false;
  render();
}

export function onUserAnalyticsTabActivated() {
  void loadAnalytics();
}
