/**
 * Advanced pipeline UI — mounted under /tools#advanced
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
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 4000);
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

function confirmDangerAction({ title, message, typeToConfirm }) {
  if (!confirm(`${title}\n\n${message}\n\nAre you sure you want to continue?`)) return false;
  if (typeToConfirm) {
    const typed = prompt(`Type "${typeToConfirm}" to confirm. This action cannot be undone.`);
    if (typed !== typeToConfirm) {
      toast('Confirmation failed — action cancelled.', true);
      return false;
    }
  } else if (!confirm('This is your last chance to cancel. Proceed?')) {
    return false;
  }
  return true;
}

function formatRegenStatusHtml(status) {
  if (!status) return '<p class="empty">Could not load regeneration status.</p>';
  const labUp = status.lab?.updated_at
    ? new Date(status.lab.updated_at).toLocaleString()
    : 'never built';
  const seedCompounds = status.seed_files?.compounds?.counts?.compounds ?? 0;
  const seedRoots = status.seed_files?.approved_roots?.counts?.roots ?? 0;
  return `<dl>
    <dt>Seeds</dt><dd>${seedRoots} roots · ${seedCompounds} compound recipes in data/</dd>
    <dt>Dictionary</dt><dd>${status.lab?.sounds ?? 0} roots · ${status.lab?.compounds ?? 0} words · built ${escapeHtml(labUp)}</dd>
  </dl>`;
}

async function refreshAdvancedPage() {
  try {
    try {
      const status = await api('/api/fonoran/lab/regen/status');
      const regenEl = $('adv-regen-status');
      if (regenEl) regenEl.innerHTML = formatRegenStatusHtml(status);
      const warnEl = $('adv-regen-warnings');
      if (warnEl) {
        const warnings = status.warnings ?? [];
        if (warnings.length) {
          warnEl.innerHTML = warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join('');
          warnEl.hidden = false;
        } else {
          warnEl.hidden = true;
          warnEl.innerHTML = '';
        }
      }
      const roots = status.lab?.sounds ?? 0;
      const rootsStat = $('adv-roots-stat');
      if (rootsStat) rootsStat.textContent = `${roots} primitive roots`;
      if ($('adv-storage-status')) {
        $('adv-storage-status').textContent =
          `${roots} roots · ${status.lab?.compounds ?? 0} words, built from the seeds in data/`;
      }
    } catch {
      if ($('adv-regen-status')) $('adv-regen-status').textContent = 'Could not load regeneration status.';
      if ($('adv-storage-status')) $('adv-storage-status').textContent = '';
      if ($('adv-roots-stat')) $('adv-roots-stat').textContent = '';
    }

    try {
      const [open, accepted] = await Promise.all([
        api('/api/fonoran/compound-proposals?status=open&limit=1'),
        api('/api/fonoran/compound-proposals?status=accepted&limit=1'),
      ]);
      const statEl = $('adv-proposals-stat');
      if (statEl) {
        const openCount = open?.stats?.open ?? 0;
        const acceptedCount = accepted?.stats?.accepted ?? 0;
        statEl.textContent = openCount > 0
          ? `${openCount} open · ${acceptedCount} accepted`
          : `All reviewed — ${acceptedCount} accepted`;
      }
    } catch {
      if ($('adv-proposals-stat')) $('adv-proposals-stat').textContent = '';
    }
  } catch {
    /* ignore */
  }
}

let _wired = false;

function wireAdvancedPage() {
  if (_wired) return;
  _wired = true;

  $('adv-regenerate')?.addEventListener('click', async () => {
    if (!confirmDangerAction({
      title: 'Regenerate dictionary from git seeds',
      message: 'This will:\n1. Reload editorial seeds from deploy (compounds, roots…)\n'
        + '2. Re-rank preferred compounds with the four rules\n'
        + '3. Rebuild the live dictionary (approve all)\n\n'
        + 'User-created roots and words (created_by: user) are preserved.',
      typeToConfirm: 'REGENERATE',
    })) return;
    try {
      const r = await api('/api/fonoran/lab/regenerate', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'REGENERATE', approve_all: true }),
      });
      const build = r.steps?.find((s) => s.step === 'build');
      toast(`Regenerated ${build?.roots ?? '?'} roots, ${build?.compounds ?? '?'} words`);
      const out = $('adv-regen-result');
      if (out) {
        out.textContent = JSON.stringify(r, null, 2);
        out.hidden = false;
      }
      await refreshAdvancedPage();
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('adv-run-translator-tests')?.addEventListener('click', async () => {
    try {
      const r = await api('/api/fonoran/lab/regression/translator', { method: 'POST', body: '{}' });
      const out = $('adv-translator-result');
      if (out) {
        out.textContent = JSON.stringify(r, null, 2);
        out.hidden = false;
      }
      if (r.ok) {
        toast(`Translation tests passed — ${r.total}/${r.total} golden phrases match`);
      } else {
        toast(`Translation tests failed — ${r.mismatches}/${r.total} drifted`, true);
      }
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('adv-force-build')?.addEventListener('click', async () => {
    if (!confirmDangerAction({
      title: 'Force rebuild only',
      message: 'Rebuild the dictionary from current Postgres editorial state WITHOUT reloading git seeds. '
        + 'Only use this if seeds were already imported. Blocked when seeds are stale.',
      typeToConfirm: 'BUILD',
    })) return;
    try {
      const r = await api('/api/fonoran/lab/build', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'BUILD', force: true, approve_all: true }),
      });
      const preserved = (r.preserved_compounds ?? 0) + (r.preserved_sounds ?? 0);
      toast(`Built ${r.roots} roots, ${r.compounds} words${preserved ? ` (${preserved} user items kept)` : ''}`);
      await refreshAdvancedPage();
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('adv-reset-review')?.addEventListener('click', async () => {
    if (!confirmDangerAction({
      title: 'Reset all review states',
      message: 'Move every root and word back to needs review? Meanings stay; you re-approve from scratch.',
    })) return;
    try {
      const r = await api('/api/fonoran/lab/reset-review', { method: 'POST', body: '{}' });
      toast(`Reset ${r.sounds_reset} roots and ${r.compounds_reset} words`);
      await refreshAdvancedPage();
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('adv-reconcile-inventory')?.addEventListener('click', async () => {
    try {
      const r = await api('/api/fonoran/lab/reconcile-inventory', { method: 'POST', body: '{}' });
      toast(`Reconciled ${r.reconciled} concept${r.reconciled === 1 ? '' : 's'} from lab`);
      await refreshAdvancedPage();
    } catch (e) {
      toast(e.message, true);
    }
  });

  $('adv-reseed')?.addEventListener('click', async () => {
    if (!confirmDangerAction({
      title: 'Reset lab',
      message: 'Clear the lab vocabulary, review queue, and all assigned Fonoran sounds? English concept definitions stay — run `npm run fonoran:build` or `npm run fonoran:build:approved` to start fresh.',
      typeToConfirm: 'RESET',
    })) return;
    try {
      await api('/api/fonoran/lab/seed', { method: 'POST', body: '{}' });
      toast('Lab reset — vocabulary and review queue cleared');
      await refreshAdvancedPage();
    } catch (e) {
      toast(e.message, true);
    }
  });

}

export async function onAdvancedTabActivated() {
  wireAdvancedPage();
  await refreshAdvancedPage();
}
