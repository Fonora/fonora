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

export async function onWordManagerTabActivated() {
  lab = null;
  await ensureLab();
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
  }
  await manager.render();
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
