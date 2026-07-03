/**
 * Word Creator / Word Editor — split picker + full admin editor (Tools Word Manager).
 */

import {
  compoundEnglishGuide,
  compoundPhoneticKey,
  englishGuide,
  isValidSyllable,
  phoneticKeyBold,
  romanToIpa,
} from '../tools/fonoran-pronunciation.js';

/**
 * @param {object} ctx
 */
export function createWordComposer(ctx) {
  const PREFIX = ctx.prefix ?? 'wc';

  const state = {
    mode: 'idle', // idle | compose | compound | root
    composer: [],
    editingId: null,
    editingRootId: null,
    editingRootIsNew: false,
    editingRootSpelling: null,
    candidateId: null,
    itemState: null,
    returnPage: null,
    pendingFields: null,
    filter: '',
    showRoots: true,
    showWords: true,
    showUnapproved: false,
    showUnnamed: false,
    analysis: null,
  };

  let stickyObserver = null;
  let wired = false;
  let analyzeTimer = null;

  function $(id) { return ctx.$(id); }
  function lab() { return ctx.getLab?.() ?? null; }
  function rules() { return ctx.getRules?.() ?? null; }
  function toast(msg) { ctx.toast(msg); }
  function escapeHtml(s) { return ctx.escapeHtml(s); }

  function userWords() {
    return (lab()?.compounds ?? []).filter(c => !c.generator_hint && c.state !== 'rejected');
  }

  function generatedLabWords() {
    return (lab()?.compounds ?? []).filter(c => c.generator_hint && c.state !== 'rejected');
  }

  function hasMeaning(item) {
    return Boolean(item?.meaning?.trim());
  }

  function soundMeaning(sp) {
    const s = lab()?.sounds?.find(x => x.spelling === sp);
    return s?.meaning || s?.legacy_label || sp;
  }

  function composerComponentParts(c) {
    if (c.type === 'word') {
      const w = lab()?.compounds?.find(x => x.id === c.ref);
      if (w?.components?.length) return composerFlatSpellings(w.components);
      if (w?.parts?.length) return w.parts;
    }
    return [c.spelling || (c.type === 'root' ? c.ref : c.ref.replace(/^cmp-/, ''))];
  }

  function composerFlatSpellings(composer) {
    return (composer ?? []).flatMap(composerComponentParts);
  }

  function composerCanListen(composer) {
    return composerFlatSpellings(composer ?? []).length > 0;
  }

  function composerToApi(composer) {
    return (composer ?? []).map(c => ({ type: c.type, ref: c.ref }));
  }

  function compDisplayLabel(c) {
    if (c.type === 'word') return c.meaning || c.spelling || c.ref;
    return soundMeaning(c.ref);
  }

  function resolveComposerSpelling(composer) {
    return composerFlatSpellings(composer).join('');
  }

  function typeBadge(type) {
    return `<span class="badge badge-${type === 'root' ? 'base' : 'compound'}">${type === 'root' ? 'ROOT' : 'COMPOUND'}</span>`;
  }

  function stateBadge(st) {
    const labels = {
      draft: 'draft', needs_review: 'needs review', approved: 'approved',
      rejected: 'rejected', revised: 'revised',
    };
    const label = labels[st] ?? st ?? 'draft';
    return `<span class="badge badge-${st ?? 'draft'}">${escapeHtml(label)}</span>`;
  }

  function scoreBar(label, value, max = 5) {
    const pct = max ? Math.round((Math.min(value ?? 0, max) / max) * 100) : 0;
    return `<div class="root-review__score">
      <span class="root-review__score-label">${escapeHtml(label)}</span>
      <div class="root-score-bar"><div class="root-score-bar__fill" style="width:${pct}%"></div></div>
      <span class="root-review__score-num">${value ?? 0}/${max}</span>
    </div>`;
  }

  function pickerMeaningShort(phrase) {
    if (!phrase || phrase === '(unnamed)') return 'unnamed';
    return String(phrase).split(';')[0].trim() || 'unnamed';
  }

  function pickerMeaningForSound(s) {
    return pickerMeaningShort(s.meaning || s.legacy_label);
  }

  function pickerMeaningForCompound(c) {
    return pickerMeaningShort(c.meaning);
  }

  function pickableRoots(query, { omit = [], showUnnamed = false } = {}) {
    const q = (query ?? '').trim();
    const skip = new Set(omit);
    return (lab()?.sounds ?? []).filter(s => s.state !== 'rejected' && !skip.has(s.spelling))
      .filter(s => showUnnamed || hasMeaning(s))
      .filter(s => ctx.labEntryMatchesQuery(q, {
        spelling: s.spelling, meaning: s.meaning, legacy_label: s.legacy_label,
        gloss: s.gloss, concept_id: s.concept_id, aliases: s.aliases ?? [],
      }))
      .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
  }

  function pickableWords(query, { omitIds = [], showUnnamed = false } = {}) {
    const q = (query ?? '').trim();
    const skip = new Set(omitIds);
    let list = userWords().filter(c => !skip.has(c.id));
    if (state.showUnapproved) list = [...list, ...generatedLabWords().filter(c => !skip.has(c.id))];
    return list
      .filter(c => showUnnamed || hasMeaning(c))
      .filter(c => ctx.labEntryMatchesQuery(q, {
        spelling: c.spelling, meaning: c.meaning, gloss: c.gloss, concept_id: c.concept_id,
        aliases: c.aliases ?? [], composition_readable: c.composition_readable,
        generator_hint: c.generator_hint, parts: c.parts ?? [],
      }))
      .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
  }

  function pickerCellHtml({ spelling, meaning, glyphs, type, attrs, selected }) {
    const displayMeaning = meaning === '(unnamed)' ? 'unnamed' : (meaning || 'unnamed');
    const unnamed = !meaning || displayMeaning === 'unnamed';
    const attrParts = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`);
    return `<button type="button" class="root-cell${selected ? ' is-selected' : ''}" ${attrParts.join(' ')} data-write>
      ${typeBadge(type)}
      <span class="sp">${escapeHtml(spelling)}</span>
      ${glyphs ? `<span class="root-glyphs symbol-text" aria-hidden="true">${escapeHtml(glyphs)}</span>` : ''}
      <span class="mn${unnamed ? ' unnamed' : ''}">${escapeHtml(displayMeaning)}</span>
    </button>`;
  }

  function rootPickerWithBadge(sounds) {
    return sounds.length ? sounds.map(s => pickerCellHtml({
      spelling: s.spelling,
      meaning: pickerMeaningForSound(s),
      type: 'root',
      selected: state.mode === 'root' && state.editingRootSpelling === s.spelling,
      attrs: { 'data-pick-root': s.spelling, 'data-concept-id': s.concept_id ?? '' },
    })).join('') : '<p class="empty" style="grid-column:1/-1">No match.</p>';
  }

  function wordPickerMarkup(words) {
    return words.length ? words.map(c => {
      const speakParts = c.components?.length ? composerFlatSpellings(c.components) : (c.parts ?? [c.spelling]);
      const glyphs = rules() ? ctx.romanToFonoraScript(speakParts, rules()).phrase : '';
      return pickerCellHtml({
        spelling: c.spelling,
        meaning: pickerMeaningForCompound(c),
        glyphs,
        type: 'word',
        selected: state.mode === 'compound' && state.editingId === c.id,
        attrs: { 'data-pick-word': c.id },
      });
    }).join('') : '<p class="empty" style="grid-column:1/-1">No words match.</p>';
  }

  function composerFromCompound(c) {
    return (c.components ?? (c.parts ?? []).map(p => ({ type: 'root', ref: p, spelling: p }))).map((comp) => {
      if (comp.type === 'word') {
        const w = lab()?.compounds?.find(x => x.id === comp.ref);
        return {
          ...comp,
          spelling: w?.spelling ?? comp.spelling ?? comp.ref.replace(/^cmp-/, ''),
          meaning: w?.meaning ?? comp.meaning,
        };
      }
      return { ...comp, spelling: comp.spelling || comp.ref };
    });
  }

  function wordPreviewPron(parts) {
    const list = Array.isArray(parts) ? parts : [parts];
    return {
      script: rules() ? ctx.romanToFonoraScript(list, rules()).phrase : '',
      sayLine: list.length > 1 ? compoundPhoneticKey(list) : phoneticKeyBold(list[0]),
      englishLine: list.length > 1 ? compoundEnglishGuide(list) : englishGuide(list[0]),
    };
  }

  function focusFromComposer(picks, meaning = null) {
    return {
      spelling: picks.length ? resolveComposerSpelling(picks) : '',
      meaning: meaning || null,
      state: 'draft',
      components: picks.map(c => ({ type: c.type, ref: c.ref })),
    };
  }

  function buildComposerPreviewHtml(focus, speakParts, hearId) {
    const pron = wordPreviewPron(speakParts);
    const ipa = focus.spelling && isValidSyllable(focus.spelling) ? romanToIpa(focus.spelling) : '';
    const meaningHtml = focus.meaning
      ? escapeHtml(focus.meaning)
      : '<span style="color:var(--draft);font-style:italic">unnamed</span>';
    const metaParts = [];
    if (ipa) metaParts.push(`<span class="word-preview__ipa mono">${escapeHtml(ipa)}</span>`);
    if (pron.englishLine) metaParts.push(`<span class="word-preview__like">${escapeHtml(pron.englishLine)}</span>`);
    const metaLine = metaParts.length
      ? `<p class="word-preview__pron-meta">${metaParts.join('<span class="word-preview__meta-sep" aria-hidden="true"> | </span>')}</p>`
      : '';
    return `<div class="word-preview">
      <div class="word-preview__card">
        <div class="word-preview__hero">
          <div class="word-preview__wordmark">
            <span class="word-preview__spelling sp">${escapeHtml(focus.spelling)}</span>
            ${pron.script ? `<span class="word-preview__script root-glyphs fonora-script symbol-text" aria-hidden="true">${escapeHtml(pron.script)}</span>` : ''}
          </div>
          <div class="word-preview__sound-block">
            <div class="word-preview__sound-pron">
              <div class="word-preview__pron-details">
                ${pron.sayLine ? `<strong class="word-preview__phonetic-key">${escapeHtml(pron.sayLine)}</strong>` : ''}
                ${metaLine}
              </div>
              ${focus.spelling ? `<p class="word-preview__meaning-line"><span class="review-meaning">${meaningHtml}</span></p>` : ''}
            </div>
            <div class="word-preview__sound-actions">
              <button type="button" class="hear-min word-preview__hear" id="${hearId}" aria-label="Listen">▶ Listen</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function meaningMatches(meaning, selfKind, selfId) {
    const m = (meaning ?? '').trim().toLowerCase();
    if (!m) return [];
    const hits = [];
    for (const s of lab()?.sounds ?? []) {
      if (s.state === 'rejected') continue;
      if (selfKind === 'sound' && s.spelling === selfId) continue;
      if ((s.meaning ?? '').trim().toLowerCase() === m) hits.push(`${s.spelling} (root)`);
    }
    for (const c of lab()?.compounds ?? []) {
      if (c.state === 'rejected') continue;
      if (selfKind === 'compound' && c.id === selfId) continue;
      if ((c.meaning ?? '').trim().toLowerCase() === m) hits.push(`${c.spelling} (word)`);
    }
    return hits;
  }

  function renderEditDupe(kind, id, editMeaning) {
    const box = $(`${PREFIX}-dupe`);
    if (!box || state.mode === 'root') { if (box) box.innerHTML = ''; return; }
    const hits = meaningMatches(editMeaning, kind, id);
    box.innerHTML = hits.length
      ? `<div class="dupe"><strong>Already in use:</strong> “${escapeHtml(editMeaning.trim())}” also means <span class="mono">${hits.join('</span>, <span class="mono">')}</span>.</div>`
      : '';
  }

  function lookupSpelling(spelling) {
    if (!spelling || !lab()) return null;
    const compound = lab().compounds.find(c => c.spelling === spelling && c.state !== 'rejected');
    if (compound) return { kind: 'compound', item: compound };
    const sound = lab().sounds.find(s => s.spelling === spelling && s.state !== 'rejected');
    if (sound) return { kind: 'sound', item: sound };
    return null;
  }

  function spellingBlocksSave(match, editingId = null) {
    if (!match) return false;
    if (editingId && match.kind === 'compound' && match.item.id === editingId) return false;
    if (match.kind === 'sound') return Boolean(match.item.meaning?.trim());
    return !match.item.generator_hint;
  }

  function renderSpellingMatch(spelling, editingId) {
    const box = $(`${PREFIX}-match`);
    if (!box || state.mode === 'root') { if (box) box.innerHTML = ''; return null; }
    const match = spelling ? lookupSpelling(spelling) : null;
    const blocks = match && spellingBlocksSave(match, editingId);
    if (!match || !blocks) {
      box.innerHTML = '';
      return match;
    }
    const { kind, item } = match;
    const gloss = item.meaning?.trim();
    const suffix = item.generator_hint && !gloss
      ? ' · generator suggestion — save below to claim'
      : (gloss ? ` · ${gloss}` : '');
    box.innerHTML = `<div class="word-match word-match--compact">
      <p class="word-match__compact-line"><strong class="mono">${escapeHtml(item.spelling)}</strong> already in your lab${escapeHtml(suffix)}.
      <button type="button" class="linkish" data-open-match="${kind}" data-match-id="${escapeHtml(kind === 'sound' ? item.spelling : item.id)}">Open</button></p>
    </div>`;
    box.querySelector('[data-open-match]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (btn.dataset.openMatch === 'compound') {
        const c = lab()?.compounds?.find(x => x.id === btn.dataset.matchId);
        if (c) openCompound(c);
      } else {
        const s = lab()?.sounds?.find(x => x.spelling === btn.dataset.matchId);
        if (s) openRootEditor(s);
      }
    });
    return match;
  }

  function renderBoundaryViolation(picks) {
    const box = $(`${PREFIX}-boundary`);
    if (!box || state.mode === 'root') { if (box) box.innerHTML = ''; return false; }
    const parts = composerFlatSpellings(picks);
    if (parts.length < 2) { box.innerHTML = ''; return false; }
    const result = ctx.checkCompoundBoundary(parts);
    if (result.valid) { box.innerHTML = ''; return false; }
    const msgs = result.violations.map(v =>
      `<span class="wc-boundary__violation">${escapeHtml(v.reason)}</span>`).join('');
    box.innerHTML = `<div class="wc-boundary wc-boundary--error" role="alert">${msgs}</div>`;
    return true;
  }

  async function runAnalysis() {
    let body;
    if (state.mode === 'root') {
      const spelling = $(`${PREFIX}-spelling`)?.value.trim().toLowerCase();
      body = { type: 'root', spelling, meaning: $(`${PREFIX}-gloss`)?.value.trim() };
    } else if (state.composer.length) {
      body = {
        type: 'compound',
        spelling: resolveComposerSpelling(state.composer),
        components: composerFlatSpellings(state.composer),
        meaning: $(`${PREFIX}-meaning`)?.value.trim(),
      };
    } else if (state.editingId) {
      const c = lab()?.compounds?.find(x => x.id === state.editingId);
      body = { type: 'compound', spelling: c?.spelling, components: c?.parts, meaning: c?.meaning };
    } else {
      state.analysis = null;
      renderAnalysis();
      return;
    }
    try {
      state.analysis = await ctx.api('/api/fonoran/analyze/word', { method: 'POST', body: JSON.stringify(body) });
    } catch {
      state.analysis = null;
    }
    renderAnalysis();
  }

  function scheduleAnalysis() {
    clearTimeout(analyzeTimer);
    analyzeTimer = setTimeout(() => { void runAnalysis(); }, 280);
  }

  function renderAnalysis() {
    const a = state.analysis?.analysis;
    const show = (state.mode === 'root' || state.mode === 'compound' || state.composer.length >= 2) && !!a;
    const btn = $(`${PREFIX}-analysis-btn`);
    if (btn) btn.hidden = !show;
    const content = document.getElementById('wm-analysis-content');
    if (!content) return;
    if (!show) { content.innerHTML = ''; return; }
    content.innerHTML = `<div class="root-review__scores">
      ${scoreBar('Pronounceability', a.pronounceability)}
      ${scoreBar('Parseability', a.parseability)}
      ${scoreBar('Learnability', a.learnability)}
      ${scoreBar('Memorability', a.memorability)}
    </div>`;
  }

  function renderMeta() {
    const head = $(`${PREFIX}-detail-head`);
    const badge = $(`${PREFIX}-state-badge`);
    const label = $(`${PREFIX}-kind-label`);
    const review = $(`${PREFIX}-review-actions`);
    const approve = $(`${PREFIX}-approve`);
    const reject = $(`${PREFIX}-reject`);
    const reopen = $(`${PREFIX}-reopen`);
    const approveCand = $(`${PREFIX}-approve-candidate`);

    if (state.mode === 'idle') {
      head.hidden = true;
      review.hidden = true;
      return;
    }

    if (state.mode === 'compose') {
      head.hidden = false;
      review.hidden = true;
      label.textContent = 'New compound';
      badge.innerHTML = '';
      return;
    }

    head.hidden = false;
    review.hidden = false;

    const alreadyApproved = state.itemState === 'approved';
    const alreadyRejected = state.itemState === 'rejected';

    if (state.mode === 'root') {
      label.textContent = 'Root';
      badge.innerHTML = state.itemState ? stateBadge(state.itemState) : '';
      approve.hidden = alreadyApproved;
      approve.textContent = 'Approve root';
      reject.hidden = alreadyRejected;
      reject.disabled = false;
      reopen.hidden = !alreadyRejected;
      approveCand.hidden = !state.candidateId;
    } else {
      label.textContent = 'Compound';
      badge.innerHTML = state.itemState ? stateBadge(state.itemState) : '';
      approve.hidden = alreadyApproved;
      approve.textContent = 'Approve word';
      reject.hidden = alreadyRejected;
      reject.disabled = false;
      reopen.hidden = !alreadyRejected;
      approveCand.hidden = true;
    }
  }

  function renderScriptLine() {
    const el = $(`${PREFIX}-script-display`);
    if (!el) return;
    if (state.mode === 'idle') {
      el.hidden = true; el.innerHTML = ''; return;
    }
    let spelling = '';
    let parts = [];
    if (state.mode === 'root') {
      spelling = state.editingRootSpelling ?? $(`${PREFIX}-spelling`)?.value.trim() ?? '';
      parts = spelling ? [spelling] : [];
    } else {
      const c = lab()?.compounds?.find(x => x.id === state.editingId);
      parts = composerFlatSpellings(state.composer).length
        ? composerFlatSpellings(state.composer)
        : (c?.parts ?? (c?.spelling ? [c.spelling] : []));
      spelling = parts.join('') || c?.spelling || '';
    }
    if (!spelling) { el.hidden = true; return; }
    const pron = wordPreviewPron(parts);
    el.hidden = false;
    el.innerHTML = `<span class="wm-script-line__roman">${escapeHtml(spelling)}</span>`
      + (pron.script ? `<span class="wm-script-line__glyphs symbol-text fonora-script" aria-hidden="true">${escapeHtml(pron.script)}</span>` : '');
  }

  function updatePanels() {
    const empty = $(`${PREFIX}-empty-state`);
    const compoundPanel = $(`${PREFIX}-compound-panel`);
    const rootPanel = $(`${PREFIX}-root-panel`);
    const isIdle = state.mode === 'idle';
    const isRoot = state.mode === 'root';
    const isCompound = state.mode === 'compound' || state.mode === 'compose';
    if (empty) empty.hidden = !isIdle;
    if (compoundPanel) compoundPanel.hidden = !isCompound;
    if (rootPanel) rootPanel.hidden = !isRoot;
    renderScriptLine();
    renderMeta();
    renderAnalysis();
  }

  function syncControls() {
    if (state.mode === 'root') return;
    const picks = state.composer;
    const spelling = picks.length ? resolveComposerSpelling(picks) : '';
    const match = renderSpellingMatch(spelling, state.editingId);
    const boundaryBlocked = renderBoundaryViolation(picks);
    const saveBtn = $(`${PREFIX}-save`);
    if (saveBtn) {
      saveBtn.disabled = picks.length < 2 || spellingBlocksSave(match, state.editingId) || boundaryBlocked;
      saveBtn.textContent = state.editingId ? 'Save changes' : 'Save compound';
    }
    const clearBtn = $(`${PREFIX}-clear`);
    if (clearBtn) clearBtn.textContent = state.mode === 'compose' ? 'Cancel' : 'Clear';
    const cancelBtn = $(`${PREFIX}-cancel`);
    if (cancelBtn) cancelBtn.hidden = !state.returnPage;
    const intro = $(`${PREFIX}-intro`);
    if (intro) {
      if (state.mode === 'compose') {
        intro.textContent = 'New compound — click roots or words on the left to build the recipe, then name and save.';
      } else if (state.editingId) {
        intro.textContent = 'Editing a compound — adjust the recipe, meaning, or aliases, then save.';
      } else {
        intro.textContent = 'Select a root or compound on the left to edit it, or start a new compound.';
      }
    }
    scheduleAnalysis();
  }

  function renderRecipe() {
    if (state.mode === 'root') return;
    const recipe = state.composer;
    const pickEl = $(`${PREFIX}-recipe-pick`);
    if (pickEl) {
      pickEl.innerHTML = recipe.length
        ? recipe.map((comp, i) => `<span class="tok" data-idx="${i}" data-write>${typeBadge(comp.type)} <span class="mono">${escapeHtml(comp.spelling || comp.ref)}</span> = ${escapeHtml(compDisplayLabel(comp))} ×</span>`).join('')
        : '<span class="wm-recipe__empty">Click roots or words in the picker to build the recipe…</span>';
      pickEl.querySelectorAll('.tok').forEach(t => t.addEventListener('click', () => {
        recipe.splice(Number(t.dataset.idx), 1);
        renderRecipe();
        syncControls();
        updatePanels();
      }));
    }
    const live = $(`${PREFIX}-live-pron`);
    if (live) {
      if (recipe.length) {
        const focus = focusFromComposer(recipe, $(`${PREFIX}-meaning`)?.value.trim());
        const speakParts = composerFlatSpellings(recipe);
        live.innerHTML = buildComposerPreviewHtml(focus, speakParts, `${PREFIX}-hear`);
        const hearBtn = $(`${PREFIX}-hear`);
        if (hearBtn) {
          const canListen = composerCanListen(recipe);
          hearBtn.disabled = !canListen;
          hearBtn.onclick = () => ctx.speakNeural(speakParts);
          hearBtn.closest('.word-preview__sound-actions')?.toggleAttribute('hidden', !canListen);
        }
      } else {
        live.innerHTML = '<p class="sans word-preview__empty">Add components from the picker to preview pronunciation.</p>';
      }
    }
    syncControls();
  }

  function renderRootPreview() {
    const sp = $(`${PREFIX}-spelling`)?.value.trim().toLowerCase() ?? '';
    const live = $(`${PREFIX}-root-live-pron`);
    const hearBtn = $(`${PREFIX}-root-hear`);
    const invalidEl = $(`${PREFIX}-spelling-invalid`);

    if (!sp) {
      if (live) live.innerHTML = '<p class="sans word-preview__empty">Enter a Fonoran sound to preview.</p>';
      if (hearBtn) hearBtn.disabled = true;
      if (invalidEl) { invalidEl.hidden = true; invalidEl.textContent = ''; }
      return;
    }

    if (!isValidSyllable(sp)) {
      if (live) live.innerHTML = '';
      if (invalidEl) {
        invalidEl.hidden = false;
        invalidEl.textContent = `“${sp}” isn’t a valid Fonoran syllable yet.`;
      }
      if (hearBtn) hearBtn.disabled = true;
      return;
    }

    if (invalidEl) { invalidEl.hidden = true; invalidEl.textContent = ''; }
    if (hearBtn) {
      hearBtn.disabled = false;
      hearBtn.onclick = () => ctx.speakNeural(sp);
    }
    const focus = { spelling: sp, meaning: $(`${PREFIX}-gloss`)?.value.trim() || null };
    if (live) live.innerHTML = buildComposerPreviewHtml(focus, [sp], `${PREFIX}-root-hear-preview`);
    scheduleAnalysis();
  }

  function wirePickerClick(container, handler) {
    container.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => handler(btn));
    });
  }

  function addToRecipe(type, ref, spelling, meaning) {
    if (state.mode !== 'compose') return;
    if (type === 'root') {
      state.composer.push({ type: 'root', ref, spelling });
    } else {
      state.composer.push({ type: 'word', ref, spelling, meaning });
    }
    render();
  }

  function render() {
    if (!lab()) return;
    ensureStickyObserver();
    updatePanels();

    const recipe = state.composer;
    const editingId = state.editingId;

    if (state.pendingFields) {
      if ($(`${PREFIX}-meaning`)) $(`${PREFIX}-meaning`).value = state.pendingFields.meaning;
      if ($(`${PREFIX}-aliases`)) $(`${PREFIX}-aliases`).value = state.pendingFields.aliases;
      state.pendingFields = null;
    }

    if (state.mode !== 'root') {
      renderRecipe();
      renderEditDupe('compound', editingId ?? '', $(`${PREFIX}-meaning`)?.value.trim() || '');
    } else {
      renderRootPreview();
    }

    $(`${PREFIX}-filters`)?.querySelectorAll('[data-wc-filter]').forEach(chip => {
      const key = chip.dataset.wcFilter;
      const on = key === 'roots' ? state.showRoots
        : key === 'words' ? state.showWords
          : key === 'unapproved' ? state.showUnapproved
            : state.showUnnamed;
      chip.classList.toggle('active', on);
    });

    const showRoots = state.showRoots;
    const showWords = state.showWords;
    $(`${PREFIX}-roots-h`)?.toggleAttribute('hidden', !showRoots);
    $(`${PREFIX}-roots`)?.toggleAttribute('hidden', !showRoots);
    $(`${PREFIX}-words-h`)?.toggleAttribute('hidden', !showWords);
    $(`${PREFIX}-words`)?.toggleAttribute('hidden', !showWords);
    $(`${PREFIX}-picker-empty`)?.toggleAttribute('hidden', showRoots || showWords);

    const pickerOpts = { showUnnamed: state.showUnnamed };
    // Only omit words that are already in the recipe — never omit the editing compound
    // itself (that was hiding the active item from the picker in compound-edit mode).
    const omitIds = recipe.filter(c => c.type === 'word').map(c => c.ref);

    if (showRoots) {
      $(`${PREFIX}-roots`).innerHTML = rootPickerWithBadge(pickableRoots(state.filter, pickerOpts));
      wirePickerClick($(`${PREFIX}-roots`), (btn) => {
        if (state.mode === 'compose') {
          addToRecipe('root', btn.dataset.pickRoot, btn.dataset.pickRoot);
          return;
        }
        const s = lab()?.sounds?.find(x => x.spelling === btn.dataset.pickRoot);
        if (s) openRootEditor(s);
      });
    } else {
      $(`${PREFIX}-roots`).innerHTML = '';
    }

    if (showWords) {
      $(`${PREFIX}-words`).innerHTML = wordPickerMarkup(pickableWords(state.filter, { omitIds, ...pickerOpts }));
      wirePickerClick($(`${PREFIX}-words`), (btn) => {
        const w = lab()?.compounds?.find(c => c.id === btn.dataset.pickWord);
        if (!w) return;
        if (state.mode === 'compose') {
          addToRecipe('word', w.id, w.spelling, w.meaning);
          return;
        }
        openCompound(w);
      });
    } else {
      $(`${PREFIX}-words`).innerHTML = '';
    }

    requestAnimationFrame(syncStickyOffsets);
  }

  function goIdle() {
    state.mode = 'idle';
    state.composer = [];
    state.returnPage = null;
    state.editingId = null;
    state.editingRootId = null;
    state.editingRootIsNew = false;
    state.editingRootSpelling = null;
    state.candidateId = null;
    state.itemState = null;
    state.pendingFields = null;
    state.analysis = null;
    render();
  }

  function startNewCompound() {
    state.mode = 'compose';
    state.composer = [];
    state.returnPage = null;
    state.editingId = null;
    state.editingRootId = null;
    state.editingRootIsNew = false;
    state.editingRootSpelling = null;
    state.candidateId = null;
    state.itemState = null;
    state.pendingFields = null;
    state.analysis = null;
    if ($(`${PREFIX}-meaning`)) $(`${PREFIX}-meaning`).value = '';
    if ($(`${PREFIX}-aliases`)) $(`${PREFIX}-aliases`).value = '';
    render();
  }

  function clearCompoundForm() {
    if (state.mode === 'compose') {
      goIdle();
      return;
    }
    if (state.editingId) {
      const c = lab()?.compounds?.find(x => x.id === state.editingId);
      if (c) openCompound(c);
    }
  }

  function clearComposer() {
    goIdle();
  }

  function clearRootEditor() {
    goIdle();
  }

  const DOMAIN_GROUPS = [
    { label: 'World & Matter',     domains: ['element', 'space', 'structure'] },
    { label: 'Time & Motion',      domains: ['time', 'deixis', 'motion', 'process'] },
    { label: 'Life & Body',        domains: ['body', 'life', 'vitality', 'perception'] },
    { label: 'Mind & Feeling',     domains: ['cognition', 'emotion', 'evaluation'] },
    { label: 'Action & State',     domains: ['action', 'state'] },
    { label: 'Social & Language',  domains: ['social', 'communication', 'agency'] },
    { label: 'Abstract',           domains: ['logic', 'relation', 'order', 'quantity', 'quality', 'ontology'] },
  ];
  const PREDEFINED_DOMAINS = new Set(DOMAIN_GROUPS.flatMap(g => g.domains));

  function populateDomainSelect(currentDomain) {
    const sel = $(`${PREFIX}-domain`);
    const customEl = $(`${PREFIX}-domain-custom`);
    if (!sel || sel.tagName !== 'SELECT') return;

    const isKnown = currentDomain ? PREDEFINED_DOMAINS.has(currentDomain) : false;

    // Any domains in the lab that aren't in our predefined set
    const labExtra = [...new Set((lab()?.sounds ?? []).map(s => s.domain).filter(Boolean))]
      .filter(d => !PREDEFINED_DOMAINS.has(d)).sort();

    let html = '<option value="">Select domain…</option>';
    for (const group of DOMAIN_GROUPS) {
      html += `<optgroup label="${escapeHtml(group.label)}">`;
      for (const d of group.domains) {
        html += `<option value="${escapeHtml(d)}"${d === currentDomain ? ' selected' : ''}>${escapeHtml(d)}</option>`;
      }
      html += '</optgroup>';
    }
    if (labExtra.length) {
      html += '<optgroup label="Other">';
      for (const d of labExtra) {
        html += `<option value="${escapeHtml(d)}"${d === currentDomain ? ' selected' : ''}>${escapeHtml(d)}</option>`;
      }
      html += '</optgroup>';
    }
    html += `<option value="_custom"${!isKnown && currentDomain ? ' selected' : ''}>Custom…</option>`;
    sel.innerHTML = html;

    if (customEl) {
      customEl.hidden = isKnown || !currentDomain;
      customEl.value = isKnown ? '' : (currentDomain ?? '');
    }
  }

  function openRootEditor(s, { isNew = false } = {}) {
    state.mode = 'root';
    state.editingRootIsNew = isNew;
    state.editingRootId = s.concept_id ?? null;
    state.editingRootSpelling = s.spelling ?? null;
    state.candidateId = s.candidate_id ?? null;
    state.itemState = s.state ?? null;
    state.composer = [];
    state.editingId = null;

    if ($(`${PREFIX}-concept-id`)) {
      $(`${PREFIX}-concept-id`).value = s.concept_id ?? '';
      $(`${PREFIX}-concept-id`).readOnly = Boolean(s.concept_id && !isNew);
    }
    if ($(`${PREFIX}-spelling`)) $(`${PREFIX}-spelling`).value = s.spelling ?? '';
    if ($(`${PREFIX}-gloss`)) $(`${PREFIX}-gloss`).value = s.meaning ?? '';
    populateDomainSelect(s.domain ?? '');
    if ($(`${PREFIX}-root-aliases`)) $(`${PREFIX}-root-aliases`).value = (s.aliases ?? []).join('\n');

    render();
  }

  function openNewRoot() {
    openRootEditor({ spelling: '', meaning: '', concept_id: '', domain: '', aliases: [] }, { isNew: true });
  }

  function openCompound(c, { returnPage = null } = {}) {
    state.mode = 'compound';
    state.editingId = c.id;
    state.returnPage = returnPage;
    state.itemState = c.state ?? null;
    state.composer = composerFromCompound(c);
    state.editingRootId = null;
    state.pendingFields = {
      meaning: c.meaning ?? '',
      aliases: (c.aliases ?? []).join('\n'),
    };
    render();
  }

  async function saveWord() {
    const meaning = $(`${PREFIX}-meaning`)?.value.trim();
    if (state.composer.length < 2) { toast('Stack at least two components.'); return; }
    if (!meaning) { toast('Give the word a meaning.'); return; }
    const aliases = ($(`${PREFIX}-aliases`)?.value ?? '').trim();
    const editingId = state.editingId;
    try {
      if (editingId) {
        const existing = lab()?.compounds?.find(c => c.id === editingId);
        const spelling = resolveComposerSpelling(state.composer);
        const recipeChanged = spelling !== existing?.spelling;
        if (recipeChanged) {
          const res = await ctx.api(`/api/fonoran/lab/compounds/${encodeURIComponent(editingId)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              components: composerToApi(state.composer),
              meaning,
              allow_unapproved: state.showUnapproved,
            }),
          });
          toast(`Saved ${res.spelling ?? spelling}`);
          state.itemState = res.state ?? state.itemState;
        } else {
          const changed = meaning !== (existing?.meaning ?? '');
          const res = await ctx.api(`/api/fonoran/lab/compounds/${encodeURIComponent(editingId)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              meaning,
              aliases: aliases || undefined,
              state: changed && existing?.meaning ? 'revised' : undefined,
            }),
          });
          toast(`Saved ${spelling}`);
          state.itemState = res.state ?? state.itemState;
        }
      } else {
        const res = await ctx.api('/api/fonoran/lab/compounds', {
          method: 'POST',
          body: JSON.stringify({
            components: composerToApi(state.composer),
            meaning,
            aliases: aliases || undefined,
            allow_unapproved: state.showUnapproved,
          }),
        });
        state.editingId = res.id;
        state.mode = 'compound';
        state.itemState = res.state ?? 'draft';
        toast(`Saved ${res.spelling ?? meaning}`);
      }
      await ctx.reloadLab?.();
      render();
    } catch (e) {
      toast(e.message);
    }
  }

  async function saveRoot() {
    const id = (state.editingRootIsNew ? $(`${PREFIX}-concept-id`)?.value : state.editingRootId)?.trim().toLowerCase();
    const gloss = $(`${PREFIX}-gloss`)?.value.trim();
    const domainSel = $(`${PREFIX}-domain`);
    const domainCustomEl = $(`${PREFIX}-domain-custom`);
    const domain = domainSel?.value === '_custom'
      ? (domainCustomEl?.value.trim().toLowerCase() ?? '')
      : (domainSel?.value.trim().toLowerCase() ?? '');
    const spelling = $(`${PREFIX}-spelling`)?.value.trim().toLowerCase();
    const aliases = $(`${PREFIX}-root-aliases`)?.value ?? '';
    if (!id || !gloss || !domain || !spelling) {
      toast('Concept id, gloss, domain, and root sound are required.');
      return;
    }
    if (!isValidSyllable(spelling)) {
      toast('Enter a valid Fonoran syllable.');
      return;
    }
    const body = { description: gloss, domain, aliases, spelling };
    try {
      if (state.editingRootIsNew) {
        await ctx.api('/api/fonoran/concepts', { method: 'POST', body: JSON.stringify({ id, ...body }) });
        toast(`Created ${id}`);
        state.editingRootIsNew = false;
        state.editingRootId = id;
      } else {
        await ctx.api(`/api/fonoran/concepts/${encodeURIComponent(state.editingRootId)}`, {
          method: 'PATCH', body: JSON.stringify(body),
        });
        toast(`Saved ${id}`);
      }
      await ctx.reloadLab?.();
      const s = lab()?.sounds?.find(x => x.concept_id === id || x.spelling === spelling);
      if (s) openRootEditor(s);
      else clearRootEditor();
    } catch (e) {
      toast(e.message);
    }
  }

  async function setReviewState(kind, id, reviewState) {
    await ctx.api(`/api/fonoran/lab/state/${kind}/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ state: reviewState }),
    });
    toast(reviewState);
    state.itemState = reviewState;
    await ctx.reloadLab?.();
    render();
  }

  async function approveCandidate() {
    if (!state.candidateId) return;
    await ctx.api(`/api/fonoran/roots/candidates/${encodeURIComponent(state.candidateId)}`, {
      method: 'PATCH', body: JSON.stringify({ action: 'approve' }),
    });
    toast('Candidate approved');
    await ctx.reloadLab?.();
    render();
  }

  function syncStickyOffsets() {
    const header = document.getElementById('app-header-root');
    let headerBottom = 0;
    if (header) {
      headerBottom = Math.ceil(header.getBoundingClientRect().bottom);
      document.documentElement.style.setProperty('--fonoran-header-offset', `${headerBottom}px`);
    }
    const root = ctx.rootEl?.() ?? document.querySelector('.wm-tools-page, .fonoran-split-page');
    const shell = root?.querySelector('[data-split-shell]');
    if (shell) {
      const grid = shell.nextElementSibling;
      const gridGap = grid?.classList.contains('fonoran-split-grid')
        ? parseFloat(getComputedStyle(grid).marginTop) || 0
        : 0;
      document.documentElement.style.setProperty(
        '--fonoran-split-chrome-offset',
        `${headerBottom + shell.offsetHeight + gridGap}px`,
      );
    }
  }

  function ensureStickyObserver() {
    const header = document.getElementById('app-header-root');
    if (!header) return;
    if (!stickyObserver) {
      stickyObserver = new ResizeObserver(() => syncStickyOffsets());
      stickyObserver.observe(header);
      window.addEventListener('resize', syncStickyOffsets);
    }
    const root = ctx.rootEl?.() ?? document.querySelector('.wm-tools-page');
    root?.querySelectorAll('[data-split-shell]').forEach((shell) => {
      if (!shell.dataset.stickyObserved) {
        shell.dataset.stickyObserved = '1';
        stickyObserver.observe(shell);
      }
    });
    syncStickyOffsets();
  }

  function wire() {
    if (wired) return;
    wired = true;

    $(`${PREFIX}-filter`)?.addEventListener('input', (e) => {
      state.filter = e.target.value;
      render();
    });

    $(`${PREFIX}-meaning`)?.addEventListener('input', () => {
      renderEditDupe('compound', state.editingId ?? '', $(`${PREFIX}-meaning`).value);
      renderRecipe();
    });

    $(`${PREFIX}-filters`)?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-wc-filter]');
      if (!chip) return;
      if (chip.dataset.wcFilter === 'roots') state.showRoots = !state.showRoots;
      else if (chip.dataset.wcFilter === 'words') state.showWords = !state.showWords;
      else if (chip.dataset.wcFilter === 'unapproved') state.showUnapproved = !state.showUnapproved;
      else if (chip.dataset.wcFilter === 'unnamed') state.showUnnamed = !state.showUnnamed;
      render();
    });

    $(`${PREFIX}-new-compound`)?.addEventListener('click', () => startNewCompound());
    $(`${PREFIX}-new-root`)?.addEventListener('click', () => openNewRoot());
    $(`${PREFIX}-clear`)?.addEventListener('click', () => clearCompoundForm());
    $(`${PREFIX}-clear-root`)?.addEventListener('click', () => goIdle());
    $(`${PREFIX}-cancel`)?.addEventListener('click', () => goIdle());
    $(`${PREFIX}-save`)?.addEventListener('click', () => void saveWord());
    $(`${PREFIX}-save-root`)?.addEventListener('click', () => void saveRoot());

    [`${PREFIX}-spelling`, `${PREFIX}-gloss`].forEach(id => {
      $(id)?.addEventListener('input', () => renderRootPreview());
    });

    $(`${PREFIX}-approve`)?.addEventListener('click', () => {
      if (state.mode === 'root' && state.editingRootSpelling) {
        void setReviewState('sound', state.editingRootSpelling, 'approved');
      } else if (state.editingId) {
        void setReviewState('compound', state.editingId, 'approved');
      }
    });
    $(`${PREFIX}-reject`)?.addEventListener('click', () => {
      const what = state.mode === 'root'
        ? `root "${state.editingRootSpelling}"`
        : `word "${lab()?.compounds?.find(c => c.id === state.editingId)?.spelling ?? state.editingId}"`;
      if (!window.confirm(`Reject ${what}? This removes it from active use.`)) return;
      if (state.mode === 'root' && state.editingRootSpelling) {
        void setReviewState('sound', state.editingRootSpelling, 'rejected');
      } else if (state.editingId) {
        void setReviewState('compound', state.editingId, 'rejected');
      }
    });
    $(`${PREFIX}-reopen`)?.addEventListener('click', () => {
      if (state.mode === 'root' && state.editingRootSpelling) {
        void setReviewState('sound', state.editingRootSpelling, 'needs_review');
      } else if (state.editingId) {
        void setReviewState('compound', state.editingId, 'needs_review');
      }
    });
    $(`${PREFIX}-approve-candidate`)?.addEventListener('click', () => void approveCandidate());

    // Domain select ↔ custom input toggle
    $(`${PREFIX}-domain`)?.addEventListener('change', () => {
      const customEl = $(`${PREFIX}-domain-custom`);
      if (!customEl) return;
      const isCustom = $(`${PREFIX}-domain`)?.value === '_custom';
      customEl.hidden = !isCustom;
      if (!isCustom) customEl.value = '';
      if (isCustom) customEl.focus();
    });

    // Analysis modal
    $(`${PREFIX}-analysis-btn`)?.addEventListener('click', () => {
      document.getElementById('wm-analysis-modal')?.removeAttribute('hidden');
    });
    document.getElementById('wm-analysis-close')?.addEventListener('click', () => {
      document.getElementById('wm-analysis-modal')?.setAttribute('hidden', '');
    });
    document.getElementById('wm-analysis-backdrop')?.addEventListener('click', () => {
      document.getElementById('wm-analysis-modal')?.setAttribute('hidden', '');
    });
  }

  wire();

  return {
    render,
    clearComposer: goIdle,
    startNewCompound,
    openCompound,
    openRootEditor,
    selectRef: (ref) => {
      const c = lab()?.compounds?.find(x => x.id === ref);
      if (c) openCompound(c);
    },
  };
}
