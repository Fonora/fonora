/**
 * Admin analytics — unified dashboard at /tools#user-analytics
 */

import { escapeHtml } from './utils.js';
import { refreshAuth } from './auth-session.js';
import {
  buildChartSvg,
  buildMultiLineChartSvg,
  chartTypeToggleHtml,
} from './fonoran-analytics-charts.js';

const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all_time', label: 'All time' },
];

const SKILL_LABELS = {
  'script-sounds': 'Script · Sounds',
  'script-writing': 'Script · Writing',
  'script-words': 'Script · Words',
  'fonoran-reading': 'Language · Reading',
  'fonoran-writing': 'Language · Writing',
  'fonoran-hearing': 'Language · Hearing',
  'fonoran-grammar': 'Language · Grammar',
  'fonoran-speaking': 'Language · Speaking',
};

const state = {
  analytics: null,
  productHealth: null,
  loading: false,
  error: null,
  period: 'week',
  chartTypes: {
    growth: 'line',
    upvotes: 'line',
    signups: 'line',
    logins: 'line',
    sync: 'line',
    practice: 'line',
  },
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
  if (!metric) return 0;
  if (period === 'day') return metric.today ?? 0;
  return metric[period] ?? 0;
}

function periodButtons(period) {
  return PERIODS.map((p) => {
    const active = p.id === period;
    return `<button type="button" class="ua-period-btn${active ? ' ua-period-btn--active' : ''}" data-ua-period="${p.id}">
      ${escapeHtml(p.label)}
    </button>`;
  }).join('');
}

function summaryCard(eyebrow, total, hint, { accent = false } = {}) {
  return `<article class="ua-summary-card${accent ? ' ua-summary-card--accent' : ''}">
    <p class="ua-summary-card__eyebrow">${escapeHtml(eyebrow)}</p>
    <p class="ua-summary-card__total">${escapeHtml(String(total))}</p>
    <p class="ua-summary-card__hint">${escapeHtml(hint)}</p>
  </article>`;
}

function chartSection({ id, title, periodCount: count, chartId, chartHtml, toggle = true }) {
  return `<section class="ua-section" aria-labelledby="${id}">
    <div class="ua-section__head">
      <h2 class="section-h" id="${id}">${escapeHtml(title)}</h2>
      <div class="ua-section__meta">
        ${toggle ? chartTypeToggleHtml(chartId, state.chartTypes[chartId]) : ''}
        <p class="ua-section__period-count"><strong>${count}</strong> in period</p>
      </div>
    </div>
    <div class="ua-chart">${chartHtml}</div>
  </section>`;
}

function trackCard(track, data) {
  const label = track === 'script' ? 'Fonora Script' : 'Fonoran language';
  return `<article class="ua-track-card">
    <p class="ua-track-card__label">${escapeHtml(label)}</p>
    <dl class="ua-track-card__stats">
      <div><dt>Learners</dt><dd>${data.learners ?? 0}</dd></div>
      <div><dt>Sessions</dt><dd>${data.sessions ?? 0}</dd></div>
      <div><dt>Lessons advanced</dt><dd>${data.lessons_advanced ?? 0}</dd></div>
      <div><dt>Avg completion</dt><dd>${data.avg_completion_pct ?? 0}%</dd></div>
      <div><dt>Avg mastery</dt><dd>${data.avg_mastery_pct ?? 0}%</dd></div>
    </dl>
  </article>`;
}

function skillsTable(skills) {
  if (!skills?.length) return '<p class="ua-chart__empty">No skill activity yet.</p>';
  const rows = skills.map((s) => `<tr>
    <th scope="row">${escapeHtml(SKILL_LABELS[s.id] ?? s.id)}</th>
    <td>${s.learners ?? 0}</td>
    <td>${s.sessions ?? 0}</td>
    <td>${s.avg_lesson_index ?? 0}</td>
    <td>${s.avg_completion_pct ?? 0}%</td>
    <td>${s.avg_mastery_pct ?? 0}%</td>
  </tr>`).join('');
  return `<div class="ua-table-wrap">
    <table class="ua-table">
      <thead>
        <tr>
          <th scope="col">Skill</th>
          <th scope="col">Learners</th>
          <th scope="col">Sessions</th>
          <th scope="col">Avg lesson</th>
          <th scope="col">Completion</th>
          <th scope="col">Mastery</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function productHealthCards(health) {
  if (!health) {
    return '<p class="ua-chart__empty">Could not load product health snapshots.</p>';
  }
  const cards = [
    {
      label: 'Vocabulary health',
      value: health.labScore != null ? `${health.labScore}/100` : '—',
      hint: 'Overall lab quality score',
      tab: 'health',
    },
    {
      label: 'Translation coverage',
      value: health.coveragePct != null ? `${health.coveragePct}%` : '—',
      hint: 'Golden corpus phrase resolution',
      tab: 'translation-test',
    },
    {
      label: 'Lab review progress',
      value: health.reviewPct != null ? `${health.reviewPct}%` : '—',
      hint: 'Roots & words reviewed',
      tab: 'progress',
    },
  ];
  return `<div class="ua-health-grid">${cards.map((c) => `
    <article class="ua-health-card">
      <p class="ua-health-card__label">${escapeHtml(c.label)}</p>
      <p class="ua-health-card__value">${escapeHtml(c.value)}</p>
      <p class="ua-health-card__hint">${escapeHtml(c.hint)}</p>
      <button type="button" class="btn btn--ghost btn--sm" data-tab="${c.tab}">Open →</button>
    </article>`).join('')}</div>`;
}

function buildGrowthChart(analytics, period) {
  const signupSeries = analytics.users?.series?.[period] ?? [];
  const practiceSeries = analytics.learn?.practice_activity?.series?.[period] ?? [];
  return buildMultiLineChartSvg([
    { id: 'signups', label: 'Signups', color: 'var(--color-word)', series: signupSeries },
    { id: 'practice', label: 'Active learners', color: 'var(--color-accent)', series: practiceSeries },
  ], { ariaLabel: 'Signups vs active learners' });
}

function buildSingleChart(chartId, series, color, ariaLabel) {
  const type = state.chartTypes[chartId] ?? 'line';
  return buildChartSvg(type, series, { color, ariaLabel });
}

function pageHtml({ analytics, productHealth, loading, error, period }) {
  if (loading) return '<p class="empty">Loading analytics…</p>';
  if (error) return `<p class="empty">${escapeHtml(error)}</p>`;
  if (!analytics) return '<p class="empty">Could not load analytics.</p>';

  const users = analytics.users ?? {};
  const upvotes = analytics.upvotes ?? {};
  const learn = analytics.learn ?? {};
  const engagement = analytics.engagement ?? {};
  const tracks = learn.tracks ?? { script: {}, language: {} };

  const activeInPeriod = period === 'day'
    ? (learn.active_today ?? 0)
    : period === 'week'
      ? (learn.active_week ?? 0)
      : period === 'month'
        ? (learn.active_month ?? 0)
        : (learn.active_learners ?? 0);

  return `
    <div class="box ua-page">
      <div class="ua-summary-grid ua-summary-grid--hero">
        ${summaryCard('Total signups', users.total ?? 0, 'All registered users')}
        ${summaryCard('New signups', periodCount(users, period), `In selected ${period.replace('_', ' ')}`, { accent: true })}
        ${summaryCard('Active learners', learn.active_learners ?? 0, 'Synced users with practice')}
        ${summaryCard('Active in period', activeInPeriod, 'By last practice date')}
        ${summaryCard('Learning sessions', learn.total_sessions ?? 0, 'Completed 10-question sessions')}
        ${summaryCard('Script learners', tracks.script?.learners ?? 0, 'Fonora Script track')}
        ${summaryCard('Language learners', tracks.language?.learners ?? 0, 'Fonoran language track')}
        ${summaryCard('Upvotes', periodCount(upvotes, period), 'Community votes in period')}
      </div>

      <div class="ua-period-toolbar">
        <p class="ua-period-toolbar__label">Period</p>
        <div class="ua-period-row" role="group" aria-label="Analytics period">${periodButtons(period)}</div>
      </div>

      <section class="ua-section" aria-labelledby="ua-engagement-heading">
        <h2 class="section-h" id="ua-engagement-heading">Engagement</h2>
        <div class="ua-summary-grid ua-summary-grid--compact">
          ${summaryCard('DAU', engagement.dau ?? 0, 'Daily active logins')}
          ${summaryCard('WAU', engagement.wau ?? 0, 'Weekly active logins')}
          ${summaryCard('MAU', engagement.mau ?? 0, 'Monthly active logins')}
          ${summaryCard('Returning', `${engagement.returning_pct ?? 0}%`, 'Users who logged in again')}
          ${summaryCard('Referrals', engagement.referral_signups ?? 0, 'Signups via referral link')}
        </div>
        ${chartSection({
          id: 'ua-growth-heading',
          title: 'Signups vs active learners',
          periodCount: `${periodCount(users, period)} / ${periodCount(learn.practice_activity, period)}`,
          chartId: 'growth',
          chartHtml: buildGrowthChart(analytics, period),
          toggle: false,
        })}
        ${chartSection({
          id: 'ua-logins-heading',
          title: 'User logins',
          periodCount: periodCount(engagement.logins, period),
          chartId: 'logins',
          chartHtml: buildSingleChart('logins', engagement.logins?.series?.[period] ?? [], 'var(--color-accent)', 'User logins over time'),
        })}
      </section>

      <section class="ua-section" aria-labelledby="ua-learn-heading">
        <h2 class="section-h" id="ua-learn-heading">Learn</h2>
        <p class="ua-section__lead">Script vs language track progress from cloud-synced learners only.</p>
        <div class="ua-summary-grid ua-summary-grid--compact">
          ${summaryCard('Synced profiles', learn.synced_users ?? 0, 'Users with saved progress')}
          ${summaryCard('Avg streak', learn.streaks?.avg ?? 0, `Max ${learn.streaks?.max ?? 0}`)}
          ${summaryCard('Streak today', learn.streaks?.active_today ?? 0, 'Active streaks today')}
          ${summaryCard('Daily goal hit', `${learn.daily_goal_hit_rate ?? 0}%`, 'Synced learners today')}
          ${summaryCard('Review mode', learn.review_mode_users ?? 0, 'Finished all lessons in a skill')}
        </div>
        <div class="ua-track-grid">
          ${trackCard('script', tracks.script ?? {})}
          ${trackCard('language', tracks.language ?? {})}
        </div>
        <h3 class="ua-subheading">Per-skill breakdown</h3>
        ${skillsTable(learn.skills)}
        ${chartSection({
          id: 'ua-sync-heading',
          title: 'Progress sync activity',
          periodCount: periodCount(learn.sync_activity, period),
          chartId: 'sync',
          chartHtml: buildSingleChart('sync', learn.sync_activity?.series?.[period] ?? [], 'var(--color-word)', 'Progress sync activity'),
        })}
        ${chartSection({
          id: 'ua-practice-heading',
          title: 'Learner practice days',
          periodCount: periodCount(learn.practice_activity, period),
          chartId: 'practice',
          chartHtml: buildSingleChart('practice', learn.practice_activity?.series?.[period] ?? [], 'var(--color-accent)', 'Learner practice days'),
        })}
      </section>

      <section class="ua-section" aria-labelledby="ua-community-heading">
        <h2 class="section-h" id="ua-community-heading">Community</h2>
        ${chartSection({
          id: 'ua-upvotes-heading',
          title: 'Upvotes',
          periodCount: periodCount(upvotes, period),
          chartId: 'upvotes',
          chartHtml: buildSingleChart('upvotes', upvotes.series?.[period] ?? [], 'var(--color-accent)', 'Upvotes over time'),
        })}
        ${chartSection({
          id: 'ua-signups-heading',
          title: 'User signups',
          periodCount: periodCount(users, period),
          chartId: 'signups',
          chartHtml: buildSingleChart('signups', users.series?.[period] ?? [], 'var(--color-word)', 'User signups over time'),
        })}
      </section>

      <section class="ua-section" aria-labelledby="ua-product-heading">
        <h2 class="section-h" id="ua-product-heading">Product health</h2>
        <p class="ua-section__lead">Live snapshots from lab and corpus tools.</p>
        ${productHealthCards(productHealth)}
      </section>

      <p class="ua-footnote">
        Updated ${escapeHtml(new Date(analytics.generated_at).toLocaleString())} · UTC buckets.
        Learn metrics include signed-in users with cloud-synced progress only; anonymous local practice is not counted.
        Session pass rates and per-day session history require future event logging.
      </p>
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
  root.querySelectorAll('[data-chart-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chartId = btn.dataset.chartId;
      const chartType = btn.dataset.chartType;
      if (!chartId || !chartType || state.chartTypes[chartId] === chartType) return;
      state.chartTypes[chartId] = chartType;
      render();
    });
  });
  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      window.location.hash = tab;
    });
  });
}

function render() {
  const el = document.getElementById('tools-user-analytics-body');
  if (!el) return;
  el.innerHTML = pageHtml({
    analytics: state.analytics,
    productHealth: state.productHealth,
    loading: state.loading,
    error: state.error,
    period: state.period,
  });
  wireControls(el);
}

function reviewItems(lab) {
  const sounds = (lab?.sounds ?? []).filter((s) => s.state !== 'rejected');
  const compounds = (lab?.compounds ?? []).filter((c) => !c.generator_hint && c.state !== 'rejected');
  return [...sounds, ...compounds];
}

function reviewed(stateValue) {
  return stateValue === 'approved' || stateValue === 'revised' || stateValue === 'rejected';
}

async function loadProductHealth() {
  try {
    const [health, translation, bootstrap] = await Promise.all([
      api('/api/fonoran/lab/health').catch(() => null),
      api('/api/fonoran/translation-tests/latest').catch(() => null),
      api('/api/fonoran/bootstrap').catch(() => null),
    ]);
    const lab = bootstrap?.lab ?? bootstrap;
    const items = reviewItems(lab);
    const reviewDone = items.filter((i) => reviewed(i.state)).length;
    const reviewPct = items.length ? Math.round((reviewDone / items.length) * 100) : null;
    const coveragePct = translation?.summary?.coverage_pct ?? translation?.coverage_pct ?? null;
    const scores = health?.scores ?? {};
    const labScore = scores.overall != null
      ? Math.round(scores.overall)
      : health?.dimensions?.length
        ? Math.round(health.dimensions.reduce((sum, d) => sum + (d.score ?? 0), 0) / health.dimensions.length)
        : null;
    return { labScore, coveragePct, reviewPct };
  } catch {
    return null;
  }
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
    const [analytics, productHealth] = await Promise.all([
      api('/api/fonoran/admin/analytics'),
      loadProductHealth(),
    ]);
    state.analytics = analytics;
    state.productHealth = productHealth;
  } catch (err) {
    state.analytics = null;
    state.productHealth = null;
    state.error = err.message || 'Could not load analytics.';
  }
  state.loading = false;
  render();
}

export function onUserAnalyticsTabActivated() {
  void loadAnalytics();
}
