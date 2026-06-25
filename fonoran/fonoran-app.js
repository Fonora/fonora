    import { toSpeakable, compoundSpeakable, phoneticKeyBold, compoundPhoneticKey, englishGuide, compoundEnglishGuide, parseSyllable, buildSyllable, isValidSyllable, pieceHint, ONSET_GROUPS, VOWEL_DISPLAY, CODA_DISPLAY } from '../tools/fonoran-pronunciation.js';
    import { romanToFonoraScript, pieceToFonoraSymbols } from '../tools/fonoran-fonora-bridge.js';
    import { loadLanguageRules } from '../js/load-language-rules.js';
    import { speakFonoraPhrase, cancelSpeech } from '../js/fonora-tts.js';
    import { initUniversalNav, setActiveTab, setFonoranUndoDisabled } from '../js/universal-nav.js';

    const LANDER_SHOWCASE_WORD_ID = 'cmp-kaso';
    let landerShowcaseToken = 0;
    let landerHealthToken = 0;

    const STATE = {
      lab: null, page: 'home', rules: null,
      wordCursor: 0,
      exploreSel: null, rootBuild: [], rootBuildFilter: '', rootEditing: false, rootsFilter: '',
      editing: false, editMeaning: '', clearAffected: false,
      justSaved: null,
      recipe: null, recipeFilter: '',
      dictFilter: 'all', dictQuery: '',
      wordComposer: [], wordComposerFilter: '',
      showUnapprovedWords: false,
      showDebugDda: false,
      rootDraft: { onset: '', vowel: '', coda: '' },
      rootPickerOpen: false,
      rootEditPickerOpen: false,
      lexicon: null,
      toolReturnPage: 'roots',
      healthOpen: false,
    };
    const $ = (id) => document.getElementById(id);

    async function api(path, opts = {}) {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }
    function toast(msg) {
      const t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2600);
    }
    function speak(text) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }
    async function ensureRules() {
      if (!STATE.rules) {
        const bundle = await loadLanguageRules('../docs/language-rules.md');
        STATE.rules = bundle.rules;
      }
      return STATE.rules;
    }
    async function speakNeural(parts) {
      const list = Array.isArray(parts) ? parts : [parts];
      try {
        const rules = await ensureRules();
        const { phrase } = romanToFonoraScript(list, rules);
        if (!phrase) throw new Error('no script');
        cancelSpeech();
        await speakFonoraPhrase(phrase, rules, { engine: 'auto', lang: 'en' });
      } catch {
        speak(Array.isArray(parts) ? compoundSpeakable(parts) : toSpeakable(parts));
      }
    }
    async function speakPiece(kind, value) {
      if (!value) return;
      try {
        const rules = await ensureRules();
        const glyph = pieceToFonoraSymbols(value, rules);
        if (glyph) {
          cancelSpeech();
          await speakFonoraPhrase(glyph, rules, { engine: 'auto', lang: 'en' });
          return;
        }
      } catch { /* fallback below */ }
      const sp = kind === 'vowel' ? value
        : kind === 'onset' ? buildSyllable(value, 'a', '')
          : buildSyllable('', 'a', value);
      if (isValidSyllable(sp)) speakNeural(sp);
    }

    function pronBlock(parts) {
      const list = Array.isArray(parts) ? parts : [parts];
      const script = STATE.rules ? romanToFonoraScript(list, STATE.rules).phrase : '';
      const sayLine = list.length > 1 ? compoundPhoneticKey(list) : phoneticKeyBold(list[0]);
      const englishLine = list.length > 1 ? compoundEnglishGuide(list) : englishGuide(list[0]);
      return `${script ? `<div class="fonora-script symbol-text">${escapeHtml(script)}</div>` : ''}
        <div class="pron-block">
          <div class="pron-line">Say: <strong>${escapeHtml(sayLine)}</strong></div>
          ${englishLine ? `<div class="pron-english">Sounds like: ${escapeHtml(englishLine)}</div>` : ''}
        </div>`;
    }
    function neighborStrip(list, cursor) {
      const prev = cursor > 0 ? list[cursor - 1] : null;
      const next = cursor < list.length - 1 ? list[cursor + 1] : null;
      if (!prev && !next) return '';
      const chip = (item, dir) => item ? `<button type="button" class="neighbor ${dir}" data-go="${dir === 'prev' ? cursor - 1 : cursor + 1}">
        <span class="nw">${dir === 'prev' ? '← ' : ''}${escapeHtml(item.spelling)}${dir === 'next' ? ' →' : ''}</span>
        <span class="nm">${escapeHtml(item.meaning || 'unnamed')}</span></button>` : '<span style="flex:1"></span>';
      return `<div class="word-neighbors">${chip(prev, 'prev')}${chip(next, 'next')}</div>`;
    }
    function wireNeighbors(list, cursorKey, rerender) {
      document.querySelectorAll('.neighbor[data-go]').forEach(b => b.addEventListener('click', () => {
        STATE[cursorKey] = Number(b.dataset.go);
        STATE.editing = false;
        STATE.justSaved = null;
        rerender();
      }));
    }
    function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function badge(state) {
      const labels = { draft: 'draft', needs_review: 'needs review', approved: 'approved', rejected: 'rejected', revised: 'revised', base: 'sound', compound: 'compound' };
      return `<span class="badge badge-${state}">${labels[state] ?? state}</span>`;
    }
    const isOpen = (st) => st === 'draft' || st === 'needs_review';
    const reviewed = (st) => st === 'approved' || st === 'revised' || st === 'rejected';
    function soundMeaning(sp) { const s = STATE.lab.sounds.find(x => x.spelling === sp); return s?.meaning || s?.legacy_label || sp; }

    function composerFlatSpellings(composer) {
      return (composer ?? []).map(c => c.spelling || (c.type === 'root' ? c.ref : c.ref.replace(/^cmp-/, '')));
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
      return `<span class="badge badge-${type === 'root' ? 'base' : 'compound'}">${type === 'root' ? 'ROOT' : 'WORD'}</span>`;
    }
    function pickableRoots(query, { omit = [] } = {}) {
      const q = (query ?? '').trim().toLowerCase();
      const skip = new Set(omit);
      return STATE.lab.sounds.filter(s => s.state !== 'rejected' && !skip.has(s.spelling))
        .filter(s => !q || `${s.spelling} ${s.meaning ?? ''} ${s.legacy_label ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
    }
    function pickableWords(query, { omitIds = [] } = {}) {
      const q = (query ?? '').trim().toLowerCase();
      const skip = new Set(omitIds);
      const allowed = STATE.showUnapprovedWords
        ? ['approved', 'revised', 'needs_review', 'draft']
        : ['approved', 'revised'];
      return STATE.lab.compounds.filter(c => allowed.includes(c.state) && !skip.has(c.id))
        .filter(c => !q || `${c.spelling} ${c.meaning ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
    }
    function wordCellBodyHtml(c) {
      const glyphs = STATE.rules ? romanToFonoraScript(c.parts ?? [c.spelling], STATE.rules).phrase : '';
      return `${typeBadge('word')}
          <span class="sp">${escapeHtml(c.spelling)}</span>
          ${glyphs ? `<span class="root-glyphs symbol-text">${escapeHtml(glyphs)}</span>` : ''}
          <span class="mn ${c.meaning ? '' : 'unnamed'}">${escapeHtml(c.meaning || 'unnamed')}</span>`;
    }
    function rootPickerWithBadge(sounds) {
      return sounds.length ? sounds.map(s => `
        <button type="button" class="root-cell" data-add-root="${escapeHtml(s.spelling)}">${typeBadge('root')}${rootCellBodyHtml(s)}</button>`).join('')
        : '<p class="empty" style="grid-column:1/-1">No match.</p>';
    }
    function wordPickerMarkup(words) {
      return words.length ? words.map(c => `
        <button type="button" class="root-cell" data-add-word="${escapeHtml(c.id)}">${wordCellBodyHtml(c)}</button>`).join('')
        : '<p class="empty" style="grid-column:1/-1">No approved words match.</p>';
    }

    async function load(opts = {}) {
      try {
        await ensureRules();
        await ensureLexicon();
        STATE.lab = await api('/api/fonoran/lab');
        $('load-error').hidden = true;
        setFonoranUndoDisabled(!STATE.lab.can_undo);
        if (!opts.skipRender) renderActivePage();
        wireMeaningPicker('wc', 'wc-meaning');
      } catch { $('load-error').hidden = false; }
    }

    function renderActivePage() {
      if (STATE.page === 'home') {
        wireLander();
        renderLanderShowcase();
        renderLanderHealth();
      }
      else if (STATE.page === 'create') renderWordComposer();
      else if (STATE.page === 'review') renderWords();
      else if (STATE.page === 'roots') renderRoots();
      else if (STATE.page === 'dictionary') renderDictionary();
      else if (STATE.page === 'health') renderHealth();
      else if (STATE.page === 'advanced') renderAdvanced();
    }

    function wireLander() {
      document.querySelectorAll('[data-goto-page]').forEach((el) => {
        if (el.dataset.landerWired) return;
        el.dataset.landerWired = '1';
        el.addEventListener('click', () => switchPage(el.dataset.gotoPage));
      });
      const exploreBtn = $('lander-showcase-explore');
      if (exploreBtn && !exploreBtn.dataset.landerWired) {
        exploreBtn.dataset.landerWired = '1';
        exploreBtn.addEventListener('click', openShowcaseExplorer);
      }
      const healthBtn = $('lander-health-open');
      if (healthBtn && !healthBtn.dataset.landerWired) {
        healthBtn.dataset.landerWired = '1';
        healthBtn.addEventListener('click', () => switchPage('health'));
      }
    }

    function healthScoreColor(v) {
      return v >= 80 ? 'var(--ok)' : v >= 60 ? 'var(--review)' : 'var(--reject)';
    }

    function healthOverallLabel(overall) {
      if (overall >= 85) return 'Strong';
      if (overall >= 70) return 'Good';
      if (overall >= 50) return 'Fair';
      return 'Needs work';
    }

    function meaningPickerHtml(prefix) {
      return `<div class="lex-pick sans">
        <label class="lex-label" for="${prefix}-lex-cat">Browse English words</label>
        <div class="lex-row">
          <select id="${prefix}-lex-cat" aria-label="Category"><option value="">All categories</option></select>
          <select id="${prefix}-lex-word" aria-label="English word"><option value="">Pick a word…</option></select>
        </div>
      </div>`;
    }

    async function ensureLexicon() {
      if (!STATE.lexicon) STATE.lexicon = await api('/api/fonoran/lexicon');
      return STATE.lexicon;
    }

    function populateLexCategories(selectEl) {
      if (!selectEl || !STATE.lexicon) return;
      const cur = selectEl.value;
      selectEl.innerHTML = '<option value="">All categories</option>'
        + STATE.lexicon.categories.map(c => `<option value="${escapeHtml(c)}"${c === cur ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }

    function populateLexWords(selectEl, category = '') {
      if (!selectEl || !STATE.lexicon) return;
      const cur = selectEl.value;
      const words = category ? STATE.lexicon.words.filter(w => w.category === category) : STATE.lexicon.words;
      selectEl.innerHTML = '<option value="">Pick a word…</option>'
        + words.map(w => `<option value="${escapeHtml(w.word)}" title="${escapeHtml(w.gloss)}"${w.word === cur ? ' selected' : ''}>${escapeHtml(w.word)}</option>`).join('');
    }

    function wireMeaningPicker(prefix, inputId) {
      const cat = $(`${prefix}-lex-cat`);
      const word = $(`${prefix}-lex-word`);
      const inp = $(inputId);
      if (!cat || !word || !inp || !STATE.lexicon || cat.dataset.wired) return;
      cat.dataset.wired = '1';
      populateLexCategories(cat);
      populateLexWords(word, cat.value);
      cat.addEventListener('change', () => populateLexWords(word, cat.value));
      word.addEventListener('change', () => { if (word.value) inp.value = word.value; });
    }

    const ROOT_TIP = 'A root is a building block. Its meaning flows into every word that uses it.';

    function rootSearchText(s) {
      const spell = s.spelling;
      const phon = phoneticKeyBold(spell);
      return `${spell} ${s.meaning ?? ''} ${s.legacy_label ?? ''} ${phon} ${phon.replace(/-/g, ' ')} ${toSpeakable(spell)} ${s.say_bold ?? ''} ${englishGuide(spell)}`.toLowerCase();
    }

    function filterRoots(sounds, query) {
      const q = (query ?? '').trim().toLowerCase();
      if (!q) return sounds;
      return sounds.filter(s => rootSearchText(s).includes(q));
    }

    function sortRoots(sounds) {
      return sounds.filter(s => s.state !== 'rejected').sort((a, b) => {
        const aNamed = a.meaning ? 1 : 0;
        const bNamed = b.meaning ? 1 : 0;
        if (aNamed !== bNamed) return aNamed - bNamed;
        return (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling);
      });
    }

    function userWords() {
      return STATE.lab.compounds.filter(c => !c.generator_hint && c.state !== 'rejected');
    }

    function rootDraftSpelling() {
      return buildSyllable(STATE.rootDraft.onset, STATE.rootDraft.vowel, STATE.rootDraft.coda);
    }

    function syncRootDraftFromSpelling(sp) {
      const s = parseSyllable(sp);
      if (s && !s.unparsed && s.vowel) {
        STATE.rootDraft = { onset: s.onset || '', vowel: s.vowel, coda: s.coda || '' };
        return true;
      }
      return false;
    }

    function syllableChip(kind, value) {
      const picked = STATE.rootDraft[kind] === value;
      const mono = value || '-';
      const hint = value ? pieceHint(value) : '';
      const glyph = value && STATE.rules ? pieceToFonoraSymbols(value, STATE.rules) : '';
      return `<button type="button" class="syl-chip ${value ? '' : 'none'}${picked ? ' picked' : ''}" data-piece="${kind}" data-val="${escapeHtml(value)}">
        ${glyph ? `<span class="syl-glyph symbol-text">${escapeHtml(glyph)}</span>` : ''}
        <span class="mono">${escapeHtml(mono)}</span>${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ''}</button>`;
    }

    function renderSyllableBuilderCollapsible(prefix = 'root', isOpen = STATE.rootPickerOpen) {
      return `
        <div class="collapse-block">
          <button type="button" class="collapse-toggle${isOpen ? ' open' : ''}" id="${prefix}-picker-toggle" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="${prefix}-picker-panel">
            <span>Sound picker <span class="sub">(start, vowel, end)</span></span>
            <span class="chev" aria-hidden="true">▸</span>
          </button>
          <div class="collapse-panel" id="${prefix}-picker-panel"${isOpen ? '' : ' hidden'}>
            ${renderSyllableBuilderMarkup(prefix)}
          </div>
        </div>`;
    }

    function syncRootPickerCollapse(prefix, isOpen) {
      const panel = $(`${prefix}-picker-panel`);
      const btn = $(`${prefix}-picker-toggle`);
      if (panel) panel.hidden = !isOpen;
      if (btn) {
        btn.classList.toggle('open', isOpen);
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
    }

    function renderSyllableBuilderMarkup(prefix = 'root') {
      const onsetRows = ONSET_GROUPS.map(g => `
        <div style="margin-top:0.4rem">
          <span class="sans" style="font-size:0.72rem;color:var(--muted)">${escapeHtml(g.label)}</span>
          <div class="syl-chips" style="margin-top:0.25rem">${g.items.map(v => syllableChip('onset', v)).join('')}</div>
        </div>`).join('');
      return `
        <div class="syl-builder" id="${prefix}-syl-builder">
          <div class="syl-row">
            <div class="syl-label">Start <span style="font-weight:400;text-transform:none">(consonant, optional)</span></div>
            <div class="syl-chips">${syllableChip('onset', '')}</div>
            ${onsetRows}
          </div>
          <div class="syl-row">
            <div class="syl-label">Vowel <em>required</em></div>
            <div class="syl-chips">${VOWEL_DISPLAY.map(v => syllableChip('vowel', v)).join('')}</div>
          </div>
          <div class="syl-row">
            <div class="syl-label">End <span style="font-weight:400;text-transform:none">(consonant, optional)</span></div>
            <div class="syl-chips">${syllableChip('coda', '')}${CODA_DISPLAY.map(v => syllableChip('coda', v)).join('')}</div>
          </div>
        </div>`;
    }

    function updateRootSpellingPreview({ spellId, pronId, hintId, saveBtnId, hearBtnId, builderId, excludeSpelling }) {
      const spellInp = $(spellId);
      const typed = spellInp?.value.trim().toLowerCase() ?? '';
      const sp = rootDraftSpelling();
      const valid = isValidSyllable(sp);
      const exists = valid && STATE.lab?.sounds?.some(s => s.spelling === sp && s.spelling !== excludeSpelling);

      if (spellInp && document.activeElement !== spellInp && valid) spellInp.value = sp;

      const pronEl = $(pronId);
      if (pronEl) {
        if (valid) {
          pronEl.innerHTML = `<div class="syl-preview"><div class="roman">${escapeHtml(sp)}</div>${pronBlock(sp)}</div>`;
        } else if (typed) {
          pronEl.innerHTML = `<div class="syl-invalid">“${escapeHtml(typed)}” isn’t a Fonoran syllable. <button type="button" class="linkish" data-open-picker>Open the sound picker</button>. There is no <strong>z</strong> in this language. Similar: <button type="button" class="linkish" data-try-spell="sa">sa</button> (s + a).</div>`;
        } else {
          pronEl.innerHTML = '';
        }
      }

      const hintEl = hintId ? $(hintId) : null;
      if (hintEl) {
        hintEl.innerHTML = exists
          ? `<div class="syl-invalid">Root <strong>${escapeHtml(sp)}</strong> already exists.</div>`
          : '';
      }

      const saveBtn = saveBtnId ? $(saveBtnId) : null;
      const hearBtn = hearBtnId ? $(hearBtnId) : null;
      if (saveBtn) saveBtn.disabled = !valid || exists;
      if (hearBtn) hearBtn.disabled = !valid;

      $(builderId)?.querySelectorAll('.syl-chip[data-piece]').forEach(chip => {
        chip.classList.toggle('picked', STATE.rootDraft[chip.dataset.piece] === (chip.dataset.val ?? ''));
      });
    }

    function updateRootCreatePreview() {
      const spellInp = $('new-root-spelling');
      const typed = spellInp?.value.trim().toLowerCase() ?? '';
      const sp = rootDraftSpelling();
      const valid = isValidSyllable(sp);
      const exists = valid && STATE.lab?.sounds?.some(s => s.spelling === sp);

      if (spellInp && document.activeElement !== spellInp && valid) spellInp.value = sp;

      const card = $('new-root-preview-card');
      const glyphsEl = $('new-root-glyphs');
      const sayEl = $('new-root-say');
      const likeEl = $('new-root-like');
      const invalidEl = $('new-root-invalid');
      const hintEl = $('new-root-hint');
      const saveBtn = $('new-root-save');
      const hearBtn = $('new-root-hear');

      card?.classList.toggle('is-valid', valid);
      card?.classList.toggle('is-empty', !valid && !typed);

      if (valid) {
        const script = STATE.rules ? romanToFonoraScript([sp], STATE.rules).phrase : '';
        if (glyphsEl) glyphsEl.textContent = script || '\u00a0';
        if (sayEl) sayEl.textContent = phoneticKeyBold(sp);
        if (likeEl) likeEl.textContent = englishGuide(sp) || '-';
        if (invalidEl) { invalidEl.hidden = true; invalidEl.innerHTML = ''; }
      } else if (typed) {
        if (glyphsEl) glyphsEl.textContent = '\u00a0';
        if (sayEl) sayEl.textContent = '-';
        if (likeEl) likeEl.textContent = '-';
        if (invalidEl) {
          invalidEl.hidden = false;
          invalidEl.innerHTML = `“${escapeHtml(typed)}” isn’t a Fonoran syllable. There is no <strong>z</strong> in this language. Similar: <button type="button" class="linkish" data-try-spell="sa">sa</button> (s + a).`;
        }
      } else {
        if (glyphsEl) glyphsEl.textContent = '\u00a0';
        if (sayEl) sayEl.textContent = '-';
        if (likeEl) likeEl.textContent = '-';
        if (invalidEl) { invalidEl.hidden = true; invalidEl.innerHTML = ''; }
      }

      if (hintEl) {
        hintEl.innerHTML = exists
          ? `<div class="syl-invalid">Root <strong>${escapeHtml(sp)}</strong> already exists.</div>`
          : '';
      }
      if (saveBtn) saveBtn.disabled = !valid || exists;
      if (hearBtn) hearBtn.disabled = !valid;

      $('root-syl-builder')?.querySelectorAll('.syl-chip[data-piece]').forEach(chip => {
        chip.classList.toggle('picked', STATE.rootDraft[chip.dataset.piece] === (chip.dataset.val ?? ''));
      });
    }

    function updateRootEditPreview(origSpelling) {
      updateRootSpellingPreview({
        spellId: 'root-ed-spelling',
        pronId: 'root-ed-pron',
        hintId: 'root-ed-hint',
        saveBtnId: 'root-ed-save',
        hearBtnId: null,
        builderId: 'root-ed-syl-builder',
        excludeSpelling: origSpelling,
      });
    }

    function wireSyllablePanel({ prefix, spellId, pronId, getPickerOpen, setPickerOpen, onPreview, excludeSpelling }) {
      $(`${prefix}-picker-toggle`)?.addEventListener('click', () => {
        setPickerOpen(!getPickerOpen());
        syncRootPickerCollapse(prefix, getPickerOpen());
      });
      $(`${prefix}-syl-builder`)?.querySelectorAll('.syl-chip[data-piece]').forEach(chip => {
        chip.addEventListener('click', () => {
          const kind = chip.dataset.piece;
          const val = chip.dataset.val ?? '';
          speakPiece(kind, val);
          STATE.rootDraft[kind] = val;
          onPreview();
        });
      });
      const spellInp = $(spellId);
      spellInp?.addEventListener('input', () => {
        const sp = spellInp.value.trim().toLowerCase();
        if (!sp) STATE.rootDraft = { onset: '', vowel: '', coda: '' };
        else if (!syncRootDraftFromSpelling(sp)) STATE.rootDraft = { onset: '', vowel: '', coda: '' };
        onPreview();
      });
      $(pronId)?.addEventListener('click', e => {
        const openBtn = e.target.closest('[data-open-picker]');
        if (openBtn) {
          setPickerOpen(true);
          syncRootPickerCollapse(prefix, true);
          return;
        }
        const b = e.target.closest('[data-try-spell]');
        if (!b || !spellInp) return;
        spellInp.value = b.dataset.trySpell;
        syncRootDraftFromSpelling(b.dataset.trySpell);
        onPreview();
      });
      syncRootPickerCollapse(prefix, getPickerOpen());
    }

    function wireRootCreatePanel() {
      $('root-syl-builder')?.querySelectorAll('.syl-chip[data-piece]').forEach(chip => {
        chip.addEventListener('click', () => {
          const kind = chip.dataset.piece;
          const val = chip.dataset.val ?? '';
          speakPiece(kind, val);
          STATE.rootDraft[kind] = val;
          updateRootCreatePreview();
        });
      });
      const spellInp = $('new-root-spelling');
      spellInp?.addEventListener('input', () => {
        const sp = spellInp.value.trim().toLowerCase();
        if (!sp) STATE.rootDraft = { onset: '', vowel: '', coda: '' };
        else if (!syncRootDraftFromSpelling(sp)) STATE.rootDraft = { onset: '', vowel: '', coda: '' };
        updateRootCreatePreview();
      });
      $('new-root-invalid')?.addEventListener('click', e => {
        const b = e.target.closest('[data-try-spell]');
        if (!b || !spellInp) return;
        spellInp.value = b.dataset.trySpell;
        syncRootDraftFromSpelling(b.dataset.trySpell);
        updateRootCreatePreview();
      });
      $('new-root-hear')?.addEventListener('click', () => {
        const sp = rootDraftSpelling();
        if (isValidSyllable(sp)) speakNeural(sp);
      });
    }

    function rootScriptPhrase(spelling) {
      return STATE.rules ? romanToFonoraScript([spelling], STATE.rules).phrase : '';
    }

    function rootCellBodyHtml(s) {
      const glyphs = rootScriptPhrase(s.spelling);
      return `
          <span class="sp">${escapeHtml(s.spelling)}</span>
          ${glyphs ? `<span class="root-glyphs symbol-text">${escapeHtml(glyphs)}</span>` : ''}
          <span class="mn ${s.meaning ? '' : 'unnamed'}">${escapeHtml(s.meaning || 'unnamed')}</span>`;
    }

    function rootPickerMarkup(sounds) {
      return sounds.length ? sounds.map(s => `
        <button type="button" class="root-cell" data-add="${escapeHtml(s.spelling)}">${rootCellBodyHtml(s)}</button>`).join('')
        : '<p class="empty" style="grid-column:1/-1">No match.</p>';
    }

    function rootsGridMarkup(filtered) {
      return filtered.length ? filtered.map(s => `
        <button type="button" class="root-cell" data-sp="${escapeHtml(s.spelling)}">${rootCellBodyHtml(s)}
          <span class="ct">${s.used_in_count} word${s.used_in_count === 1 ? '' : 's'}${s.created_by === 'user' ? ' · yours' : ''} · ${badge(s.state)}</span>
        </button>`).join('') : '<p class="empty" style="grid-column:1/-1">No roots match that sound.</p>';
    }

    function rootsCountLabel(filtered, sounds, unnamed) {
      return `${filtered.length}${filtered.length !== sounds.length ? ` of ${sounds.length}` : ''}${unnamed ? ` · ${unnamed} unnamed` : ''}`;
    }

    function wireRootsGrid() {
      $('roots-body')?.querySelectorAll('.root-cell[data-sp]').forEach(b => b.addEventListener('click', () => {
        STATE.exploreSel = b.dataset.sp;
        STATE.rootBuild = [{ type: 'root', ref: b.dataset.sp, spelling: b.dataset.sp }];
        STATE.rootBuildFilter = '';
        STATE.rootEditing = false;
        renderRoots();
        scrollPageTop();
        requestAnimationFrame(scrollPageTop);
      }));
    }

    function updateRootsFilter() {
      const sounds = sortRoots(STATE.lab.sounds);
      const filtered = filterRoots(sounds, STATE.rootsFilter);
      const unnamed = sounds.filter(s => !s.meaning).length;
      const countEl = $('roots-count');
      const gridEl = $('roots-grid');
      if (countEl) countEl.textContent = rootsCountLabel(filtered, sounds, unnamed);
      if (gridEl) {
        gridEl.innerHTML = rootsGridMarkup(filtered);
        wireRootsGrid();
      }
    }

    function compoundAtomicRoots(c) {
      const walk = (comps) => {
        const roots = [];
        for (const comp of comps ?? []) {
          if (comp.type === 'root') roots.push(comp.ref);
          else {
            const w = STATE.lab.compounds.find(x => x.id === comp.ref);
            const inner = w?.components ?? w?.parts?.map(p => ({ type: 'root', ref: p }));
            roots.push(...walk(inner));
          }
        }
        return roots;
      };
      return walk(c.components ?? c.parts?.map(p => ({ type: 'root', ref: p })));
    }

    function startsWithRoot(c, spelling) {
      const first = c.part_details?.[0];
      return first?.type === 'root' && first.ref === spelling;
    }

    function renderRoots() {
      const el = $('roots-body');
      if (!STATE.exploreSel) {
        const sounds = sortRoots(STATE.lab.sounds);
        const filtered = filterRoots(sounds, STATE.rootsFilter);
        const unnamed = sounds.filter(s => !s.meaning).length;
        el.innerHTML = `
          <div class="composer root-create" style="margin-bottom:1.5rem">
            <h3 style="margin:0 0 0.35rem">Create a new root</h3>
            <p class="sans intro">Pick sounds on the left, or type a syllable on the right.</p>
            <div class="root-create-split">
              <div class="root-create-left">
                <div class="split-h">Sound picker</div>
                ${renderSyllableBuilderMarkup('root')}
              </div>
              <div class="root-create-right">
                <div class="split-h">Preview</div>
                <div class="root-preview-card is-empty" id="new-root-preview-card">
                  <input type="text" id="new-root-spelling" class="root-preview-roman" placeholder="-" autocomplete="off" spellcheck="false" aria-label="Roman spelling">
                  <div class="root-preview-glyphs fonora-script symbol-text" id="new-root-glyphs" aria-hidden="true">&nbsp;</div>
                  <div class="pron-block root-preview-pron">
                    <div class="pron-line">Say: <strong id="new-root-say">-</strong></div>
                    <div class="pron-english" id="new-root-like-wrap">Sounds like: <span id="new-root-like">-</span></div>
                  </div>
                </div>
                <div class="syl-invalid" id="new-root-invalid" hidden></div>
                <div id="new-root-hint"></div>
                <button type="button" class="hear-min" id="new-root-hear" disabled aria-label="Listen to this syllable">▶ Listen</button>
              </div>
            </div>
            <label class="fld" for="new-root-meaning">Meaning <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
            ${meaningPickerHtml('new-root')}
            <input type="text" id="new-root-meaning" placeholder="Type or pick from English list…">
            <div class="actions" style="margin-top:0.7rem">
              <button type="button" class="btn btn-primary" id="new-root-save" disabled>Add root</button>
            </div>
          </div>
          <h3 class="section-h">All roots <span id="roots-count" style="color:var(--muted);font-weight:400">(${rootsCountLabel(filtered, sounds, unnamed)})</span></h3>
          <p class="page-intro" style="margin-bottom:0.85rem">Tap a root to name it, approve its meaning, or build words from it.</p>
          <input type="search" id="roots-filter" class="search-bar" placeholder="Search by sound… e.g. da, b-oo" value="${escapeHtml(STATE.rootsFilter)}" autocomplete="off">
          <div class="root-grid" id="roots-grid">${rootsGridMarkup(filtered)}</div>`;
        const spellInp = $('new-root-spelling');
        const meaningInp = $('new-root-meaning');
        wireRootCreatePanel();
        wireMeaningPicker('new-root', 'new-root-meaning');
        updateRootCreatePreview();
        meaningInp.addEventListener('keydown', e => { if (e.key === 'Enter') $('new-root-save').click(); });
        $('roots-filter')?.addEventListener('input', e => { STATE.rootsFilter = e.target.value; updateRootsFilter(); });
        wireRootsGrid();
        $('new-root-save').addEventListener('click', async () => {
          const spelling = rootDraftSpelling();
          const meaning = meaningInp.value.trim();
          if (!isValidSyllable(spelling)) { toast('Pick a valid syllable first.'); return; }
          try {
            const res = await api('/api/fonoran/lab/sounds', { method: 'POST', body: JSON.stringify({ spelling, meaning: meaning || undefined }) });
            toast(`Added root ${res.spelling}`);
            spellInp.value = ''; meaningInp.value = '';
            STATE.rootDraft = { onset: '', vowel: '', coda: '' };
            await load({ skipRender: true });
            renderRoots();
            scrollPageTop();
          } catch (e) { toast(e.message); }
        });
        return;
      }
      const s = STATE.lab.sounds.find(x => x.spelling === STATE.exploreSel);
      if (!s) {
        STATE.exploreSel = null;
        STATE.rootEditing = false;
        renderRoots();
        return;
      }
      const active = STATE.lab.compounds.filter(c => c.state !== 'rejected');
      const derived = active.filter(c => startsWithRoot(c, s.spelling));
      const contains = active.filter(c => !startsWithRoot(c, s.spelling) && compoundAtomicRoots(c).includes(s.spelling));
      const row = (c) => {
        const formula = c.part_details.map(p => p.spelling === s.spelling
          ? `<span class="here">${escapeHtml(p.meaning || p.spelling)}</span>`
          : escapeHtml(p.meaning || p.legacy_label || '?')).join(' + ');
        return `<button type="button" class="deriv" data-id="${escapeHtml(c.id)}">
          <div><span class="dw">${escapeHtml(c.spelling)}</span><span class="dm ${c.meaning ? '' : 'unnamed'}">${escapeHtml(c.meaning || 'unnamed')}</span></div>
          <div class="df">${formula}</div></button>`;
      };
      el.innerHTML = `
        <button type="button" class="back-link" id="exp-back">← All roots</button>
        <div class="root-head">
          ${pronBlock(s.spelling)}
          <div class="sp">${escapeHtml(s.spelling)}</div>
          <p class="mn ${s.meaning ? '' : 'unnamed'}">${escapeHtml(s.meaning || 'not named yet')}</p>
          ${badge(s.state)}
          <button type="button" class="btn" id="root-explore" style="margin-top:0.5rem">Explore family tree</button>
          <button type="button" class="hear-min" id="exp-hear" aria-label="Listen to this root">▶ Listen</button>
          ${STATE.rootEditing ? renderRootEdit(s) : (s.meaning ? `
            <div class="feel-actions" style="margin-top:0.85rem">
              <button type="button" class="fa-approve" id="root-approve" ${s.meaning ? '' : 'disabled'}>✓ Approve</button>
              <button type="button" class="fa-edit" id="root-edit">✎ Edit</button>
              <button type="button" class="fa-reject" id="root-reject">✕ Reject</button>
            </div>
            <div class="tip"><strong>Tip:</strong> ${ROOT_TIP}</div>` : renderRootNamePanel(s))}
        </div>
        <h3 class="section-h">Words built from ${escapeHtml(s.spelling)} <span style="color:var(--muted);font-weight:400">(${derived.length})</span></h3>
        <p class="sans" style="font-size:0.84rem;color:var(--muted);margin:0 0 0.6rem">${escapeHtml(s.spelling)} leads these words. They grow from this root.</p>
        ${derived.length ? derived.map(row).join('') : `<p class="empty" style="padding:0.5rem">None yet.${s.meaning ? ' Build one below.' : ''}</p>`}
        <h3 class="section-h">Other words that use ${escapeHtml(s.spelling)} <span style="color:var(--muted);font-weight:400">(${contains.length})</span></h3>
        ${contains.length ? contains.map(row).join('') : '<p class="empty" style="padding:0.5rem">None.</p>'}
        ${s.meaning ? `<div class="composer" style="margin-top:1.25rem">
          <h3>Build a new word from ${escapeHtml(s.spelling)}</h3>
          <p class="sans" style="font-size:0.84rem;color:var(--muted);margin:0">${escapeHtml(s.spelling)} stays first. Add roots or approved words below.</p>
          <div class="pick" id="rb-pick"></div>
          <p class="composer-spell" id="rb-spell">-</p>
          <div id="rb-pron"></div>
          <div id="rb-match"></div>
          <button type="button" class="hear-min" id="rb-hear" style="margin:0.5rem 0" disabled aria-label="Listen to this word">▶ Listen</button>
          <button type="button" class="btn" id="rb-explore" style="margin:0 0 0.5rem" disabled>Explore preview</button>
          <label class="fld" for="rb-meaning">Compound word meaning</label>
          ${meaningPickerHtml('rb')}
          <input type="text" id="rb-meaning" placeholder="What does this new word mean?">
          <div class="actions" style="margin-top:0.7rem">
            <button type="button" class="btn btn-primary" id="rb-save" disabled>Save word</button>
            <button type="button" class="btn" id="rb-reset">Reset</button>
          </div>
          <input type="search" id="rb-filter" placeholder="Search roots and words by spelling or meaning…" style="margin-top:0.85rem">
          <h4 class="picker-h">Primitive roots</h4>
          <div class="sound-grid" id="rb-roots"></div>
          <h4 class="picker-h">Approved words</h4>
          <div class="sound-grid" id="rb-words"></div>
        </div>` : ''}`;
      $('exp-back').addEventListener('click', () => { STATE.exploreSel = null; STATE.rootEditing = false; renderRoots(); scrollPageTop(); });
      $('root-explore')?.addEventListener('click', () => openExplorer('root', s.spelling));
      $('exp-hear').addEventListener('click', () => speakNeural(s.spelling));
      if (!STATE.rootEditing) {
        if (s.meaning) {
          $('root-edit')?.addEventListener('click', () => { STATE.rootEditing = true; renderRoots(); });
          $('root-approve')?.addEventListener('click', async () => {
            await api(`/api/fonoran/lab/sounds/${encodeURIComponent(s.spelling)}`, { method: 'PATCH', body: JSON.stringify({ meaning: s.meaning, state: 'approved' }) });
            toast(`Approved ${s.spelling}`); await load({ skipRender: true }); renderRoots();
          });
          $('root-reject')?.addEventListener('click', async () => {
            await api(`/api/fonoran/lab/state/sound/${encodeURIComponent(s.spelling)}`, { method: 'PATCH', body: JSON.stringify({ state: 'rejected' }) });
            toast(`Rejected ${s.spelling}`); STATE.exploreSel = null; await load({ skipRender: true }); renderRoots();
          });
        } else wireRootName(s);
      } else wireRootEdit(s);
      el.querySelectorAll('.deriv[data-id]').forEach(b => b.addEventListener('click', () => openChain('compound', b.dataset.id)));
      if (s.meaning) {
        renderRootBuilder(s);
        wireMeaningPicker('rb', 'rb-meaning');
        $('rb-filter').addEventListener('input', e => { STATE.rootBuildFilter = e.target.value; renderRootBuilder(s); });
        $('rb-reset')?.addEventListener('click', () => {
          STATE.rootBuild = [{ type: 'root', ref: s.spelling, spelling: s.spelling }];
          STATE.rootBuildFilter = '';
          $('rb-meaning').value = '';
          renderRootBuilder(s);
        });
        $('rb-save').addEventListener('click', async () => {
          const meaning = $('rb-meaning').value.trim();
          if (STATE.rootBuild.length < 2) { toast('Add at least one more component.'); return; }
          if (!meaning) { toast('Give the word a meaning.'); return; }
          try {
            const spelling = resolveComposerSpelling(STATE.rootBuild);
            await api('/api/fonoran/lab/compounds', {
              method: 'POST',
              body: JSON.stringify({
                components: composerToApi(STATE.rootBuild),
                meaning,
                allow_unapproved: STATE.showUnapprovedWords,
              }),
            });
            STATE.rootBuild = [{ type: 'root', ref: s.spelling, spelling: s.spelling }];
            STATE.rootBuildFilter = '';
            toast(`Saved ${spelling} → ${meaning}`);
            await load({ skipRender: true });
            renderRoots();
          } catch (e) { toast(e.message); }
        });
      }
    }

    function renderRootNamePanel(s) {
      return `
        <div class="edit-panel" style="text-align:left;margin-top:0.85rem">
          <p class="sans" style="font-size:0.86rem;color:var(--muted);margin:0 0 0.65rem">Name this root here. <strong>${escapeHtml(s.spelling)}</strong> is one sound, not a compound like ${escapeHtml(s.spelling + s.spelling)}.</p>
          <label class="fld" for="root-name-meaning">Root meaning</label>
          ${meaningPickerHtml('root-name')}
          <input type="text" id="root-name-meaning" placeholder="e.g. self, bond, motion…" autocomplete="off">
          <div class="edit-actions" style="margin-top:0.65rem">
            <button type="button" class="btn btn-primary" id="root-name-save">Save meaning</button>
            <button type="button" class="btn fa-reject" id="root-name-reject" style="border-color:#f0c0c0;color:var(--reject)">Reject root</button>
          </div>
        </div>`;
    }

    function wireRootName(s) {
      wireMeaningPicker('root-name', 'root-name-meaning');
      const inp = $('root-name-meaning');
      inp?.focus();
      inp?.addEventListener('keydown', e => { if (e.key === 'Enter') $('root-name-save').click(); });
      $('root-name-save')?.addEventListener('click', async () => {
        const meaning = inp.value.trim();
        if (!meaning) { toast('Type a meaning first.'); return; }
        try {
          await api(`/api/fonoran/lab/sounds/${encodeURIComponent(s.spelling)}`, {
            method: 'PATCH',
            body: JSON.stringify({ meaning, state: 'approved' }),
          });
          toast(`Named ${s.spelling} → ${meaning}`);
          await load({ skipRender: true });
          renderRoots();
        } catch (e) { toast(e.message); }
      });
      $('root-name-reject')?.addEventListener('click', async () => {
        await api(`/api/fonoran/lab/state/sound/${encodeURIComponent(s.spelling)}`, { method: 'PATCH', body: JSON.stringify({ state: 'rejected' }) });
        toast(`Rejected ${s.spelling}`); STATE.exploreSel = null; await load({ skipRender: true }); renderRoots();
      });
    }

    function renderRootEdit(s) {
      return `
        <div class="edit-panel" style="text-align:left;margin-top:1rem">
          <label class="fld" for="root-ed-spelling">Roman spelling</label>
          <input type="text" id="root-ed-spelling" value="${escapeHtml(s.spelling)}" autocomplete="off">
          <div id="root-ed-pron"></div>
          <div id="root-ed-hint"></div>
          ${renderSyllableBuilderCollapsible('root-ed', STATE.rootEditPickerOpen)}
          <label class="fld" for="root-ed-meaning">Meaning</label>
          ${meaningPickerHtml('root-ed')}
          <input type="text" id="root-ed-meaning" value="${escapeHtml(s.meaning ?? '')}" placeholder="e.g. flow, edge, agent…">
          <div id="root-ed-dupe"></div>
          <div class="deps-summary">
            <span class="words">${s.used_in_count} word${s.used_in_count === 1 ? '' : 's'}</span> use this root${s.used_in_count ? `: ${s.used_in.slice(0, 8).map(c => escapeHtml(c.meaning || c.spelling)).join(', ')}${s.used_in_count > 8 ? '…' : ''}` : '.'}
            ${s.used_in_count ? `<br><strong>Changing spelling or meaning updates ${s.used_in_count} word${s.used_in_count === 1 ? '' : 's'} that use this root.</strong>` : ''}
          </div>
          <div id="root-ed-impact"></div>
          <div class="edit-actions">
            <button type="button" class="btn btn-primary" id="root-ed-save">Save &amp; approve</button>
            <button type="button" class="btn" id="root-ed-cancel">Cancel</button>
          </div>
        </div>`;
    }

    function wireRootEdit(s) {
      STATE.editMeaning = s.meaning ?? '';
      STATE.clearAffected = false;
      syncRootDraftFromSpelling(s.spelling);
      wireSyllablePanel({
        prefix: 'root-ed',
        spellId: 'root-ed-spelling',
        pronId: 'root-ed-pron',
        getPickerOpen: () => STATE.rootEditPickerOpen,
        setPickerOpen: v => { STATE.rootEditPickerOpen = v; },
        onPreview: () => updateRootEditPreview(s.spelling),
      });
      const inp = $('root-ed-meaning');
      const spellInp = $('root-ed-spelling');
      inp.addEventListener('input', () => { STATE.editMeaning = inp.value; renderRootDupe(s); renderRootImpact(s); });
      spellInp?.addEventListener('input', () => { renderRootImpact(s); updateRootEditPreview(s.spelling); });
      wireMeaningPicker('root-ed', 'root-ed-meaning');
      $('root-ed-cancel').addEventListener('click', () => { STATE.rootEditing = false; STATE.rootEditPickerOpen = false; renderRoots(); });
      $('root-ed-save').addEventListener('click', async () => {
        const newSpelling = spellInp.value.trim().toLowerCase();
        const meaning = STATE.editMeaning.trim();
        if (!isValidSyllable(newSpelling)) { toast('Pick a valid syllable first.'); return; }
        if (!meaning) { toast('Type a meaning first.'); return; }
        const meaningChanged = meaning !== (s.meaning ?? '');
        const spellingChanged = newSpelling !== s.spelling;
        try {
          const res = await api(`/api/fonoran/lab/sounds/${encodeURIComponent(s.spelling)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              spelling: spellingChanged ? newSpelling : undefined,
              meaning,
              state: meaningChanged && s.meaning ? 'revised' : 'approved',
              clear_affected_compounds: STATE.clearAffected,
            }),
          });
          const savedSpelling = res.sound?.spelling ?? s.spelling;
          STATE.rootEditing = false;
          STATE.rootEditPickerOpen = false;
          STATE.exploreSel = savedSpelling;
          STATE.rootBuild = [{ type: 'root', ref: savedSpelling, spelling: savedSpelling }];
          toast(res.spelling_changed
            ? `Renamed ${res.old_spelling ?? s.spelling} → ${savedSpelling}`
            : `Saved ${savedSpelling} → ${meaning}`);
          await load({ skipRender: true });
          renderRoots();
        } catch (e) { toast(e.message); }
      });
      updateRootEditPreview(s.spelling);
      renderRootDupe(s);
      renderRootImpact(s);
    }

    function renderRootDupe(s) {
      const box = $('root-ed-dupe'); if (!box) return;
      const hits = meaningMatches(STATE.editMeaning, 'sound', s.spelling);
      box.innerHTML = hits.length ? `<div class="dupe"><strong>⚠ Already in use:</strong> “${escapeHtml(STATE.editMeaning.trim())}” also means <span class="mono">${hits.join('</span>, <span class="mono">')}</span>.</div>` : '';
    }

    function renderRootImpact(s) {
      const box = $('root-ed-impact'); if (!box) return;
      const spellInp = $('root-ed-spelling');
      const newSpelling = spellInp?.value.trim().toLowerCase() ?? s.spelling;
      const spellingChanged = newSpelling !== s.spelling;
      const meaningChanged = (STATE.editMeaning.trim() || '') !== (s.meaning ?? '');
      const named = s.used_in.filter(c => c.meaning);
      if (spellingChanged && s.used_in_count) {
        box.innerHTML = `<div class="impact">
          <strong>Spelling change:</strong> ${escapeHtml(s.spelling)} → <span class="mono">${escapeHtml(newSpelling)}</span>.
          ${s.used_in_count} word${s.used_in_count === 1 ? '' : 's'} that use this root will get new spellings too.
        </div>${meaningChanged && named.length ? '' : ''}`;
        if (meaningChanged && named.length) {
          box.innerHTML += `<div class="impact" style="margin-top:0.5rem">
            <strong>Meaning change:</strong> these ${named.length} word${named.length === 1 ? '' : 's'} were named with the old meaning:
            <ul>${named.map(c => `<li><span class="mono">${escapeHtml(c.spelling)}</span> · ${escapeHtml(c.meaning)} ${badge(c.state)}</li>`).join('')}</ul>
            <label><input type="checkbox" id="root-ed-clear"${STATE.clearAffected ? ' checked' : ''}> Send these back to “needs review” so I re-check them</label>
            <p class="impact-note">${STATE.clearAffected ? 'Their meanings stay; you just confirm each again. Nothing is deleted.' : 'Leave unchecked to keep their names exactly as they are.'}</p>
          </div>`;
          $('root-ed-clear')?.addEventListener('change', e => { STATE.clearAffected = e.target.checked; renderRootImpact(s); });
        }
        return;
      }
      if (meaningChanged && named.length) {
        box.innerHTML = `<div class="impact">
          <strong>Preview impact:</strong> these ${named.length} word${named.length === 1 ? '' : 's'} were named with the old meaning:
          <ul>${named.map(c => `<li><span class="mono">${escapeHtml(c.spelling)}</span> · ${escapeHtml(c.meaning)} ${badge(c.state)}</li>`).join('')}</ul>
          <label><input type="checkbox" id="root-ed-clear"${STATE.clearAffected ? ' checked' : ''}> Send these back to “needs review” so I re-check them</label>
          <p class="impact-note">${STATE.clearAffected ? 'Their meanings stay; you just confirm each again. Nothing is deleted.' : 'Leave unchecked to keep their names exactly as they are.'}</p>
        </div>`;
        $('root-ed-clear').addEventListener('change', e => { STATE.clearAffected = e.target.checked; renderRootImpact(s); });
      } else box.innerHTML = '';
    }

    function renderRootBuilder(root) {
      if (STATE.rootBuild.length && typeof STATE.rootBuild[0] === 'string') {
        STATE.rootBuild = STATE.rootBuild.map(p => ({ type: 'root', ref: p, spelling: p }));
      }
      const picks = STATE.rootBuild;
      $('rb-pick').innerHTML = picks.map((c, i) => {
        const sp = c.spelling || c.ref;
        const label = compDisplayLabel(c);
        if (i === 0) {
          return `<span class="tok" style="opacity:0.85;cursor:default">${typeBadge(c.type)} <span class="mono">${escapeHtml(sp)}</span> = ${escapeHtml(label)}</span>`;
        }
        return `<span class="tok" data-idx="${i}">${typeBadge(c.type)} <span class="mono">${escapeHtml(sp)}</span> = ${escapeHtml(label)} ×</span>`;
      }).join('');
      $('rb-pick').querySelectorAll('[data-idx]').forEach(t => t.addEventListener('click', () => {
        STATE.rootBuild.splice(Number(t.dataset.idx), 1);
        renderRootBuilder(root);
      }));
      const spelling = picks.length ? resolveComposerSpelling(picks) : '';
      $('rb-spell').textContent = spelling || '-';
      const flat = composerFlatSpellings(picks);
      $('rb-pron').innerHTML = picks.length >= 2 ? pronBlock(flat) : '';
      const hearBtn = $('rb-hear');
      if (hearBtn) {
        hearBtn.disabled = picks.length < 2;
        hearBtn.onclick = () => speakNeural(flat);
      }
      const exploreBtn = $('rb-explore');
      if (exploreBtn) {
        exploreBtn.disabled = picks.length < 2;
        exploreBtn.onclick = () => openExplorerPreview(picks, spelling);
      }
      const match = renderSpellingMatch('rb-match', spelling);
      $('rb-save').disabled = picks.length < 2 || spellingBlocksSave(match);
      const omitIds = picks.filter(c => c.type === 'word').map(c => c.ref);
      $('rb-roots').innerHTML = rootPickerWithBadge(pickableRoots(STATE.rootBuildFilter, { omit: [root.spelling] }));
      $('rb-words').innerHTML = wordPickerMarkup(pickableWords(STATE.rootBuildFilter, { omitIds }));
      $('rb-roots').querySelectorAll('[data-add-root]').forEach(b => b.addEventListener('click', () => {
        STATE.rootBuild.push({ type: 'root', ref: b.dataset.addRoot, spelling: b.dataset.addRoot });
        renderRootBuilder(root);
      }));
      $('rb-words').querySelectorAll('[data-add-word]').forEach(b => b.addEventListener('click', () => {
        const w = STATE.lab.compounds.find(c => c.id === b.dataset.addWord);
        if (!w) return;
        STATE.rootBuild.push({ type: 'word', ref: w.id, spelling: w.spelling, meaning: w.meaning });
        renderRootBuilder(root);
      }));
    }

    /* ---------- WORD COMPOSER + REVIEW ---------- */
    function renderWordComposer() {
      if (!STATE.lab) return;
      const picks = STATE.wordComposer;
      $('wc-pick').innerHTML = picks.length
        ? picks.map((c, i) => `<span class="tok" data-idx="${i}">${typeBadge(c.type)} <span class="mono">${escapeHtml(c.spelling || c.ref)}</span> = ${escapeHtml(compDisplayLabel(c))} ×</span>`).join('')
        : '<span class="sans" style="color:var(--muted);font-size:0.84rem">Tap roots or approved words below…</span>';
      $('wc-pick').querySelectorAll('.tok').forEach(t => t.addEventListener('click', () => { STATE.wordComposer.splice(Number(t.dataset.idx), 1); renderWordComposer(); }));
      const spelling = picks.length ? resolveComposerSpelling(picks) : '';
      $('wc-spell').textContent = spelling || '-';
      $('wc-pron').innerHTML = picks.length >= 2 ? pronBlock(composerFlatSpellings(picks)) : '';
      if (picks.length >= 2 && ! $('wc-meaning').value.trim()) {
        const sug = picks.map(compDisplayLabel).join(' + ');
        $('wc-meaning').placeholder = sug;
      }
      const match = renderSpellingMatch('wc-match', spelling);
      const hearBtn = $('wc-hear');
      hearBtn.disabled = picks.length < 2;
      hearBtn.onclick = () => speakNeural(composerFlatSpellings(picks));
      const exploreBtn = $('wc-explore');
      if (exploreBtn) {
        exploreBtn.disabled = picks.length < 2;
        exploreBtn.onclick = () => openExplorerPreview(picks, spelling);
      }
      $('wc-save').disabled = picks.length < 2 || spellingBlocksSave(match);
      const omitIds = picks.filter(c => c.type === 'word').map(c => c.ref);
      $('wc-roots').innerHTML = rootPickerWithBadge(pickableRoots(STATE.wordComposerFilter));
      $('wc-words').innerHTML = wordPickerMarkup(pickableWords(STATE.wordComposerFilter, { omitIds }));
      $('wc-roots').querySelectorAll('[data-add-root]').forEach(b => b.addEventListener('click', () => {
        STATE.wordComposer.push({ type: 'root', ref: b.dataset.addRoot, spelling: b.dataset.addRoot });
        renderWordComposer();
      }));
      $('wc-words').querySelectorAll('[data-add-word]').forEach(b => b.addEventListener('click', () => {
        const w = STATE.lab.compounds.find(c => c.id === b.dataset.addWord);
        if (!w) return;
        STATE.wordComposer.push({ type: 'word', ref: w.id, spelling: w.spelling, meaning: w.meaning });
        renderWordComposer();
      }));
    }

    function openExplorerPreview(composer, spelling) {
      openExplorer('word', `preview-${spelling}`, {
        preview: true,
        spelling,
        components: composer,
        meaning: $('wc-meaning')?.value.trim() || $('rb-meaning')?.value.trim() || null,
      });
    }

    function bindMermaidGraphClicks(svgEl, graphNodes) {
      if (!svgEl || !graphNodes?.length) return;
      const byId = Object.fromEntries(graphNodes.map(n => [n.id, n]));
      svgEl.querySelectorAll('g.node').forEach(g => {
        const raw = g.id ?? '';
        const id = raw.replace(/^flowchart-/, '').replace(/-\d+$/, '');
        const meta = byId[id];
        if (!meta || meta.preview) return;
        g.classList.add('graph-node-clickable');
        g.style.cursor = 'pointer';
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          openExplorer(meta.kind, meta.ref);
        });
      });
    }

    async function renderExplorerMermaidIn(rootEl, mermaidSource, graphNodes) {
      if (!window.mermaid || !mermaidSource || !rootEl) return;
      window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
      await window.mermaid.run({ nodes: rootEl.querySelectorAll('.mermaid') });
      const wrap = rootEl.querySelector('.mermaid-wrap');
      bindMermaidGraphClicks(wrap?.querySelector('svg'), graphNodes);
    }

    function labItemDda(type, ref) {
      if (type === 'root') {
        return STATE.lab.sounds.find(s => s.spelling === ref)?.dda ?? null;
      }
      return STATE.lab.compounds.find(c => c.id === ref)?.dda ?? null;
    }

    function ddaNotation(dda) {
      if (!dda?.D && !dda?.M && !dda?.A) return null;
      return `⟨ ${dda.D ?? '?'} · ${dda.M ?? '?'} · ${dda.A ?? '?'} ⟩`;
    }

    function buildCompositionBarHtml(f) {
      const parts = (f.components ?? []).map(c => {
        if (c.type === 'root') return c.ref;
        const w = STATE.lab.compounds.find(x => x.id === c.ref);
        return w?.spelling ?? c.ref;
      });
      if (parts.length < 2) return '';
      const pieces = parts.map((p, i) =>
        `${i > 0 ? '<span class="showcase-compose__op">+</span>' : ''}<span class="showcase-compose__piece">${escapeHtml(p)}</span>`
      ).join('');
      return `<div class="showcase-compose" aria-label="Word composition">
        ${pieces}
        <span class="showcase-compose__op">=</span>
        <span class="showcase-compose__result">${escapeHtml(f.spelling)}</span>
        ${f.meaning ? `<span class="showcase-compose__meaning">${escapeHtml(f.meaning)}</span>` : ''}
      </div>`;
    }

    function buildDdaPanelHtml(wordDda, components) {
      if (!wordDda?.D && !wordDda?.M && !wordDda?.A) {
        return `<div class="showcase-dda showcase-dda--empty">
          <h4>Semantic coordinates (DDA)</h4>
          <p class="sans showcase-dda__empty">Coordinates are inferred automatically as you build: depth, mode, and aspect for every root and compound.</p>
        </div>`;
      }
      const axes = [
        { key: 'Depth', val: wordDda.D },
        { key: 'Mode', val: wordDda.M },
        { key: 'Aspect', val: wordDda.A },
      ];
      const axisHtml = axes.map(a => `
        <div class="showcase-dda__axis">
          <span class="showcase-dda__axis-key">${a.key}</span>
          <span class="showcase-dda__axis-val">${escapeHtml(a.val ?? '?')}</span>
        </div>`).join('');
      const blendRows = (components ?? []).map(c => {
        const sp = c.type === 'root' ? c.ref : (STATE.lab.compounds.find(x => x.id === c.ref)?.spelling ?? c.ref);
        const m = c.type === 'root' ? soundMeaning(c.ref) : (STATE.lab.compounds.find(x => x.id === c.ref)?.meaning ?? '?');
        const dda = labItemDda(c.type === 'root' ? 'root' : 'word', c.ref);
        const note = ddaNotation(dda);
        if (!note) return '';
        return `<div class="showcase-dda__blend-row">
          <span class="mono">${escapeHtml(sp)}</span>
          <span class="showcase-dda__blend-note">${escapeHtml(note)}</span>
          <span class="showcase-dda__blend-meaning">${escapeHtml(m)}</span>
        </div>`;
      }).filter(Boolean).join('');
      const conf = wordDda.confidence != null ? `${Math.round(wordDda.confidence * 100)}% confidence` : '';
      const composition = wordDda.coordinates?.composition?.length
        ? `blend: ${wordDda.coordinates.composition.join(' → ')}`
        : '';
      const status = wordDda.status
        ? `<span class="showcase-dda__pill">${escapeHtml(wordDda.status)}</span>`
        : '';
      return `<div class="showcase-dda">
        <h4>Semantic coordinates (DDA)</h4>
        <p class="showcase-dda__notation">${escapeHtml(ddaNotation(wordDda))}</p>
        <div class="showcase-dda__axes">${axisHtml}</div>
        ${blendRows ? `<div class="showcase-dda__blend"><p class="showcase-dda__blend-label">Blended from roots</p>${blendRows}</div>` : ''}
        <p class="showcase-dda__meta">${status}${conf ? `${status ? ' ' : ''}${escapeHtml(conf)}` : ''}${composition ? ` · ${escapeHtml(composition)}` : ''}</p>
      </div>`;
    }

    function buildUsedInChipsHtml(usedIn) {
      if (!usedIn?.length) return '';
      const chips = usedIn.slice(0, 6).map(u => `
        <button type="button" class="showcase-used-chip" data-explore-word="${escapeHtml(u.id)}">
          <span class="mono">${escapeHtml(u.spelling)}</span>
          <span>${escapeHtml(u.meaning || 'unnamed')}</span>
        </button>`).join('');
      const more = usedIn.length > 6 ? `<span class="showcase-used-more">+${usedIn.length - 6} more</span>` : '';
      return `<div class="explorer-section showcase-used">
        <h4>Feeds into</h4>
        <p class="sans graph-hint">Words that stack this piece: recursive composition in action.</p>
        <div class="showcase-used-chips">${chips}${more}</div>
      </div>`;
    }

    function buildBuiltFromList(components) {
      return (components ?? []).length
        ? components.map(c => {
          const w = c.type === 'word' ? STATE.lab.compounds.find(x => x.id === c.ref) : null;
          const sp = c.type === 'root' ? c.ref : (w?.spelling ?? c.ref);
          const m = c.type === 'root' ? soundMeaning(c.ref) : (w?.meaning ?? '?');
          return `<li>${typeBadge(c.type)} <span class="mono">${escapeHtml(sp)}</span> · ${escapeHtml(m)}</li>`;
        }).join('')
        : '<li class="sans" style="color:var(--muted)">Atomic root, not built from other pieces.</li>';
    }

    function buildShowcaseHtml(data) {
      const f = data.focus;
      const word = STATE.lab?.compounds?.find(c => c.id === LANDER_SHOWCASE_WORD_ID);
      const builtFrom = buildBuiltFromList(f.components);
      const treeText = f.derivation?.direct?.length
        ? formatTreeNodes(f.derivation.direct, 0)
        : `${f.spelling} = ${f.meaning || 'unnamed'}`;
      const speakParts = f.components?.length ? composerFlatSpellings(f.components) : [f.spelling];

      const html = `
        <div class="showcase-hero">
          ${pronBlock(speakParts)}
          <div class="showcase-hero__word">
            <p class="review-word">${escapeHtml(f.spelling)}</p>
            <p class="review-meaning">${f.meaning ? escapeHtml(f.meaning) : '<span style="color:var(--draft);font-style:italic">unnamed</span>'}</p>
            <button type="button" class="hear-min showcase-hero__hear" id="lander-showcase-hear" aria-label="Listen to ${escapeHtml(f.spelling)}">▶ Listen</button>
          </div>
        </div>
        ${buildCompositionBarHtml(f)}
        <div class="showcase-panels">
          <div class="showcase-panel showcase-panel--structure">
            <div class="explorer-section"><h4>Built from</h4><ul class="explorer-list">${builtFrom}</ul></div>
            <div class="explorer-section"><h4>Derivation tree</h4><div class="explorer-tree">${escapeHtml(treeText)}</div></div>
          </div>
          <div class="showcase-panel showcase-panel--dda">
            ${buildDdaPanelHtml(word?.dda, f.components)}
          </div>
        </div>
        ${buildUsedInChipsHtml(data.used_in)}
        ${data.mermaid ? `<div class="explorer-section showcase-graph"><h4>Family graph</h4><p class="sans graph-hint">Tap a node to explore that root or word.</p><div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(data.mermaid)}</pre></div></div>` : ''}`;

      return { html, speakParts };
    }

    function buildExplorerHtml(data, explorerKind, { preview = false, compact = false } = {}) {
      const f = data.focus;
      const kindLabel = explorerKind === 'root' ? 'Primitive root' : (preview ? 'Draft word (preview)' : 'Approved word');
      const builtFrom = buildBuiltFromList(f.components);

      const treeText = f.derivation?.direct?.length
        ? formatTreeNodes(f.derivation.direct, 0)
        : `${f.spelling} = ${f.meaning || 'unnamed'}`;

      const speakParts = explorerKind === 'root'
        ? [f.spelling]
        : (f.components?.length ? composerFlatSpellings(f.components) : [f.spelling]);

      let html = `
        <div class="explorer-hero">
          ${pronBlock(speakParts)}
          <p class="review-word">${escapeHtml(f.spelling)}</p>
          <p class="review-meaning">${f.meaning ? escapeHtml(f.meaning) : '<span style="color:var(--draft);font-style:italic">unnamed</span>'}</p>
          <p>${typeBadge(explorerKind === 'root' ? 'root' : 'word')} ${badge(f.state || 'draft')} · <span class="sans" style="font-size:0.84rem;color:var(--muted)">${kindLabel}</span></p>
          ${preview ? '<p class="sans" style="font-size:0.82rem;color:var(--muted);margin:0.35rem 0 0">Preview: save the word to explore downstream links. Tap nodes in the graph to jump to saved roots and words.</p>' : ''}
        </div>
        <div class="explorer-section"><h4>Built from</h4><ul class="explorer-list">${builtFrom}</ul></div>
        <div class="explorer-section"><h4>Derivation tree</h4><div class="explorer-tree">${escapeHtml(treeText)}</div></div>
        ${data.mermaid ? `<div class="explorer-section"><h4>Family graph</h4><p class="sans graph-hint">Tap a node to explore that root or word.</p><div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(data.mermaid)}</pre></div></div>` : ''}`;

      if (!compact) {
        const usedIn = data.used_in?.length
          ? data.used_in.map(u => `<li><span class="mono">${escapeHtml(u.spelling)}</span> · ${escapeHtml(u.meaning || 'unnamed')} ${badge(u.state)}</li>`).join('')
          : '<li class="sans" style="color:var(--muted)">Nothing built from this yet.</li>';
        const related = data.related?.length
          ? data.related.map(r => `<li><span class="mono">${escapeHtml(r.spelling)}</span> · ${escapeHtml(r.meaning || 'unnamed')}</li>`).join('')
          : '<li class="sans" style="color:var(--muted)">No sibling words share the same components.</li>';
        html += `
          <div class="explorer-section"><h4>Used in</h4><ul class="explorer-list">${usedIn}</ul></div>
          <div class="explorer-section"><h4>Related words</h4><ul class="explorer-list">${related}</ul></div>
          <div class="actions" style="justify-content:center;margin-top:0.75rem"><button type="button" class="hear-min" id="ch-hear">▶ Listen</button></div>`;
      }

      return { html, speakParts };
    }

    async function fetchShowcaseGraph() {
      const word = STATE.lab?.compounds?.find(c => c.id === LANDER_SHOWCASE_WORD_ID);
      if (word) {
        return api(`/api/fonoran/lab/graph/word/${encodeURIComponent(word.id)}`);
      }
      return api('/api/fonoran/lab/graph/preview', {
        method: 'POST',
        body: JSON.stringify({
          spelling: 'kaso',
          meaning: 'love',
          components: [{ type: 'root', ref: 'ka' }, { type: 'root', ref: 'so' }],
        }),
      });
    }

    function openShowcaseExplorer() {
      const word = STATE.lab?.compounds?.find(c => c.id === LANDER_SHOWCASE_WORD_ID);
      if (word) {
        openExplorer('word', word.id);
        return;
      }
      openExplorer('word', 'preview-kaso', {
        preview: true,
        spelling: 'kaso',
        meaning: 'love',
        components: [
          { type: 'root', ref: 'ka', spelling: 'ka' },
          { type: 'root', ref: 'so', spelling: 'so' },
        ],
      });
    }

    async function renderLanderShowcase() {
      const el = $('lander-showcase');
      if (!el || STATE.page !== 'home' || !STATE.lab) return;
      const token = ++landerShowcaseToken;
      try {
        const data = await fetchShowcaseGraph();
        if (token !== landerShowcaseToken) return;
        const { html, speakParts } = buildShowcaseHtml(data);
        el.innerHTML = html;
        $('lander-showcase-hear')?.addEventListener('click', () => speakNeural(speakParts));
        el.querySelectorAll('.showcase-used-chip[data-explore-word]').forEach((btn) => {
          btn.addEventListener('click', () => openExplorer('word', btn.dataset.exploreWord));
        });
        await renderExplorerMermaidIn(el, data.mermaid, data.graph_nodes);
      } catch {
        if (token !== landerShowcaseToken) return;
        el.innerHTML = '<p class="sans fonoran-showcase__error">Could not load the example word. Start the dev server with <code>npm start</code>.</p>';
      }
    }

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

    function buildLanderHealthHtml(h) {
      const core = ['learnability', 'pronounceability', 'memorability', 'parseability'];
      const overall = Math.round(core.reduce((a, k) => a + h.scores[k], 0) / core.length);
      const color = healthScoreColor;
      const scoreCards = h.dimensions.map(d => `
        <div class="score lander-health__score">
          <div class="top"><span class="name">${escapeHtml(d.label)}</span><span class="val" style="color:${color(d.score)}">${d.score}<span style="font-size:0.7rem;color:var(--muted)">/100</span></span></div>
          <div class="bar"><span style="width:${d.score}%;background:${color(d.score)}"></span></div>
          <p class="explain">${escapeHtml(d.explain)}</p>
        </div>`).join('');
      const methodCards = HEALTH_METHOD.map(m => {
        const live = h.scores[m.key];
        return `<article class="lander-health__method-card">
          <div class="lander-health__method-head">
            <h4>${escapeHtml(m.title)}</h4>
            <span class="lander-health__method-live" style="color:${color(live)}">${live}/100</span>
          </div>
          <p>${escapeHtml(m.prose)}</p>
          <p class="lander-health__formula">${escapeHtml(m.formula)}</p>
        </article>`;
      }).join('');
      const metrics = h.metrics.map(m => `
        <div class="lander-health__metric">
          <span class="lander-health__metric-val">${escapeHtml(String(m.value))}${m.suffix ?? ''}</span>
          <span class="lander-health__metric-label">${escapeHtml(m.key === 'compoundLength' ? 'Avg compound length' : 'Algorithmic feel')}</span>
          <p class="lander-health__metric-note">${escapeHtml(m.explain)}</p>
        </div>`).join('');
      const warnNote = h.warning_summary.total
        ? `${h.warning_summary.total} ambiguity warning${h.warning_summary.total === 1 ? '' : 's'} flagged (${h.warning_summary.high} serious)`
        : 'No ambiguity warnings in the current vocabulary';

      return `
        <div class="lander-health__summary">
          <div class="lander-health__overall">
            <div class="lander-health__score-big" style="color:${color(overall)}">${overall}<span class="lander-health__score-of"> / 100</span></div>
            <p class="lander-health__label">${healthOverallLabel(overall)}</p>
            <p class="lander-health__warn-note">${escapeHtml(warnNote)}</p>
          </div>
          <div class="lander-health__scores">${scoreCards}</div>
        </div>
        <div class="lander-health__method">
          <h3>How scores are calculated</h3>
          <p class="lander-health__method-lead">Each dimension is recomputed from your live lab bucket whenever you open Health. Scores are heuristic design guides. They measure structural ergonomics, not linguistic "correctness."</p>
          <div class="lander-health__method-grid">${methodCards}</div>
          <div class="lander-health__metrics">${metrics}</div>
          <p class="lander-health__footnote">Warnings include look-alike sounds, prefix overlap, rhyming clusters, segmentation ambiguity, and pronunciation difficulty. Semantic coordinates (DDA) are analysed separately and surface through the explorer and health detail view.</p>
        </div>
        <div class="lander-health__actions">
          <button type="button" class="btn btn-primary" id="lander-health-open">View full health report</button>
        </div>`;
    }

    async function renderLanderHealth() {
      const el = $('lander-health');
      if (!el || STATE.page !== 'home' || !STATE.lab) return;
      const token = ++landerHealthToken;
      try {
        const h = await api('/api/fonoran/lab/health');
        if (token !== landerHealthToken) return;
        el.innerHTML = buildLanderHealthHtml(h);
        $('lander-health-open')?.addEventListener('click', () => switchPage('health'));
      } catch {
        if (token !== landerHealthToken) return;
        el.innerHTML = '<p class="sans lander-health__error">Could not load health metrics. Start the dev server with <code>npm start</code>.</p>';
      }
    }

    async function renderExplorerMermaid(mermaidSource, graphNodes) {
      await renderExplorerMermaidIn($('sheet-body'), mermaidSource, graphNodes);
    }

    function renderWords() {
      const list = userWords();
      const total = list.length;
      const reviewEl = $('word-review');
      if (!total) {
        reviewEl.innerHTML = `
          <div class="all-done">
            <p class="big">🌱</p>
            <h2>Nothing to review yet</h2>
            <p class="sans" style="color:var(--muted);max-width:28rem;margin:0.5rem auto 1.25rem">Words you save on <strong>Create Words</strong> show up here one at a time.</p>
            <button type="button" class="btn btn-primary" id="review-go-create">Create a word</button>
          </div>`;
        $('review-go-create')?.addEventListener('click', () => switchPage('create'));
        return;
      }
      const open = list.filter(i => isOpen(i.state)).length;
      if (STATE.wordCursor >= total) STATE.wordCursor = total - 1;
      if (STATE.wordCursor < 0) STATE.wordCursor = 0;
      const c = list[STATE.wordCursor];
      const partsMeaning = c.part_details.map(p => escapeHtml(p.meaning || p.legacy_label || '?')).join(' + ');
      const savedNote = STATE.justSaved === c.spelling
        ? `<div class="saved-banner">✓ Saved <strong>${escapeHtml(c.spelling)}</strong>. You're still on this word. Find it anytime in Dictionary.</div>` : '';
      $('word-review').innerHTML = `
        <div class="review">
          ${neighborStrip(list, STATE.wordCursor)}
          <div class="position">Word ${STATE.wordCursor + 1} of ${total} · ${open} need review · ${badge(c.state)}</div>
          ${pronBlock(c.parts)}
          <p class="review-word">${escapeHtml(c.spelling)}</p>
          <p class="review-meaning ${c.meaning ? '' : 'unnamed'}">${c.meaning ? escapeHtml(c.meaning) : 'not named yet'}</p>
          <p class="review-parts">${c.part_details.map(p => `${typeBadge(p.type || 'root')} ${escapeHtml(p.spelling)} = ${escapeHtml(p.meaning || p.legacy_label || '?')}`).join(' · ')}</p>
          <button type="button" class="btn" id="explore-word" style="margin-top:0.5rem">Explore family tree</button>
          <button type="button" class="hear-min" id="hear" aria-label="Listen to pronunciation">▶ Listen</button>
          ${savedNote}
          ${STATE.editing ? renderWordEdit(c) : `
            <p class="feel">${c.meaning ? 'Does this word feel right?' : 'This word needs a meaning.'}</p>
            <div class="feel-actions">
              <button type="button" class="fa-approve" id="approve" ${c.meaning ? '' : 'disabled'}>✓ Approve</button>
              <button type="button" class="fa-edit" id="edit">✎ Edit</button>
              <button type="button" class="fa-reject" id="reject">✕ Reject</button>
            </div>`}
          ${cardNav(STATE.wordCursor, total, 'word')}
        </div>`;
      wireCommon(c);
      $('explore-word')?.addEventListener('click', () => openExplorer('word', c.id));
      wireNeighbors(list, 'wordCursor', renderWords);
      if (STATE.editing) wireWordEdit(c); else wireFeel(c);
    }

    function renderWordEdit(c) {
      return `
        <div class="edit-panel">
          <div id="ed-live-pron"></div>
          <button type="button" class="hear-min" id="ed-hear" style="margin:0.5rem 0 0" aria-label="Listen to this recipe">▶ Listen</button>
          <label class="fld" for="ed-meaning">Meaning: keep it, or rename the word</label>
          ${meaningPickerHtml('ed')}
          <input type="text" id="ed-meaning" value="${escapeHtml(c.meaning ?? '')}" placeholder="${escapeHtml(c.suggested_meaning || 'e.g. river, friend…')}">
          <div id="ed-dupe"></div>
          <label class="fld">Recipe: which sounds build it (tap to remove)</label>
          <div class="pick" id="ed-recipe-pick"></div>
          <div class="recipe-preview" id="ed-recipe-preview"></div>
          <input type="search" id="ed-recipe-filter" placeholder="Find a sound by meaning… e.g. bond, motion">
          <div class="sound-grid" id="ed-recipe-sounds"></div>
          <div class="edit-actions">
            <button type="button" class="btn btn-primary" id="ed-save">Save &amp; approve</button>
            <button type="button" class="btn" id="ed-cancel">Cancel</button>
          </div>
        </div>`;
    }

    function wireWordEdit(c) {
      STATE.editMeaning = c.meaning ?? '';
      STATE.recipe = (c.components ?? c.parts.map(p => ({ type: 'root', ref: p, spelling: p }))).map(x => ({ ...x }));
      STATE.recipeFilter = '';
      const inp = $('ed-meaning');
      inp.addEventListener('input', () => { STATE.editMeaning = inp.value; renderDupe('compound', c.id); });
      wireMeaningPicker('ed', 'ed-meaning');
      renderDupe('compound', c.id);
      renderRecipe(c);
      $('ed-cancel').addEventListener('click', () => { STATE.editing = false; renderWords(); });
      $('ed-hear')?.addEventListener('click', () => speakNeural(composerFlatSpellings(STATE.recipe)));
      $('ed-save').addEventListener('click', async () => {
        const meaning = STATE.editMeaning.trim();
        if (!meaning) { toast('Type a meaning first.'); return; }
        const recipeChanged = resolveComposerSpelling(STATE.recipe) !== c.spelling;
        let savedSpelling = recipeChanged ? resolveComposerSpelling(STATE.recipe) : c.spelling;
        try {
          if (recipeChanged) {
            if (STATE.recipe.length < 2) { toast('A word needs at least 2 components.'); return; }
            const res = await api(`/api/fonoran/lab/compounds/${encodeURIComponent(c.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ components: composerToApi(STATE.recipe), meaning, allow_unapproved: STATE.showUnapprovedWords }),
            });
            savedSpelling = res.spelling ?? savedSpelling;
          } else {
            const changed = meaning !== (c.meaning ?? '');
            await api(`/api/fonoran/lab/compounds/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: JSON.stringify({ meaning, state: changed && c.meaning ? 'revised' : 'approved' }) });
          }
          STATE.editing = false;
          STATE.justSaved = savedSpelling;
          await load({ skipRender: true });
          const list = userWords();
          const idx = list.findIndex(x => x.spelling === savedSpelling);
          STATE.wordCursor = idx >= 0 ? idx : STATE.wordCursor;
          toast(`Saved ${savedSpelling}`);
          renderWords();
        } catch (e) { toast(e.message); }
      });
    }

    function renderRecipe(c) {
      const comps = STATE.recipe;
      const spelling = resolveComposerSpelling(comps);
      $('ed-recipe-pick').innerHTML = comps.length
        ? comps.map((comp, i) => `<span class="tok" data-idx="${i}">${typeBadge(comp.type)} <span class="mono">${escapeHtml(comp.spelling || comp.ref)}</span> = ${escapeHtml(compDisplayLabel(comp))} ×</span>`).join('')
        : '<span class="sans" style="color:var(--muted);font-size:0.84rem">Add at least 2 components…</span>';
      const gloss = comps.map(compDisplayLabel).map(escapeHtml).join(' + ');
      $('ed-recipe-preview').innerHTML = `
        <span class="mono" style="font-size:1.2rem;font-weight:700;color:var(--word)">${spelling || '-'}</span>
        ${comps.length ? `<span class="sans" style="font-size:0.86rem">${gloss}</span>` : ''}`;
      const live = $('ed-live-pron');
      if (live) live.innerHTML = comps.length ? pronBlock(composerFlatSpellings(comps)) : '<p class="sans" style="color:var(--muted);font-size:0.84rem">Add components to preview script &amp; pronunciation.</p>';
      $('ed-recipe-pick').querySelectorAll('.tok').forEach(t => t.addEventListener('click', () => { STATE.recipe.splice(Number(t.dataset.idx), 1); renderRecipe(c); }));
      const f = $('ed-recipe-filter');
      f.addEventListener('input', e => { STATE.recipeFilter = e.target.value; renderRecipeSounds(c); });
      renderRecipeSounds(c);
    }
    function renderRecipeSounds(c) {
      const grid = $('ed-recipe-sounds'); if (!grid) return;
      const omitIds = [...STATE.recipe.filter(x => x.type === 'word').map(x => x.ref), c.id];
      grid.innerHTML = `<h4 class="picker-h">Primitive roots</h4><div class="sound-grid">${rootPickerWithBadge(pickableRoots(STATE.recipeFilter))}</div>
        <h4 class="picker-h">Approved words</h4><div class="sound-grid">${wordPickerMarkup(pickableWords(STATE.recipeFilter, { omitIds }))}</div>`;
      grid.querySelectorAll('[data-add-root]').forEach(b => b.addEventListener('click', () => {
        STATE.recipe.push({ type: 'root', ref: b.dataset.addRoot, spelling: b.dataset.addRoot });
        renderRecipe(c);
      }));
      grid.querySelectorAll('[data-add-word]').forEach(b => b.addEventListener('click', () => {
        const w = STATE.lab.compounds.find(x => x.id === b.dataset.addWord);
        if (!w) return;
        STATE.recipe.push({ type: 'word', ref: w.id, spelling: w.spelling, meaning: w.meaning });
        renderRecipe(c);
      }));
    }

    /* ---------- shared review wiring ---------- */
    function cardNav(cursor, total, kind) {
      return `<div class="card-nav">
        <button type="button" id="nav-prev" ${cursor === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pos">${cursor + 1} / ${total}</span>
        <button type="button" id="nav-next" ${cursor >= total - 1 ? 'disabled' : ''}>Next →</button>
      </div>${progressBar()}`;
    }
    function progressBar() {
      const all = userWords();
      const done = all.filter(i => reviewed(i.state)).length;
      const pct = all.length ? Math.round((done / all.length) * 100) : 0;
      return `<div class="progress"><span style="width:${pct}%"></span></div><div class="progress-label">${done} of ${all.length} words reviewed (${pct}%)</div>`;
    }
    function wireCommon(item) {
      $('hear').addEventListener('click', () => speakNeural(item.parts));
      const prev = $('nav-prev'), next = $('nav-next');
      prev?.addEventListener('click', () => { if (STATE.wordCursor > 0) { STATE.wordCursor--; STATE.editing = false; STATE.justSaved = null; renderWords(); } });
      next?.addEventListener('click', () => { const t = userWords().length; if (STATE.wordCursor < t - 1) { STATE.wordCursor++; STATE.editing = false; STATE.justSaved = null; renderWords(); } });
    }
    function wireFeel(item) {
      $('edit')?.addEventListener('click', () => { STATE.editing = true; renderWords(); });
      $('approve')?.addEventListener('click', async () => {
        await api(`/api/fonoran/lab/compounds/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ meaning: item.meaning, state: 'approved' }) });
        toast(`Approved ${item.spelling}`); await advanceWord();
      });
      $('reject')?.addEventListener('click', async () => {
        await api(`/api/fonoran/lab/state/compound/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ state: 'rejected' }) });
        toast(`Rejected ${item.spelling}`); await advanceWord();
      });
    }
    function firstOpenIndex(list) { return list.findIndex(i => isOpen(i.state)); }
    async function advanceWord() {
      const before = STATE.wordCursor;
      await load({ skipRender: true });
      const list = userWords();
      let i = before + 1;
      while (i < list.length && !isOpen(list[i].state)) i++;
      if (i < list.length) STATE.wordCursor = i;
      else { const f = firstOpenIndex(list); STATE.wordCursor = f >= 0 ? f : Math.min(before, list.length - 1); }
      renderWords();
    }

    /* ---------- spelling lookup (word creator) ---------- */
    function lookupSpelling(spelling) {
      if (!spelling || !STATE.lab) return null;
      const compound = STATE.lab.compounds.find(c => c.spelling === spelling && c.state !== 'rejected');
      if (compound) return { kind: 'compound', item: compound };
      const sound = STATE.lab.sounds.find(s => s.spelling === spelling && s.state !== 'rejected');
      if (sound) return { kind: 'sound', item: sound };
      return null;
    }

    function spellingBlocksSave(match) {
      if (!match) return false;
      if (match.kind === 'sound') return Boolean(match.item.meaning?.trim());
      return !match.item.generator_hint;
    }

    function spellingMatchHtml(match) {
      if (!match) return '';
      const { kind, item } = match;
      const typeLabel = kind === 'sound' ? 'root' : 'word';
      const meaning = item.meaning?.trim() || '(unnamed)';
      const partsHint = kind === 'compound'
        ? `Built from ${item.parts.map(escapeHtml).join(' + ')}`
        : 'A base root, not a compound';
      const claimNote = item.generator_hint && !item.meaning?.trim()
        ? ' · generator suggestion; save below to name it'
        : item.generator_hint ? ' · generator suggestion' : '';
      const id = kind === 'sound' ? item.spelling : item.id;
      return `
        <div class="word-match">
          <div>Already a ${typeLabel}: <strong class="mono">${escapeHtml(item.spelling)}</strong> ${badge(kind === 'sound' ? 'base' : 'compound')} ${badge(item.state)}</div>
          <div class="wm-meaning">${escapeHtml(meaning)}</div>
          <div class="wm-meta">${partsHint}${claimNote} · <button type="button" class="linkish" data-view-match="${kind}" data-match-id="${escapeHtml(id)}">Details</button></div>
        </div>`;
    }

    function renderSpellingMatch(boxId, spelling) {
      const box = $(boxId);
      if (!box) return null;
      const match = spelling ? lookupSpelling(spelling) : null;
      box.innerHTML = match ? spellingMatchHtml(match) : '';
      box.querySelector('[data-view-match]')?.addEventListener('click', e => {
        const btn = e.currentTarget;
        openChain(btn.dataset.viewMatch, btn.dataset.matchId);
      });
      return match;
    }

    /* ---------- live duplicate warning ---------- */
    function meaningMatches(meaning, selfKind, selfId) {
      const m = (meaning ?? '').trim().toLowerCase(); if (!m) return [];
      const hits = [];
      for (const s of STATE.lab.sounds) { if (s.state === 'rejected') continue; if (selfKind === 'sound' && s.spelling === selfId) continue; if ((s.meaning ?? '').trim().toLowerCase() === m) hits.push(`${s.spelling} (sound)`); }
      for (const c of STATE.lab.compounds) { if (c.state === 'rejected') continue; if (selfKind === 'compound' && c.id === selfId) continue; if ((c.meaning ?? '').trim().toLowerCase() === m) hits.push(`${c.spelling} (compound)`); }
      return hits;
    }
    function renderDupe(kind, id) {
      const box = $('ed-dupe'); if (!box) return;
      const hits = meaningMatches(STATE.editMeaning, kind, id);
      box.innerHTML = hits.length ? `<div class="dupe"><strong>⚠ Already in use:</strong> “${escapeHtml(STATE.editMeaning.trim())}” also means <span class="mono">${hits.join('</span>, <span class="mono">')}</span>. Usually you want each word distinct.</div>` : '';
    }

    /* ---------- Language Explorer ---------- */
    async function openExplorer(kind, id, preview = null) {
      try {
        let data;
        if (preview?.preview) {
          data = await api('/api/fonoran/lab/graph/preview', {
            method: 'POST',
            body: JSON.stringify({
              spelling: preview.spelling,
              meaning: preview.meaning,
              components: composerToApi(preview.components),
            }),
          });
        } else {
          data = await api(`/api/fonoran/lab/graph/${kind}/${encodeURIComponent(id)}`);
        }
        const explorerKind = preview?.preview ? 'word' : kind;
        const { html, speakParts } = buildExplorerHtml(data, explorerKind, { preview: !!preview?.preview });
        $('sheet-body').innerHTML = html;
        $('ch-hear')?.addEventListener('click', () => speakNeural(speakParts));
        await renderExplorerMermaid(data.mermaid, data.graph_nodes);
        $('sheet').classList.add('open');
      } catch (e) { toast(e.message); }
    }

    function formatTreeNodes(nodes, depth) {
      const pad = '  '.repeat(depth);
      return (nodes ?? []).map(n => {
        const badge = n.type === 'root' ? 'ROOT' : 'WORD';
        const line = `${pad}${n.spelling} = ${n.meaning || '?'} (${badge})`;
        const kids = n.children?.length ? `\n${formatTreeNodes(n.children, depth + 1)}` : '';
        return line + kids;
      }).join('\n');
    }

    function openChain(kind, id) {
      openExplorer(kind === 'sound' ? 'root' : 'word', kind === 'sound' ? id : id);
    }
    function closeSheet() { $('sheet').classList.remove('open'); }

    /* ---------- DICTIONARY ---------- */
    function dictEntries() {
      const base = STATE.lab.sounds.map(s => ({ kind: 'sound', id: s.spelling, word: s.spelling, english: s.meaning || '(unnamed)', type: 'base', state: s.state, hint: s.say_bold }));
      const comp = STATE.lab.compounds.map(c => ({
        kind: 'compound',
        id: c.id,
        word: c.spelling,
        english: c.meaning || '(unnamed)',
        type: 'compound',
        state: c.state,
        hint: (c.part_details ?? []).map(p => p.spelling).join(' + ') || (c.parts ?? []).join(' + '),
      }));
      let list = [...base, ...comp];
      const f = STATE.dictFilter;
      if (f === 'base' || f === 'compound') list = list.filter(e => e.type === f);
      else if (['needs_review', 'approved', 'rejected'].includes(f)) list = list.filter(e => e.state === f);
      const q = STATE.dictQuery.trim().toLowerCase();
      if (q) list = list.filter(e => `${e.word} ${e.english} ${e.hint}`.toLowerCase().includes(q));
      return list.sort((a, b) => a.word.localeCompare(b.word));
    }
    function renderDictionary() {
      const s = STATE.lab.stats;
      $('dict-stats').innerHTML = `
        <div><strong>${s.sounds}</strong> sounds</div>
        <div><strong>${s.compounds}</strong> compounds</div>
        <div><strong>${s.sound_states.approved + s.sound_states.revised + s.compound_states.approved + s.compound_states.revised}</strong> approved</div>
        <div><strong>${s.sound_states.needs_review + s.compound_states.needs_review}</strong> need review</div>`;
      const list = dictEntries();
      $('dict-list').innerHTML = list.length ? list.map(e => `
        <button type="button" class="word-item" data-kind="${e.kind}" data-id="${escapeHtml(e.id)}">
          <div class="row"><span class="fonoran">${escapeHtml(e.word)}</span><span>${badge(e.type)} ${badge(e.state)}</span></div>
          <div class="row" style="margin-top:0.15rem"><span class="english">${escapeHtml(e.english)}</span></div>
          <div class="hint">${escapeHtml(e.hint)}</div>
        </button>`).join('') : '<p class="empty">Nothing matches.</p>';
      $('dict-list').querySelectorAll('.word-item').forEach(b => b.addEventListener('click', () => openChain(b.dataset.kind, b.dataset.id)));
    }

    /* ---------- HEALTH + TIMELINE ---------- */
    async function renderHealth() {
      let h;
      try { h = await api('/api/fonoran/lab/health'); } catch { $('health-body').innerHTML = '<p class="empty">Could not load health.</p>'; return; }
      const core = ['learnability', 'pronounceability', 'memorability', 'parseability'];
      const overall = Math.round(core.reduce((a, k) => a + h.scores[k], 0) / core.length);
      const label = healthOverallLabel(overall);
      const color = healthScoreColor;
      const dupes = duplicateMeanings();
      const order = { high: 0, medium: 1, low: 2 };
      const warns = [...h.warnings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
      $('health-body').innerHTML = `
        <div class="health-hero">
          <div class="health-score" style="color:${color(overall)}">${overall}<span class="health-of"> / 100</span></div>
          <p class="health-label">${label}</p>
          <button type="button" class="btn health-toggle" id="health-toggle">${STATE.healthOpen ? 'Hide details' : 'View details →'}</button>
        </div>
        <div id="health-details" ${STATE.healthOpen ? '' : 'hidden'}>
          ${h.dimensions.map(d => `<div class="score">
            <div class="top"><span class="name">${escapeHtml(d.label)}</span><span class="val" style="color:${color(d.score)}">${d.score}<span style="font-size:0.7rem;color:var(--muted)">/100</span></span></div>
            <div class="bar"><span style="width:${d.score}%;background:${color(d.score)}"></span></div>
            <p class="explain">${escapeHtml(d.explain)}</p></div>`).join('')}
          <h3 class="section-h">Duplicate meanings</h3>
          ${dupes.length ? dupes.map(d => `<div class="warn-row sev-medium"><span class="wlabel">${d.words.length}×</span><strong>${escapeHtml(d.label)}</strong>: ${d.words.map(w => `<span class="mono">${escapeHtml(w)}</span>`).join(', ')}</div>`).join('') : '<p class="empty" style="padding:0.75rem">Every meaning is used once.</p>'}
          <h3 class="section-h">Ambiguity &amp; repair warnings (${h.warning_summary.total}, ${h.warning_summary.high} serious)</h3>
          ${warns.length ? warns.slice(0, 30).map(w => `<div class="warn-row sev-${w.severity}"><span class="wlabel">${escapeHtml(w.label)}</span>${escapeHtml(w.message)}</div>`).join('') : '<p class="empty">No warnings.</p>'}
          ${h.dda ? `<p class="sans" style="font-size:0.84rem;color:var(--muted);margin-top:0.75rem">DDA: ${h.dda.pending} pending · ${h.dda.stale} stale · ${h.dda.confirmed} confirmed</p>` : ''}
        </div>
        <h3 class="section-h">Your progress</h3>
        <div id="timeline"></div>`;
      $('health-toggle').addEventListener('click', () => { STATE.healthOpen = !STATE.healthOpen; renderHealth(); });
      renderTimeline();
    }
    function duplicateMeanings() {
      const map = new Map();
      const add = (i) => { if (!i.meaning?.trim() || i.state === 'rejected') return; const k = i.meaning.trim().toLowerCase(); if (!map.has(k)) map.set(k, { label: i.meaning.trim(), words: [] }); map.get(k).words.push(i.spelling); };
      STATE.lab.sounds.forEach(add); STATE.lab.compounds.forEach(add);
      return [...map.values()].filter(d => d.words.length > 1).sort((a, b) => b.words.length - a.words.length);
    }
    function renderTimeline() {
      const el = $('timeline');
      const events = STATE.lab.events ?? [];
      if (!events.length) { el.innerHTML = '<p class="empty" style="padding:0.75rem">No changes yet. Approve a sound to start your timeline.</p>'; return; }
      const verbs = { approved: ['✓', 'Approved'], revised: ['✎', 'Revised'], renamed: ['✎', 'Renamed'], rejected: ['✕', 'Rejected'], created: ['+', 'Created'], recipe: ['⟲', 'Changed recipe of'] };
      const dayKey = (iso) => { const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1); if (d.toDateString() === t.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
      const groups = [];
      for (const ev of events) { const k = dayKey(ev.at); let g = groups.find(x => x.k === k); if (!g) { g = { k, items: [] }; groups.push(g); } g.items.push(ev); }
      el.innerHTML = groups.map(g => `<div class="tl-day">${g.k}</div>${g.items.map(ev => {
        const [icon, verb] = verbs[ev.action] ?? ['·', ev.action];
        const time = new Date(ev.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return `<div class="tl-item"><span class="tl-icon">${icon}</span><span>${verb} <strong>${escapeHtml(ev.detail || ev.word)}</strong> <span class="mono" style="color:var(--muted)">${escapeHtml(ev.word)}</span></span><span class="tl-when">${time}</span></div>`;
      }).join('')}`).join('');
    }

    /* ---------- nav ---------- */
    const MAIN_PAGES = new Set(['roots', 'create', 'review', 'dictionary']);
    const ALL_PAGES = new Set(['home', 'roots', 'create', 'review', 'dictionary', 'health', 'advanced']);
    function scrollPageTop() {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    function rememberMainPage() {
      if (MAIN_PAGES.has(STATE.page)) STATE.toolReturnPage = STATE.page;
    }
    function switchPage(name) {
      STATE.page = name; STATE.editing = false;
      setActiveTab(name);
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      $(`page-${name}`).classList.add('active');
      if (name === 'home') {
        if (window.location.hash) history.replaceState(null, '', window.location.pathname);
      } else if (ALL_PAGES.has(name)) {
        const nextHash = `#${name}`;
        if (window.location.hash !== nextHash) {
          history.replaceState(null, '', nextHash);
        }
      }
      renderActivePage();
      scrollPageTop();
      requestAnimationFrame(scrollPageTop);
    }

    const header = document.getElementById('app-header-root');
    header?.addEventListener('universal-nav:page', (event) => {
      switchPage(event.detail.page);
    });
    header?.addEventListener('universal-nav:action', async (event) => {
      const { action } = event.detail;
      if (action === 'undo') {
        const res = await api('/api/fonoran/lab/undo', { method: 'POST', body: '{}' });
        toast(res.reverted ? `Undid: ${res.label}` : 'Nothing to undo');
        STATE.editing = false;
        await load();
      } else if (action === 'health') {
        rememberMainPage();
        switchPage('health');
      } else if (action === 'advanced') {
        rememberMainPage();
        switchPage('advanced');
      }
    });
    $('adv-back').addEventListener('click', () => switchPage(STATE.toolReturnPage || 'roots'));
    $('dict-search').addEventListener('input', e => { STATE.dictQuery = e.target.value; renderDictionary(); });
    $('dict-filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; STATE.dictFilter = b.dataset.filter; $('dict-filters').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b)); renderDictionary(); });
    $('health-back').addEventListener('click', () => switchPage(STATE.toolReturnPage || 'roots'));
    $('adv-dictionary').addEventListener('click', () => { rememberMainPage(); switchPage('dictionary'); });
    $('adv-health').addEventListener('click', () => { rememberMainPage(); switchPage('health'); });
    $('wc-filter').addEventListener('input', e => { STATE.wordComposerFilter = e.target.value; renderWordComposer(); });
    $('wc-show-unapproved')?.addEventListener('change', e => { STATE.showUnapprovedWords = e.target.checked; renderWordComposer(); });
    $('wc-clear').addEventListener('click', () => { STATE.wordComposer = []; $('wc-meaning').value = ''; renderWordComposer(); });
    $('wc-save').addEventListener('click', async () => {
      const meaning = $('wc-meaning').value.trim();
      if (STATE.wordComposer.length < 2) { toast('Stack at least two components.'); return; }
      if (!meaning) { toast('Give the word a meaning.'); return; }
      const spelling = resolveComposerSpelling(STATE.wordComposer);
      try {
        await api('/api/fonoran/lab/compounds', {
          method: 'POST',
          body: JSON.stringify({
            components: composerToApi(STATE.wordComposer),
            meaning,
            allow_unapproved: STATE.showUnapprovedWords,
          }),
        });
        STATE.wordComposer = [];
        $('wc-meaning').value = '';
        toast(`Saved ${spelling} → ${meaning}`);
        await load({ skipRender: true });
        renderWordComposer();
      } catch (e) { toast(e.message); }
    });
    $('sheet-close').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
    $('adv-reset-review').addEventListener('click', async () => {
      if (!confirm('Move every root and word back to needs review? Meanings stay; you re-approve from scratch.')) return;
      const r = await api('/api/fonoran/lab/reset-review', { method: 'POST', body: '{}' });
      toast(`Reset ${r.sounds_reset} roots and ${r.compounds_reset} words`);
      await load();
    });
    $('adv-reseed').addEventListener('click', async () => {
      if (!confirm('Clear every root and word you have built? English word list stays for reference. Cannot be undone.')) return;
      await api('/api/fonoran/lab/seed', { method: 'POST', body: '{}' });
      STATE.lexicon = null;
      await ensureLexicon();
      toast('Lab reset. Start from scratch');
      await load();
    });

    async function renderAdvanced() {
      try {
        const h = await api('/api/fonoran/lab/health');
        const d = h.dda ?? {};
        $('adv-dda-status').textContent = `DDA: ${d.pending ?? 0} pending · ${d.stale ?? 0} stale · ${d.inferred ?? 0} inferred · ${d.confirmed ?? 0} confirmed`;
        if (STATE.showDebugDda && STATE.lab) {
          const debug = {
            sounds: STATE.lab.sounds.map(s => ({ spelling: s.spelling, dda: s.dda })),
            compounds: STATE.lab.compounds.map(c => ({ spelling: c.spelling, dda: c.dda })),
          };
          $('adv-debug-panel').textContent = JSON.stringify(debug, null, 2);
          $('adv-debug-panel').hidden = false;
        } else if ($('adv-debug-panel')) {
          $('adv-debug-panel').hidden = true;
        }
      } catch { $('adv-dda-status').textContent = ''; }
    }

    $('adv-run-dda').addEventListener('click', async () => {
      try {
        const r = await api('/api/fonoran/lab/run-dda', { method: 'POST', body: JSON.stringify({ scope: 'pending' }) });
        toast(`DDA: ${r.processed} processed (${r.confirmed} confirmed, ${r.inferred} inferred)`);
        await load({ skipRender: true });
        renderAdvanced();
      } catch (e) { toast(e.message); }
    });
    $('adv-parse-btn').addEventListener('click', async () => {
      const q = $('adv-parse-input').value.trim();
      if (!q) return;
      try {
        const r = await api(`/api/fonoran/lab/parse/${encodeURIComponent(q)}`);
        const el = $('adv-parse-out');
        if (!r.segmentations?.length) {
          el.innerHTML = `<p class="warn-row">Could not segment “${escapeHtml(q)}” into known roots.</p>`;
          return;
        }
        el.innerHTML = r.ambiguous
          ? `<p class="warn-row">Ambiguous: ${r.count} valid parses:</p><ul>${r.segmentations.map(s => `<li>${escapeHtml(s.join(' + '))}</li>`).join('')}</ul>`
          : `<p><span class="badge badge-approved">Unique</span> ${escapeHtml(r.segmentations[0].join(' + '))}</p>`;
      } catch (e) { toast(e.message); }
    });
    $('adv-debug-dda')?.addEventListener('change', e => {
      STATE.showDebugDda = e.target.checked;
      renderAdvanced();
    });

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    const initialHash = window.location.hash.replace(/^#/, '');
    const initialPage = initialHash && ALL_PAGES.has(initialHash) ? initialHash : 'home';
    initUniversalNav({ context: 'fonoran', activeTab: initialPage });
    switchPage(initialPage);
    window.addEventListener('hashchange', () => {
      const hashPage = window.location.hash.replace(/^#/, '');
      const page = hashPage && ALL_PAGES.has(hashPage) ? hashPage : 'home';
      if (page !== STATE.page) switchPage(page);
    });

    wireLander();
    load();
