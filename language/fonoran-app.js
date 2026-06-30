    import { toSpeakable, compoundSpeakable, phoneticKeyBold, compoundPhoneticKey, englishGuide, compoundEnglishGuide, parseSyllable, buildSyllable, isValidSyllable, pieceHint, ONSET_GROUPS, VOWEL_DISPLAY, CODA_DISPLAY, romanToIpa } from '../tools/fonoran-pronunciation.js';
    import { checkCompoundBoundary, segmentCompound, pronounceabilityScore, rootSimilarity } from '../tools/fonoran-gen3-readability.js';
    import { romanToFonoraScript, pieceToFonoraSymbols } from '../tools/fonoran-fonora-bridge.js';
    import { loadLanguageRules } from '../js/load-language-rules.js';
    import { speakFonoraPhrase, cancelSpeech } from '../js/fonora-tts.js';
    import { primeAudioContext } from '../js/espeak-audio.js';
    import { initUniversalNav, setActiveTab, setFonoranUndoDisabled, setFonoranAuth, setNavSelectHandlers } from '../js/universal-nav.js';
    import { bindModalDismiss, setModalBackdropOpen } from '../js/modal-dismiss.js';
    import { extractMarkdownHeadings, normalizeGrammarSource, renderMarkdown } from '../js/markdown-render.js';

    const AUTH = {
      required: false,
      authenticated: true,
      email: null,
      loginUrl: '/auth/google?returnTo=/language',
    };
    const WRITE_PAGES = new Set(['roots', 'create', 'review', 'root-review', 'concepts', 'advanced']);
    const SPLIT_WRITE_PAGES = new Set(['roots', 'create', 'review', 'concepts']);

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

    function renderBoundaryViolation(boxId, picks) {
      const box = $(boxId);
      if (!box) return false;
      const parts = composerFlatSpellings(picks);
      if (parts.length < 2) { box.innerHTML = ''; return false; }
      const result = checkCompoundBoundary(parts);
      if (result.valid) { box.innerHTML = ''; return false; }
      const msgs = result.violations.map(v =>
        `<span class="wc-boundary__violation">${escapeHtml(v.reason)}</span>`
      ).join('');
      box.innerHTML = `<div class="wc-boundary wc-boundary--error" role="alert">${msgs}</div>`;
      return true;
    }

    function syncWordComposerControls() {
      const picks = STATE.wordComposer;
      const spelling = picks.length ? resolveComposerSpelling(picks) : '';
      const match = renderSpellingMatch('wc-match', spelling, {
        compact: true,
        editingId: STATE.wordComposerEditingId,
      });
      const boundaryBlocked = renderBoundaryViolation('wc-boundary', picks);
      setWriteButton($('wc-save'), picks.length < 2 || spellingBlocksSave(match, STATE.wordComposerEditingId) || boundaryBlocked);
      const saveBtn = $('wc-save');
      if (saveBtn) saveBtn.textContent = STATE.wordComposerEditingId ? 'Save changes' : 'Save word';
      const cancelBtn = $('wc-cancel');
      if (cancelBtn) cancelBtn.hidden = !STATE.wordComposerReturnPage;
      const intro = $('wc-intro');
      if (intro) {
        intro.textContent = STATE.wordComposerEditingId
          ? 'Editing an existing word — adjust the recipe, meaning, or aliases, then save.'
          : 'Stack roots and approved words on the left, build the recipe, and name the compound.';
      }
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
      const hash = window.location.hash || '';
      return `/language${hash}`;
    }

    async function refreshAuth() {
      try {
        const returnTo = authReturnPath();
        const res = await fetch(`/auth/session?returnTo=${encodeURIComponent(returnTo)}`, { credentials: 'include' });
        const data = await res.json();
        AUTH.required = Boolean(data.authRequired);
        AUTH.authenticated = Boolean(data.authenticated);
        AUTH.email = data.email ?? null;
        AUTH.loginUrl = data.loginUrl ?? '/auth/google?returnTo=/language';
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

    let landerShowcaseWord = null;
    let landerShowcaseToken = 0;

    function pickLanderShowcaseWord() {
      const pool = (STATE.lab?.compounds ?? []).filter((c) => {
        if (c.state === 'rejected') return false;
        const partCount = c.components?.length ?? c.parts?.length ?? 0;
        return partCount >= 2;
      });
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    let landerHealthToken = 0;

    const STATE = {
      lab: null, page: 'home', rules: null,
      wordCursor: 0,
      reviewFocusPending: false,
      rootsFilter: '',
      justSaved: null,
      dictQuery: '', dictSelection: null,
      dictShowRoots: true,
      dictShowWords: true,
      dictShowParticles: false,
      dictParticles: null,
      dictShowNeedsReview: false,
      dictShowApproved: false,
      dictShowRejected: false,
      wordComposer: [], wordComposerFilter: '',
      wordComposerEditingId: null,
      wordComposerReturnPage: null,
      wordComposerPendingFields: null,
      wordComposerShowRoots: true,
      wordComposerShowWords: true,
      showUnapprovedWords: false,
      showUnnamed: false,
      showDebugDda: false,
      rootDraft: { onset: '', vowel: '', coda: '' },
      rootComposerEditingSpelling: null,
      rootComposerReturnPage: null,
      rootComposerPendingFields: null,
      lexicon: null,
      health: null,
      healthKey: null,
      toolReturnPage: 'roots',
      translatorInput: '',
      translatorResult: null,
      translatorBusy: false,
      translatorPlaying: false,
      translatorCancel: false,
      gapsReport: null,
      gapsLoaded: false,
      gapsExpanded: {},
      rootCandidates: null,
      rootCursor: 0,
      rootReviewFocusPending: false,
      reviewFilter: '',
      reviewShowRoots: true,
      reviewShowLabWords: true,
      reviewShowGeneratedWords: false,
      reviewNeedsReviewOnly: false,
      reviewShowRejected: false,
      reviewSelection: null,
      conceptEditorFilter: '',
      conceptEditorSelected: null,
      conceptEditorIsNew: false,
      conceptEditorDraft: null,
      conceptEditorPendingId: null,
      conceptEditorReturnPage: null,
      conceptEditorDomains: [],
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

    function editPronPreviewHtml(spelling, parts) {
      const { script, sayLine, englishLine } = wordPreviewPron(parts);
      if (!script && !spelling && !sayLine) {
        return '<p class="sans" style="color:var(--muted);font-size:0.84rem">Add components to preview script and pronunciation.</p>';
      }
      return `${script ? `<div class="fonora-script symbol-text">${escapeHtml(script)}</div>` : ''}
        ${spelling ? `<p class="review-word edit-preview__spelling">${escapeHtml(spelling)}</p>` : ''}
        ${sayLine ? `<div class="pron-block">
          <div class="pron-line">Say: <strong>${escapeHtml(sayLine)}</strong></div>
          ${englishLine ? `<div class="pron-english">Sounds like: ${escapeHtml(englishLine)}</div>` : ''}
        </div>` : ''}`;
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
        if (w?.components?.length) return composerFlatSpellings(w.components);
        if (w?.parts?.length) return w.parts;
      }
      return [c.spelling || (c.type === 'root' ? c.ref : c.ref.replace(/^cmp-/, ''))];
    }
    function composerFlatSpellings(composer) {
      return (composer ?? []).flatMap(composerComponentParts);
    }
    /** Phonetic syllable parts for script/TTS — expands nested word components, not flat compound parts. */
    function compoundSpeakParts(item) {
      if (!item) return [];
      if (item.components?.length) return composerFlatSpellings(item.components);
      if (item.parts?.length) return item.parts;
      return item.spelling ? [item.spelling] : [];
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
      if (type === 'particle') return '<span class="badge badge-particle">PARTICLE</span>';
      return `<span class="badge badge-${type === 'root' ? 'base' : 'compound'}">${type === 'root' ? 'ROOT' : 'COMPOUND'}</span>`;
    }
    function previewStateBadge(state) {
      const st = state || 'draft';
      if (st === 'needs_review' || st === 'rejected') return badge(st);
      return '';
    }
    function hasMeaning(item) {
      return Boolean(item?.meaning?.trim());
    }
    /** Search haystack for lab roots — matches Dictionary scope (aliases, gloss, concept id). */
    function labSoundSearchHay(s) {
      return [
        s.spelling,
        s.meaning,
        s.legacy_label,
        s.gloss,
        s.concept_id,
        ...(s.aliases ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
    }
    /** Search haystack for lab compounds — matches Dictionary scope. */
    function labCompoundSearchHay(c) {
      return [
        c.spelling,
        c.meaning,
        c.gloss,
        c.concept_id,
        ...(c.aliases ?? []),
        c.composition_readable,
        c.generator_hint,
        ...(c.parts ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
    }
    function pickableRoots(query, { omit = [], showUnnamed = false } = {}) {
      const q = (query ?? '').trim().toLowerCase();
      const skip = new Set(omit);
      return STATE.lab.sounds.filter(s => s.state !== 'rejected' && !skip.has(s.spelling))
        .filter(s => showUnnamed || hasMeaning(s))
        .filter(s => !q || labSoundSearchHay(s).includes(q))
        .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
    }
    function pickableWords(query, { omitIds = [], showUnnamed = false } = {}) {
      const q = (query ?? '').trim().toLowerCase();
      const skip = new Set(omitIds);
      let list = userWords().filter(c => !skip.has(c.id));
      if (STATE.showUnapprovedWords) {
        list = [...list, ...generatedLabWords().filter(c => !skip.has(c.id))];
      }
      return list
        .filter(c => showUnnamed || hasMeaning(c))
        .filter(c => !q || labCompoundSearchHay(c).includes(q))
        .sort((a, b) => (a.meaning || a.spelling).localeCompare(b.meaning || b.spelling));
    }
    function wordCellBodyHtml(c) {
      const speakParts = c.components?.length ? composerFlatSpellings(c.components) : (c.parts ?? [c.spelling]);
      const glyphs = STATE.rules ? romanToFonoraScript(speakParts, STATE.rules).phrase : '';
      return `${typeBadge('word')}
          <span class="sp">${escapeHtml(c.spelling)}</span>
          ${glyphs ? `<span class="root-glyphs symbol-text">${escapeHtml(glyphs)}</span>` : ''}
          <span class="mn ${c.meaning ? '' : 'unnamed'}">${escapeHtml(c.meaning || 'unnamed')}</span>`;
    }
    function rootPickerWithBadge(sounds) {
      return sounds.length ? sounds.map(s => pickerCellHtml({
        spelling: s.spelling,
        meaning: pickerMeaningForSound(s),
        type: 'root',
        attrs: { 'data-add-root': s.spelling },
        write: true,
      })).join('')
        : '<p class="empty" style="grid-column:1/-1">No match.</p>';
    }
    function wordPickerMarkup(words) {
      return words.length ? words.map(c => {
        const speakParts = c.components?.length ? composerFlatSpellings(c.components) : (c.parts ?? [c.spelling]);
        const glyphs = STATE.rules ? romanToFonoraScript(speakParts, STATE.rules).phrase : '';
        return pickerCellHtml({
          spelling: c.spelling,
          meaning: pickerMeaningForCompound(c),
          glyphs,
          type: 'word',
          attrs: { 'data-add-word': c.id },
          write: true,
        });
      }).join('')
        : '<p class="empty" style="grid-column:1/-1">No words match.</p>';
    }

    async function fetchHealth({ force = false } = {}) {
      const key = STATE.lab?.updated_at ?? null;
      if (!force && STATE.health && key && STATE.healthKey === key) return STATE.health;
      const h = await api('/api/fonoran/lab/health');
      STATE.health = h;
      STATE.healthKey = key ?? h.bucket_updated_at ?? null;
      return h;
    }

    async function load(opts = {}) {
      try {
        await ensureRules();
        STATE.health = null;
        STATE.healthKey = null;
        STATE.lexicon = null;
        const bootstrap = await api('/api/fonoran/bootstrap');
        STATE.lab = bootstrap.lab;
        STATE.lexicon = bootstrap.lexicon ?? null;
        if (bootstrap.health) {
          STATE.health = bootstrap.health;
          STATE.healthKey = bootstrap.lab?.updated_at ?? bootstrap.health.bucket_updated_at ?? null;
        }
        $('load-error').hidden = true;
        setFonoranUndoDisabled(!STATE.lab.can_undo || !canWrite());
        if (!opts.skipRender) renderActivePage();
      } catch { $('load-error').hidden = false; }
    }

    function renderActivePage() {
      const labOptional = new Set(['home', 'grammar', 'translator', 'concepts', 'gaps']);
      if (!labOptional.has(STATE.page) && !STATE.lab) return;
      if (STATE.page === 'home') {
        wireLander();
        renderLanderShowcase();
        renderLanderHealth();
      }
      else if (STATE.page === 'create') renderWordComposer();
      else if (STATE.page === 'review') renderUnifiedReview();
      else if (STATE.page === 'concepts') renderConceptEditor();
      else if (STATE.page === 'roots') renderRoots();
      else if (STATE.page === 'dictionary') renderDictionary();
      else if (STATE.page === 'grammar') renderGrammar();
      else if (STATE.page === 'translator') renderTranslator();
      else if (STATE.page === 'health') renderHealth();
      else if (STATE.page === 'gaps') void renderGaps().catch((err) => console.error('renderGaps failed:', err));
      else if (STATE.page === 'progress') renderProgress();
      else if (STATE.page === 'advanced') renderAdvanced();
      applyWriteAccessUI();
    }

    function wireLander() {
      document.querySelectorAll('[data-goto-page]').forEach((el) => {
        if (el.dataset.landerWired) return;
        el.dataset.landerWired = '1';
        el.addEventListener('click', () => switchPage(el.dataset.gotoPage));
      });
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

    function healthMetricTitle(key) {
      return HEALTH_SECONDARY_METRICS.find(m => m.key === key)?.title ?? key;
    }

    function buildHealthMetricsHtml(metrics, { compact = false } = {}) {
      return (metrics ?? []).map(m => `
        <div class="lander-health__metric">
          <span class="lander-health__metric-val">${escapeHtml(String(m.value))}${m.suffix ?? ''}</span>
          <span class="lander-health__metric-label">${escapeHtml(healthMetricTitle(m.key))}</span>
          ${compact ? '' : `<p class="lander-health__metric-note">${escapeHtml(m.explain ?? '')}</p>`}
        </div>`).join('');
    }

    function buildHealthMetricMethodHtml(metrics, scores, colorFn) {
      return HEALTH_SECONDARY_METRICS.map(def => {
        const live = metrics?.find(m => m.key === def.key);
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

    function meaningPickerHtml(prefix) {
      return `<div class="lex-pick sans">
        <label class="lex-label" for="${prefix}-lex-cat">Browse concepts</label>
        <div class="lex-row">
          <select id="${prefix}-lex-cat" aria-label="Domain" data-write-input><option value="">All domains</option></select>
          <select id="${prefix}-lex-word" aria-label="Concept" data-write-input><option value="">Pick a concept…</option></select>
        </div>
      </div>`;
    }

    async function ensureLexicon() {
      if (!STATE.lexicon) STATE.lexicon = await api('/api/fonoran/lexicon');
      return STATE.lexicon;
    }

    function conceptList() {
      return STATE.lexicon?.concepts ?? [];
    }

    /** First clause of a concept phrase for compact picker display. */
    function pickerMeaningShort(phrase) {
      if (!phrase || phrase === '(unnamed)') return 'unnamed';
      return String(phrase).split(';')[0].trim() || 'unnamed';
    }

    /** Canonical concept phrase for a lab root (not the lab meaning label). */
    function pickerMeaningForSound(s) {
      const concept = conceptForLabItem(s);
      if (concept?.concept) return pickerMeaningShort(concept.concept);
      return pickerMeaningShort(s.meaning);
    }

    /** Display label for a compound in pickers (word gloss, not primitive concept). */
    function pickerMeaningForCompound(c) {
      return pickerMeaningShort(c.meaning);
    }

    /** Full concept phrase for detail/preview panels (not picker shorthand). */
    function previewDetailMeaning(focus, kind = 'word') {
      if (kind === 'root' && focus?.spelling) {
        const sound = STATE.lab?.sounds?.find(s => s.spelling === focus.spelling);
        const concept = sound ? conceptForLabItem(sound) : null;
        if (concept?.concept) return concept.concept;
      }
      return focus?.meaning ?? '';
    }

    function populateLexCategories(selectEl) {
      if (!selectEl || !STATE.lexicon) return;
      const cur = selectEl.value;
      selectEl.innerHTML = '<option value="">All domains</option>'
        + STATE.lexicon.categories.map(c => `<option value="${escapeHtml(c)}"${c === cur ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    }

    function populateLexWords(selectEl, category = '') {
      if (!selectEl || !STATE.lexicon) return;
      const cur = selectEl.value;
      const concepts = category
        ? conceptList().filter(c => c.domain === category)
        : conceptList();
      selectEl.innerHTML = '<option value="">Pick a concept…</option>'
        + concepts.map(c => {
          const label = c.concept.length > 48 ? `${c.concept.slice(0, 45)}…` : c.concept;
          return `<option value="${escapeHtml(c.id)}" title="${escapeHtml(c.concept)}"${c.id === cur ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
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
        if (!word.value) return;
        const concept = conceptList().find(c => c.id === word.value);
        if (concept) {
          inp.value = concept.concept;
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

    function generatedLabWords() {
      return STATE.lab.compounds.filter(c => c.generator_hint && c.state !== 'rejected');
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
      const editingSpelling = STATE.rootComposerEditingSpelling;
      const exists = valid && STATE.lab?.sounds?.some(s => s.spelling === sp && s.spelling !== editingSpelling);

      if (spellInp && document.activeElement !== spellInp && valid) spellInp.value = sp;

      const card = $('new-root-preview-card');
      const glyphsEl = $('new-root-glyphs');
      const sayEl = $('new-root-say');
      const likeEl = $('new-root-like');
      const invalidEl = $('new-root-invalid');
      const hintEl = $('new-root-hint');
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
      if (hearBtn) hearBtn.disabled = !valid;

      $('root-syl-builder')?.querySelectorAll('.syl-chip[data-piece]').forEach(chip => {
        chip.classList.toggle('picked', STATE.rootDraft[chip.dataset.piece] === (chip.dataset.val ?? ''));
      });
      syncRootComposerControls();
    }

    function syncRootComposerControls() {
      const editingSpelling = STATE.rootComposerEditingSpelling;
      const sp = rootDraftSpelling();
      const valid = isValidSyllable(sp);
      const exists = valid && STATE.lab?.sounds?.some(s => s.spelling === sp && s.spelling !== editingSpelling);
      setWriteButton($('new-root-save'), !valid || exists);
      const saveBtn = $('new-root-save');
      if (saveBtn) saveBtn.textContent = editingSpelling ? 'Save changes' : 'Add root';
      const cancelBtn = $('new-root-cancel');
      if (cancelBtn) cancelBtn.hidden = !STATE.rootComposerReturnPage;
      const intro = $('roots-intro');
      if (intro) {
        intro.textContent = editingSpelling
          ? 'Editing an existing root — adjust the syllable or meaning, then save.'
          : 'Create primitive syllables and browse every root in the language.';
      }
      const meaning = $('new-root-meaning')?.value ?? '';
      renderEditDupe('sound', editingSpelling ?? sp, meaning, 'new-root');
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

    function pickerGlyphsForSpelling(spelling, { kind = 'root', compoundId = null } = {}) {
      if (!STATE.rules || !spelling) return '';
      if (kind === 'root') return romanToFonoraScript([spelling], STATE.rules).phrase;
      const compound = compoundId ? STATE.lab?.compounds.find(c => c.id === compoundId) : null;
      const parts = compound ? compoundSpeakParts(compound) : [spelling];
      return romanToFonoraScript(parts, STATE.rules).phrase;
    }

    function pickerCellHtml({
      spelling,
      meaning,
      glyphs = null,
      type = 'root',
      showTypeBadge = false,
      meta = '',
      selected = false,
      extraClasses = '',
      attrs = {},
      write = false,
    }) {
      const compoundId = attrs['data-id'] ?? null;
      const glyphStr = glyphs ?? pickerGlyphsForSpelling(spelling, {
        kind: type === 'word' ? 'word' : 'root',
        compoundId,
      });
      const displayMeaning = meaning === '(unnamed)' ? 'unnamed' : (meaning || 'unnamed');
      const unnamed = !meaning || meaning === '(unnamed)' || displayMeaning === 'unnamed';
      const attrParts = Object.entries(attrs)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`);
      const writeAttr = write ? ' data-write' : '';
      const classNames = ['root-cell', extraClasses, selected ? 'is-selected' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${classNames}" ${attrParts.join(' ')}${writeAttr}>
        ${showTypeBadge ? typeBadge(type) : ''}
        <span class="sp">${escapeHtml(spelling)}</span>
        ${glyphStr ? `<span class="root-glyphs symbol-text" aria-hidden="true">${escapeHtml(glyphStr)}</span>` : ''}
        <span class="mn${unnamed ? ' unnamed' : ''}">${escapeHtml(displayMeaning)}</span>
        ${meta ? `<span class="picker-cell__meta">${meta}</span>` : ''}
      </button>`;
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
          <div id="new-root-dupe"></div>
          <div class="actions" style="margin-top:0.7rem">
            <button type="button" class="btn btn-primary" id="new-root-save" disabled data-write>Add root</button>
            <button type="button" class="btn" id="new-root-cancel" hidden data-write>Cancel</button>
          </div>
        </div>`;
    }

    function wireRootsCreate() {
      const spellInp = $('new-root-spelling');
      const meaningInp = $('new-root-meaning');
      wireRootCreatePanel();
      wireMeaningPicker('new-root', 'new-root-meaning');

      if (STATE.rootComposerPendingFields) {
        if (meaningInp) meaningInp.value = STATE.rootComposerPendingFields.meaning;
        STATE.rootComposerPendingFields = null;
      }

      updateRootCreatePreview();
      meaningInp?.addEventListener('input', () => syncRootComposerControls());
      meaningInp?.addEventListener('keydown', e => { if (e.key === 'Enter') $('new-root-save').click(); });
      $('new-root-cancel')?.addEventListener('click', () => {
        const returnPage = STATE.rootComposerReturnPage;
        clearRootComposer();
        if (returnPage === 'review') switchPage('review');
      });
      $('new-root-save')?.addEventListener('click', async () => {
        const spelling = rootDraftSpelling();
        const meaning = meaningInp.value.trim();
        if (!isValidSyllable(spelling)) { toast('Pick a valid syllable first.'); return; }
        const editingSpelling = STATE.rootComposerEditingSpelling;
        const returnPage = STATE.rootComposerReturnPage;
        try {
          if (editingSpelling) {
            const existing = STATE.lab.sounds.find(s => s.spelling === editingSpelling);
            const spellingChanged = spelling !== editingSpelling;
            if (spellingChanged) {
              await api(`/api/fonoran/lab/sounds/${encodeURIComponent(editingSpelling)}`, {
                method: 'PATCH',
                body: JSON.stringify({ spelling, meaning: meaning || undefined }),
              });
              if (returnPage === 'review') {
                STATE.reviewSelection = { type: 'sound', ref: spelling };
              }
            } else {
              const changed = meaning !== (existing?.meaning ?? '');
              await api(`/api/fonoran/lab/sounds/${encodeURIComponent(editingSpelling)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  meaning: meaning || undefined,
                  state: changed && existing?.meaning ? 'revised' : undefined,
                }),
              });
            }
            toast(`Saved ${spelling}`);
          } else {
            const res = await api('/api/fonoran/lab/sounds', { method: 'POST', body: JSON.stringify({ spelling, meaning: meaning || undefined }) });
            toast(`Added root ${res.spelling}`);
          }
          clearRootComposer();
          await load({ skipRender: true });
          if (returnPage === 'review') {
            switchPage('review');
          } else {
            renderRoots();
          }
        } catch (e) { toast(e.message); }
      });
    }

    function openRootInCreator(s, { returnPage = null } = {}) {
      STATE.rootComposerEditingSpelling = s.spelling;
      STATE.rootComposerReturnPage = returnPage;
      syncRootDraftFromSpelling(s.spelling);
      STATE.rootComposerPendingFields = { meaning: s.meaning ?? '' };
      switchPage('roots');
    }

    function clearRootComposer({ keepReturnPage = false } = {}) {
      STATE.rootDraft = { onset: '', vowel: '', coda: '' };
      if (!keepReturnPage) STATE.rootComposerReturnPage = null;
      STATE.rootComposerEditingSpelling = null;
      STATE.rootComposerPendingFields = null;
      if ($('new-root-spelling')) $('new-root-spelling').value = '';
      if ($('new-root-meaning')) $('new-root-meaning').value = '';
      syncRootComposerControls();
    }

    function renderRoots() {
      if (!STATE.lab || !$('roots-workspace')) return;
      ensureSplitStickyObserver();
      const preservedMeaning = $('new-root-meaning')?.value;
      renderRootsSoundPicker();
      $('roots-workspace').innerHTML = renderRootsCreateHtml();
      wireRootsCreate();
      if (preservedMeaning != null && $('new-root-meaning') && !STATE.rootComposerPendingFields) {
        $('new-root-meaning').value = preservedMeaning;
      }
      syncRootComposerControls();
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    function composerFromCompound(c) {
      return (c.components ?? (c.parts ?? []).map(p => ({ type: 'root', ref: p, spelling: p }))).map((comp) => {
        if (comp.type === 'word') {
          const w = STATE.lab?.compounds?.find(x => x.id === comp.ref);
          return {
            ...comp,
            spelling: w?.spelling ?? comp.spelling ?? comp.ref.replace(/^cmp-/, ''),
            meaning: w?.meaning ?? comp.meaning,
          };
        }
        return { ...comp, spelling: comp.spelling || comp.ref };
      });
    }

    function openWordInCreator(c, { returnPage = null } = {}) {
      STATE.wordComposerEditingId = c.id;
      STATE.wordComposerReturnPage = returnPage;
      STATE.wordComposer = composerFromCompound(c);
      STATE.wordComposerPendingFields = {
        meaning: c.meaning ?? '',
        aliases: (c.aliases ?? []).join('\n'),
      };
      switchPage('create');
    }

    function clearWordComposer({ keepReturnPage = false } = {}) {
      STATE.wordComposer = [];
      if (!keepReturnPage) STATE.wordComposerReturnPage = null;
      STATE.wordComposerEditingId = null;
      STATE.wordComposerPendingFields = null;
      if ($('wc-meaning')) $('wc-meaning').value = '';
      if ($('wc-aliases')) $('wc-aliases').value = '';
      renderWordComposer();
    }

    function renderWordEditorRecipe(prefix, editingId, recipe) {
      const spelling = resolveComposerSpelling(recipe);
      const speakParts = composerFlatSpellings(recipe);
      const pickEl = $(`${prefix}-recipe-pick`);
      if (pickEl) {
        pickEl.innerHTML = recipe.length
          ? recipe.map((comp, i) => `<span class="tok" data-idx="${i}" data-write>${typeBadge(comp.type)} <span class="mono">${escapeHtml(comp.spelling || comp.ref)}</span> = ${escapeHtml(compDisplayLabel(comp))} ×</span>`).join('')
          : '<span class="sans" style="color:var(--muted);font-size:0.84rem">Add at least 2 components from the picker…</span>';
        pickEl.querySelectorAll('.tok').forEach(t => t.addEventListener('click', () => {
          recipe.splice(Number(t.dataset.idx), 1);
          renderWordEditorRecipe(prefix, editingId, recipe);
          if (prefix === 'wc') syncWordComposerControls();
        }));
      }
      const live = $(`${prefix}-live-pron`);
      if (live) {
        if (recipe.length) {
          const focus = focusFromComposer(recipe, $(`${prefix}-meaning`)?.value.trim());
          live.innerHTML = buildWordPreviewHtml(focus, {
            kind: 'word',
            speakParts,
            showBadges: false,
            showBuiltFrom: false,
            showHear: true,
            hearId: 'wc-hear',
            unnamedStyle: 'review',
          });
        } else {
          live.innerHTML = '<p class="sans word-preview__empty">Tap roots or approved words on the left to start building.</p>';
        }
      }
      const hearBtn = $(`${prefix}-hear`);
      if (hearBtn) {
        const canListen = composerCanListen(recipe);
        hearBtn.disabled = !canListen;
        hearBtn.onclick = () => speakNeural(speakParts);
        hearBtn.closest('.word-preview__sound-actions')?.toggleAttribute('hidden', !canListen);
      }
      if (prefix === 'wc') syncWordComposerControls();
    }

    /* ---------- WORD COMPOSER + REVIEW ---------- */
    function renderWordComposer() {
      if (!STATE.lab) return;
      ensureSplitStickyObserver();
      const recipe = STATE.wordComposer;
      const editingId = STATE.wordComposerEditingId;

      if (STATE.wordComposerPendingFields) {
        if ($('wc-meaning')) $('wc-meaning').value = STATE.wordComposerPendingFields.meaning;
        if ($('wc-aliases')) $('wc-aliases').value = STATE.wordComposerPendingFields.aliases;
        STATE.wordComposerPendingFields = null;
      }

      renderWordEditorRecipe('wc', editingId, recipe);

      const meaning = $('wc-meaning')?.value.trim() || '';
      renderEditDupe('compound', editingId ?? '', meaning, 'wc');

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
      const omitIds = [...recipe.filter(c => c.type === 'word').map(c => c.ref), editingId].filter(Boolean);
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

    function buildMermaidPanZoomHtml(mermaidSource, { wheelZoom = true } = {}) {
      if (!mermaidSource) return '';
      const wheelAttr = wheelZoom ? '' : ' data-wheel-zoom="false"';
      return `<div class="mermaid-pan-zoom"${wheelAttr}>
        <div class="mermaid-pan-zoom__toolbar sans" aria-label="Graph zoom controls">
          <button type="button" class="btn mermaid-pan-zoom__btn" data-mermaid-zoom-out aria-label="Zoom out">−</button>
          <button type="button" class="btn mermaid-pan-zoom__btn" data-mermaid-zoom-reset aria-label="Reset view">Fit</button>
          <button type="button" class="btn mermaid-pan-zoom__btn" data-mermaid-zoom-in aria-label="Zoom in">+</button>
        </div>
        <div class="mermaid-pan-zoom__viewport">
          <div class="mermaid-pan-zoom__stage">
            <div class="mermaid-wrap"><div class="mermaid">${escapeHtml(mermaidSource)}</div></div>
          </div>
        </div>
      </div>`;
    }

    function initMermaidPanZoom(panZoomEl) {
      if (!panZoomEl || panZoomEl.dataset.panZoomReady === '1') return;
      const viewport = panZoomEl.querySelector('.mermaid-pan-zoom__viewport');
      const stage = panZoomEl.querySelector('.mermaid-pan-zoom__stage');
      const svg = panZoomEl.querySelector('svg');
      if (!viewport || !stage || !svg) return;

      svg.style.maxWidth = 'none';
      svg.style.display = 'block';

      let scale = 1;
      let panX = 0;
      let panY = 0;
      let fitAttempts = 0;
      const minScale = 0.25;
      const maxScale = 5;
      const zoomStep = 1.2;
      const loadZoomOutSteps = 2;

      const apply = () => {
        stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      };

      const boxSize = (box) => box && box.width > 0 && box.height > 0;

      const contentBox = () => {
        const vb = svg.viewBox?.baseVal;
        if (vb?.width > 0 && vb?.height > 0) {
          return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
        }
        const bb = svg.getBBox();
        return bb;
      };

      const normalizeSvgSize = () => {
        const box = contentBox();
        if (!boxSize(box)) return false;
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = `${box.width}px`;
        svg.style.height = `${box.height}px`;
        svg.style.maxWidth = 'none';
        return true;
      };

      const unionBox = (a, b) => {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        return {
          x,
          y,
          width: Math.max(a.x + a.width, b.x + b.width) - x,
          height: Math.max(a.y + a.height, b.y + b.height) - y,
        };
      };

      const transformedBBox = (el) => {
        const bb = el.getBBox();
        const ctm = el.getCTM?.();
        if (!ctm) return bb;
        const corners = [
          [bb.x, bb.y],
          [bb.x + bb.width, bb.y],
          [bb.x + bb.width, bb.y + bb.height],
          [bb.x, bb.y + bb.height],
        ];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [x, y] of corners) {
          const pt = svg.createSVGPoint();
          pt.x = x;
          pt.y = y;
          const t = pt.matrixTransform(ctm);
          minX = Math.min(minX, t.x);
          minY = Math.min(minY, t.y);
          maxX = Math.max(maxX, t.x);
          maxY = Math.max(maxY, t.y);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      };

      const focusEl = () => svg.querySelector('g.node.focusNode')
        ?? svg.querySelector('g.focusNode')
        ?? svg.querySelector('g.node');

      /** Focus word plus immediate neighbors (roots above, direct children). */
      const focusClusterBox = () => {
        const focus = focusEl();
        if (!focus) return contentBox();
        const focusRoot = transformedBBox(focus);
        const fx = focusRoot.x + focusRoot.width / 2;
        const fy = focusRoot.y + focusRoot.height / 2;
        let cluster = { ...focusRoot };
        const xReach = Math.max(focusRoot.width * 5, 200);
        const yReach = Math.max(focusRoot.height * 6, 220);
        svg.querySelectorAll('g.node').forEach((n) => {
          if (n === focus) return;
          const b = transformedBBox(n);
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          if (Math.abs(cx - fx) <= xReach && Math.abs(cy - fy) <= yReach) {
            cluster = unionBox(cluster, b);
          }
        });
        return cluster;
      };

      const centerOn = (box, s = scale) => {
        const vp = viewport.getBoundingClientRect();
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        panX = vp.width / 2 - cx * s;
        panY = vp.height / 2 - cy * s;
      };

      const reveal = () => {
        panZoomEl.dataset.panZoomReady = '1';
        panZoomEl.classList.remove('is-loading');
        panZoomEl.classList.add('is-ready');
      };

      const fitAll = () => {
        const vp = viewport.getBoundingClientRect();
        if (!vp.width || !vp.height || !normalizeSvgSize()) return;
        const box = contentBox();
        if (!boxSize(box)) return;
        scale = Math.min(
          vp.width / (box.width * 1.14),
          vp.height / (box.height * 1.14),
          2,
        );
        scale = Math.max(scale, minScale);
        centerOn(box, scale);
        apply();
      };

      const fitReadable = () => {
        const vp = viewport.getBoundingClientRect();
        if (!vp.width || !vp.height) {
          if (fitAttempts++ < 40) requestAnimationFrame(fitReadable);
          else { scale = 1; panX = 16; panY = 16; apply(); reveal(); }
          return;
        }
        if (!normalizeSvgSize()) {
          if (fitAttempts++ < 40) requestAnimationFrame(fitReadable);
          else { scale = 1; panX = 16; panY = 16; apply(); reveal(); }
          return;
        }
        const box = contentBox();
        if (!boxSize(box)) {
          if (fitAttempts++ < 40) requestAnimationFrame(fitReadable);
          else { scale = 1; panX = 16; panY = 16; apply(); reveal(); }
          return;
        }
        fitAttempts = 0;
        const cluster = focusClusterBox();
        const focusRoot = focusEl() ? transformedBBox(focusEl()) : cluster;
        const fullFitScale = Math.min(
          vp.width / (box.width * 1.14),
          vp.height / (box.height * 1.14),
          2,
        );
        const clusterFitScale = Math.min(
          vp.width / (cluster.width * 1.18),
          vp.height / (cluster.height * 1.18),
          2,
        );
        const maxLoadZoom = Math.min(vp.width / 140, vp.height / 100, 1.8);
        const isLargeTree = fullFitScale < maxLoadZoom * 0.95;
        scale = isLargeTree ? maxLoadZoom : clusterFitScale;
        scale = Math.min(Math.max(scale, minScale), maxScale);
        scale = Math.max(scale / zoomStep ** loadZoomOutSteps, minScale);
        centerOn(focusRoot, scale);
        apply();
        reveal();
      };

      const scheduleFit = () => {
        fitAttempts = 0;
        panZoomEl.classList.remove('is-ready');
        requestAnimationFrame(() => requestAnimationFrame(fitReadable));
        if (panZoomEl.closest('.sheet')) {
          setTimeout(fitReadable, 320);
        }
      };

      const zoomBy = (factor, clientX, clientY) => {
        const rect = viewport.getBoundingClientRect();
        const mx = clientX != null ? clientX - rect.left : rect.width / 2;
        const my = clientY != null ? clientY - rect.top : rect.height / 2;
        const next = Math.min(maxScale, Math.max(minScale, scale * factor));
        panX = mx - (mx - panX) * (next / scale);
        panY = my - (my - panY) * (next / scale);
        scale = next;
        apply();
      };

      panZoomEl.querySelector('[data-mermaid-zoom-in]')?.addEventListener('click', (e) => {
        e.preventDefault();
        zoomBy(1.2);
      });
      panZoomEl.querySelector('[data-mermaid-zoom-out]')?.addEventListener('click', (e) => {
        e.preventDefault();
        zoomBy(1 / zoomStep);
      });
      panZoomEl.querySelector('[data-mermaid-zoom-reset]')?.addEventListener('click', (e) => {
        e.preventDefault();
        fitAll();
      });

      if (panZoomEl.dataset.wheelZoom !== 'false') {
        viewport.addEventListener('wheel', (e) => {
          e.preventDefault();
          e.stopPropagation();
          zoomBy(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
        }, { passive: false, capture: true });
      }

      let dragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let dragPanX = 0;
      let dragPanY = 0;
      let pointerId = null;

      const onPointerDown = (e) => {
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('.graph-node-clickable')) return;
        dragging = true;
        pointerId = e.pointerId;
        viewport.setPointerCapture(pointerId);
        viewport.classList.add('is-dragging');
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragPanX = panX;
        dragPanY = panY;
        e.preventDefault();
      };
      const onPointerMove = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        panX = dragPanX + (e.clientX - dragStartX);
        panY = dragPanY + (e.clientY - dragStartY);
        apply();
        e.preventDefault();
      };
      const endDrag = (e) => {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        pointerId = null;
        viewport.classList.remove('is-dragging');
        viewport.releasePointerCapture(e.pointerId);
      };
      viewport.addEventListener('pointerdown', onPointerDown, { capture: true });
      viewport.addEventListener('pointermove', onPointerMove);
      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);

      scheduleFit();
    }

    async function renderExplorerMermaidIn(rootEl, mermaidSource, graphNodes, onNavigate) {
      if (!window.mermaid || !mermaidSource || !rootEl) return;
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'ui-monospace, Menlo, monospace',
          lineColor: '#a89f95',
          clusterBkg: '#faf8f5',
          clusterBorder: '#e8e2da',
        },
        securityLevel: 'loose',
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const nodes = rootEl.querySelectorAll('.mermaid');
      try {
        await window.mermaid.run({ nodes });
      } catch (err) {
        console.error('Mermaid render failed:', err);
        rootEl.querySelectorAll('.mermaid-wrap').forEach((wrap) => {
          wrap.innerHTML = '<p class="graph-hint sans" style="padding:1rem;color:var(--muted)">Could not render word tree.</p>';
        });
        return;
      }
      rootEl.querySelectorAll('.mermaid-pan-zoom').forEach(initMermaidPanZoom);
      rootEl.querySelectorAll('.mermaid-pan-zoom svg, .mermaid-wrap svg').forEach((svg) => {
        bindMermaidGraphClicks(svg, graphNodes, onNavigate);
      });
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

    function ddaMethodLabel(dda) {
      if (!dda) return null;
      const sources = dda.sources ?? [];
      if (sources.includes('compound_blend')) return 'blended from parts';
      if (sources.includes('meaning')) return 'matched by meaning';
      if (sources.includes('meaning_partial')) return 'partial meaning match';
      if (sources.includes('phonetic')) return 'inferred from sound';
      if (dda.status === 'confirmed') return 'confirmed';
      return null;
    }

    function buildDdaMermaidSource(spelling, meaning, dda, components) {
      if (!dda?.D && !dda?.M && !dda?.A) return null;
      const esc = s => (s ?? '').replace(/"/g, '#quot;').replace(/[[\]{}|]/g, '').slice(0, 36);
      const wordLabel = meaning ? `${esc(spelling)} · ${esc(meaning)}` : esc(spelling || '?');
      const lines = ['graph TD'];
      const parts = (components ?? []).map((c, i) => {
        const sp = c.type === 'root'
          ? c.ref
          : (STATE.lab.compounds.find(x => x.id === c.ref)?.spelling ?? c.ref);
        const m = c.type === 'root'
          ? soundMeaning(c.ref)
          : (STATE.lab.compounds.find(x => x.id === c.ref)?.meaning ?? '');
        const label = m ? `${esc(sp)} · ${esc(m)}` : esc(sp);
        lines.push(`  P${i}["${label}"]`);
        return `P${i}`;
      });
      if (parts.length > 1) {
        lines.push(`  ${parts.join(' & ')} --> Word["${wordLabel}"]`);
      } else if (parts.length === 1) {
        lines.push(`  ${parts[0]} --> Word["${wordLabel}"]`);
      } else {
        lines.push(`  Word["${wordLabel}"]`);
      }
      lines.push(`  Word --> D["Depth: ${esc(dda.D ?? '?')}"]`);
      lines.push(`  Word --> M["Mode: ${esc(dda.M ?? '?')}"]`);
      lines.push(`  Word --> A["Aspect: ${esc(dda.A ?? '?')}"]`);
      lines.push('  classDef coord fill:#ede7f6,stroke:#c5b8f0,color:#4527a0');
      if (parts.length) {
        lines.push('  classDef part fill:#e8f5e9,stroke:#a5d6a7,color:#1b5e20');
        lines.push(`  class ${parts.join(',')} part`);
      }
      lines.push('  class D,M,A coord');
      return lines.join('\n');
    }

    function componentMeta(c) {
      const w = c.type === 'word' ? STATE.lab.compounds.find(x => x.id === c.ref) : null;
      return {
        spelling: c.type === 'root' ? c.ref : (w?.spelling ?? c.ref),
        meaning: c.type === 'root' ? soundMeaning(c.ref) : (w?.meaning ?? '?'),
      };
    }

    function buildBuiltFromComposeHtml(f, { removable = false, hideTypeBadge = false } = {}) {
      const components = f.components ?? [];
      if (!components.length) return '';
      return components.map((c, i) => {
        const { spelling, meaning } = componentMeta(c);
        const op = i > 0 ? '<span class="word-compose__op">+</span>' : '';
        const removeAttrs = removable
          ? ` class="word-compose__piece word-compose__piece--removable" data-remove-idx="${i}" data-write title="Remove ${escapeHtml(spelling)}"`
          : ' class="word-compose__piece"';
        const head = hideTypeBadge
          ? `<span class="mono">${escapeHtml(spelling)}</span>`
          : `${typeBadge(c.type)} <span class="mono">${escapeHtml(spelling)}</span>`;
        return `${op}<div${removeAttrs}>
          <div class="word-compose__piece-row">
            <span class="word-compose__piece-head">${head}</span>
            ${removable ? '<span class="word-compose__remove" aria-hidden="true">×</span>' : ''}
          </div>
          <span class="word-compose__piece-meaning">${escapeHtml(meaning)}</span>
        </div>`;
      }).join('');
    }

    function buildBuiltFromSectionHtml(f, { removable = false, wrapSection = true, hideTypeBadge = false } = {}) {
      const components = f.components ?? [];
      const compose = buildBuiltFromComposeHtml(f, { removable, hideTypeBadge });
      if (!components.length) {
        const empty = '<div class="root-review__reason sans">Primitive root. Not built from other pieces.</div>';
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

    function previewIpaForFocus(focus) {
      const sp = (focus.spelling ?? '').trim().toLowerCase();
      return sp && isValidSyllable(sp) ? romanToIpa(sp) : '';
    }

    function buildWordPreviewWordmarkHtml(focus, pron) {
      const hasSpelling = Boolean(focus.spelling);
      if (!hasSpelling && !pron?.script) return '';
      return `<div class="word-preview__wordmark">
        ${hasSpelling ? `<span class="word-preview__spelling sp">${escapeHtml(focus.spelling)}</span>` : ''}
        ${pron?.script ? `<span class="word-preview__script root-glyphs fonora-script symbol-text" aria-hidden="true">${escapeHtml(pron.script)}</span>` : ''}
      </div>`;
    }

    function buildWordPreviewSoundBlockHtml(focus, pron, {
      showHear = false,
      hearId = '',
      meaningHtml = '',
      meaningClass = '',
      contextHtml = '',
    } = {}) {
      const hasSpelling = Boolean(focus.spelling);
      const ipa = pron ? previewIpaForFocus(focus) : '';
      const hearBtn = showHear && hasSpelling
        ? `<div class="word-preview__sound-actions">
            <button type="button" class="hear-min word-preview__hear"${hearId ? ` id="${hearId}"` : ''} aria-label="Listen to ${escapeHtml(focus.spelling)}">▶ Listen</button>
          </div>`
        : '';
      const hasPronContent = Boolean(pron && (pron.sayLine || pron.englishLine || ipa));
      const pronDetails = hasPronContent
        ? (() => {
          const metaParts = [];
          if (ipa) metaParts.push(`<span class="word-preview__ipa mono">${escapeHtml(ipa)}</span>`);
          if (pron.englishLine) metaParts.push(`<span class="word-preview__like">${escapeHtml(pron.englishLine)}</span>`);
          const metaLine = metaParts.length
            ? `<p class="word-preview__pron-meta">${metaParts.join('<span class="word-preview__meta-sep" aria-hidden="true"> | </span>')}</p>`
            : '';
          return `<div class="word-preview__pron-details">
            ${pron.sayLine ? `<strong class="word-preview__phonetic-key">${escapeHtml(pron.sayLine)}</strong>` : ''}
            ${metaLine}
          </div>`;
        })()
        : '';
      const meaningBlock = meaningHtml
        ? `<p class="word-preview__meaning-line"><span class="review-meaning ${meaningClass}">${meaningHtml}</span></p>`
        : '';
      if (!pronDetails && !hearBtn && !meaningBlock && !contextHtml) return '';
      return `<div class="word-preview__sound-block">
        <div class="word-preview__sound-pron">
          ${pronDetails}
          ${meaningBlock}
          ${contextHtml}
        </div>
        ${hearBtn}
      </div>`;
    }

    function buildWordPreviewHtml(focus, {
      kind = 'word',
      speakParts = null,
      previewNote = '',
      metaExtra = '',
      hearId = '',
      hearRowExtra = '',
      showBadges = true,
      showBuiltFrom = true,
      builtFromRemovable = false,
      builtFromHideBadges = false,
      unnamedStyle = 'default',
      showHear = true,
      footerHtml = '',
      descriptionHtml = '',
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
      const components = focus.components ?? [];
      let inBoxContext = descriptionHtml;
      if (!inBoxContext && showBuiltFrom && kind === 'root' && !components.length) {
        inBoxContext = '<div class="word-preview__context sans">Primitive root. Not built from other pieces.</div>';
      }
      const builtFromHtml = showBuiltFrom && components.length
        ? buildBuiltFromSectionHtml(focus, { removable: builtFromRemovable, hideTypeBadge: builtFromHideBadges })
        : '';
      const wordmarkHtml = buildWordPreviewWordmarkHtml(focus, pron);
      const soundBlockHtml = buildWordPreviewSoundBlockHtml(focus, pron, {
        showHear,
        hearId,
        meaningHtml: hasSpelling ? meaningHtml : '',
        meaningClass,
        contextHtml: inBoxContext,
      });
      const hearHtml = !showHear && hearRowExtra
        ? `<div class="word-preview__hear-row">${hearRowExtra}</div>`
        : '';
      const stateBadgeHtml = showBadges ? previewStateBadge(focus.state || 'draft') : '';
      const badgeParts = [stateBadgeHtml, metaExtra].filter(Boolean).join('');
      const showToolbar = Boolean(badgeParts);

      return `<div class="word-preview">
        <div class="word-preview__card">
          ${showToolbar ? `<div class="word-preview__toolbar">
            <div class="word-preview__badges" aria-label="Word status">${badgeParts}</div>
          </div>` : ''}
          <div class="word-preview__hero">
            ${wordmarkHtml}
            ${soundBlockHtml}
          </div>
          ${hearHtml}
          ${previewNote ? `<p class="sans word-preview__note">${previewNote}</p>` : ''}
          ${builtFromHtml}
          ${footerHtml}
        </div>
      </div>`;
    }

    function buildDdaPanelHtml(wordDda, components, focus = null) {
      if (!wordDda?.D && !wordDda?.M && !wordDda?.A) {
        return `<div class="showcase-dda showcase-dda--empty">
          <h4>Semantic coordinates</h4>
          <p class="sans showcase-dda__empty">Every word carries three semantic coordinates — depth, mode, and aspect — assigned automatically when you build. Run DDA in Advanced to generate them.</p>
        </div>`;
      }
      const axes = [
        { key: 'Depth', val: wordDda.D, hint: 'how abstract or concrete' },
        { key: 'Mode', val: wordDda.M, hint: 'how the concept moves or acts' },
        { key: 'Aspect', val: wordDda.A, hint: 'how it relates to its context' },
      ];
      const axisHtml = axes.map(a => `
        <div class="showcase-dda__axis" title="${escapeHtml(a.hint)}">
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
      const conf = wordDda.confidence != null ? wordDda.confidence : null;
      const confPct = conf != null ? Math.round(conf * 100) : null;
      const isLowConf = conf != null && conf < 0.6;
      const method = ddaMethodLabel(wordDda);
      const statusPillClass = wordDda.status === 'confirmed'
        ? 'showcase-dda__pill showcase-dda__pill--confirmed'
        : wordDda.status === 'stale'
          ? 'showcase-dda__pill showcase-dda__pill--stale'
          : (isLowConf ? 'showcase-dda__pill showcase-dda__pill--low' : 'showcase-dda__pill');
      const methodBadge = method
        ? `<span class="showcase-dda__method">${escapeHtml(method)}</span>`
        : '';
      const statusPill = wordDda.status
        ? `<span class="${statusPillClass}">${escapeHtml(wordDda.status)}</span>`
        : '';
      const confBadge = confPct != null
        ? `<span class="showcase-dda__conf${isLowConf ? ' showcase-dda__conf--low' : ''}">${confPct}%</span>`
        : '';
      const mermaidSrc = focus?.spelling
        ? buildDdaMermaidSource(focus.spelling, focus.meaning, wordDda, components)
        : null;
      const chartHtml = mermaidSrc
        ? `<div class="dda-chart">
            <p class="showcase-dda__blend-label">Semantic relationship</p>
            <div class="mermaid-wrap dda-chart__wrap"><div class="mermaid">${escapeHtml(mermaidSrc)}</div></div>
          </div>`
        : '';
      return `<div class="showcase-dda">
        <h4>Semantic coordinates</h4>
        <p class="showcase-dda__notation">${escapeHtml(ddaNotation(wordDda))}</p>
        <div class="showcase-dda__axes">${axisHtml}</div>
        ${blendRows ? `<div class="showcase-dda__blend"><p class="showcase-dda__blend-label">Blended from</p>${blendRows}</div>` : ''}
        <div class="showcase-dda__footer">${methodBadge}${statusPill}${confBadge}</div>
        ${chartHtml}
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
      const isShowcase = variant === 'showcase';
      const klass = isShowcase ? 'explorer-section showcase-graph' : 'explorer-section';
      const hint = isShowcase
        ? 'Drag to pan · tap a node to explore.'
        : 'Drag to pan · scroll or use +/− to zoom · tap a node to explore.';
      return `<div class="${klass}">
        <h4>Word Tree</h4>
        <p class="sans graph-hint">${hint}</p>
        ${buildMermaidPanZoomHtml(mermaid, { wheelZoom: !isShowcase })}
      </div>`;
    }

    function buildExplorerActionsHtml({ graph = false, dda = true, hasMermaid = false, compact = false } = {}) {
      if (!graph && !dda) return '';
      const ddaLabel = compact ? 'Coordinates' : 'Semantic coordinates';
      const ddaTitle = compact ? 'Semantic coordinates' : '';
      return `<div class="explorer-actions">
        ${graph ? `<button type="button" class="btn" data-open-graph ${hasMermaid ? '' : 'disabled'}>Word Tree</button>` : ''}
        ${dda ? `<button type="button" class="btn" data-open-dda${ddaTitle ? ` title="${ddaTitle}"` : ''}>${ddaLabel}</button>` : ''}
      </div>`;
    }

    function buildShowcaseHtml(data, word = landerShowcaseWord) {
      const f = data.focus;
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
      const kind = explorerKind === 'root' ? 'root' : 'word';
      const displayFocus = { ...f, meaning: previewDetailMeaning(f, kind) };
      const speakParts = wordPreviewSpeakParts(displayFocus, kind);
      const isDictionary = layout === 'dictionary';
      const showInlineGraph = includeGraph && !isDictionary;
      let descriptionHtml = '';
      if (kind === 'root' && f.spelling) {
        const sound = STATE.lab?.sounds?.find(s => s.spelling === f.spelling);
        const concept = sound ? conceptForLabItem(sound) : null;
        if (concept?.reason) {
          descriptionHtml = `<div class="word-preview__context sans">${escapeHtml(concept.reason)}</div>`;
        }
      }

      const actionButtons = (isDictionary || modalActions)
        ? buildExplorerActionsHtml({
          graph: isDictionary || !showInlineGraph,
          dda: true,
          hasMermaid: Boolean(data.mermaid),
          compact: true,
        })
        : '';

      const previewHtml = buildWordPreviewHtml(displayFocus, {
        kind,
        speakParts,
        previewNote: preview ? 'Preview: save the word to explore downstream links. Tap nodes in the graph to jump to saved roots and words.' : '',
        showHear: true,
        descriptionHtml,
      });

      const graphSection = showInlineGraph
        ? buildWordTreeSectionHtml(data.mermaid, { variant: 'default' })
        : '';

      const trailingActions = !isDictionary && actionButtons
        ? `<div class="word-preview-actions">${actionButtons}</div>`
        : '';

      const dictActions = isDictionary && actionButtons
        ? `<div class="word-preview-actions word-preview-actions--explorer">${actionButtons}</div>`
        : '';

      const body = `${previewHtml}${graphSection}${trailingActions}${dictActions}`;

      const html = isDictionary
        ? `<div class="dict-detail-stack word-preview-panel">${body}</div>`
        : body;

      return { html, speakParts };
    }

    async function fetchShowcaseGraph(word) {
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

    async function renderLanderShowcase() {
      const el = $('lander-showcase');
      if (!el || STATE.page !== 'home' || !STATE.lab) return;
      const token = ++landerShowcaseToken;
      landerShowcaseWord = pickLanderShowcaseWord();
      try {
        const data = await fetchShowcaseGraph(landerShowcaseWord);
        if (token !== landerShowcaseToken) return;
        const { html, speakParts } = buildShowcaseHtml(data, landerShowcaseWord);
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

    function buildHealthWarningLi(w) {
      const sevClass = w.severity === 'high' ? 'lander-health__conflict-item--high' : 'lander-health__conflict-item--medium';
      const segDetail = w.segmentations?.length
        ? `<span class="lander-health__conflict-detail">Parses: ${w.segmentations.map(s => escapeHtml(s)).join(' · ')}</span>`
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
        const high = warnings.filter(w => w.severity === 'high');
        const lookalikes = warnings.filter(w => w.type === 'similar_roots');
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
        const rhyming = warnings.filter(w => w.type === 'phonetic_cluster');
        const lookalikes = warnings.filter(w => w.type === 'similar_roots');
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
        const ambiguous = warnings.filter(w => w.type === 'segmentation_ambiguity');
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

    function buildHealthMethodHtml(h) {
      const color = healthScoreColor;
      const methodCards = HEALTH_METHOD.map(m => {
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
      const metricMethods = buildHealthMetricMethodHtml(h.metrics, h.scores, color);
      return `
        <div class="lander-health__method">
          <p class="lander-health__method-lead">Each dimension is recomputed from your live lab bucket whenever you open Health. Scores are heuristic design guides. They measure structural ergonomics, not linguistic "correctness."</p>
          <div class="lander-health__method-grid">${methodCards}</div>
          <div class="lander-health__metrics">${metrics}</div>
          <h4 class="lander-health__method-subhead">Secondary metrics</h4>
          <div class="lander-health__method-grid lander-health__method-grid--secondary">${metricMethods}</div>
          <p class="lander-health__footnote">Warnings include look-alike sounds, prefix overlap, rhyming clusters, segmentation ambiguity, and pronunciation difficulty. Semantic coordinates (DDA) are analysed separately and surface through the explorer and health detail view.</p>
        </div>`;
    }

    function buildLanderHealthHtml(h, { showFullReportButton = false, compact = false } = {}) {
      const core = ['learnability', 'pronounceability', 'memorability', 'parseability'];
      const overall = Math.round(core.reduce((a, k) => a + h.scores[k], 0) / core.length);
      const color = healthScoreColor;
      const scoreCards = h.dimensions.map(d => `
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

      const buttonHtml = showFullReportButton
        ? `<div class="lander-health__actions lander-health__actions--in-panel">
          <button type="button" class="btn btn-primary" id="lander-health-open">View full health report</button>
        </div>`
        : '';

      return `
        <div class="lander-health__summary${compact ? ' lander-health__summary--compact' : ''}">
          <div class="lander-health__overall">
            <div class="lander-health__score-big" style="color:${color(overall)}">${overall}<span class="lander-health__score-of"> / 100</span></div>
            <p class="lander-health__label">${healthOverallLabel(overall)}</p>
            ${warnNote ? `<p class="lander-health__warn-note">${escapeHtml(warnNote)}</p>` : ''}
            <div class="lander-health__metrics lander-health__metrics--summary">${metrics}</div>
            ${buttonHtml}
          </div>
          <div class="lander-health__scores">${scoreCards}</div>
        </div>`;
    }

    async function renderLanderHealth() {
      const el = $('lander-health');
      if (!el || STATE.page !== 'home' || !STATE.lab) return;
      const token = ++landerHealthToken;
      try {
        const h = await fetchHealth();
        if (token !== landerHealthToken) return;
        el.innerHTML = buildLanderHealthHtml(h, { showFullReportButton: true, compact: true });
        $('lander-health-open')?.addEventListener('click', () => switchPage('health'));
      } catch {
        if (token !== landerHealthToken) return;
        el.innerHTML = '<p class="lander-health__error">Could not load health metrics. Start the dev server with <code>npm start</code>.</p>';
      }
    }


    function firstOpenIndex(list) { return list.findIndex(i => isOpen(i.state)); }

    function conceptForLabItem(item) {
      if (!item) return null;
      if (item.concept_id) return conceptList().find(c => c.id === item.concept_id) ?? null;
      const m = item.meaning?.trim().toLowerCase();
      if (!m) return null;
      return conceptList().find(c => c.id === m || c.concept.toLowerCase() === m) ?? null;
    }

    function resolveConceptIdForLabSound(item) {
      return conceptForLabItem(item)?.id ?? item.concept_id ?? null;
    }

    function openConceptInEditor(conceptId, { returnPage = null } = {}) {
      STATE.conceptEditorReturnPage = returnPage;
      STATE.conceptEditorIsNew = false;
      STATE.conceptEditorSelected = conceptId;
      STATE.conceptEditorPendingId = conceptId;
      const c = conceptList().find(x => x.id === conceptId);
      STATE.conceptEditorDraft = c ? conceptEditorDraftFrom(c) : null;
      switchPage('concepts');
    }

    function reviewItemScriptParts(item, isSound) {
      if (isSound) return [item.spelling];
      return compoundSpeakParts(item);
    }

    function buildLabReviewCardHtml(item, { isSound = true } = {}) {
      return buildLabReviewPreviewHtml(item, { isSound });
    }

    function reviewParseInventory() {
      return userSounds().map(s => ({
        root: s.spelling,
        id: s.spelling,
        gloss: s.meaning ?? s.spelling,
      }));
    }

    function compoundReviewPartSpellings(item) {
      if (!item) return [];
      if (item.components?.length) return composerFlatSpellings(item.components);
      if (item.parts?.length) return item.parts.map(p => String(p).toLowerCase());
      return [];
    }

    function compoundReviewRecipeText(item) {
      const readable = item.composition_readable?.trim();
      if (readable) return readable;
      const hint = item.generator_hint?.trim();
      if (!hint) return '';
      return hint.replace(/^curated:\s*/i, '');
    }

    function compoundReviewMetrics(item) {
      const spelling = (item.spelling ?? '').trim().toLowerCase();
      const partSpellings = compoundReviewPartSpellings(item);
      if (!spelling) {
        return { parseScore: 1, pronScore: 1, segmentations: [], partSpellings };
      }
      const segmentations = segmentCompound(spelling, reviewParseInventory());
      const parseScore = segmentations.length === 0 ? 1
        : segmentations.length === 1 ? 5
          : segmentations.length === 2 ? 3
            : 2;
      const pronScore = Math.max(1, Math.min(5, Math.round(pronounceabilityScore(spelling).score / 20)));
      return { parseScore, pronScore, segmentations, partSpellings };
    }

    function compoundReviewBoundaryHtml(partSpellings) {
      if (partSpellings.length < 2) return '';
      const result = checkCompoundBoundary(partSpellings);
      if (result.valid) return '';
      const items = result.violations.map(v =>
        `<li class="root-review__warn root-review__warn--boundary">${escapeHtml(v.reason)}</li>`,
      );
      return `<ul class="root-review__warnings">${items.join('')}</ul>`;
    }

    function compoundReviewSegmentationHtml(metrics) {
      const { parseScore, segmentations } = metrics;
      if (parseScore >= 5) return '';
      if (!segmentations.length) {
        return '<div class="root-review__hint sans">Cannot segment this spelling with the current root inventory.</div>';
      }
      const shown = segmentations.slice(0, 5).map(s => s.join('+')).join(' · ');
      const more = segmentations.length > 5 ? ` (+${segmentations.length - 5} more)` : '';
      return `<ul class="root-review__warnings"><li class="root-review__warn root-review__warn--homophone">Also parses as: <span class="mono">${escapeHtml(shown)}</span>${more}</li></ul>`;
    }

    function buildCompoundReviewScoresHtml(item) {
      const metrics = compoundReviewMetrics(item);
      const { parseScore, pronScore } = metrics;
      const scores = `<div class="root-review__scores">
          ${rootReviewScoreCell('Parseability', parseScore, 5)}
          ${rootReviewScoreCell('Pronounceability', pronScore, 5)}
        </div>`;
      return scores
        + compoundReviewSegmentationHtml(metrics)
        + compoundReviewBoundaryHtml(metrics.partSpellings);
    }

    function priorityClassBadge(pc) {
      if (!pc) return '';
      return `<span class="root-review__chip root-review__chip--${escapeHtml(pc)}">${escapeHtml(pc)}</span>`;
    }

    function suggestedStatusBadge(ss) {
      if (!ss || ss === 'primitive') return '';
      const label = ss === 'compound_candidate' ? 'compound candidate' : ss;
      return `<span class="root-review__chip root-review__chip--${escapeHtml(ss)}">${escapeHtml(label)}</span>`;
    }

    function rootReviewWarningsHtml(c) {
      const collisions = c.collision_warnings ?? [];
      const boundary = c.boundary_warnings ?? [];
      if (!collisions.length && !boundary.length) return '';
      const items = [];
      for (const w of collisions) {
        items.push(`<li class="root-review__warn root-review__warn--${escapeHtml(w.type ?? 'collision')}">${escapeHtml(w.message ?? '')}</li>`);
      }
      for (const b of boundary) {
        items.push(`<li class="root-review__warn root-review__warn--boundary">Compound boundary: ${escapeHtml(b.left)} + ${escapeHtml(b.right)} → doubled ${escapeHtml(b.phoneme)}</li>`);
      }
      return `<ul class="root-review__warnings">${items.join('')}</ul>`;
    }

    function compoundRecipeHintHtml(c) {
      const match = STATE.lab?.compounds?.find(x => x.concept_id === c.id);
      if (match?.composition_readable) {
        return `Suggested compound: <span class="mono">${escapeHtml(match.composition_readable)}</span>.`;
      }
      return 'Define a compound recipe in the Word Creator once its parts are approved.';
    }

    const ROOT_REVIEW_SCORE_TIPS = {
      Pronunciation: 'How easy this syllable is to say aloud. Shorter, simpler CV forms score higher.',
      'Compound usefulness': 'How often this root matters inside compounds. High-leverage concepts score higher.',
      Distinctiveness: 'How spread out this sound is from other roots. Low scores mean similar-sounding neighbors.',
      'Compound flow': 'How cleanly this root joins likely compound partners without awkward doubled consonants at morpheme boundaries.',
      Parseability: 'Whether this word segments back into its intended parts uniquely. Ambiguous compounds score lower.',
      Pronounceability: 'How speakable the full compound is aloud. Long forms and consonant pile-ups score lower.',
    };

    function rootReviewScoreCell(label, value, max) {
      const tip = ROOT_REVIEW_SCORE_TIPS[label];
      const titleAttr = tip ? ` title="${escapeHtml(tip)}"` : '';
      return `<div class="root-review__score">
          <span class="root-review__score-label"${titleAttr}>${escapeHtml(label)}</span>
          ${rootScoreBar(value ?? 0, max)}
        </div>`;
    }

    function buildRootReviewScoresHtml(c) {
      const g = c.generation ?? {};
      if (!c.spelling) {
        return '<div class="root-review__hint sans">No root sound assigned yet. Run build or edit this concept.</div>';
      }

      const cells = [
        rootReviewScoreCell('Pronunciation', c.pronunciation_ease, 5),
        rootReviewScoreCell('Compound usefulness', c.semantic_usefulness, 5),
      ];
      if (g.distinctiveness_score != null) cells.push(rootReviewScoreCell('Distinctiveness', g.distinctiveness_score, 100));
      if (g.compound_flow_score != null) cells.push(rootReviewScoreCell('Compound flow', g.compound_flow_score, 100));

      return `<div class="root-review__scores">${cells.join('')}</div>${rootReviewWarningsHtml(c)}`;
    }

    function buildCandidateReviewPreviewHtml(c) {
      const focus = {
        spelling: c.spelling ?? '',
        meaning: c.concept,
        state: c.status === 'pending' ? 'needs_review' : c.status,
        components: [],
      };
      return buildWordPreviewHtml(focus, {
        kind: 'root',
        showHear: true,
        hearId: 'root-hear',
        showBuiltFrom: false,
        footerHtml: buildRootReviewScoresHtml(c),
        unnamedStyle: 'review',
      });
    }

    function buildLabReviewPreviewHtml(item, { isSound = true } = {}) {
      const concept = conceptForLabItem(item);
      const focus = {
        spelling: item.spelling,
        meaning: concept?.concept ?? item.meaning ?? '',
        state: item.state,
        components: isSound ? [] : (item.components ?? []),
      };
      let footer = '';
      let descriptionHtml = '';
      if (!isSound) {
        const recipe = compoundReviewRecipeText(item);
        if (recipe) {
          descriptionHtml = `<div class="word-preview__context sans">Recipe: <span class="mono">${escapeHtml(recipe)}</span></div>`;
        }
      }
      if (concept?.reason) {
        descriptionHtml += `<div class="word-preview__context sans">${escapeHtml(concept.reason)}</div>`;
      }
      if (!isSound) {
        footer += buildCompoundReviewScoresHtml(item);
      }
      return buildWordPreviewHtml(focus, {
        kind: isSound ? 'root' : 'word',
        showHear: true,
        hearId: 'hear',
        showBuiltFrom: !isSound && Boolean(focus.components?.length),
        builtFromHideBadges: true,
        descriptionHtml,
        footerHtml: footer,
        unnamedStyle: 'review',
      });
    }

    function reviewPickableCandidates() {
      const q = (STATE.reviewFilter ?? '').trim().toLowerCase();
      let list = rootReviewList();
      if (STATE.reviewShowRejected) list = list.filter(c => c.status === 'rejected');
      else {
        list = list.filter(c => c.status === 'pending' || c.status === 'rejected');
        if (STATE.reviewNeedsReviewOnly) list = list.filter(c => c.status === 'pending');
      }
      if (!q) return list;
      return list.filter(c => `${c.id} ${c.spelling} ${c.concept} ${c.domain}`.toLowerCase().includes(q));
    }

    function queuedCandidateConceptIds() {
      return new Set(
        rootReviewList()
          .filter(c => c.status === 'pending' || c.status === 'rejected')
          .map(c => c.id),
      );
    }

    function reviewPickableLabSounds() {
      if (!STATE.lab) return [];
      const q = (STATE.reviewFilter ?? '').trim().toLowerCase();
      const queued = queuedCandidateConceptIds();
      let list;
      if (STATE.reviewShowRejected) {
        list = STATE.lab.sounds
          .filter(s => s.state === 'rejected' && (!s.concept_id || !queued.has(s.concept_id)))
          .map(s => ({ ...s, reviewKind: 'sound' }));
      } else {
        list = userSounds()
          .filter(s => !s.concept_id || !queued.has(s.concept_id))
          .map(s => ({ ...s, reviewKind: 'sound' }));
        if (STATE.reviewNeedsReviewOnly) list = list.filter(s => isOpen(s.state));
      }
      if (!q) return list;
      return list.filter(s => `${s.spelling} ${s.meaning ?? ''} ${s.legacy_label ?? ''}`.toLowerCase().includes(q));
    }

    function reviewPickableLabCompounds() {
      if (!STATE.lab) return [];
      const q = (STATE.reviewFilter ?? '').trim().toLowerCase();
      let list;
      if (STATE.reviewShowRejected) {
        list = STATE.lab.compounds
          .filter(c => !c.generator_hint && c.state === 'rejected')
          .map(c => ({ ...c, reviewKind: 'compound' }));
      } else {
        list = [...userWords(), ...generatedLabWords()].map(c => ({ ...c, reviewKind: 'compound' }));
        if (STATE.reviewNeedsReviewOnly) list = list.filter(c => isOpen(c.state));
      }
      if (!q) return list;
      return list.filter(c => `${c.spelling} ${c.meaning ?? ''} ${c.generator_hint ?? ''}`.toLowerCase().includes(q));
    }

    function reviewPickableGeneratedCompounds() {
      if (!STATE.lab) return [];
      const q = (STATE.reviewFilter ?? '').trim().toLowerCase();
      let list;
      if (STATE.reviewShowRejected) {
        list = STATE.lab.compounds
          .filter(c => c.generator_hint && c.state === 'rejected')
          .map(c => ({ ...c, reviewKind: 'compound' }));
      } else {
        list = generatedLabWords().map(c => ({ ...c, reviewKind: 'compound' }));
        if (STATE.reviewNeedsReviewOnly) list = list.filter(c => isOpen(c.state));
      }
      if (!q) return list;
      return list.filter(c => `${c.spelling} ${c.meaning ?? ''} ${c.generator_hint ?? ''}`.toLowerCase().includes(q));
    }

    function reviewSelectionKey(sel) {
      return sel ? `${sel.type}:${sel.ref}` : '';
    }

    function isReviewSelected(type, ref) {
      const sel = STATE.reviewSelection;
      return sel?.type === type && sel.ref === ref;
    }

    function resolveReviewSelection() {
      const sel = STATE.reviewSelection;
      if (!sel) return null;
      if (sel.type === 'candidate') {
        const c = rootReviewList().find(x => x.id === sel.ref);
        return c ? { kind: 'candidate', item: c } : null;
      }
      if (sel.type === 'sound') {
        const s = STATE.lab?.sounds?.find(x => x.spelling === sel.ref);
        return s ? { kind: 'sound', item: { ...s, reviewKind: 'sound' } } : null;
      }
      if (sel.type === 'compound') {
        const c = STATE.lab?.compounds?.find(x => x.id === sel.ref);
        return c ? { kind: 'compound', item: { ...c, reviewKind: 'compound' } } : null;
      }
      return null;
    }

    function reviewRootsPickerMarkup(candidates, sounds) {
      const tiles = [];
      for (const c of candidates) {
        const meta = c.status === 'rejected' ? badge('rejected') : '';
        tiles.push(pickerCellHtml({
          spelling: c.spelling || '—',
          meaning: pickerMeaningShort(c.concept),
          type: 'root',
          meta,
          selected: isReviewSelected('candidate', c.id),
          extraClasses: 'review-pick',
          attrs: { 'data-review-type': 'candidate', 'data-review-ref': c.id },
        }));
      }
      for (const s of sounds) {
        tiles.push(pickerCellHtml({
          spelling: s.spelling,
          meaning: pickerMeaningForSound(s),
          type: 'root',
          meta: s.state === 'rejected' ? badge('rejected') : '',
          selected: isReviewSelected('sound', s.spelling),
          extraClasses: 'review-pick',
          attrs: { 'data-review-type': 'sound', 'data-review-ref': s.spelling },
        }));
      }
      return tiles.length
        ? tiles.join('')
        : '<p class="empty" style="grid-column:1/-1">No roots match.</p>';
    }

    function reviewLabWordPickerMarkup(words) {
      return words.length ? words.map(c => {
        const selected = isReviewSelected('compound', c.id);
        const speakParts = c.components?.length ? composerFlatSpellings(c.components) : (c.parts ?? [c.spelling]);
        const glyphs = STATE.rules ? romanToFonoraScript(speakParts, STATE.rules).phrase : '';
        return pickerCellHtml({
          spelling: c.spelling,
          meaning: pickerMeaningForCompound(c),
          glyphs,
          type: 'word',
          meta: c.state === 'rejected' ? badge('rejected') : '',
          selected,
          extraClasses: 'review-pick',
          attrs: { 'data-review-type': 'compound', 'data-review-ref': c.id },
        });
      }).join('') : '<p class="empty" style="grid-column:1/-1">No words match.</p>';
    }

    function wireReviewPicker(container) {
      container?.querySelectorAll('[data-review-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          STATE.reviewSelection = { type: btn.dataset.reviewType, ref: btn.dataset.reviewRef };
          STATE.justSaved = null;
          renderUnifiedReview();
        });
      });
    }

    function ensureReviewSelection(candidates, roots, words, generated) {
      const resolved = resolveReviewSelection();
      if (resolved) return;
      const first = candidates[0]
        ? { type: 'candidate', ref: candidates[0].id }
        : roots[0]
          ? { type: 'sound', ref: roots[0].spelling }
          : words[0]
            ? { type: 'compound', ref: words[0].id }
            : generated[0]
              ? { type: 'compound', ref: generated[0].id }
              : null;
      STATE.reviewSelection = first;
    }

    function renderReviewPicker() {
      const showRoots = STATE.reviewShowRoots;
      const showWords = STATE.reviewShowLabWords;
      const showGenerated = STATE.reviewShowGeneratedWords;

      $('rv-filters')?.querySelectorAll('[data-rv-filter]').forEach(chip => {
        const key = chip.dataset.rvFilter;
        const on = key === 'roots' ? showRoots
          : key === 'words' ? showWords
            : key === 'generated' ? showGenerated
              : key === 'rejected' ? STATE.reviewShowRejected
                : STATE.reviewNeedsReviewOnly;
        chip.classList.toggle('active', on);
      });

      $('rv-roots-h')?.toggleAttribute('hidden', !showRoots);
      $('rv-roots')?.toggleAttribute('hidden', !showRoots);
      $('rv-words-h')?.toggleAttribute('hidden', !showWords);
      $('rv-words')?.toggleAttribute('hidden', !showWords);
      $('rv-generated-h')?.toggleAttribute('hidden', !showGenerated);
      $('rv-generated')?.toggleAttribute('hidden', !showGenerated);
      $('rv-picker-empty')?.toggleAttribute('hidden', showRoots || showWords || showGenerated);

      const candidates = showRoots ? reviewPickableCandidates() : [];
      const roots = showRoots ? reviewPickableLabSounds() : [];
      const words = showWords ? reviewPickableLabCompounds() : [];
      const generated = showGenerated ? reviewPickableGeneratedCompounds() : [];

      if (STATE.rootReviewFocusPending) {
        STATE.rootReviewFocusPending = false;
        const pending = candidates.find(c => c.status === 'pending') ?? reviewPickableCandidates().find(c => c.status === 'pending');
        if (pending) STATE.reviewSelection = { type: 'candidate', ref: pending.id };
      }
      if (STATE.reviewFocusPending) {
        STATE.reviewFocusPending = false;
        const pending = candidates.find(c => c.status === 'pending')
          ?? reviewPickableCandidates().find(c => c.status === 'pending')
          ?? candidates[0];
        if (pending) {
          STATE.reviewSelection = { type: 'candidate', ref: pending.id };
        } else {
          const openRoot = roots.find(s => isOpen(s.state)) ?? reviewPickableLabSounds().find(s => isOpen(s.state));
          const openWord = words.find(c => isOpen(c.state)) ?? reviewPickableLabCompounds().find(c => isOpen(c.state));
          const openGenerated = generated.find(c => isOpen(c.state)) ?? reviewPickableGeneratedCompounds().find(c => isOpen(c.state));
          if (openRoot) STATE.reviewSelection = { type: 'sound', ref: openRoot.spelling };
          else if (openWord) STATE.reviewSelection = { type: 'compound', ref: openWord.id };
          else if (openGenerated) STATE.reviewSelection = { type: 'compound', ref: openGenerated.id };
        }
      }

      ensureReviewSelection(candidates, roots, words, generated);

      if (showRoots) {
        $('rv-roots').innerHTML = reviewRootsPickerMarkup(candidates, roots);
        wireReviewPicker($('rv-roots'));
      } else $('rv-roots').innerHTML = '';

      if (showWords) {
        $('rv-words').innerHTML = reviewLabWordPickerMarkup(words);
        wireReviewPicker($('rv-words'));
      } else $('rv-words').innerHTML = '';

      if (showGenerated) {
        const generatedEl = $('rv-generated');
        if (generatedEl) {
          generatedEl.innerHTML = reviewLabWordPickerMarkup(generated);
          wireReviewPicker(generatedEl);
        }
      } else {
        const generatedEl = $('rv-generated');
        if (generatedEl) generatedEl.innerHTML = '';
      }

      return { candidates, roots, words, generated };
    }

    async function renderUnifiedReview() {
      if (STATE.page !== 'review') return;
      ensureSplitStickyObserver();

      const workspace = $('word-review');
      if (!workspace) return;

      try {
        await ensureRules();
        if (STATE.reviewShowRoots) {
          try { await ensureRootCandidates(); } catch { /* candidates optional */ }
        }
        if (STATE.lab && (STATE.reviewShowRoots || STATE.reviewShowLabWords || STATE.reviewShowGeneratedWords)) {
          await ensureLexicon();
        }
      } catch (err) {
        workspace.innerHTML = `<div class="fonoran-split-empty"><p>${escapeHtml(err.message)}</p></div>`;
        return;
      }

      const filterEl = $('rv-filter');
      if (filterEl && filterEl.value !== STATE.reviewFilter) filterEl.value = STATE.reviewFilter;

      const { candidates, roots, words, generated } = renderReviewPicker();
      const resolved = resolveReviewSelection();

      if (!resolved) {
        workspace.innerHTML = `<div class="fonoran-split-empty"><p>${candidates.length + roots.length + words.length + generated.length ? 'Select a root or word on the left to review it.' : 'Nothing to review yet. Run <code>npm run fonoran:reset && npm run fonoran:build</code>, or <code>npm run fonoran:build:approved</code> after a reset.'}</p></div>`;
        requestAnimationFrame(syncSplitStickyOffsets);
        return;
      }

      try {
        if (resolved.kind === 'candidate') renderCandidateReviewWorkspace(resolved.item);
        else renderLabReviewWorkspace(resolved.item);
      } catch (err) {
        console.error('Review preview failed:', err);
        workspace.innerHTML = `<div class="fonoran-split-empty"><p>${escapeHtml(err.message)}</p></div>`;
        requestAnimationFrame(syncSplitStickyOffsets);
        return;
      }

      requestAnimationFrame(() => {
        scrollReviewSelectionIntoView();
        syncSplitStickyOffsets();
      });
    }

    function scrollReviewSelectionIntoView() {
      const sel = STATE.reviewSelection;
      if (!sel || STATE.page !== 'review') return;
      const picker = document.querySelector('#page-review .fonoran-split-picker');
      if (!picker) return;
      const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
      const btn = picker.querySelector(`[data-review-type="${esc(sel.type)}"][data-review-ref="${esc(sel.ref)}"]`);
      if (!btn) return;
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function reviewExplorerNavigate(navKind, ref) {
      STATE.reviewSelection = navKind === 'root'
        ? { type: 'sound', ref }
        : { type: 'compound', ref };
      renderUnifiedReview();
    }

    function buildFamilyGraphSheetHtml(data) {
      const f = data.focus;
      return `
        <div class="explorer-section showcase-graph word-tree-sheet">
          <h4>Word Tree · <span class="mono" data-word-tree-spelling>${escapeHtml(f.spelling)}</span></h4>
          <p class="sans graph-hint">Drag to pan · scroll or use +/− to zoom · tap a node to explore.</p>
          ${buildMermaidPanZoomHtml(data.mermaid)}
        </div>`;
    }

    async function mountFamilyGraphSheet(data, { onSideEffect = null, body = null, firstOpen = false } = {}) {
      const host = body ?? $('sheet-body');
      if (!data.mermaid) return;
      if (firstOpen) {
        host.innerHTML = buildFamilyGraphSheetHtml(data);
        openSheet();
        await new Promise((resolve) => requestAnimationFrame(resolve));
      } else {
        host.querySelector('[data-word-tree-spelling]')?.replaceChildren(document.createTextNode(data.focus.spelling));
        host.querySelector('.mermaid-pan-zoom')?.remove();
        host.querySelector('.word-tree-sheet')?.insertAdjacentHTML('beforeend', buildMermaidPanZoomHtml(data.mermaid));
      }

      const navigateInTree = async (navKind, ref) => {
        const panZoom = host.querySelector('.mermaid-pan-zoom');
        panZoom?.classList.add('is-loading');
        try {
          const kind = navKind === 'root' ? 'root' : 'word';
          const next = await fetchExplorerData(kind, ref);
          if (!next.mermaid) {
            toast('No word tree for this item.');
            panZoom?.classList.remove('is-loading');
            return;
          }
          await mountFamilyGraphSheet(next, { onSideEffect, body: host, firstOpen: false });
          onSideEffect?.(navKind, ref);
        } catch (e) {
          panZoom?.classList.remove('is-loading');
          toast(e.message);
        }
      };

      const section = host.querySelector('.word-tree-sheet') ?? host;
      await renderExplorerMermaidIn(section, data.mermaid, data.graph_nodes, navigateInTree);
    }

    async function openFamilyGraphSheet(data, onSideEffect = null) {
      await mountFamilyGraphSheet(data, { onSideEffect, firstOpen: true });
    }

    function wireReviewExplorerButtons(c, isSound, rootEl) {
      const kind = isSound ? 'root' : 'word';
      const id = isSound ? c.spelling : c.id;
      const dataPromise = fetchExplorerData(kind, id);
      const graphBtn = rootEl.querySelector('[data-open-graph]');
      dataPromise.then((data) => {
        if (graphBtn && !data.mermaid) graphBtn.disabled = true;
      }).catch(() => { if (graphBtn) graphBtn.disabled = true; });
      graphBtn?.addEventListener('click', async () => {
        try {
          const data = await dataPromise;
          if (data.mermaid) openFamilyGraphSheet(data, reviewExplorerNavigate);
        } catch (e) { toast(e.message); }
      });
      rootEl.querySelector('[data-open-dda]')?.addEventListener('click', async () => {
        try {
          const data = await dataPromise;
          openDdaSheet(data, kind, id);
        } catch (e) { toast(e.message); }
      });
    }

    function renderLabReviewWorkspace(c) {
      const reviewEl = $('word-review');
      if (!reviewEl || !c) return;
      const isSound = c.reviewKind === 'sound';
      const canReopen = c.state === 'rejected';
      const savedNote = STATE.justSaved === c.spelling
        ? `<div class="saved-banner">✓ Saved <strong>${escapeHtml(c.spelling)}</strong>. Find it anytime in Dictionary.</div>` : '';
      reviewEl.innerHTML = `
        <div class="review root-review word-review review-workspace word-preview-panel">
          ${buildLabReviewPreviewHtml(c, { isSound })}
          ${savedNote}
          <div class="review-decision">
            <div class="feel-actions root-review__actions">
              <button type="button" class="fa-approve" id="approve"${writeDisabledAttr(!c.meaning)} data-write>✓ Approve</button>
              ${canWrite() ? '<button type="button" class="fa-edit" id="edit" data-write>✎ Edit</button>' : ''}
              ${canReopen && canWrite() ? '<button type="button" class="btn" id="reopen" data-write>Reopen</button>' : ''}
              <button type="button" class="fa-reject" id="reject" data-write ${canReopen ? 'disabled' : ''}>✕ Reject</button>
            </div>
          </div>
        </div>`;
      wireLabReviewCommon(c);
      wireFeel(c);
    }

    /* ---------- shared review wiring ---------- */
    function cardNav(cursor, total, kind, footerHtml = null) {
      return `<div class="card-nav">
        <button type="button" id="nav-prev" ${cursor === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pos">${cursor + 1} / ${total}</span>
        <button type="button" id="nav-next" ${cursor >= total - 1 ? 'disabled' : ''}>Next →</button>
      </div>${footerHtml ?? ''}`;
    }
    function buildReviewProgressHtml() {
      const tracks = [];
      const labAll = reviewItems();
      if (labAll.length) {
        const done = labAll.filter(i => reviewed(i.state)).length;
        const pct = Math.round((done / labAll.length) * 100);
        const open = labAll.filter(i => isOpen(i.state)).length;
        tracks.push({
          label: 'Roots & words reviewed',
          done,
          total: labAll.length,
          pct,
          note: open ? `${open} need review` : '',
        });
      }
      const roots = rootReviewList().filter(c => c.status === 'pending' || c.status === 'rejected');
      if (roots.length) {
        const done = roots.filter(x => x.status === 'approved' || x.status === 'rejected').length;
        const pct = Math.round((done / roots.length) * 100);
        const pending = roots.filter(x => x.status === 'pending').length;
        tracks.push({
          label: 'Root queue decided',
          done,
          total: roots.length,
          pct,
          note: pending ? `${pending} pending` : '',
        });
      }
      if (!tracks.length) return '';
      return `<div class="health-review-stats">${tracks.map(t => `
        <div class="health-review-stat">
          <p class="health-review-stat__label">${escapeHtml(t.label)}</p>
          <div class="progress"><span style="width:${t.pct}%"></span></div>
          <p class="progress-label">${t.done} of ${t.total} (${t.pct}%)${t.note ? ` · ${escapeHtml(t.note)}` : ''}</p>
        </div>`).join('')}</div>`;
    }
    function wireLabReviewCommon(item) {
      const isSound = item.reviewKind === 'sound';
      const speakParts = reviewItemScriptParts(item, isSound);
      $('hear')?.addEventListener('click', () => speakNeural(speakParts));
    }
    function wireFeel(item) {
      const isSound = item.reviewKind === 'sound';
      $('edit')?.addEventListener('click', async () => {
        if (!canWrite()) { toast('Sign in required'); return; }
        if (isSound) {
          await ensureLexicon();
          const conceptId = resolveConceptIdForLabSound(item);
          if (conceptId) {
            openConceptInEditor(conceptId, { returnPage: 'review' });
          } else {
            openRootInCreator(item, { returnPage: 'review' });
          }
        } else {
          openWordInCreator(item, { returnPage: 'review' });
        }
      });
      $('approve')?.addEventListener('click', async () => {
        if (isSound) {
          await api(`/api/fonoran/lab/sounds/${encodeURIComponent(item.spelling)}`, { method: 'PATCH', body: JSON.stringify({ state: 'approved' }) });
        } else {
          await api(`/api/fonoran/lab/compounds/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: JSON.stringify({ meaning: item.meaning, state: 'approved' }) });
        }
        toast(`Approved ${item.spelling}`); await advanceReviewItem(item);
      });
      $('reject')?.addEventListener('click', async () => {
        const kind = isSound ? 'sound' : 'compound';
        const id = isSound ? item.spelling : item.id;
        await api(`/api/fonoran/lab/state/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ state: 'rejected' }) });
        toast(`Rejected ${item.spelling}`); await advanceReviewItem(item);
      });
      $('reopen')?.addEventListener('click', async () => {
        if (!canWrite()) { toast('Sign in required'); return; }
        const kind = isSound ? 'sound' : 'compound';
        const id = isSound ? item.spelling : item.id;
        await api(`/api/fonoran/lab/state/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ state: 'needs_review' }) });
        toast(`Reopened ${item.spelling}`);
        await load({ skipRender: true });
        renderUnifiedReview();
      });
    }
    async function advanceReviewItem(current) {
      await load({ skipRender: true });
      const pool = [
        ...reviewPickableLabSounds().map(s => ({ type: 'sound', ref: s.spelling, open: isOpen(s.state) })),
        ...reviewPickableLabCompounds().map(c => ({ type: 'compound', ref: c.id, open: isOpen(c.state) })),
        ...reviewPickableGeneratedCompounds().map(c => ({ type: 'compound', ref: c.id, open: isOpen(c.state) })),
      ];
      const curKey = current.reviewKind === 'sound' ? `sound:${current.spelling}` : `compound:${current.id}`;
      const idx = pool.findIndex(p => `${p.type}:${p.ref}` === curKey);
      let next = null;
      for (let i = idx + 1; i < pool.length; i++) {
        if (pool[i].open) { next = pool[i]; break; }
      }
      if (!next) next = pool.find(p => p.open) ?? pool[idx + 1] ?? pool[idx] ?? null;
      if (next) STATE.reviewSelection = { type: next.type, ref: next.ref };
      STATE.justSaved = null;
      renderUnifiedReview();
    }

    /* ---------- ROOT REVIEW ---------- */
    function rootReviewList() {
      return STATE.rootCandidates?.candidates ?? [];
    }

    function firstPendingRootIndex(list) {
      return list.findIndex(c => c.status === 'pending');
    }

    function rootStatusBadge(status) {
      const map = { pending: 'needs_review', approved: 'approved', rejected: 'rejected' };
      return badge(map[status] ?? status);
    }

    function rootScoreBar(score, max = 5) {
      const pct = Math.round((score / max) * 100);
      return `<div class="root-review__bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`;
    }

    function buildRootReviewCardHtml(c) {
      return buildCandidateReviewPreviewHtml(c);
    }

    function renderCandidateReviewWorkspace(c) {
      const el = $('word-review');
      if (!el || !c) return;

      const eligible = Boolean(c.spelling);
      const canApprove = eligible && c.status !== 'approved';
      const canRegenerate = eligible && c.status !== 'approved';
      const canReopen = c.status === 'rejected';

      el.innerHTML = `
        <div class="review root-review review-workspace word-preview-panel">
          ${buildCandidateReviewPreviewHtml(c)}
          <div class="review-decision">
            <div class="feel-actions root-review__actions">
              <button type="button" class="fa-approve" id="root-approve" data-write ${canApprove ? '' : 'disabled'}>✓ Approve</button>
              ${canWrite() ? '<button type="button" class="fa-edit" id="root-edit" data-write>✎ Edit</button>' : ''}
              ${canRegenerate && canWrite() ? '<button type="button" class="btn" id="root-regenerate" data-write>↻ Regenerate</button>' : ''}
              ${canReopen && canWrite() ? '<button type="button" class="btn" id="root-reopen" data-write>Reopen</button>' : ''}
              <button type="button" class="fa-reject" id="root-reject" data-write ${c.status === 'rejected' ? 'disabled' : ''}>✕ Reject</button>
            </div>
          </div>
        </div>`;

      $('root-hear')?.addEventListener('click', () => { if (c.spelling) speakNeural([c.spelling]); });
      wireRootActions(c);
    }

    function wireRootActions(c) {
      $('root-edit')?.addEventListener('click', () => {
        if (!canWrite()) { toast('Sign in required'); return; }
        openConceptInEditor(c.id, { returnPage: 'review' });
      });
      $('root-regenerate')?.addEventListener('click', async () => {
        if (!canWrite()) { toast('Sign in required'); return; }
        try {
          await api(`/api/fonoran/roots/candidates/${encodeURIComponent(c.id)}/regenerate`, { method: 'POST', body: '{}' });
          STATE.rootCandidates = null;
          STATE.lexicon = null;
          toast(`Regenerated spelling for ${c.id}`);
          await load({ skipRender: true });
          renderUnifiedReview();
        } catch (err) { toast(err.message); }
      });
      $('root-reopen')?.addEventListener('click', async () => {
        if (!canWrite()) { toast('Sign in required'); return; }
        try {
          await api(`/api/fonoran/roots/candidates/${encodeURIComponent(c.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'reopen' }),
          });
          STATE.rootCandidates = null;
          STATE.lexicon = null;
          toast(`Reopened ${c.id}`);
          await load({ skipRender: true });
          renderUnifiedReview();
        } catch (err) { toast(err.message); }
      });
      $('root-approve')?.addEventListener('click', async () => {
        try {
          await api(`/api/fonoran/roots/candidates/${encodeURIComponent(c.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'approve' }),
          });
          STATE.rootCandidates = null;
          STATE.lexicon = null;
          await advanceRoot();
          toast(`Approved ${c.spelling} → ${c.id}`);
        } catch (err) { toast(err.message); }
      });
      $('root-reject')?.addEventListener('click', async () => {
        try {
          await api(`/api/fonoran/roots/candidates/${encodeURIComponent(c.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'reject' }),
          });
          STATE.rootCandidates = null;
          STATE.lexicon = null;
          await advanceRoot();
          toast(`Rejected ${c.id}`);
        } catch (err) { toast(err.message); }
      });
    }

    async function ensureRootCandidates() {
      if (STATE.rootCandidates) return STATE.rootCandidates;
      STATE.rootCandidates = await api('/api/fonoran/roots/candidates');
      return STATE.rootCandidates;
    }

    async function advanceRoot() {
      await ensureRootCandidates();
      const list = reviewPickableCandidates();
      const curId = STATE.reviewSelection?.type === 'candidate' ? STATE.reviewSelection.ref : null;
      const idx = list.findIndex(c => c.id === curId);
      let next = null;
      for (let i = idx + 1; i < list.length; i++) {
        if (list[i].status === 'pending') { next = list[i]; break; }
      }
      if (!next) next = list.find(c => c.status === 'pending') ?? list[idx + 1] ?? list[idx] ?? null;
      if (next) STATE.reviewSelection = { type: 'candidate', ref: next.id };
      renderUnifiedReview();
    }

    /* ---------- review item edit ---------- */
    function meaningMatches(meaning, selfKind, selfId) {
      const m = (meaning ?? '').trim().toLowerCase();
      if (!m) return [];
      const hits = [];
      for (const s of STATE.lab.sounds) {
        if (s.state === 'rejected') continue;
        if (selfKind === 'sound' && s.spelling === selfId) continue;
        if ((s.meaning ?? '').trim().toLowerCase() === m) hits.push(`${s.spelling} (root)`);
      }
      for (const c of STATE.lab.compounds) {
        if (c.state === 'rejected') continue;
        if (selfKind === 'compound' && c.id === selfId) continue;
        if ((c.meaning ?? '').trim().toLowerCase() === m) hits.push(`${c.spelling} (word)`);
      }
      return hits;
    }

    function renderEditDupe(kind, id, editMeaning, prefix = 'ed') {
      const box = $(`${prefix}-dupe`);
      if (!box) return;
      const hits = meaningMatches(editMeaning, kind, id);
      box.innerHTML = hits.length
        ? `<div class="dupe"><strong>Already in use:</strong> “${escapeHtml(editMeaning.trim())}” also means <span class="mono">${hits.join('</span>, <span class="mono">')}</span>.</div>`
        : '';
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

    function spellingBlocksSave(match, editingId = null) {
      if (!match) return false;
      if (editingId && match.kind === 'compound' && match.item.id === editingId) return false;
      if (match.kind === 'sound') return Boolean(match.item.meaning?.trim());
      return !match.item.generator_hint;
    }

    function spellingMatchHtml(match, { compact = false } = {}) {
      if (!match) return '';
      const { kind, item } = match;
      const id = kind === 'sound' ? item.spelling : item.id;
      if (compact) {
        const gloss = item.meaning?.trim();
        const suffix = item.generator_hint && !gloss
          ? ' · generator suggestion — save below to claim'
          : (gloss ? ` · ${gloss}` : '');
        return `<div class="word-match word-match--compact">
          <p class="word-match__compact-line"><strong class="mono">${escapeHtml(item.spelling)}</strong> already in your lab${escapeHtml(suffix)}.
          <button type="button" class="linkish" data-view-match="${kind}" data-match-id="${escapeHtml(id)}">Open</button></p>
        </div>`;
      }
      const focus = {
        spelling: item.spelling,
        meaning: item.meaning,
        state: item.state,
        components: kind === 'compound' ? (item.components ?? []) : [],
      };
      const claimNote = item.generator_hint && !item.meaning?.trim()
        ? 'Generator suggestion. Save below to name it.'
        : item.generator_hint ? 'Generator suggestion.' : '';
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

    function renderSpellingMatch(boxId, spelling, { compact = false, editingId = null } = {}) {
      const box = $(boxId);
      if (!box) return null;
      const match = spelling ? lookupSpelling(spelling) : null;
      const blocks = match && spellingBlocksSave(match, editingId);
      box.innerHTML = match && blocks ? spellingMatchHtml(match, { compact }) : '';
      box.querySelector('[data-view-match]')?.addEventListener('click', e => {
        const btn = e.currentTarget;
        openChain(btn.dataset.viewMatch, btn.dataset.matchId);
      });
      return match;
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
      containerEl.querySelector('.word-preview__hear, .word-preview-actions .hear-min')?.addEventListener('click', () => speakNeural(speakParts));
      if (showInlineGraph) {
        await renderExplorerMermaidIn(containerEl, data.mermaid, data.graph_nodes, onNavigate);
      }
      if (modalActions || layout === 'dictionary') {
        containerEl.querySelector('[data-open-graph]')?.addEventListener('click', () => {
          openFamilyGraphSheet(data, onNavigate ?? null);
        });
        containerEl.querySelector('[data-open-dda]')?.addEventListener('click', () => {
          openDdaSheet(data, explorerKind, id);
        });
      }
      return data;
    }

    async function openDdaSheet(data, explorerKind, ref) {
      const dda = labItemDda(explorerKind, ref);
      const body = $('sheet-body');
      body.innerHTML = buildDdaPanelHtml(dda, data.focus.components, data.focus);
      openSheet();
      const mermaidEl = body.querySelector('.mermaid');
      if (mermaidEl && window.mermaid) {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: { fontFamily: 'ui-monospace, Menlo, monospace', lineColor: '#a89f95' },
          securityLevel: 'loose',
        });
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
          await window.mermaid.run({ nodes: [mermaidEl] });
        } catch (err) {
          console.warn('DDA chart render failed:', err);
          body.querySelector('.dda-chart')?.remove();
        }
      }
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

    /* ---------- CONCEPT EDITOR ---------- */
    function conceptEditorWordBankText(c) {
      if (c.stored_aliases?.length) return c.stored_aliases.join('\n');
      return (c.aliases ?? []).filter(a => a !== c.id).join('\n');
    }

    function conceptEditorEmptyDraft() {
      return { id: '', concept: '', domain: 'being', spelling: '', ipa: '', aliases: '', status: 'pending' };
    }

    function conceptEditorDraftFrom(c) {
      return {
        id: c.id,
        concept: c.concept,
        domain: c.domain,
        spelling: c.spelling,
        ipa: c.ipa,
        aliases: conceptEditorWordBankText(c),
        status: c.status,
      };
    }

    function conceptEditorFilteredList() {
      const concepts = conceptList();
      const q = (STATE.conceptEditorFilter ?? '').trim().toLowerCase();
      if (!q) return concepts;
      const tokens = q.split(/[\s-]+/).filter(Boolean);
      return concepts.filter(c => {
        const hay = `${c.id} ${c.concept} ${c.domain} ${c.spelling} ${(c.aliases ?? []).join(' ')}`.toLowerCase();
        return hay.includes(q) || tokens.every(t => hay.includes(t));
      });
    }

    function conceptEditorStatusBadge(status) {
      if (status === 'approved') return '<span class="concept-editor__status concept-editor__status--approved">approved</span>';
      if (status === 'rejected') return '<span class="concept-editor__status concept-editor__status--rejected">rejected</span>';
      return '<span class="concept-editor__status concept-editor__status--pending">pending</span>';
    }

    function conceptEditorCurrentId() {
      if (STATE.conceptEditorIsNew) {
        return ($('ce-id')?.value ?? STATE.conceptEditorDraft?.id ?? '').trim().toLowerCase();
      }
      return STATE.conceptEditorSelected ?? '';
    }

    function conceptEditorComparableRoots(conceptId) {
      const excludeId = (conceptId ?? '').trim().toLowerCase();
      return conceptList().filter(c =>
        c.status !== 'rejected' &&
        c.spelling?.trim() &&
        c.id !== excludeId,
      );
    }

    function conceptEditorSpellingConflicts(spelling, conceptId) {
      const sp = (spelling ?? '').trim().toLowerCase();
      if (!sp || !isValidSyllable(sp)) return null;
      const other = conceptEditorComparableRoots(conceptId).find(
        c => c.spelling.trim().toLowerCase() === sp,
      );
      return other ? { concept: other } : null;
    }

    function conceptEditorSoundRiskPreview(spelling, conceptId) {
      const sp = (spelling ?? '').trim().toLowerCase();
      if (!sp || !isValidSyllable(sp)) return null;
      const prefixOverlaps = [];
      const lookAlikes = [];
      for (const c of conceptEditorComparableRoots(conceptId)) {
        const other = c.spelling.trim().toLowerCase();
        if (sp !== other && (sp.startsWith(other) || other.startsWith(sp))) {
          prefixOverlaps.push({ proposed: sp, other, concept: c });
        }
        const sim = rootSimilarity(sp, other);
        if (sp !== other && sim >= 0.67) {
          lookAlikes.push({ other, sim, concept: c });
        }
      }
      let riskLevel = 'clean';
      if (prefixOverlaps.length >= 3) riskLevel = 'high';
      else if (prefixOverlaps.length >= 1) riskLevel = 'some';
      return { prefixOverlaps, lookAlikes, riskLevel };
    }

    function updateConceptEditorSoundChecks(spelling) {
      const alertsEl = $('ce-spelling-alerts');
      const submitBtn = $('concept-editor-form')?.querySelector('[type="submit"]');
      if (!alertsEl) return;

      const sp = (spelling ?? '').trim();
      const normalized = sp.toLowerCase();
      const valid = isValidSyllable(sp);
      const savedSp = (STATE.conceptEditorDraft?.spelling ?? '').trim().toLowerCase();
      const conceptId = conceptEditorCurrentId();
      const duplicate = valid ? conceptEditorSpellingConflicts(sp, conceptId) : null;
      const unchanged = normalized === savedSp;

      setWriteButton(submitBtn, !valid || Boolean(duplicate));

      if (!sp || !valid) {
        alertsEl.innerHTML = '';
        return;
      }

      if (!duplicate && unchanged) {
        alertsEl.innerHTML = '';
        return;
      }

      const parts = [];

      if (duplicate) {
        const other = duplicate.concept;
        const gloss = pickerMeaningShort(other.concept);
        parts.push(`<div class="dupe">Already in use: <strong class="mono">${escapeHtml(sp)}</strong> is assigned to <strong class="mono">${escapeHtml(other.id)}</strong> (${escapeHtml(gloss)}).
          <button type="button" class="linkish" data-open-concept="${escapeHtml(other.id)}">Open concept</button></div>`);
      } else {
        const preview = conceptEditorSoundRiskPreview(sp, conceptId);
        const { prefixOverlaps, lookAlikes, riskLevel } = preview;
        if (prefixOverlaps.length || lookAlikes.length) {
          const badgeClass = riskLevel === 'high' ? 'concept-editor__risk-badge--high'
            : riskLevel === 'some' ? 'concept-editor__risk-badge--some' : '';
          const badgeLabel = riskLevel === 'high' ? 'High risk'
            : riskLevel === 'some' ? 'Some overlap' : 'Looks clean';
          const MAX_SHOW = 8;
          const listItems = [];
          let shown = 0;
          const total = prefixOverlaps.length + lookAlikes.length;

          for (const o of prefixOverlaps) {
            if (shown >= MAX_SHOW) break;
            const shorter = sp.length < o.other.length ? sp : o.other;
            const longer = sp.length >= o.other.length ? sp : o.other;
            listItems.push(`<li class="lander-health__conflict-item lander-health__conflict-item--high">
              <span class="lander-health__conflict-msg">"${escapeHtml(shorter)}" prefixes "${escapeHtml(longer)}" (${escapeHtml(o.concept.id)})</span>
            </li>`);
            shown += 1;
          }
          for (const o of lookAlikes) {
            if (shown >= MAX_SHOW) break;
            const sev = o.sim >= 0.85 ? 'high' : 'medium';
            listItems.push(`<li class="lander-health__conflict-item lander-health__conflict-item--${sev}">
              <span class="lander-health__conflict-msg">"${escapeHtml(sp)}" sounds similar to "${escapeHtml(o.other)}" (${escapeHtml(o.concept.id)}, ${o.sim.toFixed(2)})</span>
            </li>`);
            shown += 1;
          }

          const remaining = total - shown;
          const moreLine = remaining > 0
            ? `<p class="concept-editor__alert-more sans">…and ${remaining} more</p>`
            : '';
          const header = riskLevel === 'high' && prefixOverlaps.length > 0
            ? `<p class="concept-editor__alert-head sans"><strong>High risk spelling</strong> — ${prefixOverlaps.length} prefix overlap${prefixOverlaps.length === 1 ? '' : 's'} detected</p>`
            : `<p class="concept-editor__alert-head sans"><span class="concept-editor__risk-badge ${badgeClass}">${badgeLabel}</span></p>`;
          const footer = prefixOverlaps.length > 0
            ? '<p class="concept-editor__alert-foot sans">Short roots like this often cause segmentation problems and hurt language health.</p>'
            : '';

          parts.push(`<div class="concept-editor__alerts-panel">
            ${header}
            <ul class="concept-editor__alert-list lander-health__conflict-list">${listItems.join('')}</ul>
            ${moreLine}
            ${footer}
          </div>`);
        }
      }

      alertsEl.innerHTML = parts.join('');
      alertsEl.querySelectorAll('[data-open-concept]').forEach(btn => {
        btn.addEventListener('click', () => {
          openConceptInEditor(btn.dataset.openConcept);
        });
      });
    }

    function updateConceptEditorSound(spelling) {
      const sp = (spelling ?? '').trim();
      const invalidEl = $('ce-spelling-invalid');
      const hearBtn = $('ce-hear');

      if (!sp) {
        if (invalidEl) { invalidEl.hidden = true; invalidEl.textContent = ''; }
        if (hearBtn) hearBtn.disabled = true;
        return;
      }

      if (!isValidSyllable(sp)) {
        if (invalidEl) {
          invalidEl.hidden = false;
          invalidEl.textContent = `“${sp}” isn’t a valid Fonoran syllable yet.`;
        }
        if (hearBtn) hearBtn.disabled = true;
        return;
      }

      if (invalidEl) { invalidEl.hidden = true; invalidEl.textContent = ''; }
      if (hearBtn) hearBtn.disabled = false;
    }

    function renderConceptEditorDetail() {
      const panel = $('concept-editor-detail');
      if (!panel) return;
      const d = STATE.conceptEditorDraft;
      if (!d) {
        panel.innerHTML = `<div class="fonoran-split-empty"><p>Select a concept on the left, or create a new one.</p></div>`;
        return;
      }

      const knownDomains = [...new Set([...(STATE.conceptEditorDomains ?? []), d.domain].filter(Boolean))].sort();
      const isKnownDomain = knownDomains.includes(d.domain);
      const domainOpts = knownDomains
        .map(dom => `<option value="${escapeHtml(dom)}"${dom === d.domain ? ' selected' : ''}>${escapeHtml(dom)}</option>`).join('');

      const selected = conceptList().find(c => c.id === STATE.conceptEditorSelected);
      const effectivePreview = selected?.aliases?.length
        ? selected.aliases.slice(0, 24).map(a => `<span class="concept-editor__chip">${escapeHtml(a)}</span>`).join('')
        : '<span class="concept-editor__chip concept-editor__chip--muted">Save to preview translator matches</span>';

      const headHtml = STATE.conceptEditorIsNew
        ? `<input type="text" id="ce-id" class="mono concept-editor__id-input" value="${escapeHtml(d.id)}" placeholder="concept-id" data-write-input autocomplete="off" spellcheck="false" aria-label="Concept id">`
        : `<h3>${escapeHtml(d.id)}</h3>${conceptEditorStatusBadge(d.status)}`;

      panel.innerHTML = `
        <form class="concept-editor__form" id="concept-editor-form">
          <div class="concept-editor__form-head">${headHtml}</div>
          <label class="fld" for="ce-spelling">Fonoran sound</label>
          <div class="concept-editor__sound-row">
            <input type="text" id="ce-spelling" class="mono" value="${escapeHtml(d.spelling)}" data-write-input autocomplete="off" spellcheck="false">
            <button type="button" class="btn" id="ce-hear" disabled>▶ Hear</button>
          </div>
          <p class="concept-editor__invalid syl-invalid" id="ce-spelling-invalid" hidden></p>
          <label class="fld" for="ce-concept">Gloss</label>
          <p class="concept-editor__hint sans">Short note for your review — the root is the sound, not this text.</p>
          <input type="text" id="ce-concept" value="${escapeHtml(d.concept)}" data-write-input autocomplete="off">
          <div id="ce-spelling-alerts" class="concept-editor__alerts" aria-live="polite"></div>
          <label class="fld" for="ce-domain">Domain</label>
          <select id="ce-domain" data-write-input>
            ${domainOpts}
            <option value="_custom"${isKnownDomain ? '' : ' selected'}>Custom domain…</option>
          </select>
          <input type="text" id="ce-domain-custom" class="concept-editor__domain-custom" placeholder="new domain" value="${isKnownDomain ? '' : escapeHtml(d.domain)}"${isKnownDomain ? ' hidden' : ''} data-write-input>
          <label class="fld" for="ce-aliases">English word bank</label>
          <p class="concept-editor__hint sans">One word or phrase per line. Saved to the English localization layer and used by the translator for alias matching.</p>
          <textarea id="ce-aliases" rows="3" data-write-input>${escapeHtml(d.aliases)}</textarea>
          <div class="concept-editor__preview" hidden>
            <span class="concept-editor__preview-label sans">Effective matches after save</span>
            <div class="concept-editor__chips">${effectivePreview}</div>
          </div>
          <div class="concept-editor__actions">
            <button type="submit" class="btn btn-primary" data-write>${STATE.conceptEditorIsNew ? 'Create concept' : 'Save changes'}</button>
            <button type="button" class="btn" id="ce-cancel">${STATE.conceptEditorReturnPage ? 'Cancel' : 'Discard changes'}</button>
            ${STATE.conceptEditorIsNew ? '' : `<button type="button" class="btn danger" id="ce-delete" data-write>Delete</button>`}
          </div>
        </form>`;

      const domainSel = $('ce-domain');
      const domainCustom = $('ce-domain-custom');
      const syncDomainCustom = () => {
        const custom = domainSel?.value === '_custom';
        if (domainCustom) domainCustom.hidden = !custom;
      };
      domainSel?.addEventListener('change', syncDomainCustom);
      syncDomainCustom();

      $('ce-spelling')?.addEventListener('input', (e) => {
        updateConceptEditorSound(e.target.value);
        updateConceptEditorSoundChecks(e.target.value);
      });

      updateConceptEditorSound(d.spelling);
      updateConceptEditorSoundChecks(d.spelling);

      $('ce-hear')?.addEventListener('click', () => {
        const sp = $('ce-spelling')?.value.trim();
        if (sp) speakNeural(sp);
      });

      $('concept-editor-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConceptEditor();
      });

      $('ce-cancel')?.addEventListener('click', () => {
        const returnPage = STATE.conceptEditorReturnPage;
        if (returnPage === 'review') {
          STATE.conceptEditorReturnPage = null;
          STATE.conceptEditorPendingId = null;
          switchPage('review');
          return;
        }
        if (STATE.conceptEditorIsNew) {
          STATE.conceptEditorIsNew = false;
          STATE.conceptEditorDraft = null;
          STATE.conceptEditorSelected = null;
        } else {
          const c = conceptList().find(x => x.id === STATE.conceptEditorSelected);
          STATE.conceptEditorDraft = c ? conceptEditorDraftFrom(c) : null;
        }
        renderConceptEditor();
      });

      $('ce-delete')?.addEventListener('click', async () => {
        const id = STATE.conceptEditorSelected;
        if (!id || !confirm(`Delete concept "${id}"? This cannot be undone.`)) return;
        try {
          await api(`/api/fonoran/concepts/${encodeURIComponent(id)}`, { method: 'DELETE' });
          STATE.lexicon = null;
          STATE.rootCandidates = null;
          STATE.conceptEditorSelected = null;
          STATE.conceptEditorDraft = null;
          STATE.conceptEditorIsNew = false;
          toast(`Deleted ${id}`);
          renderConceptEditor();
        } catch (err) { toast(err.message); }
      });
    }

    async function saveConceptEditor() {
      const id = STATE.conceptEditorIsNew
        ? $('ce-id')?.value.trim().toLowerCase()
        : STATE.conceptEditorSelected;
      const concept = $('ce-concept')?.value.trim();
      const domainSel = $('ce-domain')?.value;
      const domain = domainSel === '_custom' ? $('ce-domain-custom')?.value.trim().toLowerCase() : domainSel;
      const spelling = $('ce-spelling')?.value.trim().toLowerCase();
      const aliases = $('ce-aliases')?.value ?? '';
      if (!id || !concept || !domain || !spelling) {
        toast('Concept id, gloss, domain, and root sound are required.');
        return;
      }
      const body = {
        description: concept,
        domain,
        aliases,
        spelling,
      };
      const returnPage = STATE.conceptEditorReturnPage;
      try {
        if (STATE.conceptEditorIsNew) {
          await api('/api/fonoran/concepts', { method: 'POST', body: JSON.stringify({ id, ...body }) });
          STATE.conceptEditorIsNew = false;
          STATE.conceptEditorSelected = id;
          toast(`Created ${id}`);
        } else {
          await api(`/api/fonoran/concepts/${encodeURIComponent(STATE.conceptEditorSelected)}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          if (id !== STATE.conceptEditorSelected) STATE.conceptEditorSelected = id;
          toast(`Saved ${id}`);
        }
        STATE.lexicon = null;
        STATE.rootCandidates = null;
        STATE.conceptEditorReturnPage = null;
        STATE.conceptEditorPendingId = null;
        if (returnPage === 'review') {
          await load({ skipRender: true });
          const sound = STATE.lab?.sounds?.find(s => s.concept_id === id && s.state !== 'rejected');
          if (sound) {
            STATE.reviewSelection = { type: 'sound', ref: sound.spelling };
          } else {
            STATE.reviewSelection = { type: 'candidate', ref: id };
          }
          switchPage('review');
        } else {
          await load();
          const c = conceptList().find(x => x.id === id);
          STATE.conceptEditorDraft = c ? conceptEditorDraftFrom(c) : conceptEditorEmptyDraft();
          renderConceptEditor();
        }
      } catch (err) { toast(err.message); }
    }

    async function renderConceptEditor() {
      const listEl = $('concept-editor-list');
      const filterEl = $('ce-filter');
      if (!listEl) return;

      try {
        await ensureLexicon();
        if (!STATE.conceptEditorDomains.length) {
          try {
            const { domains } = await api('/api/fonoran/concepts/domains');
            STATE.conceptEditorDomains = domains ?? [];
          } catch {
            STATE.conceptEditorDomains = [...new Set(conceptList().map(c => c.domain))].sort();
          }
        }
      } catch (err) {
        listEl.innerHTML = `<p class="empty sans">${escapeHtml(err.message)}</p>`;
        return;
      }

      if (filterEl && filterEl.value !== STATE.conceptEditorFilter) filterEl.value = STATE.conceptEditorFilter;

      if (STATE.conceptEditorPendingId) {
        const pending = conceptList().find(c => c.id === STATE.conceptEditorPendingId);
        STATE.conceptEditorSelected = STATE.conceptEditorPendingId;
        STATE.conceptEditorDraft = pending ? conceptEditorDraftFrom(pending) : STATE.conceptEditorDraft;
        STATE.conceptEditorPendingId = null;
      }

      const list = conceptEditorFilteredList();
      listEl.innerHTML = list.length
        ? list.map(c => {
          const selected = STATE.conceptEditorSelected === c.id && !STATE.conceptEditorIsNew;
          const gloss = c.concept.split(';')[0];
          const tip = `${c.domain} · ${c.id}`;
          return `<button type="button" class="dict-item concept-editor__item${selected ? ' is-selected' : ''}" data-ce-id="${escapeHtml(c.id)}" title="${escapeHtml(tip)}">
            <span class="concept-editor__pair-sound mono">${c.spelling ? escapeHtml(c.spelling) : '—'}</span>
            <span class="concept-editor__pair-meaning">${escapeHtml(gloss)}</span>
          </button>`;
        }).join('')
        : '<p class="empty sans" style="margin:0">No concepts match.</p>';

      listEl.querySelectorAll('[data-ce-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const c = conceptList().find(x => x.id === btn.dataset.ceId);
          if (!c) return;
          STATE.conceptEditorSelected = c.id;
          STATE.conceptEditorIsNew = false;
          STATE.conceptEditorDraft = conceptEditorDraftFrom(c);
          renderConceptEditor();
        });
      });

      if (!STATE.conceptEditorDraft && !STATE.conceptEditorIsNew && list.length) {
        const pick = list.find(c => c.id === STATE.conceptEditorSelected) ?? list[0];
        STATE.conceptEditorSelected = pick.id;
        STATE.conceptEditorDraft = conceptEditorDraftFrom(pick);
      }

      renderConceptEditorDetail();
      ensureSplitStickyObserver();
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    /* ---------- DICTIONARY ---------- */
    function dictEntries() {
      const base = STATE.lab.sounds.map(s => ({ kind: 'sound', id: s.spelling, word: s.spelling, english: s.meaning || '(unnamed)', gloss: s.gloss || '', aliases: (s.aliases ?? []).join(' '), concept_id: s.concept_id ?? '', type: 'base', state: s.state, hint: s.say_bold }));
      const comp = STATE.lab.compounds.map(c => ({
        kind: 'compound',
        id: c.id,
        word: c.spelling,
        english: c.meaning || '(unnamed)',
        gloss: c.gloss || '',
        aliases: (c.aliases ?? []).join(' '),
        concept_id: c.concept_id ?? '',
        type: 'compound',
        state: c.state,
        hint: (c.part_details ?? []).map(p => p.spelling).join(' + ') || (c.parts ?? []).join(' + '),
      }));
      let list = [...base, ...comp];
      const statusFilters = [];
      if (STATE.dictShowNeedsReview) statusFilters.push('needs_review', 'draft');
      if (STATE.dictShowApproved) statusFilters.push('approved', 'revised');
      if (STATE.dictShowRejected) statusFilters.push('rejected');
      if (statusFilters.length) {
        list = list.filter(e => statusFilters.includes(e.state));
      } else {
        list = list.filter(e => e.state !== 'rejected');
      }

      // Particles are a curated closed class: independent of the lab status filters.
      const particles = dictParticleEntries();
      list = [...list, ...particles];

      const q = STATE.dictQuery.trim().toLowerCase();
      if (q) list = list.filter(e => `${e.word} ${e.english} ${e.gloss} ${e.aliases} ${e.concept_id} ${e.hint}`.toLowerCase().includes(q));
      return list.sort((a, b) => a.word.localeCompare(b.word));
    }

    /** Curated grammar particles mapped into dictionary-entry shape. */
    function dictParticleEntries() {
      const data = STATE.dictParticles;
      if (!data?.particles) return [];
      return data.particles
        .filter(p => p.form)
        .map(p => ({
          kind: 'particle',
          id: p.id,
          word: p.form,
          english: p.gloss || p.id,
          gloss: p.gloss || '',
          aliases: (p.triggers ?? []).join(' '),
          concept_id: p.id,
          type: 'particle',
          state: 'active',
          role: p.role,
          group: p.group,
          triggers: p.triggers ?? [],
          hint: p.role || '',
        }));
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

    function particleDetailHtml(p) {
      const triggers = (p.triggers ?? []).filter(Boolean);
      const triggerHtml = triggers.length
        ? triggers.map(t => `<code>${escapeHtml(t)}</code>`).join(' ')
        : '<span class="muted">handled structurally / emitted by the grammar</span>';
      const examples = {
        logic_not: 'no + true = false · no + same = different',
        logic_yes: 'affirmative answer',
        query_marker: 'clause-initial flag for questions',
      }[p.id];
      return `
        <div class="fonoran-split-workspace-inner particle-detail">
          <div class="particle-detail__head">
            ${typeBadge('particle')}
            <span class="particle-detail__form">${escapeHtml(p.form)}</span>
          </div>
          <p class="particle-detail__gloss">${escapeHtml(p.gloss || p.id)}</p>
          <dl class="particle-detail__meta">
            <div><dt>Role</dt><dd>${escapeHtml(p.role || '—')}</dd></div>
            <div><dt>Group</dt><dd>${escapeHtml(p.group || '—')}</dd></div>
            <div><dt>English triggers</dt><dd>${triggerHtml}</dd></div>
            ${examples ? `<div><dt>Composition</dt><dd>${escapeHtml(examples)}</dd></div>` : ''}
          </dl>
          <p class="particle-detail__note sans">Grammar particle: invariant, never fused into spellings (see <a href="#grammar">grammar</a>).</p>
        </div>`;
    }

    function showParticleDetail(id) {
      const panel = $('dict-detail');
      if (!panel) return;
      const p = (STATE.dictParticles?.particles ?? []).find(x => x.id === id);
      panel.innerHTML = p
        ? particleDetailHtml(p)
        : '<div class="fonoran-split-empty"><p>Particle not found.</p></div>';
    }

    let dictDetailToken = 0;
    async function loadDictionaryDetail(entryKind, id) {
      if (entryKind === 'particle') {
        showParticleDetail(id);
        return;
      }
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

    function dictPickerMeaning(entry) {
      if (entry.kind === 'sound') {
        const sound = STATE.lab?.sounds.find(s => s.spelling === entry.id);
        if (sound) return pickerMeaningForSound(sound);
      }
      return pickerMeaningShort(entry.english === '(unnamed)' ? 'unnamed' : entry.english);
    }

    function dictItemHtml(entry) {
      const sel = STATE.dictSelection;
      const selected = sel && sel.kind === entry.kind && sel.id === entry.id;
      const type = entry.kind === 'sound' ? 'root' : entry.kind === 'particle' ? 'particle' : 'word';
      return pickerCellHtml({
        spelling: entry.word,
        meaning: dictPickerMeaning(entry),
        type,
        glyphs: entry.kind === 'particle' ? '' : null,
        showTypeBadge: entry.kind === 'particle',
        selected,
        attrs: { 'data-kind': entry.kind, 'data-id': entry.id },
      });
    }

    function dictListScrollInset() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--fonoran-split-chrome-offset').trim();
      const chrome = parseFloat(raw) || 144;
      return chrome + 16;
    }

    function scrollDictSelectionIntoView() {
      const sel = STATE.dictSelection;
      if (!sel || STATE.page !== 'dictionary') return;
      const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
      const btn = document.querySelector(
        `#dict-roots .root-cell[data-kind="${esc(sel.kind)}"][data-id="${esc(sel.id)}"], `
        + `#dict-words .root-cell[data-kind="${esc(sel.kind)}"][data-id="${esc(sel.id)}"], `
        + `#dict-particles .root-cell[data-kind="${esc(sel.kind)}"][data-id="${esc(sel.id)}"]`,
      );
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

    function wireDictionaryPicker(container) {
      container?.querySelectorAll('.root-cell[data-kind]').forEach(b => {
        b.addEventListener('click', () => selectDictionaryEntry(b.dataset.kind, b.dataset.id));
      });
    }

    function renderDictionaryList({ scrollToSelection = false } = {}) {
      const list = dictEntries();
      const roots = list.filter(e => e.kind === 'sound');
      const words = list.filter(e => e.kind === 'compound');
      const particles = list.filter(e => e.kind === 'particle');
      const showRoots = STATE.dictShowRoots;
      const showWords = STATE.dictShowWords;
      const showParticles = STATE.dictShowParticles;
      const emptyAll = STATE.lab.sounds.length + STATE.lab.compounds.length === 0;
      const emptyAllMsg = '<p class="empty" style="grid-column:1/-1">No vocabulary yet. <br/> <code>npm run fonoran:reset <br/> npm run fonoran:build</code></p>';
      const emptyMatchMsg = '<p class="empty" style="grid-column:1/-1">Nothing matches.</p>';

      $('dict-filters')?.querySelectorAll('[data-dict-filter]').forEach(chip => {
        const key = chip.dataset.dictFilter;
        const on = key === 'roots' ? showRoots
          : key === 'words' ? showWords
            : key === 'particles' ? showParticles
              : key === 'needs_review' ? STATE.dictShowNeedsReview
                : key === 'approved' ? STATE.dictShowApproved
                  : STATE.dictShowRejected;
        chip.classList.toggle('active', on);
      });
      $('dict-picker-empty')?.toggleAttribute('hidden', showRoots || showWords || showParticles);

      $('dict-roots-h')?.toggleAttribute('hidden', !showRoots);
      $('dict-words-h')?.toggleAttribute('hidden', !showWords);
      $('dict-particles-h')?.toggleAttribute('hidden', !showParticles);

      if (showRoots) {
        const rootsHtml = emptyAll
          ? emptyAllMsg
          : (roots.length ? roots.map(dictItemHtml).join('') : emptyMatchMsg);
        $('dict-roots').innerHTML = rootsHtml;
        wireDictionaryPicker($('dict-roots'));
      } else {
        $('dict-roots').innerHTML = '';
      }

      if (showWords) {
        const wordsHtml = emptyAll
          ? ''
          : (words.length ? words.map(dictItemHtml).join('') : emptyMatchMsg);
        $('dict-words').innerHTML = wordsHtml;
        wireDictionaryPicker($('dict-words'));
      } else {
        $('dict-words').innerHTML = '';
      }

      if (showParticles) {
        $('dict-particles').innerHTML = particles.length ? particles.map(dictItemHtml).join('') : emptyMatchMsg;
        wireDictionaryPicker($('dict-particles'));
      } else {
        $('dict-particles').innerHTML = '';
      }

      if (scrollToSelection) {
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollDictSelectionIntoView);
        });
      }
    }

    function pageEl(pageName = STATE.page) {
      const normalized = pageName === 'root-review' ? 'review' : pageName;
      return normalized === 'review' ? $('page-review') : (normalized ? $(`page-${normalized}`) : null);
    }

    function activeSplitPageEl(pageName = STATE.page) {
      const el = pageEl(pageName);
      if (el?.classList.contains('fonoran-split-page')) return el;
      return document.querySelector('.fonoran-split-page.active');
    }

    function syncSplitStickyOffsets() {
      const header = document.getElementById('app-header-root');
      let headerBottom = 0;
      if (header) {
        headerBottom = Math.ceil(header.getBoundingClientRect().bottom);
        document.documentElement.style.setProperty('--fonoran-header-offset', `${headerBottom}px`);
      }
      const shell = activeSplitPageEl()?.querySelector('[data-split-shell]');
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
      const grammarChrome = document.querySelector('#page-grammar.active .grammar-sticky-shell');
      if (grammarChrome) {
        document.documentElement.style.setProperty('--grammar-chrome-offset', `${grammarChrome.offsetHeight}px`);
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
      const grammarChrome = document.querySelector('#page-grammar .grammar-sticky-shell');
      if (grammarChrome && !grammarChrome.dataset.stickyObserved) {
        grammarChrome.dataset.stickyObserved = '1';
        splitStickyObserver.observe(grammarChrome);
      }
    }

    async function ensureDictParticles() {
      if (STATE.dictParticles) return;
      try {
        STATE.dictParticles = await api('/api/fonoran/grammar-particles');
      } catch {
        STATE.dictParticles = { particles: [] };
      }
    }

    function renderDictionary() {
      if (!STATE.lab) return;
      ensureSplitStickyObserver();
      Promise.all([ensureLexicon(), ensureDictParticles()])
        .then(() => {
          renderDictionaryList();
          syncDictSelection();
          requestAnimationFrame(syncSplitStickyOffsets);
        })
        .catch(() => {
          renderDictionaryList();
          syncDictSelection();
          requestAnimationFrame(syncSplitStickyOffsets);
        });
    }

    /* ---------- TRANSLATOR ---------- */
    let translatorToken = 0;

    const TRANSLATOR_SPEED_KEY = 'fonoran:translator:speed';
    const TRANSLATOR_SYLLABLE_MODE_KEY = 'fonoran:translator:syllable-by-syllable';
    const TRANSLATOR_SYLLABLE_MODE_LEGACY_KEY = 'fonoran:translator:word-by-word';
    const TRANSLATOR_SHOW_PRON_KEY = 'fonoran:translator:show-pronunciation';

    function readTranslatorShowPron() {
      return localStorage.getItem(TRANSLATOR_SHOW_PRON_KEY) === '1';
    }

    function readTranslatorSpeed() {
      const el = $('tr-speed');
      const raw = el ? parseFloat(el.value) : parseFloat(localStorage.getItem(TRANSLATOR_SPEED_KEY));
      return Number.isFinite(raw) ? Math.max(0.45, Math.min(1, raw)) : 1;
    }

    function syncTranslatorSpeedLabel() {
      const val = $('tr-speed-val');
      if (val) val.textContent = `${Math.round(readTranslatorSpeed() * 100)}%`;
    }

    function translatorCanHear(result) {
      return Boolean(result?.tokens?.some(t => t.resolved && t.parts?.length));
    }

    function syncTranslatorPlaybackUi(result) {
      const playBtn = $('tr-hear');
      const stopBtn = $('tr-stop');
      const canHear = translatorCanHear(result);
      if (playBtn && !STATE.translatorPlaying) {
        playBtn.disabled = !canHear;
        playBtn.textContent = '▶ Listen';
      }
      if (stopBtn && !STATE.translatorPlaying) stopBtn.disabled = true;
    }

    function buildTranslatorScriptPhrase(result, { syllableBySyllable = false } = {}) {
      if (!result?.tokens?.length || !STATE.rules) return { phrase: '', unitTokenIndex: [] };
      const chunks = [];
      const unitTokenIndex = [];
      for (let i = 0; i < result.tokens.length; i++) {
        const token = result.tokens[i];
        if (!token.resolved || !token.parts?.length) continue;
        if (syllableBySyllable && token.parts.length > 1) {
          for (const part of token.parts) {
            const { phrase } = romanToFonoraScript([part], STATE.rules);
            if (phrase) {
              chunks.push(phrase);
              unitTokenIndex.push(i);
            }
          }
        } else {
          const { phrase } = romanToFonoraScript(token.parts, STATE.rules);
          if (phrase) {
            chunks.push(phrase);
            unitTokenIndex.push(i);
          }
        }
      }
      return { phrase: chunks.join(' '), unitTokenIndex };
    }

    function highlightTranslatorToken(tokenIndex) {
      document.querySelectorAll('.translator-token').forEach(el => el.classList.remove('translator-token--speaking'));
      if (tokenIndex == null || tokenIndex < 0) return;
      document.querySelector(`.translator-token[data-tr-word="${tokenIndex}"]`)?.classList.add('translator-token--speaking');
    }

    async function speakTranslatorResult(result) {
      if (!result?.tokens?.some(t => t.resolved) || STATE.translatorPlaying) return;
      await ensureRules();
      primeAudioContext();

      const syllableBySyllable = $('tr-syllable-by-syllable')?.checked === true;
      const playbackRate = readTranslatorSpeed();
      const wordGapMs = syllableBySyllable ? Math.round(250 + (1 - playbackRate) * 450) : 0;
      const { phrase, unitTokenIndex } = buildTranslatorScriptPhrase(result, { syllableBySyllable });
      if (!phrase) {
        speak(compoundSpeakable(result.tokens.flatMap(t => (t.resolved ? t.parts : []))));
        return;
      }

      STATE.translatorPlaying = true;
      STATE.translatorCancel = false;
      const playBtn = $('tr-hear');
      const stopBtn = $('tr-stop');
      if (playBtn) { playBtn.disabled = true; playBtn.textContent = '…'; }
      if (stopBtn) stopBtn.disabled = false;

      highlightTranslatorToken(-1);

      try {
        cancelSpeech();
        await speakFonoraPhrase(phrase, STATE.rules, {
          engine: 'auto',
          playbackRate,
          wordGapMs,
          shouldCancel: () => STATE.translatorCancel,
          onWordStart: (index) => highlightTranslatorToken(unitTokenIndex[index]),
          onWordEnd: () => highlightTranslatorToken(-1),
        });
      } catch {
        speak(compoundSpeakable(result.tokens.flatMap(t => (t.resolved ? t.parts : []))));
      } finally {
        STATE.translatorPlaying = false;
        STATE.translatorCancel = false;
        highlightTranslatorToken(-1);
        if (playBtn) { playBtn.disabled = false; playBtn.textContent = '▶ Listen'; }
        if (stopBtn) stopBtn.disabled = true;
      }
    }

    function stopTranslatorSpeech() {
      if (!STATE.translatorPlaying) return;
      STATE.translatorCancel = true;
      cancelSpeech();
    }

    function translatorResolutionKind(token) {
      if (!token?.resolved) return 'unknown';
      return token.resolution_kind ?? (token.interpreted ? 'interpreted' : 'direct');
    }

    function translatorResolutionClass(kind) {
      if (kind === 'unknown') return 'translator-unresolved-sample';
      if (kind === 'interpreted') return 'translator-resolved--interpreted';
      if (kind === 'semantic') return 'translator-resolved--semantic';
      if (kind === 'alias_weak') return 'translator-resolved--alias_weak';
      return '';
    }

    function translatorTokenClass(token) {
      const kind = translatorResolutionKind(token);
      if (kind === 'unknown') return ' translator-token--unresolved';
      if (kind === 'interpreted') return ' translator-token--interpreted';
      if (kind === 'semantic') return ' translator-token--semantic';
      if (kind === 'alias_weak') return ' translator-token--semantic';
      return '';
    }

    function parseHashPage() {
      const raw = window.location.hash.replace(/^#/, '');
      return raw.split('?')[0] || 'home';
    }

    function translatorTokenHtml(token, index) {
      const kind = translatorResolutionKind(token);
      const resClass = translatorResolutionClass(kind);
      const fonoran = token.resolved
        ? `<span class="${resClass}">${escapeHtml(token.fonoran)}</span>`
        : `<span class="translator-unresolved-sample">${escapeHtml(token.english)}</span>`;
      const gloss = token.gloss ? `<span class="translator-token__gloss">${escapeHtml(token.gloss)}</span>` : '';
      const showInterp = token.interpreted || (kind !== 'direct' && kind !== 'unknown');
      const interp = showInterp
        ? `<span class="translator-token__interp">${escapeHtml(token.interpreted_from ?? token.english)} → ${escapeHtml(token.concept_id ?? token.lookup ?? '')}${token.interpret_reason ? ` (${escapeHtml(token.interpret_reason)})` : ''}</span>`
        : '';
      return `<li class="translator-token${translatorTokenClass(token)}" data-tr-word="${index}">
        <span class="translator-token__role">${escapeHtml(token.role)}</span>
        <span class="translator-token__english">${escapeHtml(token.english)}</span>
        <span class="translator-token__arrow" aria-hidden="true">→</span>
        <span class="translator-token__fonoran">${fonoran}</span>
        ${gloss}
        ${interp}
      </li>`;
    }

    async function renderTranslatorOutput(result) {
      const out = $('tr-output');
      if (!out) return;
      if (!result || result.mode === 'empty') {
        out.innerHTML = '<p class="translator-output__empty sans">Type English on the left to see Fonoran script and pronunciation.</p>';
        syncTranslatorPlaybackUi(null);
        return;
      }

      await ensureRules();
      const scriptParts = result.tokens.flatMap(t => (t.resolved ? t.parts : []));
      const script = scriptParts.length && STATE.rules
        ? result.tokens.map(t => {
          if (!t.resolved || !t.parts?.length) return '';
          return romanToFonoraScript(t.parts, STATE.rules).phrase;
        }).filter(Boolean).join(' ')
        : '';

      const romanHtml = result.tokens.map(t => {
        if (!t.resolved) {
          return `<span class="translator-unresolved-sample">${escapeHtml(t.english)}</span>`;
        }
        const kind = translatorResolutionKind(t);
        const cls = translatorResolutionClass(kind);
        return cls
          ? `<span class="${cls}">${escapeHtml(t.fonoran)}</span>`
          : escapeHtml(t.fonoran);
      }).join(' ');

      const pron = result.surface?.pronunciation;
      const showPron = readTranslatorShowPron();
      const pronHtml = pron?.sayLine
        ? `<div class="translator-output__pron-wrap">
            <label class="translator-output__pron-toggle sans">
              <input type="checkbox" id="tr-show-pron"${showPron ? ' checked' : ''}>
              Pronunciation
            </label>
            <div class="pron-block translator-output__pron" id="tr-pron-detail"${showPron ? '' : ' hidden'}>
              <div class="pron-line">Say: <strong>${escapeHtml(pron.sayLine)}</strong></div>
              ${pron.englishLine ? `<div class="pron-english">Sounds like: ${escapeHtml(pron.englishLine)}</div>` : ''}
            </div>
          </div>`
        : '';

      out.innerHTML = `
        <div class="translator-output__surface">
          ${script ? `<div class="translator-output__script fonora-script symbol-text">${escapeHtml(script)}</div>` : ''}
          <p class="translator-output__roman">${romanHtml}</p>
          ${pronHtml}
        </div>
        <ul class="translator-token-list">${result.tokens.map((t, i) => translatorTokenHtml(t, i)).join('')}</ul>
        ${result.unresolved?.length ? `<p class="sans translator-output__note" style="font-size:0.84rem;color:var(--muted);margin:0.75rem 0 0">Unresolved concepts reveal where the language still needs to grow — add a root or compound for these in the Root Creator or Word Creator.</p>` : ''}`;

      syncTranslatorPlaybackUi(result);
    }

    async function runTranslator() {
      const input = $('tr-input');
      const text = (input?.value ?? STATE.translatorInput ?? '').trim();
      STATE.translatorInput = input?.value ?? text;
      const token = ++translatorToken;

      if (!text) {
        STATE.translatorResult = null;
        renderTranslatorOutput(null);
        return;
      }

      STATE.translatorBusy = true;
      try {
        const result = await api('/api/fonoran/translate', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        if (token !== translatorToken) return;
        STATE.translatorResult = result;
        await renderTranslatorOutput(result);
      } catch (e) {
        if (token !== translatorToken) return;
        const out = $('tr-output');
        if (out) out.innerHTML = `<p class="translator-output__empty sans" style="color:var(--danger,#c0392b)">${escapeHtml(e.message)}</p>`;
        syncTranslatorPlaybackUi(null);
      } finally {
        if (token === translatorToken) STATE.translatorBusy = false;
      }
    }

    function renderTranslator() {
      const input = $('tr-input');
      if (input && input.value !== STATE.translatorInput) input.value = STATE.translatorInput;
      const speedEl = $('tr-speed');
      const savedSpeed = localStorage.getItem(TRANSLATOR_SPEED_KEY);
      if (speedEl && savedSpeed) speedEl.value = savedSpeed;
      const syllableEl = $('tr-syllable-by-syllable');
      const savedSyllableMode = localStorage.getItem(TRANSLATOR_SYLLABLE_MODE_KEY)
        ?? localStorage.getItem(TRANSLATOR_SYLLABLE_MODE_LEGACY_KEY);
      if (syllableEl && savedSyllableMode != null) syllableEl.checked = savedSyllableMode !== '0';
      syncTranslatorSpeedLabel();
      syncTranslatorPlaybackUi(STATE.translatorResult);
      if (STATE.translatorResult) void renderTranslatorOutput(STATE.translatorResult);
      else void renderTranslatorOutput(null);
    }

    /* ---------- GRAMMAR SPEC ---------- */
    const GRAMMAR_DOC_PATH = '../docs/fonoran-grammar.md';
    let grammarLoadToken = 0;

    async function renderGrammarMermaidIn(rootEl) {
      if (!window.mermaid || !rootEl) return;
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'ui-monospace, Menlo, monospace',
          lineColor: '#a89f95',
          clusterBkg: '#faf8f5',
          clusterBorder: '#e8e2da',
        },
        securityLevel: 'loose',
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await window.mermaid.run({ nodes: rootEl.querySelectorAll('.mermaid') });
      const { initMermaidPanZoomIn } = await import('../js/mermaid-pan-zoom.js');
      initMermaidPanZoomIn(rootEl, { fitMode: 'diagram' });
    }

    async function renderGrammar() {
      ensureSplitStickyObserver();
      syncSplitStickyOffsets();
      const body = $('grammar-body');
      const toc = $('grammar-toc');
      if (!body) return;
      const token = ++grammarLoadToken;
      body.innerHTML = '<p class="grammar-content__loading sans">Loading specification…</p>';
      if (toc) toc.innerHTML = '<p class="grammar-toc__loading sans">Loading…</p>';
      try {
        const res = await fetch(GRAMMAR_DOC_PATH, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not load grammar specification (HTTP ${res.status})`);
        const markdown = normalizeGrammarSource(await res.text());
        if (token !== grammarLoadToken) return;
        const headings = extractMarkdownHeadings(markdown, { minLevel: 2, maxLevel: 3 });
        if (toc) {
          toc.innerHTML = headings.length
            ? `<ul class="grammar-toc__list">${headings
                .map(
                  (h) =>
                    `<li class="grammar-toc__item grammar-toc__item--h${h.level}"><a href="#${escapeHtml(h.id)}" class="grammar-toc__link">${escapeHtml(h.title)}</a></li>`,
                )
                .join('')}</ul>`
            : '<p class="grammar-toc__loading sans">No sections</p>';
        }
        body.innerHTML = renderMarkdown(markdown, { docPath: 'docs/fonoran-grammar.md', grammar: true });
        await renderGrammarMermaidIn(body);
        if (token !== grammarLoadToken) return;
        syncSplitStickyOffsets();
        toc?.querySelectorAll('.grammar-toc__link').forEach((link) => {
          link.addEventListener('click', (event) => {
            const href = link.getAttribute('href');
            if (!href?.startsWith('#')) return;
            const target = document.getElementById(href.slice(1));
            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', `${window.location.pathname}#grammar`);
          });
        });
      } catch (e) {
        if (token !== grammarLoadToken) return;
        body.innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`;
        if (toc) toc.innerHTML = '';
      }
    }

    /* ---------- HEALTH + TIMELINE ---------- */
    async function undoLastChange() {
      if (!canWrite()) { toast('Sign in required'); return; }
      const res = await api('/api/fonoran/lab/undo', { method: 'POST', body: '{}' });
      toast(res.reverted ? `Undid: ${res.label}` : 'Nothing to undo');
      await load();
    }

    async function renderHealth() {
      let h;
      try { h = await fetchHealth(); } catch { $('health-body').innerHTML = '<p class="empty">Could not load health.</p>'; return; }
      $('health-body').innerHTML = `
        <div class="content-page">
          <section class="content-section">
            <h2 class="section-h">Language health</h2>
            <p class="section-lead">A live readability audit of vocabulary by four dimensions that measure internal consistency, morphological transparency, and learner ergonomics. Designed for conlang pedagogy, not English familiarity.</p>
            <div class="lander-health">
              ${buildLanderHealthHtml(h, { compact: true })}
            </div>
            <div class="health-details">
              <h3 class="section-h">Score breakdown &amp; conflicts</h3>
              ${buildHealthMethodHtml(h)}
            </div>
          </section>
        </div>`;
    }

    async function renderProgress() {
      try { await ensureRootCandidates(); } catch { /* candidates optional */ }
      const undoDisabled = !STATE.lab?.can_undo || !canWrite();
      $('progress-body').innerHTML = `
        <div class="content-page progress-page">
          <section class="content-section content-section--intro">
            <header class="home-intro-header">
              <h1>Lab progress</h1>
              <p class="home-subtitle">Review activity, vocabulary growth, and recent changes in your lab.</p>
            </header>
            <div class="health-progress-header">
              <h2 class="section-h">Your progress</h2>
              <button type="button" class="health-undo-btn" id="undo-btn"${undoDisabled ? ' disabled' : ''} data-write>↶ Undo</button>
            </div>
            ${buildReviewProgressHtml()}
            <div id="timeline"></div>
          </section>
        </div>`;
      $('undo-btn')?.addEventListener('click', () => { undoLastChange(); });
      renderTimeline();
    }

    /* ---------- translation gap test ---------- */
    function gapCoverageColor(pct) {
      return pct >= 80 ? 'var(--ok)' : pct >= 50 ? 'var(--review)' : 'var(--reject)';
    }

    function gapsPageHtml({ r, loading }) {
      const body = loading
        ? '<div class="gap-running"><span class="gap-spinner"></span> Loading latest results…</div>'
        : r
          ? buildGapReportHtml(r)
          : '<p class="empty">No saved run yet. Generate one with <code>node scripts/fonoran-translation-gaps.js</code>.</p>';

      const stamp = r?.generated_at
        ? `<div class="gap-controls"><span class="gap-controls__hint sans">Latest run ${new Date(r.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></div>`
        : '';

      return `
        <div class="content-page">
          <section class="content-section content-section--intro">
            <header class="home-intro-header">
              <h1>Translation Test</h1>
              <p class="home-subtitle">The latest full run of the English corpus through the translator. Red words are concepts the language cannot yet express.</p>
            </header>
            ${stamp}
            ${body}
          </section>
        </div>`;
    }

    function wireGapsControls(el) {
      el.querySelectorAll('[data-gap-level-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const lvl = Number(btn.dataset.gapLevelToggle);
          STATE.gapsExpanded[lvl] = !STATE.gapsExpanded[lvl];
          renderGaps();
        });
      });
    }

    function buildGapPhraseRow(p) {
      const miss = p.unresolved.length
        ? `<div class="gap-phrase__missing">missing: ${p.unresolved.map(w => `<span class="gap-chip">${escapeHtml(w)}</span>`).join(' ')}</div>`
        : '';
      const status = p.unresolved.length === 0
        ? '<span class="gap-status gap-status--ok">✓</span>'
        : `<span class="gap-status gap-status--bad">✗ ${p.unresolved.length}</span>`;
      return `
        <div class="gap-phrase${p.unresolved.length ? ' gap-phrase--miss' : ''}">
          <div class="gap-phrase__head">${status}<span class="gap-phrase__en">${escapeHtml(p.phrase)}</span></div>
          <div class="gap-phrase__fon mono">${escapeHtml(p.roman || '(empty)')}</div>
          ${miss}
        </div>`;
    }

    function buildGapReportHtml(r) {
      const summary = `
        <div class="gap-summary">
          <div class="gap-stat">
            <div class="gap-stat__value" style="color:${gapCoverageColor(r.coverage_pct)}">${r.coverage_pct}%</div>
            <div class="gap-stat__label">Coverage</div>
          </div>
          <div class="gap-stat">
            <div class="gap-stat__value">${r.clean_phrases}/${r.total_phrases}</div>
            <div class="gap-stat__label">Phrases fully resolved</div>
          </div>
          <div class="gap-stat">
            <div class="gap-stat__value" style="color:var(--reject)">${r.distinct_gaps}</div>
            <div class="gap-stat__label">Distinct missing concepts</div>
          </div>
        </div>`;

      const coverageBars = `
        <section class="gap-block">
          <h3 class="section-h">Coverage by level</h3>
          <div class="gap-levels">
            ${(r.levels ?? []).map(s => `
              <div class="gap-level-row">
                <div class="gap-level-row__name">L${s.level} · ${escapeHtml(s.name)}</div>
                <div class="gap-level-row__bar"><span style="width:${s.coverage}%;background:${gapCoverageColor(s.coverage)}"></span></div>
                <div class="gap-level-row__pct">${s.clean}/${s.phrases}</div>
              </div>`).join('')}
          </div>
        </section>`;

      const gapList = `
        <section class="gap-block">
          <h3 class="section-h">Missing concepts <span class="gap-count">(by frequency)</span></h3>
          ${!(r.gaps ?? []).length
            ? '<p class="empty">No gaps — every phrase fully resolved.</p>'
            : `<div class="gap-list">${(r.gaps ?? []).map(g => `
                <div class="gap-item">
                  <span class="gap-item__count">${g.count}×</span>
                  <span class="gap-item__word">${escapeHtml(g.word)}</span>
                  <span class="gap-item__sample">${escapeHtml(g.samples[0] ?? '')}</span>
                </div>`).join('')}</div>`}
        </section>`;

      const byLevel = new Map();
      for (const p of r.phrases ?? []) {
        if (!byLevel.has(p.level)) byLevel.set(p.level, []);
        byLevel.get(p.level).push(p);
      }
      const phraseGroups = `
        <section class="gap-block">
          <h3 class="section-h">Phrase-by-phrase</h3>
          <div class="gap-groups">
            ${(r.levels ?? []).map(s => {
              const expanded = STATE.gapsExpanded[s.level];
              const phrases = byLevel.get(s.level) ?? [];
              return `
                <div class="gap-group">
                  <button type="button" class="gap-group__head" data-gap-level-toggle="${s.level}" aria-expanded="${expanded ? 'true' : 'false'}">
                    <span class="gap-group__chevron">${expanded ? '▾' : '▸'}</span>
                    <span class="gap-group__title">Level ${s.level}: ${escapeHtml(s.name)}</span>
                    <span class="gap-group__meta" style="color:${gapCoverageColor(s.coverage)}">${s.coverage}%</span>
                  </button>
                  ${expanded ? `<div class="gap-group__body">${phrases.map(buildGapPhraseRow).join('')}</div>` : ''}
                </div>`;
            }).join('')}
          </div>
        </section>`;

      return summary + coverageBars + gapList + phraseGroups;
    }

    async function renderGaps() {
      const el = $('gaps-body');
      if (!el) return;

      // Fetch the saved "latest" full run once, then render from cache.
      if (!STATE.gapsLoaded) {
        el.innerHTML = gapsPageHtml({ r: null, loading: true });
        try {
          STATE.gapsReport = await api('/api/fonoran/translation-tests/latest');
        } catch {
          STATE.gapsReport = null;
        }
        STATE.gapsLoaded = true;
      }

      el.innerHTML = gapsPageHtml({ r: STATE.gapsReport, loading: false });
      wireGapsControls(el);
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
    const MAIN_PAGES = new Set(['roots', 'create', 'review', 'dictionary', 'translator']);
    const ALL_PAGES = new Set(['home', 'root-review', 'roots', 'create', 'review', 'dictionary', 'grammar', 'translator', 'health', 'gaps', 'progress', 'advanced', 'concepts']);

    function confirmDangerAction({ title, message, typeToConfirm }) {
      if (!confirm(`${title}\n\n${message}\n\nAre you sure you want to continue?`)) return false;
      if (typeToConfirm) {
        const typed = prompt(`Type "${typeToConfirm}" to confirm. This action cannot be undone.`);
        if (typed !== typeToConfirm) {
          toast('Confirmation failed — action cancelled.');
          return false;
        }
      } else if (!confirm('This is your last chance to cancel. Proceed?')) {
        return false;
      }
      return true;
    }
    function scrollPageTop() {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    function rememberMainPage() {
      if (MAIN_PAGES.has(STATE.page)) STATE.toolReturnPage = STATE.page;
    }
    function switchPage(name) {
      if (name === 'root-review') {
        STATE.rootReviewFocusPending = true;
        name = 'review';
      } else if (name === 'review' && STATE.page !== 'review') {
        STATE.reviewFocusPending = true;
      }
      STATE.page = name;
      setActiveTab(name);
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const target = pageEl(name);
      if (target) target.classList.add('active');
      else if (name !== 'home') {
        console.warn(`Fonoran: missing page section for "${name}"`);
        $('page-home')?.classList.add('active');
        name = 'home';
        STATE.page = 'home';
      }
      if (name === 'home') {
        if (window.location.hash) history.replaceState(null, '', window.location.pathname);
      } else if (ALL_PAGES.has(name) || name === 'review') {
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
        if (name === 'dictionary' || name === 'create' || name === 'roots' || name === 'grammar' || name === 'concepts' || name === 'review') {
          syncSplitStickyOffsets();
          requestAnimationFrame(syncSplitStickyOffsets);
        }
      });
    }

    const header = document.getElementById('app-header-root');
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
    $('dict-filters')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-dict-filter]');
      if (!chip) return;
      const key = chip.dataset.dictFilter;
      if (key === 'roots') STATE.dictShowRoots = !STATE.dictShowRoots;
      else if (key === 'words') STATE.dictShowWords = !STATE.dictShowWords;
      else if (key === 'particles') STATE.dictShowParticles = !STATE.dictShowParticles;
      else if (key === 'needs_review') STATE.dictShowNeedsReview = !STATE.dictShowNeedsReview;
      else if (key === 'approved') STATE.dictShowApproved = !STATE.dictShowApproved;
      else if (key === 'rejected') STATE.dictShowRejected = !STATE.dictShowRejected;
      renderDictionary();
    });
    $('ce-filter')?.addEventListener('input', e => { STATE.conceptEditorFilter = e.target.value; renderConceptEditor(); });
    $('ce-new')?.addEventListener('click', () => {
      STATE.conceptEditorIsNew = true;
      STATE.conceptEditorSelected = null;
      STATE.conceptEditorDraft = conceptEditorEmptyDraft();
      renderConceptEditor();
    });
    $('wc-filter').addEventListener('input', e => { STATE.wordComposerFilter = e.target.value; renderWordComposer(); });
    $('rv-filter')?.addEventListener('input', e => { STATE.reviewFilter = e.target.value; renderUnifiedReview(); });
    $('rv-filters')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-rv-filter]');
      if (!chip) return;
      const key = chip.dataset.rvFilter;
      if (key === 'roots') STATE.reviewShowRoots = !STATE.reviewShowRoots;
      else if (key === 'words') STATE.reviewShowLabWords = !STATE.reviewShowLabWords;
      else if (key === 'generated') STATE.reviewShowGeneratedWords = !STATE.reviewShowGeneratedWords;
      else if (key === 'needs-review') {
        STATE.reviewNeedsReviewOnly = !STATE.reviewNeedsReviewOnly;
        if (STATE.reviewNeedsReviewOnly) STATE.reviewShowRejected = false;
      }
      else if (key === 'rejected') {
        STATE.reviewShowRejected = !STATE.reviewShowRejected;
        if (STATE.reviewShowRejected) STATE.reviewNeedsReviewOnly = false;
      }
      renderUnifiedReview();
    });
    $('wc-meaning')?.addEventListener('input', () => {
      renderEditDupe('compound', STATE.wordComposerEditingId ?? '', $('wc-meaning').value, 'wc');
      renderWordEditorRecipe('wc', STATE.wordComposerEditingId, STATE.wordComposer);
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
    $('wc-clear').addEventListener('click', () => clearWordComposer());
    $('wc-cancel')?.addEventListener('click', () => {
      const returnPage = STATE.wordComposerReturnPage;
      clearWordComposer();
      if (returnPage === 'review') switchPage('review');
    });
    $('wc-save').addEventListener('click', async () => {
      const meaning = $('wc-meaning').value.trim();
      if (STATE.wordComposer.length < 2) { toast('Stack at least two components.'); return; }
      if (!meaning) { toast('Give the word a meaning.'); return; }
      const spelling = resolveComposerSpelling(STATE.wordComposer);
      const aliases = ($('wc-aliases')?.value ?? '').trim();
      const editingId = STATE.wordComposerEditingId;
      const returnPage = STATE.wordComposerReturnPage;
      try {
        if (editingId) {
          const existing = STATE.lab.compounds.find(c => c.id === editingId);
          const recipeChanged = spelling !== existing?.spelling;
          if (recipeChanged) {
            const res = await api(`/api/fonoran/lab/compounds/${encodeURIComponent(editingId)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                components: composerToApi(STATE.wordComposer),
                meaning,
                allow_unapproved: STATE.showUnapprovedWords,
              }),
            });
            toast(`Saved ${res.spelling ?? spelling}`);
            if (returnPage === 'review') {
              STATE.reviewSelection = { type: 'compound', ref: res.id ?? editingId };
            }
          } else {
            const changed = meaning !== (existing?.meaning ?? '');
            await api(`/api/fonoran/lab/compounds/${encodeURIComponent(editingId)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                meaning,
                aliases: aliases || undefined,
                state: changed && existing?.meaning ? 'revised' : undefined,
              }),
            });
            toast(`Saved ${spelling}`);
          }
        } else {
          await api('/api/fonoran/lab/compounds', {
            method: 'POST',
            body: JSON.stringify({
              components: composerToApi(STATE.wordComposer),
              meaning,
              aliases: aliases || undefined,
              allow_unapproved: STATE.showUnapprovedWords,
            }),
          });
          toast(`Saved ${spelling} → ${meaning}`);
        }
        clearWordComposer();
        await load({ skipRender: true });
        if (returnPage === 'review') {
          switchPage('review');
        } else {
          renderWordComposer();
        }
      } catch (e) { toast(e.message); }
    });
    bindModalDismiss({
      backdrop: $('sheet-backdrop'),
      panel: $('sheet'),
      close: closeSheet,
      isOpen: () => $('sheet')?.classList.contains('open'),
    });
    $('adv-import-vocabulary').addEventListener('click', async () => {
      if (!confirmDangerAction({
        title: 'Run converged build',
        message: 'Generate the converged vocabulary (roots + curated compounds), locking any approved spellings? Lab vocabulary is rebuilt; user-added roots and words you created are preserved.',
      })) return;
      const r = await api('/api/fonoran/lab/build', { method: 'POST', body: '{}' });
      const preserved = (r.preserved_compounds ?? 0) + (r.preserved_sounds ?? 0);
      toast(`Generated ${r.roots} roots and ${r.compounds} words${preserved ? ` (${preserved} user items kept)` : ''}`);
      await load();
      rememberMainPage();
      switchPage('dictionary');
    });
    $('adv-reset-review').addEventListener('click', async () => {
      if (!confirmDangerAction({
        title: 'Reset all review states',
        message: 'Move every root and word back to needs review? Meanings stay; you re-approve from scratch.',
      })) return;
      const r = await api('/api/fonoran/lab/reset-review', { method: 'POST', body: '{}' });
      toast(`Reset ${r.sounds_reset} roots and ${r.compounds_reset} words`);
      await load();
    });
    $('adv-reconcile-inventory')?.addEventListener('click', async () => {
      try {
        const r = await api('/api/fonoran/lab/reconcile-inventory', { method: 'POST', body: '{}' });
        STATE.lexicon = null;
        toast(`Reconciled ${r.reconciled} concept${r.reconciled === 1 ? '' : 's'} from lab`);
        await load();
      } catch (e) { toast(e.message); }
    });
    $('adv-reseed').addEventListener('click', async () => {
      if (!confirmDangerAction({
        title: 'Reset lab',
        message: 'Clear the lab vocabulary, review queue, and all assigned Fonoran sounds? English concept definitions stay — run `npm run fonoran:build` or `npm run fonoran:build:approved` to start fresh.',
        typeToConfirm: 'RESET',
      })) return;
      await api('/api/fonoran/lab/seed', { method: 'POST', body: '{}' });
      STATE.lexicon = null;
      STATE.rootCandidates = null;
      await ensureLexicon();
      toast('Lab reset — vocabulary and review queue cleared');
      await load();
    });

    async function renderAdvanced() {
      try {
        const h = await fetchHealth();
        const d = h.dda ?? {};
        $('adv-dda-status').textContent = `DDA: ${d.pending ?? 0} pending · ${d.stale ?? 0} stale · ${d.inferred ?? 0} inferred · ${d.confirmed ?? 0} confirmed`;
        try {
          const status = await api('/api/fonoran/snapshot/status');
          const lab = status.lab ?? {};
          $('adv-storage-status').textContent =
            `Storage: ${status.storage_mode} · ${lab.sounds ?? 0} roots · ${lab.compounds ?? 0} words · lab updated ${lab.updated_at ? new Date(lab.updated_at).toLocaleString() : '—'}`;
        } catch {
          if ($('adv-storage-status')) $('adv-storage-status').textContent = '';
        }
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
      } catch {
        $('adv-dda-status').textContent = '';
      }
    }

    $('adv-run-dda').addEventListener('click', async () => {
      try {
        const r = await api('/api/fonoran/lab/run-dda', { method: 'POST', body: JSON.stringify({ scope: 'pending' }) });
        toast(`DDA: ${r.processed} processed (${r.confirmed} confirmed, ${r.inferred} inferred)`);
        await load({ skipRender: true });
        renderAdvanced();
      } catch (e) { toast(e.message); }
    });
    $('adv-debug-dda')?.addEventListener('change', e => {
      STATE.showDebugDda = e.target.checked;
      renderAdvanced();
    });

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          resolve(String(dataUrl).split(',')[1] ?? '');
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
    }

    $('adv-snapshot-import')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const zip_base64 = await fileToBase64(file);
        const preview = await api('/api/fonoran/snapshot/preview', {
          method: 'POST',
          body: JSON.stringify({ zip_base64 }),
        });
        const summary = preview.summary ?? {};
        const previewEl = $('adv-snapshot-preview');
        if (previewEl) {
          previewEl.textContent = JSON.stringify(preview, null, 2);
          previewEl.hidden = false;
        }
        const ok = confirmDangerAction({
          title: 'Restore snapshot',
          message: `Replace all Fonoran state with this backup?\n\n${summary.sounds ?? 0} roots · ${summary.compounds ?? 0} words · ${summary.primitives ?? 0} concepts · ${summary.candidates ?? 0} candidates`,
          typeToConfirm: 'RESTORE',
        });
        if (!ok) return;
        await api('/api/fonoran/snapshot/import', {
          method: 'POST',
          body: JSON.stringify({ confirm: 'RESTORE', zip_base64 }),
        });
        STATE.lexicon = null;
        STATE.rootCandidates = null;
        toast('Snapshot restored');
        await load();
      } catch (err) { toast(err.message); }
    });

    $('tr-hear')?.addEventListener('click', () => {
      if (STATE.translatorResult) void speakTranslatorResult(STATE.translatorResult);
    });
    $('tr-stop')?.addEventListener('click', () => stopTranslatorSpeech());

    let translatorDebounce = null;
    $('tr-input')?.addEventListener('input', (e) => {
      STATE.translatorInput = e.target.value;
      clearTimeout(translatorDebounce);
      translatorDebounce = setTimeout(() => { void runTranslator(); }, 280);
    });
    $('tr-speed')?.addEventListener('input', () => {
      syncTranslatorSpeedLabel();
      localStorage.setItem(TRANSLATOR_SPEED_KEY, String(readTranslatorSpeed()));
    });
    $('tr-syllable-by-syllable')?.addEventListener('change', (e) => {
      localStorage.setItem(TRANSLATOR_SYLLABLE_MODE_KEY, e.target.checked ? '1' : '0');
    });
    $('tr-output')?.addEventListener('change', (e) => {
      if (e.target.id !== 'tr-show-pron') return;
      const detail = $('tr-pron-detail');
      if (detail) detail.hidden = !e.target.checked;
      localStorage.setItem(TRANSLATOR_SHOW_PRON_KEY, e.target.checked ? '1' : '0');
    });
    document.querySelectorAll('[data-tr-example]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.trExample ?? '';
        const input = $('tr-input');
        if (input) input.value = text;
        STATE.translatorInput = text;
        void runTranslator();
      });
    });

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    const hashOnLoad = window.location.hash.replace(/^#/, '').split('?')[0];
    const initialPageRaw = (hashOnLoad && ALL_PAGES.has(hashOnLoad) ? hashOnLoad : null)
      || document.documentElement.getAttribute('data-fonora-page')
      || 'home';
    const initialPage = initialPageRaw === 'root-review' ? 'review' : initialPageRaw;
    setNavSelectHandlers({
      onPage: (page) => switchPage(page),
      onSignOut: () => { signOut(); },
    });
    initUniversalNav({ context: 'language', activeTab: initialPage });
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    $(`page-${initialPage}`)?.classList.add('active');

    async function boot() {
      STATE.page = initialPage;
      if (initialPage === 'review') STATE.reviewFocusPending = true;
      if (initialPageRaw === 'root-review') STATE.rootReviewFocusPending = true;
      await refreshAuth();
      handleAuthUrlErrors();
      updateAuthGate();
      window.addEventListener('hashchange', () => {
        const hashPage = parseHashPage();
        let page = hashPage && ALL_PAGES.has(hashPage) ? hashPage : 'home';
        if (hashPage === 'root-review') {
          STATE.rootReviewFocusPending = true;
          page = 'review';
        }
        if (page !== STATE.page) switchPage(page);
      });
      wireLander();
      window.addEventListener('resize', syncSplitStickyOffsets);
      await load();
      syncSplitStickyOffsets();
    }

    boot();
