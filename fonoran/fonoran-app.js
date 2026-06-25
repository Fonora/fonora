    import { toSpeakable, compoundSpeakable, phoneticKeyBold, compoundPhoneticKey, englishGuide, compoundEnglishGuide, parseSyllable, buildSyllable, isValidSyllable, pieceHint, ONSET_GROUPS, VOWEL_DISPLAY, CODA_DISPLAY, enumerateOpenSyllables } from '../tools/fonoran-pronunciation.js';
    import { romanToFonoraScript, pieceToFonoraSymbols } from '../tools/fonoran-fonora-bridge.js';
    import { loadLanguageRules } from '../js/load-language-rules.js';
    import { speakFonoraPhrase, cancelSpeech } from '../js/fonora-tts.js';
    import { initUniversalNav, setActiveTab, setFonoranUndoDisabled, setFonoranAuth } from '../js/universal-nav.js';
    import { bindModalDismiss, setModalBackdropOpen } from '../js/modal-dismiss.js';

    const AUTH = {
      required: false,
      authenticated: true,
      email: null,
      loginUrl: '/auth/google?returnTo=/fonoran/',
    };
    const WRITE_PAGES = new Set(['roots', 'create', 'matcher', 'review', 'advanced']);
    const SPLIT_WRITE_PAGES = new Set(['roots', 'create', 'matcher']);
    const MATCHER_DISMISSED_KEY = 'fonoran:matcher:dismissed';

    function canWrite() {
      return !AUTH.required || AUTH.authenticated;
    }

    function writeLocked() {
      return AUTH.required && !AUTH.authenticated;
    }

    function writeDisabled(...reasons) {
      return writeLocked() || reasons.some(Boolean);
    }

    function writeDisabledAttr(...reasons) {
      return writeDisabled(...reasons) ? ' disabled' : '';
    }

    function setWriteButton(el, ...reasons) {
      if (!el) return;
      const off = reasons.some(Boolean);
      el.dataset.writeOff = off ? '1' : '0';
      el.disabled = writeDisabled(off);
    }

    function syncWordComposerControls() {
      const picks = STATE.wordComposer;
      const spelling = picks.length ? resolveComposerSpelling(picks) : '';
      const match = renderSpellingMatch('wc-match', spelling);
      setWriteButton($('wc-save'), picks.length < 2 || spellingBlocksSave(match));
    }

    function applyWriteAccessUI() {
      updateAuthGate();
      setFonoranUndoDisabled(!STATE.lab?.can_undo || !canWrite());
      const locked = writeLocked();
      document.body.classList.toggle('fonoran-readonly', locked);

      document.querySelectorAll('[data-write]').forEach((el) => {
        if (el.tagName === 'SPAN') return;
        el.disabled = locked || el.dataset.writeOff === '1';
      });

      document.querySelectorAll('[data-write-input]').forEach((el) => {
        if (locked) {
          el.readOnly = true;
          if (el.type === 'checkbox' || el.tagName === 'SELECT') el.disabled = true;
        } else {
          el.readOnly = false;
          if (el.type === 'checkbox' || el.tagName === 'SELECT') el.disabled = false;
        }
      });
    }

    function authReturnPath() {
      return `/fonoran/${window.location.hash || ''}`;
    }

    async function refreshAuth() {
      try {
        const returnTo = authReturnPath();
        const res = await fetch(`/auth/session?returnTo=${encodeURIComponent(returnTo)}`, { credentials: 'include' });
        const data = await res.json();
        AUTH.required = Boolean(data.authRequired);
        AUTH.authenticated = Boolean(data.authenticated);
        AUTH.email = data.email ?? null;
        AUTH.loginUrl = data.loginUrl ?? '/auth/google?returnTo=/fonoran/';
      } catch {
        AUTH.required = false;
        AUTH.authenticated = true;
      }
      setFonoranAuth({
        required: AUTH.required,
        authenticated: AUTH.authenticated,
        email: AUTH.email,
        loginUrl: AUTH.loginUrl,
      });
      applyWriteAccessUI();
      if (STATE.lab && WRITE_PAGES.has(STATE.page)) renderActivePage();
    }

    async function signOut() {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      await refreshAuth();
      toast('Signed out');
      switchPage('home');
    }

    function handleAuthUrlErrors() {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('auth_error');
      if (!err) return;
      params.delete('auth_error');
      params.delete('email');
      const next = params.toString();
      const clean = `${window.location.pathname}${window.location.hash}${next ? `?${next}` : ''}`;
      history.replaceState(null, '', clean);
      const messages = {
        access_denied: 'Sign-in cancelled.',
        domain: 'That Google account is not allowed. Use an @fonora.org address.',
        email_unverified: 'Google email is not verified.',
        invalid_state: 'Sign-in expired. Try again.',
      };
      toast(messages[err] ?? `Sign-in failed (${err}).`);
    }

    function updateAuthGate() {
      const main = document.querySelector('main');
      const show = !canWrite() && WRITE_PAGES.has(STATE.page);
      let gate = $('auth-gate');

      if (!show) {
        gate?.remove();
        requestAnimationFrame(syncSplitStickyOffsets);
        return;
      }

      if (!gate) {
        gate = document.createElement('div');
        gate.id = 'auth-gate';
      }
      gate.className = 'auth-gate sans';
      gate.innerHTML = `<p>Sign in with your <strong>@fonora.org</strong> Google account to edit Fonoran vocabulary.</p>
        <a href="${escapeHtml(AUTH.loginUrl)}" class="btn btn-primary auth-gate__sign-in">Sign in with Google</a>`;
      const host = SPLIT_WRITE_PAGES.has(STATE.page)
        ? $(`page-${STATE.page}`)?.querySelector('.fonoran-split-chrome')
        : main;
      if (host && gate.parentElement !== host) host.prepend(gate);
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    const LANDER_SHOWCASE_WORD_ID = 'cmp-shakafa';
    let landerShowcaseToken = 0;
    let landerHealthToken = 0;

    const STATE = {
      lab: null, page: 'home', rules: null,
      wordCursor: 0,
      reviewFocusPending: false,
      rootsFilter: '',
      editing: false, editMeaning: '', clearAffected: false,
      justSaved: null,
      recipe: null, recipeFilter: '',
      dictFilter: 'all', dictQuery: '', dictSelection: null,
      wordComposer: [], wordComposerFilter: '',
      wordComposerShowRoots: true,
      wordComposerShowWords: true,
      showUnapprovedWords: false,
      showUnnamed: false,
      showDebugDda: false,
      rootDraft: { onset: '', vowel: '', coda: '' },
      lexicon: null,
      matcherFilter: '',
      matcherEnglishFilter: '',
      matcherShowDismissed: false,
      matcherDismissed: new Set(),
      matcherSelectedFonoran: null,
      matcherSelectedEnglish: null,
      matcherCatalog: null,
      toolReturnPage: 'roots',
      healthOpen: false,
    };
    const $ = (id) => document.getElementById(id);

    async function api(path, opts = {}) {
      const res = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await refreshAuth();
        throw new Error('Sign in required');
      }
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

    function wordPreviewPron(parts) {
      const list = Array.isArray(parts) ? parts : [parts];
      return {
        script: STATE.rules ? romanToFonoraScript(list, STATE.rules).phrase : '',
        sayLine: list.length > 1 ? compoundPhoneticKey(list) : phoneticKeyBold(list[0]),
        englishLine: list.length > 1 ? compoundEnglishGuide(list) : englishGuide(list[0]),
      };
    }

    function pronBlock(parts) {
      const { script, sayLine, englishLine } = wordPreviewPron(parts);
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

    function composerComponentParts(c) {
      if (c.type === 'word') {
        const w = STATE.lab?.compounds?.find(x => x.id === c.ref);
        if (w?.parts?.length) return w.parts;
      }
      return [c.spelling || (c.type === 'root' ? c.ref : c.ref.replace(/^cmp-/, ''))];
    }
    function composerFlatSpellings(composer) {
      return (composer ?? []).flatMap(composerComponentParts);
    }
    function composerCanListen(composer) {
      const picks = composer ?? [];
      if (!composerFlatSpellings(picks).length) return false;
      return picks.length >= 2 || (picks.length === 1 && picks[0].type === 'word');
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
    function hasMeaning(item) {
      return Boolean(item?.meaning?.trim());
    }
    function pickableRoots(query, { omit = [], showUnnamed = false } = {}) {
      const q = (query ?? '').trim().toLowerCase();
      const skip = new Set(omit);
      return STATE.lab.sounds.filter(s => s.state !== 'rejected' && !skip.has(s.spelling))
        .filter(s => showUnnamed || hasMeaning(s))
        .filter(s => !q || `${s.spelling} ${s.meaning ?? ''} ${s.legacy_label ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
    }
    function pickableWords(query, { omitIds = [], showUnnamed = false } = {}) {
      const q = (query ?? '').trim().toLowerCase();
      const skip = new Set(omitIds);
      const allowed = STATE.showUnapprovedWords
        ? ['approved', 'revised', 'needs_review', 'draft']
        : ['approved', 'revised'];
      return STATE.lab.compounds.filter(c => allowed.includes(c.state) && !skip.has(c.id))
        .filter(c => !c.generator_hint)
        .filter(c => showUnnamed || hasMeaning(c))
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
        <button type="button" class="root-cell" data-add-root="${escapeHtml(s.spelling)}" data-write>${typeBadge('root')}${rootCellBodyHtml(s)}</button>`).join('')
        : '<p class="empty" style="grid-column:1/-1">No match.</p>';
    }
    function wordPickerMarkup(words) {
      return words.length ? words.map(c => `
        <button type="button" class="root-cell" data-add-word="${escapeHtml(c.id)}" data-write>${wordCellBodyHtml(c)}</button>`).join('')
        : '<p class="empty" style="grid-column:1/-1">No words match.</p>';
    }

    async function load(opts = {}) {
      try {
        await ensureRules();
        await ensureLexicon();
        STATE.lab = await api('/api/fonoran/lab');
        $('load-error').hidden = true;
        setFonoranUndoDisabled(!STATE.lab.can_undo || !canWrite());
        if (!opts.skipRender) renderActivePage();
        wireMeaningPicker('wc', 'wc-meaning');
      } catch { $('load-error').hidden = false; }
    }

    function renderActivePage() {
      if (STATE.page !== 'home' && !STATE.lab) return;
      if (STATE.page === 'home') {
        wireLander();
        renderLanderShowcase();
        renderLanderHealth();
      }
      else if (STATE.page === 'create') renderWordComposer();
      else if (STATE.page === 'matcher') renderWordMatcher();
      else if (STATE.page === 'review') renderWords();
      else if (STATE.page === 'roots') renderRoots();
      else if (STATE.page === 'dictionary') renderDictionary();
      else if (STATE.page === 'health') renderHealth();
      else if (STATE.page === 'advanced') renderAdvanced();
      applyWriteAccessUI();
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
          <select id="${prefix}-lex-cat" aria-label="Category" data-write-input><option value="">All categories</option></select>
          <select id="${prefix}-lex-word" aria-label="English word" data-write-input><option value="">Pick a word…</option></select>
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
      word.addEventListener('change', () => {
        if (word.value) {
          inp.value = word.value;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    function soundPieceMatches(kind, value, query) {
      const q = (query ?? '').trim().toLowerCase();
      if (!q) return true;
      const hint = value ? pieceHint(value) : '';
      const hay = `${kind} ${value || '-'} ${hint} none`.toLowerCase();
      const tokens = q.split(/[\s-]+/).filter(Boolean);
      return hay.includes(q) || tokens.every(t => hay.includes(t));
    }

    function renderFilteredSyllableBuilderMarkup(prefix = 'root', query = '') {
      const show = (kind, val) => soundPieceMatches(kind, val, query);
      const onsetChips = [
        ...(show('onset', '') ? [syllableChip('onset', '')] : []),
        ...ONSET_GROUPS.flatMap(g => g.items.filter(v => show('onset', v)).map(v => syllableChip('onset', v))),
      ];
      const onsetGrid = onsetChips.length ? `<div class="syl-chips">${onsetChips.join('')}</div>` : '';
      const vowels = VOWEL_DISPLAY.filter(v => show('vowel', v)).map(v => syllableChip('vowel', v)).join('');
      const codas = [
        ...(show('coda', '') ? [syllableChip('coda', '')] : []),
        ...CODA_DISPLAY.filter(v => show('coda', v)).map(v => syllableChip('coda', v)),
      ].join('');
      const hasOnset = onsetGrid.length > 0;
      const hasVowel = vowels.length > 0;
      const hasCoda = codas.length > 0;
      if (!hasOnset && !hasVowel && !hasCoda) {
        return `<div class="syl-builder" id="${prefix}-syl-builder"><p class="empty" style="margin:0">No sounds match.</p></div>`;
      }
      return `
        <div class="syl-builder" id="${prefix}-syl-builder">
          ${hasOnset ? `<div class="syl-row">
            <div class="syl-label">Start <span style="font-weight:400;text-transform:none">(consonant, optional)</span></div>
            ${onsetGrid}
          </div>` : ''}
          ${hasVowel ? `<div class="syl-row">
            <div class="syl-label">Vowel <em>required</em></div>
            <div class="syl-chips">${vowels}</div>
          </div>` : ''}
          ${hasCoda ? `<div class="syl-row">
            <div class="syl-label">End <span style="font-weight:400;text-transform:none">(consonant, optional)</span></div>
            <div class="syl-chips">${codas}</div>
          </div>` : ''}
        </div>`;
    }

    function userSounds() {
      return STATE.lab.sounds.filter(s => s.state !== 'rejected');
    }

    function userWords() {
      return STATE.lab.compounds.filter(c => !c.generator_hint && c.state !== 'rejected');
    }

    /** Roots first, then compounds, matches computeNextStep in the lab API. */
    function reviewItems() {
      return [
        ...userSounds().map(s => ({ ...s, reviewKind: 'sound' })),
        ...userWords().map(c => ({ ...c, reviewKind: 'compound' })),
      ];
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
      if (!value) {
        return `<button type="button" class="syl-chip none${picked ? ' picked' : ''}" data-piece="${kind}" data-val="" data-write>
        <span class="syl-glyph syl-glyph--empty symbol-text" aria-hidden="true">&nbsp;</span>
        <span class="mono">${escapeHtml(mono)}</span>
        <span class="hint syl-hint--empty" aria-hidden="true">&nbsp;</span></button>`;
      }
      return `<button type="button" class="syl-chip${picked ? ' picked' : ''}" data-piece="${kind}" data-val="${escapeHtml(value)}" data-write>
        ${glyph ? `<span class="syl-glyph symbol-text">${escapeHtml(glyph)}</span>` : ''}
        <span class="mono">${escapeHtml(mono)}</span>${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ''}</button>`;
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
          invalidEl.innerHTML = `“${escapeHtml(typed)}” isn’t a valid Fonoran syllable. Pick sounds from the builder, or try <button type="button" class="linkish" data-try-spell="a">a</button> (vowel only) or <button type="button" class="linkish" data-try-spell="sa">sa</button> (s + a).`;
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
      if (saveBtn) setWriteButton(saveBtn, !valid || exists);
      if (hearBtn) hearBtn.disabled = !valid;

      $('root-syl-builder')?.querySelectorAll('.syl-chip[data-piece]').forEach(chip => {
        chip.classList.toggle('picked', STATE.rootDraft[chip.dataset.piece] === (chip.dataset.val ?? ''));
      });
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
        <button type="button" class="root-cell" data-add="${escapeHtml(s.spelling)}" data-write>${rootCellBodyHtml(s)}</button>`).join('')
        : '<p class="empty" style="grid-column:1/-1">No match.</p>';
    }

    function renderRootsSoundPicker() {
      const pickerEl = $('roots-sound-picker');
      if (!pickerEl) return;
      pickerEl.innerHTML = renderFilteredSyllableBuilderMarkup('root', STATE.rootsFilter);
      wireRootCreatePanel();
      updateRootCreatePreview();
    }

    function updateRootsSoundFilter() {
      renderRootsSoundPicker();
    }

    function renderRootsCreateHtml() {
      return `
        <div class="root-create-panel">
          <div class="root-preview-card is-empty" id="new-root-preview-card">
            <input type="text" id="new-root-spelling" class="root-preview-roman" placeholder="-" autocomplete="off" spellcheck="false" aria-label="Roman spelling" data-write-input>
            <div class="root-preview-glyphs fonora-script symbol-text" id="new-root-glyphs" aria-hidden="true">&nbsp;</div>
            <div class="pron-block root-preview-pron">
              <div class="pron-line">Say: <strong id="new-root-say">-</strong></div>
              <div class="pron-english" id="new-root-like-wrap">Sounds like: <span id="new-root-like">-</span></div>
            </div>
          </div>
          <div class="syl-invalid" id="new-root-invalid" hidden></div>
          <div id="new-root-hint"></div>
          <button type="button" class="hear-min" id="new-root-hear" disabled aria-label="Listen to this syllable">▶ Listen</button>
          <label class="fld" for="new-root-meaning">Meaning <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          ${meaningPickerHtml('new-root')}
          <input type="text" id="new-root-meaning" placeholder="Type or pick from English list…" data-write-input>
          <div class="actions" style="margin-top:0.7rem">
            <button type="button" class="btn btn-primary" id="new-root-save" disabled data-write>Add root</button>
          </div>
        </div>`;
    }

    function wireRootsCreate() {
      const spellInp = $('new-root-spelling');
      const meaningInp = $('new-root-meaning');
      wireRootCreatePanel();
      wireMeaningPicker('new-root', 'new-root-meaning');
      updateRootCreatePreview();
      meaningInp?.addEventListener('keydown', e => { if (e.key === 'Enter') $('new-root-save').click(); });
      $('new-root-save')?.addEventListener('click', async () => {
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
        } catch (e) { toast(e.message); }
      });
    }

    function renderRoots() {
      if (!STATE.lab || !$('roots-workspace')) return;
      ensureSplitStickyObserver();
      renderRootsSoundPicker();
      $('roots-workspace').innerHTML = renderRootsCreateHtml();
      wireRootsCreate();
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    /* ---------- WORD COMPOSER + REVIEW ---------- */
    function renderWordComposer() {
      if (!STATE.lab) return;
      ensureSplitStickyObserver();
      const picks = STATE.wordComposer;
      const meaning = $('wc-meaning')?.value.trim() || '';
      const previewEl = $('wc-preview');
      if (previewEl) {
        if (!picks.length) {
          previewEl.innerHTML = '<div class="word-preview word-preview--empty"><p class="sans">Tap roots or approved words on the left…</p></div>';
        } else {
          const focus = focusFromComposer(picks, meaning);
          previewEl.innerHTML = buildWordPreviewHtml(focus, {
            kind: 'word',
            speakParts: composerCanListen(picks) ? composerFlatSpellings(picks) : [],
            showBadges: false,
            builtFromRemovable: true,
            hearId: 'wc-hear',
            showHear: composerCanListen(picks),
          });
          previewEl.querySelectorAll('[data-remove-idx]').forEach((piece) => {
            piece.addEventListener('click', () => {
              STATE.wordComposer.splice(Number(piece.dataset.removeIdx), 1);
              renderWordComposer();
            });
          });
        }
      }
      const spelling = picks.length ? resolveComposerSpelling(picks) : '';
      if (picks.length >= 2 && !meaning) {
        const sug = picks.map(compDisplayLabel).join(' + ');
        $('wc-meaning').placeholder = sug;
      }
      const match = renderSpellingMatch('wc-match', spelling);
      const hearBtn = $('wc-hear');
      if (hearBtn) {
        const flat = composerFlatSpellings(picks);
        hearBtn.disabled = !composerCanListen(picks);
        hearBtn.onclick = () => speakNeural(flat);
      }
      const exploreBtn = $('wc-explore');
      if (exploreBtn) {
        exploreBtn.disabled = picks.length < 2;
        exploreBtn.onclick = () => openExplorerPreview(picks, spelling);
      }
      syncWordComposerControls();
      $('wc-filters')?.querySelectorAll('[data-wc-filter]').forEach(chip => {
        const key = chip.dataset.wcFilter;
        const on = key === 'roots' ? STATE.wordComposerShowRoots
          : key === 'words' ? STATE.wordComposerShowWords
            : key === 'unapproved' ? STATE.showUnapprovedWords
              : STATE.showUnnamed;
        chip.classList.toggle('active', on);
      });
      const showRoots = STATE.wordComposerShowRoots;
      const showWords = STATE.wordComposerShowWords;
      $('wc-roots-h')?.toggleAttribute('hidden', !showRoots);
      $('wc-roots')?.toggleAttribute('hidden', !showRoots);
      $('wc-words-h')?.toggleAttribute('hidden', !showWords);
      $('wc-words')?.toggleAttribute('hidden', !showWords);
      $('wc-picker-empty')?.toggleAttribute('hidden', showRoots || showWords);
      const pickerOpts = { showUnnamed: STATE.showUnnamed };
      const omitIds = picks.filter(c => c.type === 'word').map(c => c.ref);
      if (showRoots) {
        $('wc-roots').innerHTML = rootPickerWithBadge(pickableRoots(STATE.wordComposerFilter, pickerOpts));
        $('wc-roots').querySelectorAll('[data-add-root]').forEach(b => b.addEventListener('click', () => {
          STATE.wordComposer.push({ type: 'root', ref: b.dataset.addRoot, spelling: b.dataset.addRoot });
          renderWordComposer();
        }));
      } else {
        $('wc-roots').innerHTML = '';
      }
      if (showWords) {
        $('wc-words').innerHTML = wordPickerMarkup(pickableWords(STATE.wordComposerFilter, { omitIds, ...pickerOpts }));
        $('wc-words').querySelectorAll('[data-add-word]').forEach(b => b.addEventListener('click', () => {
          const w = STATE.lab.compounds.find(c => c.id === b.dataset.addWord);
          if (!w) return;
          STATE.wordComposer.push({ type: 'word', ref: w.id, spelling: w.spelling, meaning: w.meaning });
          renderWordComposer();
        }));
      } else {
        $('wc-words').innerHTML = '';
      }
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    /* ---------- WORD MATCHER ---------- */
    function loadMatcherDismissed() {
      try {
        const raw = localStorage.getItem(MATCHER_DISMISSED_KEY);
        const list = raw ? JSON.parse(raw) : [];
        STATE.matcherDismissed = new Set(Array.isArray(list) ? list : []);
      } catch {
        STATE.matcherDismissed = new Set();
      }
    }

    function saveMatcherDismissed() {
      localStorage.setItem(MATCHER_DISMISSED_KEY, JSON.stringify([...STATE.matcherDismissed]));
    }

    function ensureMatcherCatalog() {
      if (!STATE.matcherCatalog) STATE.matcherCatalog = enumerateOpenSyllables();
      return STATE.matcherCatalog;
    }

    function labSoundForSpelling(spelling) {
      return STATE.lab?.sounds?.find(s => s.spelling === spelling && s.state !== 'rejected');
    }

    function matcherFonoranMatchesFilter(entry, query) {
      const q = (query ?? '').trim().toLowerCase();
      if (!q) return true;
      if (entry.spelling.includes(q)) return true;
      if (soundPieceMatches('onset', entry.onset, q)) return true;
      if (soundPieceMatches('vowel', entry.vowel, q)) return true;
      return false;
    }

    function matcherEnglishWords() {
      if (!STATE.lexicon) return [];
      const words = STATE.lexicon.words.filter(w => w.source === 'roots');
      const q = (STATE.matcherEnglishFilter ?? '').trim().toLowerCase();
      if (!q) return words;
      const tokens = q.split(/[\s-]+/).filter(Boolean);
      return words.filter(w => {
        const hay = `${w.word} ${w.gloss ?? ''} ${w.category ?? ''}`.toLowerCase();
        return hay.includes(q) || tokens.every(t => hay.includes(t));
      });
    }

    function matcherCellBodyHtml(spelling, meaning) {
      const glyphs = rootScriptPhrase(spelling);
      return `
          <span class="sp">${escapeHtml(spelling)}</span>
          ${glyphs ? `<span class="root-glyphs symbol-text">${escapeHtml(glyphs)}</span>` : ''}
          <span class="mn ${meaning ? '' : 'unnamed'}">${escapeHtml(meaning || 'unnamed')}</span>`;
    }

    function syncMatcherMatchBar() {
      const fonPick = $('wm-pick-fonoran');
      const engPick = $('wm-pick-english');
      const meaningInp = $('wm-meaning');
      const assignBtn = $('wm-assign');

      if (fonPick) {
        const sp = STATE.matcherSelectedFonoran;
        const valEl = fonPick.querySelector('.fonoran-match-eq__value');
        fonPick.classList.toggle('is-filled', Boolean(sp));
        if (valEl) {
          valEl.innerHTML = sp
            ? `<span class="mono">${escapeHtml(sp)}</span>`
            : '<span class="fonoran-match-eq__placeholder">Fonoran</span>';
        }
      }
      if (engPick) {
        const eng = STATE.matcherSelectedEnglish;
        const valEl = engPick.querySelector('.fonoran-match-eq__value');
        engPick.classList.toggle('is-filled', Boolean(eng));
        if (valEl) {
          valEl.innerHTML = eng
            ? `<strong>${escapeHtml(eng.word)}</strong>`
            : '<span class="fonoran-match-eq__placeholder">English</span>';
        }
      }
      if (meaningInp && document.activeElement !== meaningInp) {
        if (STATE.matcherSelectedEnglish && !meaningInp.dataset.userEdited) {
          const lab = STATE.matcherSelectedFonoran ? labSoundForSpelling(STATE.matcherSelectedFonoran) : null;
          meaningInp.value = lab?.meaning?.trim() || STATE.matcherSelectedEnglish.word;
        } else if (!STATE.matcherSelectedEnglish && !STATE.matcherSelectedFonoran) {
          meaningInp.value = '';
          delete meaningInp.dataset.userEdited;
        }
      }
      const hearBtn = $('wm-hear');
      if (hearBtn) hearBtn.disabled = !STATE.matcherSelectedFonoran;
      const meaning = meaningInp?.value.trim() ?? '';
      setWriteButton(assignBtn, !STATE.matcherSelectedFonoran || !STATE.matcherSelectedEnglish || !meaning);    }

    function dismissMatcherSyllable(spelling) {
      const lab = labSoundForSpelling(spelling);
      if (lab?.meaning?.trim()) {
        if (!confirm(`"${spelling}" is named in your lab (${lab.meaning}). Dismiss from matcher only?`)) return;
      }
      STATE.matcherDismissed.add(spelling);
      saveMatcherDismissed();
      if (STATE.matcherSelectedFonoran === spelling) STATE.matcherSelectedFonoran = null;
      renderWordMatcher();
    }

    function restoreMatcherSyllable(spelling) {
      STATE.matcherDismissed.delete(spelling);
      saveMatcherDismissed();
      renderWordMatcher();
    }

    async function assignMatcherPair() {
      const spelling = STATE.matcherSelectedFonoran;
      const meaning = $('wm-meaning')?.value.trim();
      if (!spelling || !STATE.matcherSelectedEnglish || !meaning) return;
      try {
        const exists = labSoundForSpelling(spelling);
        if (exists) {
          await api(`/api/fonoran/lab/sounds/${encodeURIComponent(spelling)}`, {
            method: 'PATCH',
            body: JSON.stringify({ meaning }),
          });
        } else {
          await api('/api/fonoran/lab/sounds', {
            method: 'POST',
            body: JSON.stringify({ spelling, meaning }),
          });
        }
        toast(`Assigned ${spelling} = ${meaning}`);
        const meaningInp = $('wm-meaning');
        if (meaningInp) delete meaningInp.dataset.userEdited;
        await load({ skipRender: true });
        renderWordMatcher();
      } catch (e) { toast(e.message); }
    }

    function renderWordMatcher() {
      if (!STATE.lab || !$('wm-fonoran')) return;
      ensureMatcherCatalog();
      loadMatcherDismissed();
      const catalog = STATE.matcherCatalog;
      const fonEl = $('wm-fonoran');
      const engEl = $('wm-english');
      if (!fonEl || !engEl) return;

      const visibleFon = catalog.filter(entry => {
        const dismissed = STATE.matcherDismissed.has(entry.spelling);
        if (dismissed && !STATE.matcherShowDismissed) return false;
        return matcherFonoranMatchesFilter(entry, STATE.matcherFilter);
      });

      fonEl.innerHTML = visibleFon.length
        ? visibleFon.map(entry => {
          const lab = labSoundForSpelling(entry.spelling);
          const meaning = lab?.meaning ?? null;
          const dismissed = STATE.matcherDismissed.has(entry.spelling);
          const selected = STATE.matcherSelectedFonoran === entry.spelling;
          return `<button type="button" class="root-cell${selected ? ' is-selected' : ''}${meaning ? ' is-named' : ''}${dismissed ? ' is-dismissed' : ''}" data-wm-fonoran="${escapeHtml(entry.spelling)}">${matcherCellBodyHtml(entry.spelling, meaning)}</button>`;
        }).join('')
        : '<p class="empty sans" style="margin:0">No syllables match this filter.</p>';

      const engWords = matcherEnglishWords();
      engEl.innerHTML = engWords.length
        ? engWords.map(w => {
          const selected = STATE.matcherSelectedEnglish?.word === w.word;
          return `<button type="button" class="root-cell eng-cell${selected ? ' is-selected' : ''}" data-wm-english="${escapeHtml(w.word)}">
            <span class="sp">${escapeHtml(w.word)}</span>
            <span class="mn gloss">${escapeHtml(w.gloss || w.word)}</span>
            <span class="matcher-cat">${escapeHtml(w.category || '')}</span>
          </button>`;
        }).join('')
        : '<p class="empty sans" style="margin:0">No English roots match.</p>';

      const namedCount = catalog.filter(e => labSoundForSpelling(e.spelling)?.meaning?.trim()).length;
      const statsEl = $('wm-stats');
      if (statsEl) {
        statsEl.textContent = `${visibleFon.length} Fonoran · ${engWords.length} English roots · ${namedCount} named in lab`;
      }

      fonEl.querySelectorAll('[data-wm-fonoran]').forEach(btn => {
        btn.addEventListener('click', () => {
          STATE.matcherSelectedFonoran = btn.dataset.wmFonoran;
          speakNeural(STATE.matcherSelectedFonoran);
          const lab = labSoundForSpelling(STATE.matcherSelectedFonoran);
          const meaningInp = $('wm-meaning');
          if (meaningInp) {
            delete meaningInp.dataset.userEdited;
            if (STATE.matcherSelectedEnglish) {
              meaningInp.value = lab?.meaning?.trim() || STATE.matcherSelectedEnglish.word;
            } else if (lab?.meaning) {
              meaningInp.value = lab.meaning;
            }
          }
          renderWordMatcher();
        });
      });
      engEl.querySelectorAll('[data-wm-english]').forEach(btn => {
        btn.addEventListener('click', () => {
          const word = btn.dataset.wmEnglish;
          const entry = STATE.lexicon?.words?.find(w => w.word === word);
          STATE.matcherSelectedEnglish = entry ?? { word, gloss: word, category: '' };
          const meaningInp = $('wm-meaning');
          if (meaningInp && document.activeElement !== meaningInp) {
            delete meaningInp.dataset.userEdited;
            const lab = STATE.matcherSelectedFonoran ? labSoundForSpelling(STATE.matcherSelectedFonoran) : null;
            meaningInp.value = lab?.meaning?.trim() || word;
          }
          renderWordMatcher();
        });
      });

      syncMatcherMatchBar();
    }

    function openExplorerPreview(composer, spelling) {
      openExplorer('word', `preview-${spelling}`, {
        preview: true,
        spelling,
        components: composer,
        meaning: $('wc-meaning')?.value.trim() || null,
      });
    }

    function bindMermaidGraphClicks(svgEl, graphNodes, onNavigate) {
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
          if (onNavigate) onNavigate(meta.kind, meta.ref);
          else openExplorer(meta.kind, meta.ref);
        });
      });
    }

    async function renderExplorerMermaidIn(rootEl, mermaidSource, graphNodes, onNavigate) {
      if (!window.mermaid || !mermaidSource || !rootEl) return;
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          lineColor: '#a89f95',
          clusterBkg: '#faf8f5',
          clusterBorder: '#e8e2da',
        },
        securityLevel: 'loose',
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await window.mermaid.run({ nodes: rootEl.querySelectorAll('.mermaid') });
      const wrap = rootEl.querySelector('.mermaid-wrap');
      bindMermaidGraphClicks(wrap?.querySelector('svg'), graphNodes, onNavigate);
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

    function componentMeta(c) {
      const w = c.type === 'word' ? STATE.lab.compounds.find(x => x.id === c.ref) : null;
      return {
        spelling: c.type === 'root' ? c.ref : (w?.spelling ?? c.ref),
        meaning: c.type === 'root' ? soundMeaning(c.ref) : (w?.meaning ?? '?'),
      };
    }

    function buildBuiltFromComposeHtml(f, { removable = false } = {}) {
      const components = f.components ?? [];
      if (!components.length) return '';
      return components.map((c, i) => {
        const { spelling, meaning } = componentMeta(c);
        const op = i > 0 ? '<span class="word-compose__op">+</span>' : '';
        const removeAttrs = removable
          ? ` class="word-compose__piece word-compose__piece--removable" data-remove-idx="${i}" data-write title="Remove ${escapeHtml(spelling)}"`
          : ' class="word-compose__piece"';
        return `${op}<div${removeAttrs}>
          <span class="word-compose__piece-head">${typeBadge(c.type)} <span class="mono">${escapeHtml(spelling)}</span></span>
          <span class="word-compose__piece-meaning">${escapeHtml(meaning)}</span>
          ${removable ? '<span class="word-compose__remove" aria-hidden="true">×</span>' : ''}
        </div>`;
      }).join('');
    }

    function buildBuiltFromSectionHtml(f, { removable = false, wrapSection = true } = {}) {
      const components = f.components ?? [];
      const compose = buildBuiltFromComposeHtml(f, { removable });
      if (!components.length) {
        const empty = '<p class="word-preview__footnote sans">Primitive root. Not built from other pieces.</p>';
        return wrapSection ? empty : empty;
      }
      const body = `<div class="word-compose" aria-label="Word composition">${compose}</div>`;
      return wrapSection
        ? `<div class="explorer-section explorer-section--tight"><h4>Built from</h4>${body}</div>`
        : body;
    }

    function wordPreviewSpeakParts(focus, kind = 'word') {
      return kind === 'root'
        ? [focus.spelling]
        : (focus.components?.length ? composerFlatSpellings(focus.components) : [focus.spelling]);
    }

    function focusFromReviewItem(c) {
      return {
        spelling: c.spelling,
        meaning: c.meaning,
        state: c.state,
        components: c.reviewKind === 'sound' ? [] : (c.components ?? []),
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

    function buildWordPreviewHtml(focus, {
      kind = 'word',
      speakParts = null,
      previewNote = '',
      metaExtra = '',
      hearId = '',
      showBadges = true,
      showBuiltFrom = true,
      builtFromRemovable = false,
      unnamedStyle = 'default',
      showHear = true,
      footerHtml = '',
    } = {}) {
      const parts = speakParts == null ? wordPreviewSpeakParts(focus, kind) : speakParts;
      const hasSpelling = Boolean(focus.spelling);
      const showPron = hasSpelling && parts.length > 0;
      const pron = showPron ? wordPreviewPron(parts) : null;
      const meaningHtml = focus.meaning
        ? escapeHtml(focus.meaning)
        : (unnamedStyle === 'review'
          ? 'not named yet'
          : '<span style="color:var(--draft);font-style:italic">unnamed</span>');
      const meaningClass = focus.meaning ? '' : 'unnamed';
      const badgeKind = kind === 'root' ? 'root' : 'word';
      const builtFromHtml = showBuiltFrom ? buildBuiltFromSectionHtml(focus, { removable: builtFromRemovable }) : '';
      const hearHtml = showHear && hasSpelling
        ? `<div class="word-preview__hear-row"><button type="button" class="hear-min word-preview__hear"${hearId ? ` id="${hearId}"` : ''} aria-label="Listen to ${escapeHtml(focus.spelling)}">▶ Listen</button></div>`
        : '';
      const showToolbar = showBadges || metaExtra;

      return `<div class="word-preview">
        <div class="word-preview__card">
          ${showToolbar ? `<div class="word-preview__toolbar">
            ${showBadges ? `<div class="word-preview__badges" aria-label="Word status">
              ${typeBadge(badgeKind)} ${badge(focus.state || 'draft')}${metaExtra ? ` ${metaExtra}` : ''}
            </div>` : (metaExtra ? `<div class="word-preview__badges">${metaExtra}</div>` : '')}
          </div>` : ''}
          <div class="word-preview__hero">
            ${pron?.script ? `<div class="word-preview__script fonora-script symbol-text">${escapeHtml(pron.script)}</div>` : ''}
            <div class="word-preview__identity">
              ${hasSpelling ? `<p class="word-preview__headline">
                <span class="review-word">${escapeHtml(focus.spelling)}</span>
                <span class="word-preview__dot" aria-hidden="true">·</span>
                <span class="review-meaning ${meaningClass}">${meaningHtml}</span>
              </p>` : ''}
              ${pron ? `<p class="word-preview__pron">
                <span class="word-preview__say">Say: <strong>${escapeHtml(pron.sayLine)}</strong></span>${pron.englishLine ? `<span class="word-preview__like">Sounds like ${escapeHtml(pron.englishLine)}</span>` : ''}
              </p>` : ''}
            </div>
          </div>
          ${hearHtml}
          ${previewNote ? `<p class="sans word-preview__note">${previewNote}</p>` : ''}
          ${builtFromHtml}
          ${footerHtml}
        </div>
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

    function buildWordTreeSectionHtml(mermaid, { variant = 'default' } = {}) {
      if (!mermaid) return '';
      const klass = variant === 'showcase' ? 'explorer-section showcase-graph' : 'explorer-section';
      return `<div class="${klass}">
        <h4>Word Tree</h4>
        <p class="sans graph-hint">Tap a node to explore that root or word.</p>
        <div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(mermaid)}</pre></div>
      </div>`;
    }

    function buildExplorerActionsHtml({ graph = false, dda = true, hasMermaid = false } = {}) {
      if (!graph && !dda) return '';
      return `<div class="explorer-actions">
        ${graph ? `<button type="button" class="btn" data-open-graph ${hasMermaid ? '' : 'disabled'}>Word Tree</button>` : ''}
        ${dda ? `<button type="button" class="btn" data-open-dda>Semantic coordinates (DDA)</button>` : ''}
      </div>`;
    }

    function buildShowcaseHtml(data) {
      const f = data.focus;
      const word = STATE.lab?.compounds?.find(c => c.id === LANDER_SHOWCASE_WORD_ID);
      const speakParts = wordPreviewSpeakParts(f, 'word');

      const html = `
        ${buildWordPreviewHtml(f, {
          kind: 'word',
          speakParts,
          showBadges: false,
          hearId: 'lander-showcase-hear',
        })}
        ${buildUsedInChipsHtml(data.used_in)}
        ${buildWordTreeSectionHtml(data.mermaid, { variant: 'showcase' })}
        <div class="showcase-dda-section">
          ${buildDdaPanelHtml(word?.dda, f.components)}
        </div>`;

      return { html, speakParts };
    }

    function buildExplorerHtml(data, explorerKind, {
      preview = false,
      includeGraph = true,
      layout = 'default',
      modalActions = false,
    } = {}) {
      const f = data.focus;
      const speakParts = wordPreviewSpeakParts(f, explorerKind === 'root' ? 'root' : 'word');
      const isDictionary = layout === 'dictionary';
      const showInlineGraph = includeGraph && !isDictionary;

      const actionButtons = (isDictionary || modalActions)
        ? buildExplorerActionsHtml({
          graph: isDictionary || !showInlineGraph,
          dda: true,
          hasMermaid: Boolean(data.mermaid),
        })
        : '';

      const previewHtml = buildWordPreviewHtml(f, {
        kind: explorerKind === 'root' ? 'root' : 'word',
        speakParts,
        previewNote: preview ? 'Preview: save the word to explore downstream links. Tap nodes in the graph to jump to saved roots and words.' : '',
        footerHtml: isDictionary ? actionButtons : '',
      });

      const graphSection = showInlineGraph
        ? buildWordTreeSectionHtml(data.mermaid, { variant: 'default' })
        : '';

      const trailingActions = !isDictionary ? actionButtons : '';

      const body = `${previewHtml}${graphSection}${trailingActions}`;

      const html = isDictionary
        ? `<div class="dict-detail-stack">${body}</div>`
        : body;

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
          spelling: 'shakafa',
          meaning: 'war',
          components: [{ type: 'word', ref: 'cmp-shaka' }, { type: 'root', ref: 'fa' }],
        }),
      });
    }

    function openShowcaseExplorer() {
      const word = STATE.lab?.compounds?.find(c => c.id === LANDER_SHOWCASE_WORD_ID);
      if (word) {
        openExplorer('word', word.id);
        return;
      }
      openExplorer('word', 'preview-shakafa', {
        preview: true,
        spelling: 'shakafa',
        meaning: 'war',
        components: [
          { type: 'word', ref: 'cmp-shaka', spelling: 'shaka' },
          { type: 'root', ref: 'fa', spelling: 'fa' },
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
        el.innerHTML = '<p class="fonoran-showcase__error">Could not load the example word. Start the dev server with <code>npm start</code>.</p>';
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
        el.innerHTML = '<p class="lander-health__error">Could not load health metrics. Start the dev server with <code>npm start</code>.</p>';
      }
    }


    function firstOpenIndex(list) { return list.findIndex(i => isOpen(i.state)); }

    function renderWords() {
      if (!STATE.lab) return;
      const list = reviewItems();
      const total = list.length;
      const reviewEl = $('word-review');
      if (!total) {
        reviewEl.innerHTML = `
          <div class="all-done">
            <p class="big">🌱</p>
            <h2>Nothing to review yet</h2>
            <p class="sans" style="color:var(--muted);max-width:28rem;margin:0.5rem auto 1.25rem">Roots you add on <strong>Root Creator</strong> and words you save on <strong>Word Creator</strong> show up here one at a time.</p>
            <button type="button" class="btn btn-primary" id="review-go-create">Create a root</button>
          </div>`;
        $('review-go-create')?.addEventListener('click', () => switchPage('roots'));
        return;
      }
      if (STATE.reviewFocusPending) {
        STATE.reviewFocusPending = false;
        const openIdx = firstOpenIndex(list);
        if (openIdx >= 0) {
          STATE.wordCursor = openIdx;
          STATE.justSaved = null;
        }
      }
      const open = list.filter(i => isOpen(i.state)).length;
      if (STATE.wordCursor >= total) STATE.wordCursor = total - 1;
      if (STATE.wordCursor < 0) STATE.wordCursor = 0;
      const c = list[STATE.wordCursor];
      const isSound = c.reviewKind === 'sound';
      const kindLabel = isSound ? 'Root' : 'Word';
      const focus = focusFromReviewItem(c);
      const savedNote = STATE.justSaved === c.spelling
        ? `<div class="saved-banner">✓ Saved <strong>${escapeHtml(c.spelling)}</strong>. You're still on this ${isSound ? 'root' : 'word'}. Find it anytime in Dictionary.</div>` : '';
      const feelPrompt = c.meaning
        ? `Does this ${isSound ? 'root' : 'word'} feel right?`
        : `This ${isSound ? 'root' : 'word'} needs a meaning.`;
      const editPanel = STATE.editing
        ? (isSound ? renderSoundEdit(c) : renderWordEdit(c))
        : '';
      const feelPanel = STATE.editing ? '' : `
            <p class="feel">${feelPrompt}</p>
            <div class="feel-actions">
              <button type="button" class="fa-approve" id="approve"${writeDisabledAttr(!c.meaning)} data-write>✓ Approve</button>
              <button type="button" class="fa-edit" id="edit" data-write>✎ Edit</button>
              <button type="button" class="fa-reject" id="reject" data-write>✕ Reject</button>
            </div>`;
      $('word-review').innerHTML = `
        <div class="review">
          ${neighborStrip(list, STATE.wordCursor)}
          <div class="position">${kindLabel} ${STATE.wordCursor + 1} of ${total} · ${open} need review · ${badge(isSound ? 'base' : 'compound')} ${badge(c.state)}</div>
          ${buildWordPreviewHtml(focus, {
            kind: isSound ? 'root' : 'word',
            speakParts: isSound ? [c.spelling] : c.parts,
            showBadges: false,
            unnamedStyle: 'review',
            hearId: 'hear',
          })}
          <button type="button" class="btn" id="explore-item" style="margin-top:0.5rem">Explore family tree</button>
          ${savedNote}
          ${editPanel}${feelPanel}
          ${cardNav(STATE.wordCursor, total, 'word')}
        </div>`;
      wireCommon(c);
      $('explore-item')?.addEventListener('click', () => openExplorer(isSound ? 'root' : 'word', isSound ? c.spelling : c.id));
      wireNeighbors(list, 'wordCursor', renderWords);
      if (STATE.editing) {
        if (isSound) wireSoundEdit(c);
        else wireWordEdit(c);
      } else wireFeel(c);
    }

    function renderSoundEdit(s) {
      return `
        <div class="edit-panel">
          <div id="ed-live-pron">${pronBlock(s.spelling)}</div>
          <button type="button" class="hear-min" id="ed-hear" style="margin:0.5rem 0 0" aria-label="Listen to this syllable">▶ Listen</button>
          <label class="fld" for="ed-meaning">Meaning: name this root</label>
          ${meaningPickerHtml('ed')}
          <input type="text" id="ed-meaning" value="${escapeHtml(s.meaning ?? '')}" placeholder="e.g. water, motion…" data-write-input>
          <div id="ed-dupe"></div>
          <div class="edit-actions">
            <button type="button" class="btn btn-primary" id="ed-save" data-write>Save &amp; approve</button>
            <button type="button" class="btn" id="ed-cancel">Cancel</button>
          </div>
        </div>`;
    }

    function wireSoundEdit(s) {
      STATE.editMeaning = s.meaning ?? '';
      const inp = $('ed-meaning');
      inp.addEventListener('input', () => { STATE.editMeaning = inp.value; renderDupe('sound', s.spelling); });
      wireMeaningPicker('ed', 'ed-meaning');
      renderDupe('sound', s.spelling);
      $('ed-cancel').addEventListener('click', () => { STATE.editing = false; renderWords(); });
      $('ed-hear')?.addEventListener('click', () => speakNeural(s.spelling));
      $('ed-save').addEventListener('click', async () => {
        const meaning = STATE.editMeaning.trim();
        if (!meaning) { toast('Type a meaning first.'); return; }
        try {
          const changed = meaning !== (s.meaning ?? '');
          await api(`/api/fonoran/lab/sounds/${encodeURIComponent(s.spelling)}`, {
            method: 'PATCH',
            body: JSON.stringify({ meaning, state: changed && s.meaning ? 'revised' : 'approved' }),
          });
          STATE.editing = false;
          STATE.justSaved = s.spelling;
          await load({ skipRender: true });
          const list = reviewItems();
          const idx = list.findIndex(x => x.spelling === s.spelling && x.reviewKind === 'sound');
          STATE.wordCursor = idx >= 0 ? idx : STATE.wordCursor;
          toast(`Saved ${s.spelling}`);
          renderWords();
        } catch (e) { toast(e.message); }
      });
    }

    function renderWordEdit(c) {
      return `
        <div class="edit-panel">
          <div id="ed-live-pron"></div>
          <button type="button" class="hear-min" id="ed-hear" style="margin:0.5rem 0 0" aria-label="Listen to this recipe">▶ Listen</button>
          <label class="fld" for="ed-meaning">Meaning: keep it, or rename the word</label>
          ${meaningPickerHtml('ed')}
          <input type="text" id="ed-meaning" value="${escapeHtml(c.meaning ?? '')}" placeholder="${escapeHtml(c.suggested_meaning || 'e.g. river, friend…')}" data-write-input>
          <div id="ed-dupe"></div>
          <label class="fld">Recipe: which sounds build it (tap to remove)</label>
          <div class="pick" id="ed-recipe-pick"></div>
          <div class="recipe-preview" id="ed-recipe-preview"></div>
          <input type="search" id="ed-recipe-filter" placeholder="Find a sound by meaning… e.g. bond, motion">
          <div class="sound-grid" id="ed-recipe-sounds"></div>
          <div class="edit-actions">
            <button type="button" class="btn btn-primary" id="ed-save" data-write>Save &amp; approve</button>
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
          const list = reviewItems();
          const idx = list.findIndex(x => x.spelling === savedSpelling && x.reviewKind === 'compound');
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
        ? comps.map((comp, i) => `<span class="tok" data-idx="${i}" data-write>${typeBadge(comp.type)} <span class="mono">${escapeHtml(comp.spelling || comp.ref)}</span> = ${escapeHtml(compDisplayLabel(comp))} ×</span>`).join('')
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
      const all = reviewItems();
      const done = all.filter(i => reviewed(i.state)).length;
      const pct = all.length ? Math.round((done / all.length) * 100) : 0;
      return `<div class="progress"><span style="width:${pct}%"></span></div><div class="progress-label">${done} of ${all.length} reviewed (${pct}%)</div>`;
    }
    function wireCommon(item) {
      const speakParts = item.reviewKind === 'sound' ? [item.spelling] : item.parts;
      $('hear').addEventListener('click', () => speakNeural(speakParts));
      const prev = $('nav-prev'), next = $('nav-next');
      prev?.addEventListener('click', () => { if (STATE.wordCursor > 0) { STATE.wordCursor--; STATE.editing = false; STATE.justSaved = null; renderWords(); } });
      next?.addEventListener('click', () => { const t = reviewItems().length; if (STATE.wordCursor < t - 1) { STATE.wordCursor++; STATE.editing = false; STATE.justSaved = null; renderWords(); } });
    }
    function wireFeel(item) {
      $('edit')?.addEventListener('click', () => { STATE.editing = true; renderWords(); });
      const isSound = item.reviewKind === 'sound';
      $('approve')?.addEventListener('click', async () => {
        if (isSound) {
          await api(`/api/fonoran/lab/sounds/${encodeURIComponent(item.spelling)}`, { method: 'PATCH', body: JSON.stringify({ state: 'approved' }) });
        } else {
          await api(`/api/fonoran/lab/compounds/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ meaning: item.meaning, state: 'approved' }) });
        }
        toast(`Approved ${item.spelling}`); await advanceWord();
      });
      $('reject')?.addEventListener('click', async () => {
        const kind = isSound ? 'sound' : 'compound';
        const id = isSound ? item.spelling : item.id;
        await api(`/api/fonoran/lab/state/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ state: 'rejected' }) });
        toast(`Rejected ${item.spelling}`); await advanceWord();
      });
    }
    async function advanceWord() {
      const before = STATE.wordCursor;
      await load({ skipRender: true });
      const list = reviewItems();
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
      const focus = {
        spelling: item.spelling,
        meaning: item.meaning,
        state: item.state,
        components: kind === 'compound' ? (item.components ?? []) : [],
      };
      const claimNote = item.generator_hint && !item.meaning?.trim()
        ? 'Generator suggestion. Save below to name it.'
        : item.generator_hint ? 'Generator suggestion.' : '';
      const id = kind === 'sound' ? item.spelling : item.id;
      return `
        <div class="word-match">
          <p class="word-match__label">Already in your lab</p>
          ${buildWordPreviewHtml(focus, {
            kind: kind === 'sound' ? 'root' : 'word',
            showBadges: true,
            showBuiltFrom: kind === 'compound' && focus.components.length > 0,
            showHear: false,
          })}
          ${claimNote ? `<p class="word-match__note">${escapeHtml(claimNote)}</p>` : ''}
          <div class="wm-meta"><button type="button" class="linkish" data-view-match="${kind}" data-match-id="${escapeHtml(id)}">Open details</button></div>
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
    async function fetchExplorerData(kind, id, preview = null) {
      if (preview?.preview) {
        return api('/api/fonoran/lab/graph/preview', {
          method: 'POST',
          body: JSON.stringify({
            spelling: preview.spelling,
            meaning: preview.meaning,
            components: composerToApi(preview.components),
          }),
        });
      }
      return api(`/api/fonoran/lab/graph/${kind}/${encodeURIComponent(id)}`);
    }

    async function mountExplorer(containerEl, kind, id, preview = null, {
      onNavigate,
      includeGraph = true,
      layout = 'default',
      modalActions = false,
    } = {}) {
      const data = await fetchExplorerData(kind, id, preview);
      const explorerKind = preview?.preview ? 'word' : kind;
      const showInlineGraph = includeGraph && layout !== 'dictionary';
      const { html, speakParts } = buildExplorerHtml(data, explorerKind, {
        preview: !!preview?.preview,
        includeGraph,
        layout,
        modalActions,
      });
      containerEl.innerHTML = html;
      containerEl.querySelector('.word-preview__hear')?.addEventListener('click', () => speakNeural(speakParts));
      if (showInlineGraph) {
        await renderExplorerMermaidIn(containerEl, data.mermaid, data.graph_nodes, onNavigate);
      }
      if (modalActions || layout === 'dictionary') {
        containerEl.querySelector('[data-open-graph]')?.addEventListener('click', () => {
          openFamilyGraphSheet(data, onNavigate);
        });
        containerEl.querySelector('[data-open-dda]')?.addEventListener('click', () => {
          openDdaSheet(data, explorerKind, id);
        });
      }
      return data;
    }

    async function openFamilyGraphSheet(data, onNavigate) {
      const f = data.focus;
      if (!data.mermaid) return;
      const body = $('sheet-body');
      openSheet();
      body.innerHTML = `
        <div class="explorer-section showcase-graph">
          <h4>Word Tree · <span class="mono">${escapeHtml(f.spelling)}</span></h4>
          <p class="sans graph-hint">Tap a node to explore that root or word.</p>
          <div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(data.mermaid)}</pre></div>
        </div>`;
      await renderExplorerMermaidIn(body, data.mermaid, data.graph_nodes, (navKind, ref) => {
        closeSheet();
        if (onNavigate) onNavigate(navKind, ref);
        else openExplorer(navKind, ref);
      });
    }

    function openDdaSheet(data, explorerKind, ref) {
      const dda = labItemDda(explorerKind, ref);
      openSheet();
      $('sheet-body').innerHTML = buildDdaPanelHtml(dda, data.focus.components);
    }

    async function openExplorer(kind, id, preview = null) {
      try {
        const body = $('sheet-body');
        body.innerHTML = '<p class="fonoran-split-loading">Loading…</p>';
        openSheet();
        await mountExplorer(body, kind, id, preview);
      } catch (e) {
        closeSheet();
        toast(e.message);
      }
    }

    function openSheet() {
      const sheet = $('sheet');
      const backdrop = $('sheet-backdrop');
      setModalBackdropOpen(backdrop, true);
      sheet.hidden = false;
      sheet.classList.add('open');
    }

    function closeSheet() {
      const sheet = $('sheet');
      const backdrop = $('sheet-backdrop');
      setModalBackdropOpen(backdrop, false);
      sheet.classList.remove('open');
      sheet.hidden = true;
    }

    function openChain(kind, id) {
      openExplorer(kind === 'sound' ? 'root' : 'word', kind === 'sound' ? id : id);
    }

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
    function dictExplorerKind(entryKind) {
      return entryKind === 'sound' ? 'root' : 'word';
    }

    function dictDetailEmptyHtml() {
      return `<div class="fonoran-split-empty"><p>Select a word or root on the left to preview it, then open the Word Tree or DDA from the card.</p></div>`;
    }

    function showDictDetailEmpty() {
      const panel = $('dict-detail');
      if (panel) panel.innerHTML = dictDetailEmptyHtml();
    }

    let dictDetailToken = 0;
    async function loadDictionaryDetail(entryKind, id) {
      const panel = $('dict-detail');
      if (!panel) return;
      const token = ++dictDetailToken;
      panel.innerHTML = '<p class="fonoran-split-loading">Loading…</p>';
      try {
        await mountExplorer(panel, dictExplorerKind(entryKind), id, null, {
          layout: 'dictionary',
          includeGraph: false,
          modalActions: true,
          onNavigate: (navKind, ref) => {
            const kind = navKind === 'root' ? 'sound' : 'compound';
            STATE.dictSelection = { kind, id: ref };
            renderDictionaryList({ scrollToSelection: true });
            loadDictionaryDetail(kind, ref);
          },
        });
        if (token !== dictDetailToken) return;
      } catch (e) {
        if (token !== dictDetailToken) return;
        panel.innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`;
      }
    }

    function selectDictionaryEntry(entryKind, id) {
      STATE.dictSelection = { kind: entryKind, id };
      renderDictionaryList();
      loadDictionaryDetail(entryKind, id);
    }

    function syncDictSelection() {
      if (!STATE.dictSelection) {
        showDictDetailEmpty();
        return;
      }
      const list = dictEntries();
      const still = list.some(e => e.kind === STATE.dictSelection.kind && e.id === STATE.dictSelection.id);
      if (!still) {
        STATE.dictSelection = null;
        showDictDetailEmpty();
      }
    }

    function dictItemGlyphs(entry) {
      if (!STATE.rules) return '';
      if (entry.kind === 'sound') return romanToFonoraScript([entry.word], STATE.rules).phrase;
      const compound = STATE.lab.compounds.find(c => c.id === entry.id);
      const parts = compound?.parts ?? [entry.word];
      return romanToFonoraScript(parts, STATE.rules).phrase;
    }

    function dictItemHtml(entry) {
      const glyphs = dictItemGlyphs(entry);
      const meaning = entry.english === '(unnamed)' ? 'unnamed' : entry.english;
      const unnamed = meaning === 'unnamed';
      const sel = STATE.dictSelection;
      const selected = sel && sel.kind === entry.kind && sel.id === entry.id;
      const type = entry.kind === 'sound' ? 'root' : 'word';
      return `
        <button type="button" class="dict-item${selected ? ' is-selected' : ''}" data-kind="${entry.kind}" data-id="${escapeHtml(entry.id)}">
          <span class="dict-item__content">
            <span class="mn${unnamed ? ' unnamed' : ''}">${escapeHtml(meaning)}</span>
            ${glyphs ? `<span class="dict-item__glyphs root-glyphs symbol-text" aria-hidden="true">${escapeHtml(glyphs)}</span>` : ''}
            <span class="sp">${escapeHtml(entry.word)}</span>
          </span>
          <span class="dict-item__badges">${typeBadge(type)} ${badge(entry.state)}</span>
        </button>`;
    }

    function dictListScrollInset() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--fonoran-split-chrome-offset').trim();
      const chrome = parseFloat(raw) || 144;
      return chrome + 16;
    }

    function scrollDictSelectionIntoView() {
      const sel = STATE.dictSelection;
      if (!sel || STATE.page !== 'dictionary') return;
      const list = $('dict-list');
      if (!list) return;
      const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
      const btn = list.querySelector(`.dict-item[data-kind="${esc(sel.kind)}"][data-id="${esc(sel.id)}"]`);
      if (!btn) return;

      const inset = dictListScrollInset();
      const rect = btn.getBoundingClientRect();
      const viewBottom = window.innerHeight - 20;
      if (rect.top >= inset && rect.bottom <= viewBottom) return;

      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - inset),
        behavior: 'smooth',
      });
    }

    function renderDictionaryList({ scrollToSelection = false } = {}) {
      const list = dictEntries();
      $('dict-list').innerHTML = list.length ? list.map(dictItemHtml).join('') : '<p class="empty">Nothing matches.</p>';
      $('dict-list').querySelectorAll('.dict-item').forEach(b => b.addEventListener('click', () => {
        selectDictionaryEntry(b.dataset.kind, b.dataset.id);
      }));
      if (scrollToSelection) {
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollDictSelectionIntoView);
        });
      }
    }

    function syncSplitStickyOffsets() {
      const header = document.getElementById('app-header-root');
      let headerBottom = 0;
      if (header) {
        headerBottom = Math.ceil(header.getBoundingClientRect().bottom);
        document.documentElement.style.setProperty('--fonoran-header-offset', `${headerBottom}px`);
      }
      const shell = document.querySelector('.fonoran-split-page.active [data-split-shell]');
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

    let splitStickyObserver = null;
    function ensureSplitStickyObserver() {
      const header = document.getElementById('app-header-root');
      if (!header) return;
      if (!splitStickyObserver) {
        splitStickyObserver = new ResizeObserver(() => syncSplitStickyOffsets());
        splitStickyObserver.observe(header);
      }
      document.querySelectorAll('[data-split-shell]').forEach((shell) => {
        if (!shell.dataset.stickyObserved) {
          shell.dataset.stickyObserved = '1';
          splitStickyObserver.observe(shell);
        }
      });
    }

    function renderDictionary() {
      if (!STATE.lab) return;
      ensureSplitStickyObserver();
      renderDictionaryList();
      syncDictSelection();
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    /* ---------- HEALTH + TIMELINE ---------- */
    async function undoLastChange() {
      if (!canWrite()) { toast('Sign in required'); return; }
      const res = await api('/api/fonoran/lab/undo', { method: 'POST', body: '{}' });
      toast(res.reverted ? `Undid: ${res.label}` : 'Nothing to undo');
      STATE.editing = false;
      await load();
    }

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
      const undoDisabled = !STATE.lab?.can_undo || !canWrite();
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
        <div class="health-progress-header">
          <h3 class="section-h">Your progress</h3>
          <button type="button" class="health-undo-btn" id="undo-btn"${undoDisabled ? ' disabled' : ''} data-write>↶ Undo</button>
        </div>
        <div id="timeline"></div>`;
      $('health-toggle').addEventListener('click', () => { STATE.healthOpen = !STATE.healthOpen; renderHealth(); });
      $('undo-btn')?.addEventListener('click', () => { undoLastChange(); });
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
    const MAIN_PAGES = new Set(['roots', 'create', 'matcher', 'review', 'dictionary']);
    const ALL_PAGES = new Set(['home', 'roots', 'create', 'matcher', 'review', 'dictionary', 'health', 'advanced']);
    function scrollPageTop() {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    function rememberMainPage() {
      if (MAIN_PAGES.has(STATE.page)) STATE.toolReturnPage = STATE.page;
    }
    function switchPage(name) {
      const enteringReview = name === 'review' && STATE.page !== 'review';
      STATE.page = name; STATE.editing = false;
      if (enteringReview) STATE.reviewFocusPending = true;
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
      updateAuthGate();
      renderActivePage();
      scrollPageTop();
      requestAnimationFrame(() => {
        scrollPageTop();
        if (name === 'dictionary' || name === 'create' || name === 'roots') {
          syncSplitStickyOffsets();
          requestAnimationFrame(syncSplitStickyOffsets);
        }
      });
    }

    const header = document.getElementById('app-header-root');
    header?.addEventListener('universal-nav:page', (event) => {
      switchPage(event.detail.page);
    });
    header?.addEventListener('universal-nav:sign-out', () => { signOut(); });
    header?.addEventListener('universal-nav:action', async (event) => {
      const { action } = event.detail;
      if (action === 'health') {
        rememberMainPage();
        switchPage('health');
      } else if (action === 'advanced') {
        rememberMainPage();
        switchPage('advanced');
      }
    });
    $('dict-search').addEventListener('input', e => { STATE.dictQuery = e.target.value; renderDictionary(); });
    $('roots-filter')?.addEventListener('input', e => { STATE.rootsFilter = e.target.value; updateRootsSoundFilter(); });
    $('dict-filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; STATE.dictFilter = b.dataset.filter; $('dict-filters').querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b)); renderDictionary(); });
    $('adv-dictionary').addEventListener('click', () => { rememberMainPage(); switchPage('dictionary'); });
    $('adv-health').addEventListener('click', () => { rememberMainPage(); switchPage('health'); });
    $('wc-filter').addEventListener('input', e => { STATE.wordComposerFilter = e.target.value; renderWordComposer(); });
    $('wc-meaning')?.addEventListener('input', () => renderWordComposer());
    $('wm-filter')?.addEventListener('input', e => { STATE.matcherFilter = e.target.value; renderWordMatcher(); });
    $('wm-english-filter')?.addEventListener('input', e => { STATE.matcherEnglishFilter = e.target.value; renderWordMatcher(); });
    $('wm-meaning')?.addEventListener('input', () => {
      $('wm-meaning').dataset.userEdited = '1';
      syncMatcherMatchBar();
    });
    $('wm-assign')?.addEventListener('click', () => assignMatcherPair());
    $('wm-clear-sel')?.addEventListener('click', () => {
      STATE.matcherSelectedFonoran = null;
      STATE.matcherSelectedEnglish = null;
      const meaningInp = $('wm-meaning');
      if (meaningInp) { meaningInp.value = ''; delete meaningInp.dataset.userEdited; }
      renderWordMatcher();
    });
    $('wc-filters')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-wc-filter]');
      if (!chip) return;
      if (chip.dataset.wcFilter === 'roots') STATE.wordComposerShowRoots = !STATE.wordComposerShowRoots;
      else if (chip.dataset.wcFilter === 'words') STATE.wordComposerShowWords = !STATE.wordComposerShowWords;
      else if (chip.dataset.wcFilter === 'unapproved') STATE.showUnapprovedWords = !STATE.showUnapprovedWords;
      else if (chip.dataset.wcFilter === 'unnamed') STATE.showUnnamed = !STATE.showUnnamed;
      renderWordComposer();
    });
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
    bindModalDismiss({
      backdrop: $('sheet-backdrop'),
      panel: $('sheet'),
      close: closeSheet,
      isOpen: () => $('sheet')?.classList.contains('open'),
    });
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

    const initialPage = document.documentElement.getAttribute('data-fonora-page') || 'home';
    initUniversalNav({ context: 'language', activeTab: initialPage });
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    $(`page-${initialPage}`)?.classList.add('active');

    async function boot() {
      STATE.page = initialPage;
      if (initialPage === 'review') STATE.reviewFocusPending = true;
      await refreshAuth();
      handleAuthUrlErrors();
      updateAuthGate();
      window.addEventListener('hashchange', () => {
        const hashPage = window.location.hash.replace(/^#/, '');
        const page = hashPage && ALL_PAGES.has(hashPage) ? hashPage : 'home';
        if (page !== STATE.page) switchPage(page);
      });
      wireLander();
      window.addEventListener('resize', syncSplitStickyOffsets);
      await load();
      syncSplitStickyOffsets();
    }

    boot();
