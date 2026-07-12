/**
 * LLM Evaluation Wizard — /tools#advanced
 */

import { escapeHtml } from './utils.js';
import { refreshAuth } from './auth-session.js';

const TAB_ROOT = () => document.getElementById('tab-advanced');

function $(id) {
  return TAB_ROOT()?.querySelector(`#${id}`) ?? document.getElementById(id);
}

function toast(msg, isError = false) {
  let el = document.getElementById('tools-adv-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tools-adv-toast';
    el.className = 'wm-toast sans';
    TAB_ROOT()?.appendChild(el);
  }
  el.textContent = String(msg);
  el.className = `wm-toast sans${isError ? ' wm-toast--error' : ''}`;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 5000);
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

const REVIEW_ACK_KEY = 'fonoran-llm-review-ack';

const STATE = {
  status: null,
  pollTimer: null,
  activeJobId: null,
  reviewAck: sessionStorage.getItem(REVIEW_ACK_KEY) === '1',
  toastedJobId: null,
  postJobPolls: 0,
};

function stepDotState(st, stepId, isRunning) {
  const job = STATE.status?.active_job;
  if (job?.step === stepId && job?.status === 'failed') return 'error';
  if (isRunning) return 'running';
  if (st === 'complete' || st === 'ready') return 'done';
  if (st === 'warning') return 'warn';
  if (st === 'partial') return 'next';
  if (st === 'failed') return 'error';
  return 'idle';
}

function statusDot(dotState) {
  const labels = {
    done: 'Completed',
    running: 'Running',
    warn: 'Needs review',
    next: 'Up next',
    idle: 'Not started',
    error: 'Failed',
  };
  return `<span class="lpw-status-dot lpw-status-dot--${dotState}" role="img" aria-label="${labels[dotState] ?? 'Not started'}"></span>`;
}

function stateBadge(st, isRunning) {
  const map = {
    complete: { cls: 'lpw-badge--ok', label: 'Complete' },
    'up-next': { cls: 'lpw-badge--next', label: 'Up next' },
    partial: { cls: 'lpw-badge--next', label: 'Up next' },
    running: { cls: 'lpw-badge--run', label: 'Running' },
    ready: { cls: 'lpw-badge--ok', label: 'Ready' },
    warning: { cls: 'lpw-badge--warn', label: 'Below threshold' },
    blocked: { cls: 'lpw-badge--block', label: 'Blocked' },
    pending: { cls: 'lpw-badge--pending', label: 'Pending' },
    stale: { cls: 'lpw-badge--warn', label: 'Stale' },
    manual: { cls: 'lpw-badge--manual', label: 'Manual' },
    failed: { cls: 'lpw-badge--fail', label: 'Failed' },
  };
  const key = isRunning ? 'running' : (st === 'partial' ? 'up-next' : st);
  const m = map[key] ?? map.pending;
  return `<span class="lpw-badge ${m.cls}">${m.label}</span>`;
}

function phaseHeading(phase) {
  const titles = {
    evaluate: 'Phase A — Evaluate (local, uses API credits)',
    review: 'Phase B — Review & full inventory',
    ship: 'Phase C — Ship to git & production',
  };
  return titles[phase] ?? phase;
}

function renderStep(step) {
  const st = step.status?.state ?? 'pending';
  const job = STATE.status?.active_job;
  const isRunning = job?.step === step.id && job?.status === 'running';

  const displayState = isRunning ? 'running' : st;
  const dotState = stepDotState(st, step.id, isRunning);
  const verifyHtml = (step.verify ?? []).map(v => `<li>${escapeHtml(v)}</li>`).join('');
  const cmdHtml = step.command
    ? `<p class="lpw-cmd sans"><code>${escapeHtml(step.command)}</code></p>`
    : '';
  const cmdsHtml = step.commands?.length
    ? `<ul class="lpw-cmd-list sans">${step.commands.map(c => `<li><code>${escapeHtml(c)}</code></li>`).join('')}</ul>`
    : '';

  let actions = '';
  if (step.id === 'review') {
    actions = `<label class="lpw-ack sans">
      <input type="checkbox" id="lpw-review-ack" data-write-input ${STATE.reviewAck ? 'checked' : ''}>
      I reviewed calibration winners and accept proceeding to the full inventory
    </label>`;
  } else if (step.runnable) {
    const disabled = !step.can_run || Boolean(STATE.activeJobId) || step.blocked
      || (step.needs_review_ack && !STATE.reviewAck);
    actions = `<button type="button" class="btn btn--sm btn--primary lpw-run" data-step="${escapeHtml(step.id)}"
      data-write ${disabled ? 'disabled' : ''}>${escapeHtml(step.run_label ?? (step.inline ? 'Run audit' : 'Run on server'))}</button>`;
    if (step.needs_review_ack && !STATE.reviewAck) {
      actions += `<span class="lpw-hint sans">Check the box in “Your judgment call” above first.</span>`;
    } else if (step.blocked && step.blocked_reason) {
      actions += `<span class="lpw-hint sans">Complete <strong>${escapeHtml(step.blocked_reason)}</strong> first (scroll up in Phase A).</span>`;
    } else if (!STATE.status?.api_configured) {
      actions += `<span class="lpw-hint sans">Set ANTHROPIC_API_KEY in .env and restart npm start.</span>`;
    }
  } else if (step.action === 'regenerate') {
    actions = `<button type="button" class="btn btn--sm btn--primary" id="lpw-jump-regenerate" data-write>Jump to Regenerate ↓</button>`;
  } else if (step.action === 'scroll_regenerate') {
    actions = `<button type="button" class="btn btn--sm" id="lpw-jump-regenerate">Jump to Regenerate ↓</button>`;
  }

  return `<li class="adv-step lpw-step lpw-step--${displayState}" data-step-id="${escapeHtml(step.id)}">
    ${statusDot(dotState)}
    <div class="adv-step__body">
      <div class="lpw-step__head">
        <h3 class="adv-step__title">${escapeHtml(step.title)}</h3>
        ${stateBadge(st, isRunning)}
        <span class="lpw-detail sans">${escapeHtml(step.status?.detail ?? '')}</span>
      </div>
      ${step.estimate ? `<p class="lpw-estimate sans">${escapeHtml(step.estimate)}${step.cost ? ` · <strong>${escapeHtml(step.cost)}</strong> cost` : ''}</p>` : ''}
      ${cmdHtml}${cmdsHtml}
      ${verifyHtml ? `<div class="lpw-verify"><p class="lpw-verify__label sans">What to verify</p><ul class="lpw-verify__list sans">${verifyHtml}</ul></div>` : ''}
      ${step.next ? `<p class="lpw-next sans"><strong>Then:</strong> ${escapeHtml(step.next)}</p>` : ''}
      <div class="adv-step__actions lpw-actions">${actions}</div>
      <pre class="lpw-log debug-panel" id="lpw-log-${escapeHtml(step.id)}" hidden></pre>
    </div>
  </li>`;
}

function scrollLogToEnd(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function updateJobLog(job) {
  if (!job?.log_tail) return;
  const logEl = $(`lpw-log-${job.step}`);
  if (!logEl) return;
  logEl.textContent = job.log_tail;
  logEl.hidden = false;
  if (job.status === 'running') scrollLogToEnd(logEl);
}

function renderWinners(winners) {
  if (!winners?.length) return '<p class="sans lpw-empty">No calibration winners yet — run calibration first.</p>';
  const rows = winners.map(w => `<tr>
    <td><code>${escapeHtml(w.concept_id)}</code></td>
    <td>${w.stale ? '<em class="lpw-stale-cell">stale — re-run calibration</em>' : escapeHtml(w.winner ?? '—')}</td>
    <td>${w.weight != null ? Number(w.weight).toFixed(2) : '—'}</td>
    <td>${w.close_call ? 'close call' : ''}</td>
  </tr>`).join('');
  return `<table class="lpw-table sans"><thead><tr><th>Concept</th><th>Winner</th><th>Weight</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderReliability(rel) {
  if (!rel) return '';
  const ok = rel.mean_spearman != null && rel.mean_spearman >= rel.threshold;
  return `<div class="lpw-summary lpw-summary--${ok ? 'ok' : 'warn'} sans">
    <strong>Reliability:</strong> mean ρ ${rel.mean_spearman?.toFixed(2) ?? '—'}
    (threshold ${rel.threshold}) ·
    ${rel.promotion_eligible ?? 0} promotion-eligible ·
    ${rel.split_queue ?? 0} split queue
  </div>`;
}

function renderConfusPart(parts) {
  if (!parts?.length) return '—';
  return parts.map(p => `<code>${escapeHtml(p.spelling)}</code> <span class="lpw-conf-root">(${escapeHtml(p.id)})</span>`).join(' <span class="lpw-conf-plus">+</span> ');
}

function renderConfusSide(pair, side) {
  const concept = side === 'a' ? pair.a : pair.b;
  const gloss = side === 'a' ? pair.glossA : pair.glossB;
  const parts = side === 'a' ? pair.partsA : pair.partsB;
  const surface = side === 'a' ? pair.surfaceA : pair.surfaceB;
  const partsLabel = side === 'a' ? pair.partsLabelA : pair.partsLabelB;
  const hasParts = parts?.length;
  return `<div class="lpw-conf-side">
    <div class="lpw-conf-concept"><code>${escapeHtml(concept)}</code></div>
    ${gloss ? `<div class="lpw-conf-gloss">${escapeHtml(gloss)}</div>` : ''}
    ${hasParts ? `<div class="lpw-conf-parts">${renderConfusPart(parts)}</div>` : ''}
    <div class="lpw-conf-surface" title="${escapeHtml(partsLabel ?? '')}">→ <strong>${escapeHtml(surface ?? '—')}</strong></div>
    ${!hasParts && !gloss ? `<div class="lpw-conf-gloss">Re-run audit for composition breakdown</div>` : ''}
  </div>`;
}

function renderConfusability(sum) {
  if (!sum) return '';
  const pairs = sum.near_pairs ?? sum.top_pairs ?? [];
  const warn = pairs.some(p => (p.distinctness ?? 1) < 0.7);
  const rows = pairs.map(p => {
    const pct = (p.distinctness * 100).toFixed(0);
    const warnCls = p.distinctness < 0.7 ? ' lpw-conf-row--warn' : '';
    return `<tr class="lpw-conf-row${warnCls}">
      <td class="lpw-conf-pct">${pct}%</td>
      <td>${renderConfusSide(p, 'a')}</td>
      <td class="lpw-conf-vs" aria-hidden="true">↔</td>
      <td>${renderConfusSide(p, 'b')}</td>
    </tr>`;
  }).join('');

  return `<div class="lpw-summary lpw-summary--${warn ? 'warn' : 'ok'} sans lpw-conf-summary">
    <p class="lpw-conf-lead"><strong>Confusability:</strong> ${sum.near_pair_count} near pairs · avg boundary ${(sum.avg_boundary_score * 100).toFixed(0)}%</p>
    <p class="lpw-conf-note">These are <em>different words</em> whose spoken surfaces sound alike — not compounds built from each other. Review whether learners could confuse them by ear.</p>
    ${pairs.length ? `<details class="lpw-conf-details" open>
      <summary>Near-confusable pairs (${pairs.length} shown)</summary>
      <div class="lpw-conf-table-wrap">
        <table class="lpw-table lpw-conf-table">
          <thead><tr>
            <th>Distinct</th>
            <th>Word A</th>
            <th></th>
            <th>Word B</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>` : ''}
  </div>`;
}

function renderSeedQuality(sum) {
  if (!sum) return '';
  const ok = sum.gate_pass;
  const failures = sum.failures ?? [];
  const rows = failures.map(f => `<tr>
    <td><code>${escapeHtml(f.concept)}</code></td>
    <td><code>${escapeHtml(f.composition)}</code></td>
    <td>${escapeHtml(f.issues?.[0] ?? '')}</td>
  </tr>`).join('');

  return `<div class="lpw-summary lpw-summary--${ok ? 'ok' : 'warn'} sans lpw-seed-summary">
    <p><strong>Seed quality:</strong> ${(sum.pass_rate * 100).toFixed(1)}% pass
      · ${sum.failure_count} failures · ${sum.warning_count} warnings
      · gate ${ok ? 'PASS' : 'FAIL'}</p>
    <p class="lpw-conf-note">Roots are <em>ideas</em>, not English words. Preferred compounds must pass campfire semantic-role rules before the LLM full inventory run.</p>
    ${failures.length ? `<details class="lpw-conf-details" open>
      <summary>Hard failures (${failures.length})</summary>
      <table class="lpw-table"><thead><tr><th>Concept</th><th>Composition</th><th>Issue</th></tr></thead><tbody>${rows}</tbody></table>
    </details>` : ''}
  </div>`;
}

function renderWizard(status) {
  const root = $('lpw-steps');
  if (!root || !status) return;

  const phases = ['evaluate', 'review', 'ship'];
  let html = `<div class="lpw-meta sans">
    <span>${status.rounds_total} evaluation rounds stored</span>
    <span>Judge: <code>${escapeHtml(status.judge_model)}</code></span>
    <span>Battery: <code>${escapeHtml(status.battery)}</code></span>
    <span>Seeds: <code>${escapeHtml(status.seed_bank?.fingerprint ?? '—')}</code></span>
  </div>`;

  if (status.seed_bank?.llm_eval_stale) {
    const legacy = status.seed_bank.legacy_round_count ?? 0;
    html += `<div class="lpw-banner lpw-banner--warn sans" role="status">
      <strong>Seeds changed.</strong> ${legacy} older evaluation round(s) remain on disk and are ignored for step progress.
      Completed steps on the current seed bank stay complete — run the next step when ready.
    </div>`;
  }

  for (const phase of phases) {
    const steps = status.steps.filter(s => s.phase === phase);
    if (!steps.length) continue;
    html += `<h2 class="lpw-phase">${escapeHtml(phaseHeading(phase))}</h2><ol class="adv-pipeline lpw-pipeline">`;
    html += steps.map(renderStep).join('');
    html += '</ol>';
  }

  root.innerHTML = html;

  const winnersEl = $('lpw-winners');
  if (winnersEl) winnersEl.innerHTML = renderWinners(status.calibration_winners);

  const relEl = $('lpw-reliability');
  if (relEl) relEl.innerHTML = renderReliability(status.reliability_summary);

  const confEl = $('lpw-confusability');
  if (confEl) confEl.innerHTML = renderConfusability(status.confusability_summary);

  const seedEl = $('lpw-seed-quality');
  if (seedEl) seedEl.innerHTML = renderSeedQuality(status.seed_quality_summary);

  const job = status.active_job;
  updateJobLog(job);

  wireWizardEvents();
}

function stopPolling() {
  if (STATE.pollTimer) {
    clearInterval(STATE.pollTimer);
    STATE.pollTimer = null;
  }
}

function ensurePolling() {
  if (!STATE.pollTimer) {
    STATE.pollTimer = setInterval(refreshPipelineStatus, 2000);
  }
}

async function refreshPipelineStatus() {
  try {
    const status = await api('/api/fonoran/llm-pipeline/status');
    STATE.status = status;
    const job = status.active_job;
    STATE.activeJobId = job?.status === 'running' ? job.id : null;
    const winnersStale = (status.calibration_winners ?? []).some(w => w.stale);
    if (winnersStale) STATE.reviewAck = false;
    renderWizard(status);

    if (job?.status === 'running') {
      ensurePolling();
    } else {
      if (job?.status === 'complete' && job.id !== STATE.toastedJobId) {
        STATE.toastedJobId = job.id;
        toast(`Step “${job.step}” finished successfully`);
        STATE.postJobPolls = 4;
        ensurePolling();
      }
      if (job?.status === 'failed' && job.id !== STATE.toastedJobId) {
        STATE.toastedJobId = job.id;
        toast(job.error || 'Pipeline job failed', true);
      }
      if (STATE.postJobPolls > 0) {
        STATE.postJobPolls -= 1;
        ensurePolling();
      } else {
        stopPolling();
      }
    }
  } catch (e) {
    const el = $('lpw-steps');
    if (el) el.innerHTML = `<p class="sans lpw-error">${escapeHtml(e.message)}</p>`;
  }
}

async function runStep(stepId) {
  try {
    const body = { step: stepId };
    if (stepId === 'full') body.review_acknowledged = STATE.reviewAck;
    const r = await api('/api/fonoran/llm-pipeline/run', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    STATE.activeJobId = r.job_id;
    STATE.toastedJobId = null;
    STATE.postJobPolls = 0;
    toast(`Started “${stepId}” — this may take several minutes`);
    const logEl = $(`lpw-log-${stepId}`);
    if (logEl) {
      logEl.hidden = false;
      logEl.textContent = 'Running…\n';
      scrollLogToEnd(logEl);
    }
    await refreshPipelineStatus();
  } catch (e) {
    toast(e.message, true);
  }
}

let _wired = false;

function wireWizardEvents() {
  if (_wired) return;
  _wired = true;

  TAB_ROOT()?.addEventListener('click', (e) => {
    const runBtn = e.target.closest('.lpw-run');
    if (runBtn && !runBtn.disabled) {
      runStep(runBtn.dataset.step);
      return;
    }
    if (e.target.closest('#lpw-jump-regenerate')) {
      document.getElementById('adv-regenerate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  TAB_ROOT()?.addEventListener('change', (e) => {
    if (e.target.id === 'lpw-review-ack') {
      STATE.reviewAck = e.target.checked;
      sessionStorage.setItem(REVIEW_ACK_KEY, STATE.reviewAck ? '1' : '0');
      renderWizard(STATE.status);
    }
  });
}

export async function initLlmPipelineWizard() {
  wireWizardEvents();
  await refreshPipelineStatus();
}

export function teardownLlmPipelineWizard() {
  stopPolling();
}
