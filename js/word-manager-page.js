/**
 * Admin Word Manager — lives under /tools#word-manager (not Language nav).
 */

import { escapeHtml } from './utils.js';
import { loadLanguageRules } from './load-language-rules.js';
import { speakFonoraPhrase } from './fonora-tts.js';
import { labEntryMatchesQuery } from '../tools/fonoran-lab-search.js';
import { checkCompoundBoundary } from '../tools/fonoran-gen3-readability.js';
import { romanToFonoraScript } from '../tools/fonoran-fonora-bridge.js';
import { createWordManager } from '../language/word-manager/index.js';

const TAB_ROOT = () => document.getElementById('tab-word-manager');

function $(id) {
  return TAB_ROOT()?.querySelector(`#${id}`) ?? document.getElementById(id);
}

function toast(msg) {
  let el = document.getElementById('wm-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wm-toast';
    el.className = 'wm-toast sans';
    TAB_ROOT()?.appendChild(el);
  }
  el.textContent = String(msg);
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3200);
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

/** @type {ReturnType<typeof createWordManager> | null} */
let manager = null;
/** @type {object | null} */
let lab = null;
/** @type {object | null} */
let rules = null;
/** @type {Map<string, object> | null} */
let conceptMeta = null;
/** @type {object[]} */
let openProposals = [];

async function ensureRulesLoaded() {
  if (rules) return rules;
  const bundle = await loadLanguageRules();
  if (!bundle.rules) {
    toast(bundle.loadError || 'Could not load Fonora script rules.');
  }
  rules = bundle.rules;
  return rules;
}

async function ensureLab() {
  await ensureRulesLoaded();
  if (lab) return lab;
  const bootstrap = await api('/api/fonoran/bootstrap');
  lab = bootstrap.lab;
  return lab;
}

async function ensureConceptMeta() {
  if (conceptMeta) return conceptMeta;
  const data = await api('/api/fonoran/concepts');
  conceptMeta = new Map((data.concepts ?? []).map(c => [c.id, c]));
  return conceptMeta;
}

async function loadOpenProposals() {
  const res = await api('/api/fonoran/compound-proposals?status=open&limit=100');
  openProposals = res?.proposals ?? [];
  return openProposals;
}

export async function onWordManagerTabActivated() {
  lab = null;
  await ensureLab();
  await ensureConceptMeta();
  await loadOpenProposals();
  if (!manager) {
    manager = createWordManager({
      prefix: 'wc',
      rootEl: TAB_ROOT,
      $,
      api,
      toast,
      escapeHtml,
      getLab: () => lab,
      getRules: () => rules,
      getConceptMeta: () => conceptMeta,
      getOpenProposals: () => openProposals,
      loadProposals: loadOpenProposals,
      reloadConceptMeta: async () => {
        conceptMeta = null;
        await ensureConceptMeta();
      },
      labEntryMatchesQuery,
      checkCompoundBoundary,
      romanToFonoraScript,
      speakNeural: async (parts) => {
        const list = Array.isArray(parts) ? parts : [parts];
        const r = await ensureRulesLoaded();
        if (r) {
          const { phrase } = romanToFonoraScript(list, r);
          if (phrase) {
            await speakFonoraPhrase(phrase, r, { parts: list });
            return;
          }
        }
        await speakFonoraPhrase(list.join(' '), { parts: list });
      },
      reloadLab: async () => {
        lab = null;
        await ensureLab();
      },
    });
  } else {
    await ensureLab();
    await ensureConceptMeta();
    await loadOpenProposals();
  }
  wirePublishPanel();
  await applyProposalPrefill();
  await manager.loadProposals();
  await manager.render();
}

function wirePublishPanel() {
  const buildBtn = document.getElementById('wm-build-approved');
  const exportBtn = document.getElementById('wm-export-seeds');
  const statusEl = document.getElementById('wm-seed-status');
  if (!buildBtn || buildBtn.dataset.wired) return;
  buildBtn.dataset.wired = '1';

  buildBtn.addEventListener('click', async () => {
    buildBtn.disabled = true;
    try {
      const res = await api('/api/fonoran/lab/build', {
        method: 'POST',
        body: JSON.stringify({ approve_all: true }),
      });
      toast(`Built ${res.compounds ?? '?'} compounds`);
      lab = null;
      conceptMeta = null;
      await ensureLab();
      await ensureConceptMeta();
      await manager?.loadProposals();
      await manager?.render();
    } catch (e) {
      toast(e.message);
    } finally {
      buildBtn.disabled = false;
    }
  });

  exportBtn?.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try {
      const res = await api('/api/fonoran/editorial/export-seeds', { method: 'POST', body: '{}' });
      toast(`Exported seeds (${res.compounds ?? '?'} compounds)`);
    } catch (e) {
      toast(e.message);
    } finally {
      exportBtn.disabled = false;
    }
  });

  api('/api/fonoran/snapshot/status').then((st) => {
    if (st.storage_mode === 'postgres' && exportBtn) exportBtn.hidden = false;
    if (statusEl && st.storage_mode) {
      statusEl.textContent = st.storage_mode === 'json'
        ? 'Local Translator uses the full lab. JSON saves write directly to data/*.json.'
        : 'Local Translator uses the full lab. Use Export seeds before git commit.';
    }
  }).catch(() => {});
}

async function applyProposalPrefill() {
  const raw = sessionStorage.getItem('wm-proposal-prefill');
  if (!raw || !manager) return;
  sessionStorage.removeItem('wm-proposal-prefill');
  try {
    const data = JSON.parse(raw);
    if (data?.composition?.length >= 2) {
      manager.openProposalPrefill(data);
    }
  } catch {
    /* ignore */
  }
}

/** Redirect legacy /language#words URLs. */
export function migrateWordManagerHash() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '').split('?')[0];
  const legacy = new Set(['words', 'concepts', 'create', 'review', 'roots', 'root-review']);
  if ((path === '/language' || path.startsWith('/language/')) && legacy.has(hash)) {
    window.location.replace(`/tools#word-manager${window.location.search}`);
  }
}
