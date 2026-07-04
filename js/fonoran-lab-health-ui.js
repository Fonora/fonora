/**
 * Shared HTML builders for the lab Health report (Tools + Language).
 */

import { escapeHtml } from './utils.js';

const HEALTH_SECONDARY_METRICS = [
  {
    key: 'compoundLength',
    title: 'Avg compound length',
    formula: 'mean character count across all non-rejected compound spellings',
  },
  {
    key: 'algorithmicFeel',
    title: 'Algorithmic feel',
    formula: '(roots with grid repair steps > 0 ÷ total roots) × 100',
  },
];

const HEALTH_METHOD = [
  {
    key: 'learnability',
    title: 'Learnability',
    prose: 'Whether the sound inventory is discriminable for learners working from internal phonology, not English cognates. Penalises look-alike roots and serious ambiguity warnings.',
    formula: '100 − (8 × high-severity warnings) − (3 × look-alike root pairs)',
  },
  {
    key: 'pronounceability',
    title: 'Pronounceability',
    prose: 'How speakable the root syllables are out loud. Long compounds, consonant pile-ups, and awkward clusters reduce the average across your inventory.',
    formula: 'mean pronounceability score across all roots',
  },
  {
    key: 'memorability',
    title: 'Memorability',
    prose: 'Orthographic and phonetic distinctiveness. Can roots be told apart at a glance? Rhyming clusters and near-homophones make recall harder.',
    formula: '100 − (15 × rhyming clusters) − (5 × similar roots)',
  },
  {
    key: 'parseability',
    title: 'Parseability',
    prose: 'Morphological transparency: what share of compounds segment back into their parts uniquely? Critical for agglutinative and root-stacking designs.',
    formula: '(uniquely parsable compounds ÷ total compounds) × 100',
  },
];

function healthScoreColor(v) {
  return v >= 80 ? 'var(--ok)' : v >= 60 ? 'var(--review)' : 'var(--reject)';
}

function healthOverallLabel(overall) {
  if (overall >= 85) return 'Strong';
  if (overall >= 70) return 'Good';
  if (overall >= 50) return 'Fair';
  return 'Needs work';
}

function healthMetricTitle(key) {
  return HEALTH_SECONDARY_METRICS.find((m) => m.key === key)?.title ?? key;
}

function buildHealthMetricsHtml(metrics, { compact = false } = {}) {
  return (metrics ?? []).map((m) => `
    <div class="lander-health__metric">
      <span class="lander-health__metric-val">${escapeHtml(String(m.value))}${m.suffix ?? ''}</span>
      <span class="lander-health__metric-label">${escapeHtml(healthMetricTitle(m.key))}</span>
      ${compact ? '' : `<p class="lander-health__metric-note">${escapeHtml(m.explain ?? '')}</p>`}
    </div>`).join('');
}

function buildHealthMetricMethodHtml(metrics, scores) {
  const colorFn = healthScoreColor;
  return HEALTH_SECONDARY_METRICS.map((def) => {
    const live = metrics?.find((m) => m.key === def.key);
    const value = live?.value ?? scores?.[def.key] ?? '—';
    const suffix = live?.suffix ?? (def.key === 'algorithmicFeel' ? '%' : '');
    return `<article class="lander-health__method-card">
      <div class="lander-health__method-head">
        <h4>${escapeHtml(def.title)}</h4>
        <span class="lander-health__method-live">${escapeHtml(String(value))}${suffix}</span>
      </div>
      <p>${escapeHtml(live?.explain ?? '')}</p>
      <p class="lander-health__formula">${escapeHtml(def.formula)}</p>
    </article>`;
  }).join('');
}

function buildHealthWarningLi(w) {
  const sevClass = w.severity === 'high' ? 'lander-health__conflict-item--high' : 'lander-health__conflict-item--medium';
  const segDetail = w.segmentations?.length
    ? `<span class="lander-health__conflict-detail">Parses: ${w.segmentations.map((s) => escapeHtml(s)).join(' · ')}</span>`
    : '';
  return `<li class="lander-health__conflict-item ${sevClass}">
    <span class="lander-health__conflict-type">${escapeHtml(w.label ?? w.type)}</span>
    <span class="lander-health__conflict-msg">${escapeHtml(w.message)}</span>
    ${segDetail}
  </li>`;
}

function buildHealthConflictGroup(label, items, { penaltyTotal = null } = {}) {
  if (!items.length) return '';
  const penalty = penaltyTotal != null ? ` (−${penaltyTotal})` : '';
  return `<div class="lander-health__conflict-group">
    <p class="lander-health__conflict-head">${escapeHtml(label)}${penalty}</p>
    <ul class="lander-health__conflict-list">${items.map(buildHealthWarningLi).join('')}</ul>
  </div>`;
}

function buildDimensionConflictsHtml(key, h) {
  const warnings = h.warnings ?? [];
  if (key === 'learnability') {
    const high = warnings.filter((w) => w.severity === 'high');
    const lookalikes = warnings.filter((w) => w.type === 'similar_roots');
    if (!high.length && !lookalikes.length) {
      return '<p class="lander-health__conflicts-none">No conflicts affecting this score.</p>';
    }
    return `<div class="lander-health__conflicts">${[
      buildHealthConflictGroup(
        `${high.length} high-severity warning${high.length === 1 ? '' : 's'}`,
        high,
        { penaltyTotal: high.length * 8 },
      ),
      buildHealthConflictGroup(
        `${lookalikes.length} look-alike root pair${lookalikes.length === 1 ? '' : 's'}`,
        lookalikes,
        { penaltyTotal: lookalikes.length * 3 },
      ),
    ].join('')}</div>`;
  }
  if (key === 'memorability') {
    const rhyming = warnings.filter((w) => w.type === 'phonetic_cluster');
    const lookalikes = warnings.filter((w) => w.type === 'similar_roots');
    if (!rhyming.length && !lookalikes.length) {
      return '<p class="lander-health__conflicts-none">No conflicts affecting this score.</p>';
    }
    return `<div class="lander-health__conflicts">${[
      buildHealthConflictGroup(
        `${rhyming.length} rhyming cluster${rhyming.length === 1 ? '' : 's'}`,
        rhyming,
        { penaltyTotal: rhyming.length * 15 },
      ),
      buildHealthConflictGroup(
        `${lookalikes.length} similar root pair${lookalikes.length === 1 ? '' : 's'}`,
        lookalikes,
        { penaltyTotal: lookalikes.length * 5 },
      ),
    ].join('')}</div>`;
  }
  if (key === 'parseability') {
    const ambiguous = warnings.filter((w) => w.type === 'segmentation_ambiguity');
    if (!ambiguous.length) {
      return '<p class="lander-health__conflicts-none">All compounds segment uniquely.</p>';
    }
    return `<div class="lander-health__conflicts">${buildHealthConflictGroup(
      `${ambiguous.length} ambiguous compound${ambiguous.length === 1 ? '' : 's'}`,
      ambiguous,
    )}</div>`;
  }
  return '';
}

export function buildHealthMethodHtml(h) {
  const color = healthScoreColor;
  const methodCards = HEALTH_METHOD.map((m) => {
    const live = h.scores[m.key];
    const conflicts = buildDimensionConflictsHtml(m.key, h);
    return `<article class="lander-health__method-card">
      <div class="lander-health__method-head">
        <h4>${escapeHtml(m.title)}</h4>
        <span class="lander-health__method-live" style="color:${color(live)}">${live}/100</span>
      </div>
      <p>${escapeHtml(m.prose)}</p>
      <p class="lander-health__formula">${escapeHtml(m.formula)}</p>
      ${conflicts ? `<div class="lander-health__conflicts-wrap">${conflicts}</div>` : ''}
    </article>`;
  }).join('');
  const metrics = buildHealthMetricsHtml(h.metrics);
  const metricMethods = buildHealthMetricMethodHtml(h.metrics, h.scores);
  return `
    <div class="lander-health__method">
      <p class="lander-health__method-lead">Each dimension is recomputed from your live lab bucket whenever you open Health. Scores are heuristic design guides. They measure structural ergonomics, not linguistic "correctness."</p>
      <div class="lander-health__method-grid">${methodCards}</div>
      <div class="lander-health__metrics">${metrics}</div>
      <h4 class="lander-health__method-subhead">Secondary metrics</h4>
      <div class="lander-health__method-grid lander-health__method-grid--secondary">${metricMethods}</div>
      <p class="lander-health__footnote">Warnings include look-alike sounds, prefix overlap, rhyming clusters, segmentation ambiguity, and pronunciation difficulty.</p>
    </div>`;
}

export function buildLanderHealthHtml(h, { compact = false } = {}) {
  const core = ['learnability', 'pronounceability', 'memorability', 'parseability'];
  const overall = Math.round(core.reduce((a, k) => a + h.scores[k], 0) / core.length);
  const color = healthScoreColor;
  const scoreCards = h.dimensions.map((d) => `
    <div class="score lander-health__score">
      <div class="top"><span class="name">${escapeHtml(d.label)}</span><span class="val" style="color:${color(d.score)}">${d.score}<span style="font-size:0.7rem;color:var(--muted)">/100</span></span></div>
      <div class="bar"><span style="width:${d.score}%;background:${color(d.score)}"></span></div>
      <p class="explain">${escapeHtml(d.explain)}</p>
    </div>`).join('');
  const metrics = buildHealthMetricsHtml(h.metrics, { compact });
  const warnNote = compact
    ? ''
    : h.warning_summary.total
      ? `${h.warning_summary.total} ambiguity warning${h.warning_summary.total === 1 ? '' : 's'} flagged (${h.warning_summary.high} serious)`
      : 'No ambiguity warnings in the current vocabulary';

  return `
    <div class="lander-health__summary${compact ? ' lander-health__summary--compact' : ''}">
      <div class="lander-health__overall">
        <div class="lander-health__score-big" style="color:${color(overall)}">${overall}<span class="lander-health__score-of"> / 100</span></div>
        <p class="lander-health__label">${healthOverallLabel(overall)}</p>
        ${warnNote ? `<p class="lander-health__warn-note">${escapeHtml(warnNote)}</p>` : ''}
        <div class="lander-health__metrics lander-health__metrics--summary">${metrics}</div>
      </div>
      <div class="lander-health__scores">${scoreCards}</div>
    </div>`;
}

/** Full health report body (summary + breakdown). */
export function buildHealthReportHtml(h) {
  return `
    <div class="box lander-health-page">
      <div class="lander-health">
        ${buildLanderHealthHtml(h, { compact: true })}
      </div>
      <div class="health-details">
        <h3 class="section-h">Score breakdown &amp; conflicts</h3>
        ${buildHealthMethodHtml(h)}
      </div>
    </div>`;
}
