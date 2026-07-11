/**
 * Shared SVG chart builders for admin analytics.
 */

import { escapeHtml } from './utils.js';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 200;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

function chartLayout(seriesList) {
  const allCounts = seriesList.flatMap((s) => s.map((b) => b.count ?? 0));
  const max = Math.max(1, ...allCounts);
  const chartW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const chartH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  return { max, chartW, chartH };
}

function yForCount(count, max, chartH) {
  return PAD_TOP + chartH - (count / max) * chartH;
}

function gridLines(max, chartH) {
  const ticks = [0, Math.round(max / 2), max];
  const unique = [...new Set(ticks)];
  return unique.map((tick) => {
    const y = yForCount(tick, max, chartH);
    return `
      <line x1="${PAD_LEFT}" y1="${y.toFixed(1)}" x2="${CHART_WIDTH - PAD_RIGHT}" y2="${y.toFixed(1)}" class="ua-chart__grid" />
      <text x="${PAD_LEFT - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="ua-chart__axis">${tick}</text>`;
  }).join('');
}

function xLabels(series, barW, gap) {
  return series.map((bucket, i) => {
    const x = PAD_LEFT + i * (barW + gap) + barW / 2;
    const show = series.length <= 12 || i % Math.ceil(series.length / 8) === 0 || i === series.length - 1;
    if (!show) return '';
    return `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - 8}" text-anchor="middle" class="ua-chart__label">${escapeHtml(bucket.label)}</text>`;
  }).join('');
}

function emptyChart(message = 'No data for this period yet.') {
  return `<p class="ua-chart__empty">${escapeHtml(message)}</p>`;
}

/**
 * @param {{ start: string, label: string, count: number }[]} series
 * @param {{ color?: string, ariaLabel?: string }} [opts]
 */
export function buildBarChartSvg(series, { color = 'var(--color-accent)', ariaLabel = 'Bar chart' } = {}) {
  if (!series?.length) return emptyChart();
  const { max, chartW, chartH } = chartLayout([series]);
  const barGap = 4;
  const barW = Math.max(4, (chartW - barGap * (series.length - 1)) / series.length);
  const bars = series.map((bucket, i) => {
    const h = Math.round((bucket.count / max) * chartH);
    const x = PAD_LEFT + i * (barW + barGap);
    const y = PAD_TOP + chartH - h;
    const title = `${bucket.label}: ${bucket.count}`;
    return `<rect class="ua-chart__bar" x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${h}" rx="3" fill="${color}">
      <title>${escapeHtml(title)}</title>
    </rect>`;
  }).join('');
  return `<svg class="ua-chart__svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(ariaLabel)}">
    ${gridLines(max, chartH)}
    ${bars}
    ${xLabels(series, barW, barGap)}
  </svg>`;
}

/**
 * @param {{ start: string, label: string, count: number }[]} series
 * @param {{ color?: string, ariaLabel?: string }} [opts]
 */
export function buildLineChartSvg(series, { color = 'var(--color-accent)', ariaLabel = 'Line chart' } = {}) {
  if (!series?.length) return emptyChart();
  const { max, chartW, chartH } = chartLayout([series]);
  const step = series.length > 1 ? chartW / (series.length - 1) : 0;
  const points = series.map((bucket, i) => {
    const x = PAD_LEFT + i * step;
    const y = yForCount(bucket.count, max, chartH);
    return { x, y, bucket };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)} Z`;
  const dots = points.map((p) => {
    const title = `${p.bucket.label}: ${p.bucket.count}`;
    return `<circle class="ua-chart__dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}" stroke="var(--surface, #fff)" stroke-width="2">
      <title>${escapeHtml(title)}</title>
    </circle>`;
  }).join('');
  const labels = series.map((bucket, i) => {
    const x = PAD_LEFT + i * step;
    const show = series.length <= 12 || i % Math.ceil(series.length / 8) === 0 || i === series.length - 1;
    if (!show) return '';
    return `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - 8}" text-anchor="middle" class="ua-chart__label">${escapeHtml(bucket.label)}</text>`;
  }).join('');
  return `<svg class="ua-chart__svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(ariaLabel)}">
    ${gridLines(max, chartH)}
    <path class="ua-chart__area" d="${areaPath}" fill="${color}" />
    <path class="ua-chart__line" d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    ${labels}
  </svg>`;
}

/**
 * @param {{ id: string, label: string, color: string, series: { label: string, count: number }[] }[]} seriesList
 * @param {{ ariaLabel?: string }} [opts]
 */
export function buildMultiLineChartSvg(seriesList, { ariaLabel = 'Multi-series line chart' } = {}) {
  const filtered = (seriesList ?? []).filter((s) => s.series?.length);
  if (!filtered.length) return emptyChart();
  const { max, chartW, chartH } = chartLayout(filtered.map((s) => s.series));
  const pointCount = filtered[0].series.length;
  const step = pointCount > 1 ? chartW / (pointCount - 1) : 0;
  const paths = filtered.map((s) => {
    const points = s.series.map((bucket, i) => {
      const x = PAD_LEFT + i * step;
      const y = yForCount(bucket.count, max, chartH);
      return { x, y, bucket };
    });
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const dots = points.map((p) => {
      const title = `${s.label} · ${p.bucket.label}: ${p.bucket.count}`;
      return `<circle class="ua-chart__dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${s.color}">
        <title>${escapeHtml(title)}</title>
      </circle>`;
    }).join('');
    return `<path class="ua-chart__line" d="${linePath}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />${dots}`;
  }).join('');
  const labels = filtered[0].series.map((bucket, i) => {
    const x = PAD_LEFT + i * step;
    const show = pointCount <= 12 || i % Math.ceil(pointCount / 8) === 0 || i === pointCount - 1;
    if (!show) return '';
    return `<text x="${x.toFixed(1)}" y="${CHART_HEIGHT - 8}" text-anchor="middle" class="ua-chart__label">${escapeHtml(bucket.label)}</text>`;
  }).join('');
  const legend = filtered.map((s) =>
    `<span class="ua-chart__legend-item"><span class="ua-chart__legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`,
  ).join('');
  return `<div class="ua-chart__wrap">
    <div class="ua-chart__legend" aria-hidden="true">${legend}</div>
    <svg class="ua-chart__svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(ariaLabel)}">
      ${gridLines(max, chartH)}
      ${paths}
      ${labels}
    </svg>
  </div>`;
}

/**
 * @param {'line' | 'bar'} type
 * @param {{ start: string, label: string, count: number }[]} series
 * @param {{ color?: string, ariaLabel?: string }} [opts]
 */
export function buildChartSvg(type, series, opts = {}) {
  return type === 'bar' ? buildBarChartSvg(series, opts) : buildLineChartSvg(series, opts);
}

/**
 * @param {string} chartId
 * @param {'line' | 'bar'} active
 */
export function chartTypeToggleHtml(chartId, active = 'line') {
  return `<div class="ua-chart-type-row" role="group" aria-label="Chart type">
    <button type="button" class="ua-chart-type-btn${active === 'line' ? ' ua-chart-type-btn--active' : ''}" data-chart-type="line" data-chart-id="${escapeHtml(chartId)}">Line</button>
    <button type="button" class="ua-chart-type-btn${active === 'bar' ? ' ua-chart-type-btn--active' : ''}" data-chart-type="bar" data-chart-id="${escapeHtml(chartId)}">Bar</button>
  </div>`;
}
