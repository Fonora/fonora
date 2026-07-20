    import { toSpeakable, compoundSpeakable, phoneticKeyBold, compoundPhoneticKey, englishGuide, compoundEnglishGuide, isValidSyllable, romanToIpa } from '../tools/fonoran-pronunciation.js';
    import { checkCompoundBoundary, segmentCompound, pronounceabilityScore, rootSimilarity } from '../tools/fonoran-gen3-readability.js';
    import { romanToFonoraScript, romanTextToFonoraScript, pauseMsForPunctuation } from '../tools/fonoran-fonora-bridge.js';
    import { buildPlaybackFromTokens, isSkippablePlaybackToken } from '../js/fonoran-playback-build.js';
    import { createFonoraKeyboard } from '../js/fonora-keyboard-ui.js';
    import { loadLanguageRules } from '../js/load-language-rules.js';
    import { speakFonoraPhrase, cancelSpeech, setReaderWordSources } from '../js/fonora-tts.js';
    import { getSamplePlaybackPlan, getPiperVoiceForLang, initPiperAudio } from '../js/piper-audio.js';
    import { resolveEspeakVoice, loadLanguagePreferences } from '../js/language-preferences.js';
    import { primeAudioContext } from '../js/espeak-audio.js';
    import { initUniversalNav, setActiveTab, setFonoranUndoDisabled, setFonoranAuth, setNavSelectHandlers } from '../js/universal-nav.js';
    import { mountSiteFooter } from '../js/site-footer.js';
    import { createPuzzlePage } from './pages/puzzle-page.js';
    import { buildComposeScenesFromLab, mountComposeShowcase } from './compose-showcase.js';
    import { labEntryMatchesQuery } from '../tools/fonoran-lab-search.js';
    import { experienceMetaFor } from '../tools/fonoran-experience-tiers.js';
    import { bindModalDismiss, setModalBackdropOpen } from '../js/modal-dismiss.js';
    import { extractMarkdownHeadings, normalizeGrammarSource, renderMarkdown } from '../js/markdown-render.js';
    import {
      disconnectTocScrollSpy,
      ensurePageChromeObserver,
      mountDocToc,
      scrollToPageAnchor,
      setupContentAnchorHandlers,
      setupTocClickHandlers,
      setupTocScrollSpy,
      syncPageChromeOffset,
    } from '../js/markdown-doc-shell.js';
    import { getStoredTheme, isDarkTheme } from '../js/theme.js';
    import { buildMermaidPanZoomHtml } from '../js/mermaid-pan-zoom.js';
    import { playButtonMarkup, setPlayButtonLabel, setPlayButtonText } from '../js/play-button-ui.js';
    import {
      dictStateToFilters,
      isFilterActive,
      passesLabFilters,
      toggleFilterKey,
      UI_TIER_LABELS,
    } from './lab-filters.js';

    const AUTH = {
      required: false,
      authenticated: true,
      isAdmin: true,
      email: null,
      userId: null,
      role: null,
      loginUrl: '/auth/google?returnTo=/language',
      loginUrls: { google: '/auth/google', primary: '/auth/google' },
    };
    const WRITE_PAGES = new Set([]);
    const LEGACY_WORD_PAGES = new Set(['words', 'create', 'review', 'concepts', 'roots', 'root-review']);

    function goWordManager() {
      window.location.href = `/tools#word-manager${window.location.search}`;
    }

    function isWordManagerPage(name) {
      return LEGACY_WORD_PAGES.has(name);
    }

    function isAdmin() {
      return AUTH.isAdmin;
    }

    function isSignedIn() {
      return AUTH.authenticated;
    }

    function canWrite() {
      return !AUTH.required || AUTH.isAdmin;
    }

    function writeLocked() {
      return AUTH.required && !AUTH.isAdmin;
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
      let data = null;
      try {
        const returnTo = authReturnPath();
        const res = await fetch(`/auth/session?returnTo=${encodeURIComponent(returnTo)}`, { credentials: 'include' });
        data = await res.json();
        AUTH.required = Boolean(data.authRequired);
        AUTH.authenticated = Boolean(data.authenticated);
        AUTH.isAdmin = Boolean(data.isAdmin);
        AUTH.email = data.email ?? null;
        AUTH.userId = data.userId ?? null;
        AUTH.role = data.role ?? null;
        AUTH.loginUrl = data.loginUrl ?? '/auth/google?returnTo=/language';
        AUTH.loginUrls = data.loginUrls ?? { primary: AUTH.loginUrl };
      } catch {
        AUTH.required = false;
        AUTH.authenticated = true;
      }
      setFonoranAuth({
        required: AUTH.required,
        configured: Boolean(data?.authConfigured),
        toolsGated: Boolean(data?.toolsGated ?? data?.learnToolsGated),
        authenticated: AUTH.authenticated,
        isAdmin: AUTH.isAdmin,
        email: AUTH.email,
        loginUrl: AUTH.loginUrl,
        loginUrls: AUTH.loginUrls,
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
      const show = AUTH.required && !AUTH.isAdmin && WRITE_PAGES.has(STATE.page);
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
      const googleUrl = escapeHtml(AUTH.loginUrls?.google ?? AUTH.loginUrl);
      gate.innerHTML = `<p>Sign in with the <strong>admin</strong> account to edit Fonoran canon in Advanced settings.</p>
        <p class="sans">Community sign-in with Google works for voting on the Dictionary without admin access.</p>
        <div class="auth-gate__buttons">
          ${googleUrl ? `<a href="${googleUrl}" class="btn btn--primary auth-gate__sign-in">Continue with Google</a>` : ''}
        </div>`;
      const host = main;
      if (host && gate.parentElement !== host) host.prepend(gate);
      requestAnimationFrame(syncSplitStickyOffsets);
    }

    let landerShowcaseWord = null;
    let landerShowcaseToken = 0;
    /** @type {(() => void) | null} */
    let landerShowcaseCleanup = null;

    const LANDER_SHOWCASE_SPELLING = 'shakafa';

    function pickLanderShowcaseWord() {
      const pool = (STATE.lab?.compounds ?? []).filter((c) => {
        if (c.state === 'rejected') return false;
        const partCount = c.components?.length ?? c.parts?.length ?? 0;
        return partCount >= 2;
      });
      const preferred = pool.find((c) => c.spelling === LANDER_SHOWCASE_SPELLING);
      if (preferred) return preferred;
      return pool[0] ?? null;
    }
    let landerHealthToken = 0;

    const STATE = {
      lab: null, page: 'home', rules: null,
      justSaved: null,
      dictQuery: '', dictSelection: null,
      dictShowRoots: true,
      dictShowWords: true,
      dictShowParticles: false,
      dictParticles: null,
      dictShowNeedsReview: false,
      dictShowApproved: false,
      dictShowRejected: false,
      dictShowReconsider: false,
      dictCoreOnly: false,
      conceptTiers: null,
      lexicon: null,
      health: null,
      healthKey: null,
      toolReturnPage: 'dictionary',
      translatorInput: '',
      translatorResult: null,
      translatorBusy: false,
      translatorPlaying: false,
      translatorCancel: false,
      puzzle: {
        challenge: null,
        coreOnly: false,
        difficultyMode: 'normal',
        repairTurns: 0,
        revealed: false,
        busy: false,
        recorded: false,
        lastRoundId: null,
        feedbackSent: false,
        feedbackTags: [],
        feedbackNote: '',
        session: { played: 0, recovered: 0 },
        summary: null,
        missedMode: false,
        missedIndex: null,
      },
      rootCandidates: null,
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
    function cancelBrowserSpeech() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    function cancelAllSpeech() {
      cancelSpeech();
      cancelBrowserSpeech();
    }

    const SOURCE_LANG_BCP47 = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ja: 'ja-JP',
      ar: 'ar-SA',
      zh: 'zh-CN',
    };

    function sourceLangToBcp47(lang) {
      const code = String(lang ?? 'en').toLowerCase().split(/[-_]/)[0];
      return SOURCE_LANG_BCP47[code] ?? 'en-US';
    }

    function speakAsync(text, lang = 'en-US') {
      return new Promise((resolve) => {
        if (!window.speechSynthesis || !String(text ?? '').trim()) {
          resolve();
          return;
        }
        cancelBrowserSpeech();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.85;
        const done = () => resolve();
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
      });
    }

    /** @deprecated Use speakAsync — kept for quick fire-and-forget outside playback loops. */
    function speak(text) {
      void speakAsync(text);
    }

    async function speakNeural(parts, { lang = 'en' } = {}) {
      const list = Array.isArray(parts) ? parts : [parts];
      const rules = await ensureRules();
      const { phrase } = romanToFonoraScript(list, rules);
      if (!phrase) throw new Error('no script');
      cancelSpeech();
      const plan = getSamplePlaybackPlan(lang);
      await speakFonoraPhrase(phrase, rules, plan ?? {
        engine: 'piper',
        piperVoice: getPiperVoiceForLang('en'),
        espeakVoice: resolveEspeakVoice(lang, { englishDialect: loadLanguagePreferences().englishDialect }),
      });
    }
    async function ensureRules() {
      if (!STATE.rules) {
        const bundle = await loadLanguageRules('../docs/language-rules.md');
        STATE.rules = bundle.rules;
      }
      return STATE.rules;
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

    const { renderPuzzle } = createPuzzlePage({
      getState: () => STATE,
      api,
      $,
      escapeHtml,
      toast,
      ensureRules,
      romanToFonoraScript,
      speakNeural,
    });

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
        const piperVoice = getPiperVoiceForLang(loadLanguagePreferences().lang) || 'en_US-lessac-medium';
        initPiperAudio(piperVoice).catch(() => {});
        if (!opts.skipRender) renderActivePage();
      } catch { $('load-error').hidden = false; }
    }

    function renderActivePage() {
      const labOptional = new Set(['home', 'grammar', 'translator']);
      if (!labOptional.has(STATE.page) && !STATE.lab) return;
      if (STATE.page === 'home') {
        wireLander();
        renderLanderShowcase();
      }
      else if (STATE.page === 'dictionary') renderDictionary();
      else if (STATE.page === 'grammar') renderGrammar();
      else if (STATE.page === 'translator') renderTranslator();
      else if (STATE.page === 'puzzle') renderPuzzle();
      else if (STATE.page === 'health') renderHealth();
      else if (STATE.page === 'progress') renderProgress();
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
        healthBtn.addEventListener('click', () => {
          window.location.href = `/tools#health${window.location.search}`;
        });
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

    const LANGUAGE_TIER_LABELS = {
      communicative_core: UI_TIER_LABELS.communicative_core,
      extended_core: 'Ring 2 — Everyday (100)',
      fluent_core: 'Ring 3 — Fluency (150 max)',
      complete: 'Ring 3 — Fluency (150 max)',
    };
    const EXPERIENCE_TIER_LABELS = {
      survival_body: 'Survival & body', space_motion: 'Space & motion', social: 'Social',
      emotion: 'Emotion', time: 'Time', thinking: 'Thinking', abstract: 'Abstract',
    };

    async function ensureConceptTiers() {
      if (STATE.conceptTiers) return STATE.conceptTiers;
      const map = new Map();
      try {
        const data = await api('/api/fonoran/concepts');
        for (const c of data.concepts ?? []) {
          if (!c.id) continue;
          map.set(c.id, {
            experience_tier: c.experience_tier ?? null,
            language_tier: c.language_tier ?? null,
            campfire_pass: c.campfire_pass ?? null,
            reconsider: Boolean(c.reconsider),
            reconsider_reason: c.reconsider_reason ?? null,
          });
        }
      } catch { /* tiers are optional decoration */ }
      STATE.conceptTiers = map;
      return map;
    }

    function tierFor(conceptId) {
      if (!conceptId) return null;
      const cached = STATE.conceptTiers?.get(conceptId);
      if (cached?.language_tier) return cached;
      const meta = experienceMetaFor(conceptId);
      if (!meta) return null;
      return {
        experience_tier: meta.experience_tier,
        language_tier: meta.language_tier,
        campfire_pass: meta.campfire.pass,
      };
    }

    function buildTierPlacementHtml(conceptId) {
      const t = tierFor(conceptId);
      if (!t?.language_tier) return '';
      const lang = LANGUAGE_TIER_LABELS[t.language_tier] ?? t.language_tier;
      const exp = t.experience_tier
        ? (EXPERIENCE_TIER_LABELS[t.experience_tier] ?? t.experience_tier)
        : '';
      const campfire = t.campfire_pass
        ? '<span class="wp-placement__campfire"><span class="wp-placement__mark" aria-hidden="true">✓</span> Campfire</span>'
        : '';
      return `<div class="wp-placement">
        <span class="wp-placement__tier">${escapeHtml(lang)}</span>
        ${exp ? `<span class="wp-placement__experience">${escapeHtml(exp)}</span>` : ''}
        ${campfire}
      </div>`;
    }

    function buildDictionarySideActionsHtml({ hasMermaid, alternatesCount, spelling }) {
      const buttons = [];
      if (spelling?.trim()) {
        buttons.push(`<button type="button" class="hear-min word-preview__hear" aria-label="Listen to ${escapeHtml(spelling)}">Listen</button>`);
      }
      buttons.push(`<button type="button" class="btn wp-side-btn" data-open-graph${hasMermaid ? '' : ' disabled'}>Tree</button>`);
      if (alternatesCount > 0) {
        buttons.push(`<button type="button" class="btn wp-side-btn wp-side-btn--subtle" data-open-alternates>Alternates</button>`);
      }
      return `<div class="word-preview__sound-actions">${buttons.join('')}</div>`;
    }

    function buildDictAlternateBreakdownHtml(alt) {
      const parts = alt.parts ?? [];
      const composition = alt.composition ?? [];
      if (!parts.length) {
        const gloss = composition.join(' + ');
        return gloss
          ? `<span class="dict-alt__breakdown-gloss">${escapeHtml(gloss)}</span>`
          : '';
      }
      return parts.map((part, i) => {
        const op = i > 0 ? '<span class="dict-alt__op">+</span>' : '';
        const gloss = composition[i]
          ? `<span class="dict-alt__piece-gloss">${escapeHtml(composition[i])}</span>`
          : '';
        return `${op}<span class="dict-alt__piece"><span class="mono dict-alt__piece-sp">${escapeHtml(part)}</span>${gloss}</span>`;
      }).join('');
    }

    function dictAltStatusPillClass(status) {
      if (status === 'confirmed' || status === 'playtested') return 'dict-alt__pill dict-alt__pill--confirmed';
      if (status === 'plausible') return 'dict-alt__pill';
      return 'dict-alt__pill dict-alt__pill--low';
    }

    function buildDictAlternatesPanelHtml(entryKind, id) {
      if (entryKind !== 'compound') return '';
      const compound = STATE.lab?.compounds?.find(c => c.id === id);
      if (!compound) return '';
      const alts = compound.alternate_forms ?? [];
      const score = compound.understandability;
      const meaning = compound.meaning && compound.meaning !== '(unnamed)' ? compound.meaning : '';
      if (!alts.length && score == null) {
        return `<div class="dict-alternates-panel dict-alternates-panel--empty">
          <h4>Alternates</h4>
          <p class="sans dict-alternates-panel__empty">No alternates recorded yet.</p>
        </div>`;
      }
      const items = alts.map((a, altIndex) => {
        const pct = a.understandability != null ? Math.round(a.understandability * 100) : null;
        const breakdown = buildDictAlternateBreakdownHtml(a);
        const hearBtn = a.parts?.length
          ? `<button type="button" class="hear-min dict-alt__hear" data-alt-index="${altIndex}" aria-label="Listen to ${escapeHtml(a.spelling)}">Listen</button>`
          : '';
        return `<li class="dict-alt">
            <div class="dict-alt__main">
              <span class="dict-alt__spelling mono">${escapeHtml(a.spelling)}</span>
              ${breakdown ? `<div class="dict-alt__breakdown">${breakdown}</div>` : ''}
            </div>
            <div class="dict-alt__meta">
              ${hearBtn}
              ${pct != null ? `<div class="dict-alt__score-row" title="Understandability (advisory)">
                  <span class="dict-alt__bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
                  <span class="dict-alt__score">${pct}%</span>
                </div>` : ''}
              ${a.status ? `<span class="${dictAltStatusPillClass(a.status)}">${escapeHtml(a.status)}</span>` : ''}
            </div>
          </li>`;
      }).join('');
      const preferredPct = score != null ? Math.round(score * 100) : null;
      const footer = preferredPct != null || alts.length
        ? `<footer class="dict-alternates-panel__footer">
            ${preferredPct != null ? `<span class="dict-alt__pill dict-alt__pill--preferred">Preferred · ${preferredPct}%</span>` : ''}
            <a class="dict-alternates-panel__cta" href="#puzzle">Try in Puzzle Conversation</a>
          </footer>`
        : '';
      return `<div class="dict-alternates-panel">
          <header class="dict-alternates-panel__head">
            <h4>Alternates</h4>
            <p class="dict-alternates-panel__focus mono">${escapeHtml(compound.spelling)}</p>
            ${meaning ? `<p class="dict-alternates-panel__meaning">${escapeHtml(meaning)}</p>` : ''}
          </header>
          <p class="dict-alternates-panel__hint sans graph-hint">Other transparent ways to express the same idea — ranked by understandability (advisory).</p>
          ${items ? `<ul class="dict-alternates-list">${items}</ul>` : '<p class="sans dict-alternates-panel__empty">No alternates recorded yet.</p>'}
          ${footer}
        </div>`;
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
        viewport.classList.remove('is-loading');
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
        viewport.classList.add('is-loading');
        panZoomEl.classList.add('is-loading');
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
          if (!(e.metaKey || e.ctrlKey)) return;
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
      const { MERMAID_INIT } = await import('../js/mermaid-theme.js');
      window.mermaid.initialize(MERMAID_INIT);
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
      if (kind === 'root') return [focus.spelling];
      if (focus.components?.length) return composerFlatSpellings(focus.components);
      if (focus.parts?.length > 1) return focus.parts;
      return [focus.spelling];
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
      sideActionsHtml = '',
      hearId = '',
      meaningHtml = '',
      meaningClass = '',
      contextHtml = '',
    } = {}) {
      const hasSpelling = Boolean(focus.spelling);
      const ipa = pron ? previewIpaForFocus(focus) : '';
      const hearBtn = !sideActionsHtml && showHear && hasSpelling
        ? `<div class="word-preview__sound-actions">
            <button type="button" class="hear-min word-preview__hear"${hearId ? ` id="${hearId}"` : ''} aria-label="Listen to ${escapeHtml(focus.spelling)}">${playButtonMarkup('Listen')}</button>
          </div>`
        : '';
      const actionsColumn = sideActionsHtml || hearBtn;
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
      if (!pronDetails && !actionsColumn && !meaningBlock && !contextHtml) return '';
      return `<div class="word-preview__sound-block">
        <div class="word-preview__sound-pron">
          ${pronDetails}
          ${meaningBlock}
          ${contextHtml}
        </div>
        ${actionsColumn}
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
      sideActionsHtml = '',
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
        sideActionsHtml,
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
      return `<div class="${klass}">
        <h4>Word Tree</h4>
        ${buildMermaidPanZoomHtml(mermaid, { wheelZoom: !isShowcase, toolbar: true })}
      </div>`;
    }

    function buildExplorerActionsHtml({ graph = false, hasMermaid = false } = {}) {
      if (!graph) return '';
      return `<div class="explorer-actions">
        <button type="button" class="btn" data-open-graph ${hasMermaid ? '' : 'disabled'}>Word Tree</button>
      </div>`;
    }

    function buildShowcaseHtml(data) {
      const f = data.focus;
      const speakParts = wordPreviewSpeakParts(f, 'word');
      const html = buildWordPreviewHtml(f, {
        kind: 'word',
        speakParts,
        showBadges: false,
        hearId: 'lander-showcase-hear',
      });
      return { html, speakParts };
    }

    function buildExplorerHtml(data, explorerKind, {
      preview = false,
      includeGraph = true,
      layout = 'default',
      modalActions = false,
      ref = null,
      entryKind = null,
    } = {}) {
      const f = data.focus;
      const kind = explorerKind === 'root' ? 'root' : 'word';
      const displayFocus = { ...f, meaning: previewDetailMeaning(f, kind) };
      const speakParts = wordPreviewSpeakParts(displayFocus, kind);
      const isDictionary = layout === 'dictionary';
      const showInlineGraph = includeGraph && !isDictionary;
      let descriptionHtml = '';
      let sideActionsHtml = '';
      if (isDictionary && ref != null && entryKind) {
        let conceptId = null;
        if (kind === 'root' && f.spelling) {
          conceptId = STATE.lab?.sounds?.find(s => s.spelling === f.spelling)?.concept_id ?? null;
        } else if (entryKind === 'compound') {
          conceptId = STATE.lab?.compounds?.find(c => c.id === ref)?.concept_id ?? null;
        }
        if (conceptId) descriptionHtml = buildTierPlacementHtml(conceptId);
        const compound = entryKind === 'compound' ? STATE.lab?.compounds?.find(c => c.id === ref) : null;
        sideActionsHtml = buildDictionarySideActionsHtml({
          hasMermaid: Boolean(data.mermaid),
          alternatesCount: compound?.alternate_forms?.length ?? 0,
          spelling: displayFocus.spelling,
        });
      } else if (kind === 'root' && f.spelling) {
        const sound = STATE.lab?.sounds?.find(s => s.spelling === f.spelling);
        const concept = sound ? conceptForLabItem(sound) : null;
        if (concept?.reason) {
          descriptionHtml = `<div class="word-preview__context sans">${escapeHtml(concept.reason)}</div>`;
        }
      }

      const actionButtons = !isDictionary && (modalActions || !showInlineGraph)
        ? buildExplorerActionsHtml({
          graph: !showInlineGraph,
          hasMermaid: Boolean(data.mermaid),
        })
        : '';

      const previewHtml = buildWordPreviewHtml(displayFocus, {
        kind,
        speakParts,
        previewNote: preview ? 'Preview: save the word to explore downstream links. Tap nodes in the graph to jump to saved roots and words.' : '',
        showHear: !sideActionsHtml,
        sideActionsHtml,
        descriptionHtml,
      });

      const graphSection = showInlineGraph
        ? buildWordTreeSectionHtml(data.mermaid, { variant: 'default' })
        : '';

      const trailingActions = !isDictionary && actionButtons
        ? `<div class="word-preview-actions">${actionButtons}</div>`
        : '';

      const body = `${previewHtml}${graphSection}${trailingActions}`;

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

    function renderLanderShowcase() {
      const el = $('lander-showcase');
      if (!el || STATE.page !== 'home' || !STATE.lab) return;
      if (landerShowcaseCleanup) {
        landerShowcaseCleanup();
        landerShowcaseCleanup = null;
      }
      const scenes = buildComposeScenesFromLab(STATE.lab);
      if (!scenes.length) {
        el.innerHTML = '<p class="fonoran-showcase__error">No composed words available yet.</p>';
        return;
      }
      landerShowcaseCleanup = mountComposeShowcase(el, {
        scenes,
        toScript: (spelling) => {
          if (!STATE.rules) return '';
          const compound = STATE.lab?.compounds?.find((c) => c.spelling === spelling);
          const parts = compound ? compoundSpeakParts(compound) : [spelling];
          return romanToFonoraScript(parts, STATE.rules).phrase ?? '';
        },
      });
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
          <p class="lander-health__footnote">Warnings include look-alike sounds, prefix overlap, rhyming clusters, segmentation ambiguity, and pronunciation difficulty.</p>
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
          <button type="button" class="btn btn--primary" id="lander-health-open">View full health report</button>
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
        $('lander-health-open')?.addEventListener('click', () => {
          window.location.href = `/tools#health${window.location.search}`;
        });
      } catch {
        if (token !== landerHealthToken) return;
        el.innerHTML = '<p class="lander-health__error">Could not load health metrics. Start the dev server with <code>npm start</code>.</p>';
      }
    }



    function conceptForLabItem(item) {
      if (!item) return null;
      if (item.concept_id) return conceptList().find(c => c.id === item.concept_id) ?? null;
      const m = item.meaning?.trim().toLowerCase();
      if (!m) return null;
      return conceptList().find(c => c.id === m || c.concept.toLowerCase() === m) ?? null;
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
      const roots = (STATE.rootCandidates?.candidates ?? []).filter(c => c.status === 'pending' || c.status === 'rejected');
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

    async function ensureRootCandidates() {
      if (STATE.rootCandidates) return STATE.rootCandidates;
      STATE.rootCandidates = await api('/api/fonoran/roots/candidates');
      return STATE.rootCandidates;
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
      entryKind = null,
    } = {}) {
      const data = await fetchExplorerData(kind, id, preview);
      const explorerKind = preview?.preview ? 'word' : kind;
      const showInlineGraph = includeGraph && layout !== 'dictionary';
      const { html, speakParts } = buildExplorerHtml(data, explorerKind, {
        preview: !!preview?.preview,
        includeGraph,
        layout,
        modalActions,
        ref: id,
        entryKind: entryKind ?? (explorerKind === 'root' ? 'sound' : 'compound'),
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
        containerEl.querySelector('[data-open-alternates]')?.addEventListener('click', () => {
          const panelKind = entryKind ?? (explorerKind === 'root' ? 'sound' : 'compound');
          openAlternatesSheet(panelKind, id);
        });
      }
      return data;
    }

    function buildFamilyGraphSheetHtml(data) {
      const f = data.focus;
      return `
        <div class="explorer-section showcase-graph word-tree-sheet">
          <h4>Word Tree · <span class="mono" data-word-tree-spelling>${escapeHtml(f.spelling)}</span></h4>
          ${buildMermaidPanZoomHtml(data.mermaid, { toolbar: true })}
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
        host.querySelector('.word-tree-sheet')?.insertAdjacentHTML('beforeend', buildMermaidPanZoomHtml(data.mermaid, { toolbar: true }));
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
      if (!data?.mermaid) {
        toast('No word tree for this item.');
        return;
      }
      try {
        await mountFamilyGraphSheet(data, { onSideEffect, firstOpen: true });
      } catch (e) {
        closeSheet();
        toast(e.message);
      }
    }

    function openAlternatesSheet(entryKind, id) {
      const body = $('sheet-body');
      body.innerHTML = buildDictAlternatesPanelHtml(entryKind, id) || `<div class="dict-alternates-panel dict-alternates-panel--empty">
        <h4>Alternates</h4>
        <p class="sans dict-alternates-panel__empty">No alternates recorded yet.</p>
      </div>`;
      if (entryKind === 'compound') {
        const compound = STATE.lab?.compounds?.find(c => c.id === id);
        body.querySelectorAll('.dict-alt__hear').forEach((btn) => {
          const altIndex = Number(btn.getAttribute('data-alt-index'));
          const alt = compound?.alternate_forms?.[altIndex];
          if (!alt?.parts?.length) return;
          btn.addEventListener('click', () => speakNeural(alt.parts));
        });
      }
      openSheet();
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

    const DICT_DETAIL_SHEET_MQ = window.matchMedia('(max-width: 768px)');

    function dictDetailUsesSheet() {
      return STATE.page === 'dictionary' && DICT_DETAIL_SHEET_MQ.matches;
    }

    function dictDetailPanel() {
      return dictDetailUsesSheet() ? $('sheet-body') : $('dict-detail');
    }

    function openDictDetailSheet() {
      if (!dictDetailUsesSheet()) return;
      openSheet();
    }

    DICT_DETAIL_SHEET_MQ.addEventListener('change', () => {
      if (STATE.page !== 'dictionary' || !STATE.dictSelection) return;
      const { kind, id } = STATE.dictSelection;
      if (DICT_DETAIL_SHEET_MQ.matches) {
        loadDictionaryDetail(kind, id);
      } else {
        closeSheet();
        loadDictionaryDetail(kind, id);
      }
    });

    function openAuthModal() {
      const modal = $('auth-sign-in-modal');
      const googleLink = $('auth-sign-in-google');
      if (googleLink) googleLink.href = AUTH.loginUrls?.google ?? AUTH.loginUrl;
      modal?.removeAttribute('hidden');
      document.documentElement.classList.add('modal-open');
    }

    function closeAuthModal() {
      $('auth-sign-in-modal')?.setAttribute('hidden', '');
      document.documentElement.classList.remove('modal-open');
    }

    function openChain(kind, id) {
      openExplorer(kind === 'sound' ? 'root' : 'word', kind === 'sound' ? id : id);
    }


    function conceptReconsider(conceptId) {
      return Boolean(STATE.conceptTiers?.get(conceptId)?.reconsider);
    }

    function isLocalDevHost() {
      const h = window.location.hostname;
      return h === 'localhost' || h === '127.0.0.1';
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
      const filters = dictStateToFilters(STATE);
      let list = [...base, ...comp].filter((e) => {
        const entry = {
          kind: e.kind,
          state: e.state,
          concept_id: e.concept_id,
          reconsider: conceptReconsider(e.concept_id),
        };
        return passesLabFilters(entry, filters, tierFor);
      });

      const particles = dictParticleEntries();
      if (filters.showParticles) list = [...list, ...particles];

      const q = STATE.dictQuery.trim();
      if (q) list = list.filter(e => labEntryMatchesQuery(q, {
        word: e.word,
        english: e.english,
        gloss: e.gloss,
        aliases: e.aliases,
        concept_id: e.concept_id,
        hint: e.hint,
      }));
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
      return `<div class="fonoran-split-empty"><p>Select a word or root on the left to preview it.</p></div>`;
    }

    function showDictDetailEmpty() {
      const panel = $('dict-detail');
      if (panel) panel.innerHTML = dictDetailEmptyHtml();
    }

    function particleGroupPillClass(group) {
      if (group === 'tense') return 'particle-panel__pill particle-panel__pill--tense';
      if (group === 'interrogative') return 'particle-panel__pill particle-panel__pill--query';
      if (group === 'logical') return 'particle-panel__pill particle-panel__pill--logic';
      return 'particle-panel__pill';
    }

    function particleCompositionExamples(p) {
      const rows = {
        logic_not: [
          { parts: ['no', 'true'], gloss: 'false' },
          { parts: ['no', 'same'], gloss: 'different' },
        ],
        logic_yes: [{ text: 'Standalone affirmative answer' }],
      }[p.id];
      if (rows?.length) return rows;
      if (p.note) return [{ text: p.note }];
      return null;
    }

    function buildParticleCompositionHtml(examples) {
      if (!examples?.length) return '';
      const items = examples.map((ex) => {
        if (ex.text) {
          return `<li class="particle-panel__compose-item"><span class="particle-panel__compose-text">${escapeHtml(ex.text)}</span></li>`;
        }
        const breakdown = (ex.parts ?? []).map((part, i) => {
          const op = i > 0 ? '<span class="particle-panel__op">+</span>' : '';
          return `${op}<span class="particle-panel__piece"><span class="mono">${escapeHtml(part)}</span></span>`;
        }).join('');
        const gloss = ex.gloss ? `<span class="particle-panel__compose-eq">=</span><span class="particle-panel__compose-gloss">${escapeHtml(ex.gloss)}</span>` : '';
        return `<li class="particle-panel__compose-item"><div class="particle-panel__compose-row">${breakdown}${gloss}</div></li>`;
      }).join('');
      return `<div class="particle-panel__section">
          <p class="particle-panel__label">Composition</p>
          <ul class="particle-panel__compose-list">${items}</ul>
        </div>`;
    }

    function particleDetailHtml(p) {
      const triggers = (p.triggers ?? []).filter(Boolean);
      const gloss = p.gloss || p.id;
      const group = p.group || '';
      const role = p.role || '—';
      const script = p.form ? rootScriptPhrase(p.form) : '';
      const triggerChips = triggers.length
        ? triggers.map(t => `<span class="particle-panel__chip mono">${escapeHtml(t)}</span>`).join('')
        : '<span class="particle-panel__empty-hint">Emitted by grammar rules — no English trigger word</span>';
      const compositionHtml = buildParticleCompositionHtml(particleCompositionExamples(p));
      const groupPill = group
        ? `<span class="${particleGroupPillClass(group)}">${escapeHtml(group)}</span>`
        : '';
      const listenBtn = p.form
        ? `<button type="button" class="hear-min word-preview__hear" aria-label="Listen to ${escapeHtml(p.form)}">Listen</button>`
        : '';
      const wordmark = p.form
        ? `<div class="particle-panel__wordmark">
            <span class="particle-panel__form mono">${escapeHtml(p.form)}</span>${script ? `<span class="particle-panel__dash" aria-hidden="true"> - </span><span class="particle-panel__script symbol-text" aria-hidden="true">${escapeHtml(script)}</span>` : ''}
          </div>`
        : '';
      return `
        <div class="dict-detail-stack word-preview-panel">
          <div class="particle-panel">
            <header class="particle-panel__head">
              <div class="particle-panel__title-row">
                <h4>Particle</h4>
                ${groupPill}
              </div>
              ${wordmark}
              <p class="particle-panel__gloss">${escapeHtml(gloss)}</p>
              ${listenBtn ? `<div class="particle-panel__actions">${listenBtn}</div>` : ''}
            </header>
            <div class="particle-panel__axes">
              <div class="particle-panel__axis">
                <span class="particle-panel__axis-key">Role</span>
                <span class="particle-panel__axis-val">${escapeHtml(role)}</span>
              </div>
              <div class="particle-panel__axis">
                <span class="particle-panel__axis-key">Group</span>
                <span class="particle-panel__axis-val">${escapeHtml(group || '—')}</span>
              </div>
            </div>
            <div class="particle-panel__section">
              <p class="particle-panel__label">English triggers</p>
              <div class="particle-panel__chips">${triggerChips}</div>
            </div>
            ${compositionHtml}
            <footer class="particle-panel__footer sans">
              Invariant grammar marker — never fused into lexical spellings.
              <a class="particle-panel__link" href="#grammar">See grammar</a>
            </footer>
          </div>
        </div>`;
    }

    function showParticleDetail(id, panel = dictDetailPanel()) {
      if (!panel) return;
      const p = (STATE.dictParticles?.particles ?? []).find(x => x.id === id);
      panel.innerHTML = p
        ? particleDetailHtml(p)
        : '<div class="fonoran-split-empty"><p>Particle not found.</p></div>';
      if (p?.form) {
        panel.querySelector('.word-preview__hear')?.addEventListener('click', () => speakNeural(p.form));
      }
      openDictDetailSheet();
    }

    let dictDetailToken = 0;

    async function appendDictVoteBar(panel, entryKind, id) {
      if (entryKind === 'particle') return;
      const sound = entryKind === 'sound' ? STATE.lab?.sounds?.find(s => s.spelling === id) : null;
      const compound = entryKind === 'compound' ? STATE.lab?.compounds?.find(c => c.id === id) : null;
      const voteRef = sound?.concept_id ?? compound?.id ?? id;
      try {
        const data = await api(`/api/fonoran/words/${encodeURIComponent(voteRef)}/vote`);
        let bar = panel.querySelector('.dict-votes');
        if (!bar) {
          bar = document.createElement('div');
          bar.className = 'wm-votes dict-votes sans';
          panel.querySelector('.dict-detail-stack')?.appendChild(bar)
            ?? panel.appendChild(bar);
        }
        const upCount = data.up ?? 0;
        const downCount = data.down ?? 0;
        const total = upCount + downCount;
        const upPct = total > 0 ? Math.round((upCount / total) * 100) : 50;
        const sentiment = total === 0 ? '' : upPct > 50 ? ' vote-meter--up' : upPct < 50 ? ' vote-meter--down' : '';
        const downPressed = data.userVote === -1;
        const upPressed = data.userVote === 1;
        bar.innerHTML = `<p class="vote-meter__label">Community</p>
          <div class="vote-meter${sentiment}" role="meter" aria-valuenow="${upPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Approval: ${upPct}%">
            <button type="button" class="vote-meter__btn vote-meter__btn--down" data-dict-vote="-1"
              aria-pressed="${downPressed}"
              aria-label="Downvote (${downCount})"><span class="vote-meter__btn-num">${downCount}</span><span class="vote-meter__btn-arrow" aria-hidden="true">↓</span></button>
            <div class="vote-meter__track">
              <div class="vote-meter__fill" style="width:${upPct}%" aria-hidden="true"></div>
            </div>
            <button type="button" class="vote-meter__btn vote-meter__btn--up" data-dict-vote="1"
              aria-pressed="${upPressed}"
              aria-label="Upvote (${upCount})"><span class="vote-meter__btn-arrow" aria-hidden="true">↑</span><span class="vote-meter__btn-num">${upCount}</span></button>
          </div>`;
        bar.querySelectorAll('[data-dict-vote]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!AUTH.authenticated) {
              openAuthModal();
              return;
            }
            const clicked = Number(btn.dataset.dictVote);
            const vote = data.userVote === clicked ? 0 : clicked;
            try {
              await api(`/api/fonoran/words/${encodeURIComponent(voteRef)}/vote`, {
                method: 'POST',
                body: JSON.stringify({ vote }),
              });
              await appendDictVoteBar(panel, entryKind, id);
            } catch (err) {
              toast(err.message);
            }
          });
        });
      } catch {
        /* votes optional */
      }
    }

    async function loadDictionaryDetail(entryKind, id) {
      if (entryKind === 'particle') {
        showParticleDetail(id);
        return;
      }
      const panel = dictDetailPanel();
      if (!panel) return;
      const token = ++dictDetailToken;
      panel.innerHTML = '<p class="fonoran-split-loading">Loading…</p>';
      openDictDetailSheet();
      try {
        await mountExplorer(panel, dictExplorerKind(entryKind), id, null, {
          layout: 'dictionary',
          includeGraph: false,
          modalActions: true,
          entryKind,
          onNavigate: (navKind, ref) => {
            const kind = navKind === 'root' ? 'sound' : 'compound';
            STATE.dictSelection = { kind, id: ref };
            renderDictionaryList({ scrollToSelection: true });
            loadDictionaryDetail(kind, ref);
          },
        });
        if (token !== dictDetailToken) return;
        void appendDictVoteBar(panel, entryKind, id);
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
        if (dictDetailUsesSheet()) closeSheet();
        return;
      }
      const list = dictEntries();
      const still = list.some(e => e.kind === STATE.dictSelection.kind && e.id === STATE.dictSelection.id);
      if (!still) {
        STATE.dictSelection = null;
        showDictDetailEmpty();
        if (dictDetailUsesSheet()) closeSheet();
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
        chip.classList.toggle('active', isFilterActive(key, dictStateToFilters(STATE)));
      });
      $('dict-picker-empty')?.toggleAttribute('hidden', showRoots || showWords || showParticles);

      const visibleCount = (showRoots ? roots.length : 0)
        + (showWords ? words.length : 0)
        + (showParticles ? particles.length : 0);
      const countEl = $('dict-count');
      if (countEl) {
        countEl.textContent = emptyAll
          ? ''
          : (visibleCount === 1 ? '1 result' : `${visibleCount} results`);
      }

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
      return pageName ? $(`page-${pageName}`) : null;
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
        document.documentElement.style.setProperty('--app-header-offset', `${headerBottom}px`);
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
      const grammarChrome = document.querySelector('#page-grammar.active .page-toolbar-shell');
      if (grammarChrome) {
        syncPageChromeOffset(grammarChrome);
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
      const grammarChrome = document.querySelector('#page-grammar .page-toolbar-shell');
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
      Promise.all([ensureLexicon(), ensureDictParticles(), ensureConceptTiers()])
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
    /** @type {ReturnType<typeof createFonoraKeyboard> | null} */
    let translatorKeyboard = null;
    let translatorKeyboardOpen = false;

    const TRANSLATOR_SPEED_KEY = 'fonoran:translator:speed';
    const TRANSLATOR_SYLLABLE_MODE_KEY = 'fonoran:translator:syllable-by-syllable';
    const TRANSLATOR_SYLLABLE_MODE_LEGACY_KEY = 'fonoran:translator:word-by-word';
    const TRANSLATOR_SOURCE_LANG_KEY = 'fonoran:translator:source-lang';
    const TRANSLATOR_TARGET_LANG_KEY = 'fonoran:translator:target-lang';

    const TRANSLATOR_FORWARD_EXAMPLES = [
      'Do you want to go to the beach?',
      'I love my family',
      'The tribe is at war',
      'I am going to the water.',
    ];
    const TRANSLATOR_REVERSE_ROMAN_EXAMPLES = [
      'mi gi lekche?',
      'mi gi ye',
      'mi ta gi nam',
      'ya',
    ];

    function isFonoranSourceLang(lang) {
      const value = String(lang ?? '').trim().toLowerCase();
      return value === 'fonoran-roman' || value === 'fonoran-fonora';
    }

    function isTranslatorFonoraMode() {
      return readTranslatorSourceLang() === 'fonoran-fonora';
    }

    function isTranslatorKeyboardActive() {
      return translatorKeyboardOpen
        && STATE.page === 'translator'
        && isTranslatorFonoraMode();
    }

    function syncTranslatorKeyboardToggle() {
      const toggle = $('tr-keyboard-toggle');
      const fonoraMode = isTranslatorFonoraMode();
      if (toggle) {
        toggle.hidden = !fonoraMode;
        toggle.setAttribute('aria-pressed', translatorKeyboardOpen && fonoraMode ? 'true' : 'false');
        toggle.textContent = translatorKeyboardOpen && fonoraMode ? 'Hide keyboard' : 'Keyboard';
      }
      const dock = $('tr-keyboard-dock');
      if (dock) dock.hidden = !(translatorKeyboardOpen && fonoraMode);
      document.body.classList.toggle(
        'fonora-keyboard-dock-open',
        Boolean(document.querySelector('.fonora-keyboard-dock:not([hidden])')),
      );
    }

    async function ensureTranslatorKeyboard() {
      const input = $('tr-input');
      const container = $('tr-keyboard');
      if (!input || !container) return null;
      const rules = await ensureRules();
      if (!rules) return null;
      if (translatorKeyboard) {
        translatorKeyboard.refresh(rules);
        translatorKeyboard.setTarget(input);
        return translatorKeyboard;
      }
      translatorKeyboard = createFonoraKeyboard({
        rules,
        container,
        target: input,
        isActive: isTranslatorKeyboardActive,
        layout: 'practice',
        enterKeyLabel: 'go',
        onEnter: () => { void runTranslator(); },
      });
      return translatorKeyboard;
    }

    async function setTranslatorKeyboardOpen(open) {
      if (open && !isTranslatorFonoraMode()) open = false;
      if (open) {
        await ensureTranslatorKeyboard();
        translatorKeyboardOpen = true;
        translatorKeyboard?.activate();
      } else {
        translatorKeyboardOpen = false;
        translatorKeyboard?.deactivate();
      }
      syncTranslatorKeyboardToggle();
    }

    function readTranslatorSourceLang() {
      const el = $('tr-source-lang');
      const fromSelect = el?.value?.trim();
      if (fromSelect) return fromSelect;
      return localStorage.getItem(TRANSLATOR_SOURCE_LANG_KEY) || 'auto';
    }

    function readTranslatorTargetLang() {
      const el = $('tr-target-lang');
      const fromSelect = el?.value?.trim();
      if (fromSelect) return fromSelect;
      return localStorage.getItem(TRANSLATOR_TARGET_LANG_KEY) || 'en';
    }

    function syncTranslatorDirectionUi() {
      const sourceLang = readTranslatorSourceLang();
      const reverse = isFonoranSourceLang(sourceLang);
      const input = $('tr-input');
      const outputLabel = $('tr-output-label');
      const targetWrap = $('tr-target-lang-wrap');
      const examples = $('tr-examples');

      if (outputLabel) outputLabel.hidden = reverse;
      if (targetWrap) targetWrap.hidden = !reverse;

      if (input) {
        const fonoraMode = reverse && sourceLang === 'fonoran-fonora';
        input.classList.toggle('translator-input--fonora', fonoraMode);
        input.classList.toggle('symbol-text', fonoraMode);
        if (fonoraMode) {
          input.placeholder = 'Type Fonoran in Fonora script…';
          input.setAttribute('aria-label', 'Fonoran (Fonora script) to translate');
          input.spellcheck = false;
        } else if (reverse) {
          input.placeholder = 'Type Fonoran in roman spelling…';
          input.setAttribute('aria-label', 'Fonoran (roman) to translate');
          input.spellcheck = false;
        } else {
          input.placeholder = 'Type words, phrases, or sentences in any language…';
          input.setAttribute('aria-label', 'Text to translate into Fonoran');
          input.spellcheck = true;
        }
      }

      if (examples) {
        let phrases = reverse ? TRANSLATOR_REVERSE_ROMAN_EXAMPLES : TRANSLATOR_FORWARD_EXAMPLES;
        const fonoraExamples = reverse && sourceLang === 'fonoran-fonora';
        if (fonoraExamples && STATE.rules) {
          phrases = TRANSLATOR_REVERSE_ROMAN_EXAMPLES.map((roman) => {
            const converted = romanTextToFonoraScript(roman, STATE.rules);
            return converted.symbols || roman;
          });
        }
        const chipClass = fonoraExamples ? 'chip symbol-text' : 'chip';
        examples.innerHTML = `<span class="translator-examples__label">Try:</span>${
          phrases.map(p => `<button type="button" class="${chipClass}" data-tr-example="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')
        }`;
        examples.querySelectorAll('[data-tr-example]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const text = btn.dataset.trExample ?? '';
            const inputEl = $('tr-input');
            if (inputEl) inputEl.value = text;
            STATE.translatorInput = text;
            void runTranslator();
          });
        });
      }

      if (!isTranslatorFonoraMode() && translatorKeyboardOpen) {
        void setTranslatorKeyboardOpen(false);
      } else {
        syncTranslatorKeyboardToggle();
      }
    }

    async function syncTranslatorDirectionUiAsync() {
      const sourceLang = readTranslatorSourceLang();
      if (isFonoranSourceLang(sourceLang) && sourceLang === 'fonoran-fonora') {
        await ensureRules();
      }
      syncTranslatorDirectionUi();
    }

    function translatorEngineLabel(engine) {
      if (engine === 'cached') return 'Cached';
      if (engine === 'legacy') return 'Legacy';
      if (engine === 'lexical') return 'Lexical';
      if (engine === 'llm') return 'LLM';
      return engine ? String(engine) : '';
    }

    function syncTranslatorOutputHeader(result) {
      const meta = $('tr-output-meta');
      if (!meta) return;
      const reasoning = result?.reasoning?.trim();
      if (!reasoning) {
        meta.innerHTML = '';
        meta.hidden = true;
        return;
      }
      const engine = result?.engine ? translatorEngineLabel(result.engine) : '';
      const engineHtml = engine
        ? `<p class="translator-output__frame-engine sans">${escapeHtml(engine)}</p>`
        : '';
      meta.hidden = false;
      meta.innerHTML = `<div class="translator-output__frame-popup">
        <button type="button" class="translator-output__frame-trigger sans" aria-describedby="tr-frame-popover">Why this reading</button>
        <div class="translator-output__frame-popover sans" id="tr-frame-popover" role="tooltip">
          <p>${escapeHtml(reasoning)}</p>
          ${engineHtml}
        </div>
      </div>`;
    }

    function translatorLegendHtml(result) {
      const kinds = new Set((result?.tokens ?? []).map(t => translatorResolutionKind(t)));
      const items = [];
      if (kinds.has('composed')) items.push('<span class="translator-resolved--composed">composed</span> from roots');
      if (kinds.has('loan')) items.push('<span class="translator-resolved--loan">«loan»</span> phonetic borrow');
      if (kinds.has('interpreted')) items.push('<span class="translator-resolved--interpreted">interpreted</span>');
      if (kinds.has('unknown')) items.push('<span class="translator-unresolved-sample">gap</span>');
      if ((result?.tokens ?? []).some(t => t.droppable)) {
        items.push('<span class="translator-token__droppable">can drop</span> optional in casual speech');
      }
      if (items.length < 1) return '';
      return `<p class="translator-output__legend sans">${items.join(' · ')}</p>`;
    }

    function translatorSimplifiedHtml(result) {
      const simplified = result?.simplified;
      const clauses = Array.isArray(simplified?.clauses) ? simplified.clauses.filter(Boolean) : [];
      if (!clauses.length) return '';
      const items = clauses.map(c => `<li>${escapeHtml(c)}</li>`).join('');
      const note = simplified.note
        ? `<p class="translator-output__plain-note sans">${escapeHtml(simplified.note)}</p>`
        : '';
      return `<details class="translator-output__plain sans">
        <summary>Plain meaning <span class="translator-output__plain-hint">(what we translated)</span></summary>
        <div class="translator-output__plain-body">
          <ol class="translator-output__plain-list">${items}</ol>
          ${note}
        </div>
      </details>`;
    }

    function translatorPronHtml(pron) {
      if (!pron?.sayLine) return '';
      const likeHtml = pron.englishLine
        ? `<p class="translator-output__pron-line translator-output__like">${escapeHtml(pron.englishLine)}</p>`
        : '';
      return `<details class="translator-output__pron sans">
        <summary>Pronunciation</summary>
        <div class="translator-output__pron-body">
          <p class="translator-output__pron-line"><strong class="translator-output__phonetic-key mono">${escapeHtml(pron.sayLine)}</strong></p>
          ${likeHtml}
        </div>
      </details>`;
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
      if (!result || result.error || result.mode === 'empty') return false;
      if (result.playback?.playable) return true;
      return Boolean(result.tokens?.some(t => !isSkippablePlaybackToken(t)));
    }

    /** Resolve playback payload — prefer server-built, rebuild client-side when needed. */
    function resolveTranslatorPlayback(result, { syllableBySyllable = false } = {}) {
      if (!syllableBySyllable && result?.playback?.segments?.length) {
        return result.playback;
      }
      if (!STATE.rules || !result?.tokens?.length) {
        return result?.playback ?? { phrase: '', script: '', segments: [], wordSources: [], tokenIndices: [], playable: false };
      }
      return buildPlaybackFromTokens(result.tokens, STATE.rules, { syllableBySyllable });
    }

    function sleepMs(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function syncTranslatorPlaybackUi(result) {
      const playBtn = $('tr-hear');
      const stopBtn = $('tr-stop');
      const canHear = translatorCanHear(result);
      if (playBtn && !STATE.translatorPlaying) {
        playBtn.disabled = !canHear;
        setPlayButtonLabel(playBtn, 'Listen');
      }
      if (stopBtn && !STATE.translatorPlaying) stopBtn.disabled = true;
    }

    function readTranslatorPlaybackLang(result) {
      const sel = readTranslatorSourceLang();
      if (sel && sel !== 'auto') return sel;
      return result?.detected_lang ?? result?.sourceLang ?? 'en';
    }

    function getTranslatorPlaybackOptions(result) {
      const lang = readTranslatorPlaybackLang(result);
      const prefs = loadLanguagePreferences();
      const plan = getSamplePlaybackPlan(lang);
      const playbackRate = readTranslatorSpeed();
      if (plan) return { ...plan, playbackRate };
      return {
        engine: 'piper',
        piperVoice: getPiperVoiceForLang('en'),
        espeakVoice: resolveEspeakVoice(lang, { englishDialect: prefs.englishDialect }),
        playbackRate,
      };
    }

    function clearTranslatorSpeakingHighlight() {
      document.querySelectorAll('.translator-token--speaking').forEach(el => {
        el.classList.remove('translator-token--speaking');
      });
      document.querySelectorAll('.translator-alternate--speaking').forEach(el => {
        el.classList.remove('translator-alternate--speaking');
      });
      $('tr-output')?.classList.remove('translator-output--alternate-playing');
    }

    function highlightTranslatorToken(tokenIndex, { alternateIndex = null } = {}) {
      clearTranslatorSpeakingHighlight();
      if (tokenIndex == null || tokenIndex < 0) return;

      if (alternateIndex != null) {
        $('tr-output')?.classList.add('translator-output--alternate-playing');
        document.querySelector(`.translator-alternate[data-tr-alt-index="${alternateIndex}"]`)
          ?.classList.add('translator-alternate--speaking');
        document.querySelector(
          `.translator-alternate[data-tr-alt-index="${alternateIndex}"] .translator-token[data-tr-word="${tokenIndex}"]`,
        )?.classList.add('translator-token--speaking');
        return;
      }

      document.querySelector(
        `.translator-token-list--primary .translator-token[data-tr-word="${tokenIndex}"]`,
      )?.classList.add('translator-token--speaking');
    }

    function setTranslatorPlaybackStatus(message, { isError = false } = {}) {
      const el = $('tr-playback-status');
      if (!el) return;
      el.hidden = !message;
      el.textContent = message;
      el.classList.toggle('translator-playback-status--error', Boolean(isError));
    }

    async function speakTranslatorResult(result, { alternateIndex = null } = {}) {
      if (!result?.tokens?.some(t => !isSkippablePlaybackToken(t)) || STATE.translatorPlaying) return;
      await ensureRules();
      primeAudioContext();

      const syllableBySyllable = $('tr-syllable-by-syllable')?.checked === true;
      const playback = resolveTranslatorPlayback(result, { syllableBySyllable });

      if (!playback?.segments?.length) {
        setTranslatorPlaybackStatus('Nothing to speak for this translation.', { isError: true });
        return;
      }

      STATE.translatorPlaying = true;
      STATE.translatorCancel = false;
      const playBtn = $('tr-hear');
      const stopBtn = $('tr-stop');
      if (playBtn) { playBtn.disabled = true; setPlayButtonText(playBtn, '…'); }
      if (stopBtn) stopBtn.disabled = false;
      setTranslatorPlaybackStatus('');

      highlightTranslatorToken(-1);

      try {
        cancelAllSpeech();
        const playbackOpts = getTranslatorPlaybackOptions(result);
        const sourceBcp47 = sourceLangToBcp47(readTranslatorPlaybackLang(result));
        const wordGapMs = syllableBySyllable
          ? Math.round(250 + (1 - playbackOpts.playbackRate) * 450)
          : Math.round(120 + (1 - playbackOpts.playbackRate) * 80);

        for (let i = 0; i < playback.segments.length; i++) {
          if (STATE.translatorCancel) break;

          const seg = playback.segments[i];
          highlightTranslatorToken(seg.tokenIndex ?? -1, { alternateIndex });

          if (seg.kind === 'pause') {
            const pauseMs = pauseMsForPunctuation(
              seg.char,
              playbackOpts.playbackRate,
              1,
            );
            if (pauseMs > 0) await sleepMs(pauseMs);
            continue;
          }

          if (seg.kind === 'english') {
            await speakAsync(seg.text, sourceBcp47);
          } else {
            setReaderWordSources([seg.wordSource]);
            try {
              await speakFonoraPhrase(seg.phrase, STATE.rules, {
                ...playbackOpts,
                wordGapMs: 0,
                shouldCancel: () => STATE.translatorCancel,
              });
            } catch {
              // Never fall back to English orthography TTS for Fonoran tokens
              // (roman "mi" would be read as English "mee"). Skip the word.
            }
          }

          if (STATE.translatorCancel) break;
          if (wordGapMs > 0 && i < playback.segments.length - 1) {
            const next = playback.segments[i + 1];
            if (next?.kind !== 'pause') await sleepMs(wordGapMs);
          }
        }
      } catch (err) {
        setTranslatorPlaybackStatus(err.message || 'Playback failed.', { isError: true });
      } finally {
        STATE.translatorPlaying = false;
        STATE.translatorCancel = false;
        highlightTranslatorToken(-1);
        setReaderWordSources(null);
        clearTranslatorSpeakingHighlight();
        if (playBtn) { playBtn.disabled = false; setPlayButtonLabel(playBtn, 'Listen'); }
        if (stopBtn) stopBtn.disabled = true;
      }
    }

    function stopTranslatorSpeech() {
      if (!STATE.translatorPlaying) return;
      STATE.translatorCancel = true;
      cancelAllSpeech();
    }

    function translatorResolutionKind(token) {
      if (!token?.resolved) return 'unknown';
      return token.resolution_kind ?? (token.interpreted ? 'interpreted' : 'direct');
    }

    function translatorResolutionClass(kind) {
      if (kind === 'unknown') return 'translator-unresolved-sample';
      if (kind === 'composed') return 'translator-resolved--composed';
      if (kind === 'loan') return 'translator-resolved--loan';
      if (kind === 'interpreted') return 'translator-resolved--interpreted';
      if (kind === 'semantic') return 'translator-resolved--semantic';
      if (kind === 'alias_weak') return 'translator-resolved--alias_weak';
      return '';
    }

    function translatorTokenClass(token) {
      const kind = translatorResolutionKind(token);
      let cls = '';
      if (kind === 'unknown') cls = ' translator-token--unresolved';
      else if (kind === 'composed') cls = ' translator-token--composed';
      else if (kind === 'loan') cls = ' translator-token--loan';
      else if (kind === 'interpreted') cls = ' translator-token--interpreted';
      else if (kind === 'semantic') cls = ' translator-token--semantic';
      else if (kind === 'alias_weak') cls = ' translator-token--semantic';
      if (token?.droppable) cls += ' translator-token--droppable';
      return cls;
    }

    function parseHashPage() {
      const raw = window.location.hash.replace(/^#/, '');
      return raw.split('?')[0] || 'home';
    }

    function translatorTokenHtml(token, index) {
      const kind = translatorResolutionKind(token);
      const resClass = translatorResolutionClass(kind);
      const fonoran = token.resolved
        ? (resClass
          ? `<span class="${resClass}">${escapeHtml(token.fonoran)}</span>`
          : escapeHtml(token.fonoran))
        : `<span class="translator-unresolved-sample">${escapeHtml(token.english)}</span>`;
      const gloss = token.gloss ? `<span class="translator-token__gloss">${escapeHtml(token.gloss)}</span>` : '';
      const showInterp = token.interpreted || (kind !== 'direct' && kind !== 'unknown');
      const interp = showInterp
        ? `<span class="translator-token__interp">${escapeHtml(token.interpreted_from ?? token.english)} → ${escapeHtml(token.concept_id ?? token.lookup ?? '')}${token.interpret_reason ? ` (${escapeHtml(token.interpret_reason)})` : ''}</span>`
        : '';
      const droppable = token.droppable
        ? `<span class="translator-token__droppable" title="${escapeHtml(token.droppable_note || 'Can drop in casual speech')}">can drop</span>`
        : '';
      return `<li class="translator-token${translatorTokenClass(token)}" data-tr-word="${index}">
        <span class="translator-token__role">${escapeHtml(token.role)}</span>
        <span class="translator-token__english">${escapeHtml(token.english)}</span>
        <span class="translator-token__arrow" aria-hidden="true">→</span>
        <span class="translator-token__fonoran">${fonoran}</span>
        ${droppable}
        ${gloss}
        ${interp}
      </li>`;
    }

    function swapTranslatorAlternate(index) {
      const r = STATE.translatorResult;
      const alt = r?.alternates?.[index];
      if (!alt) return;
      const previous = {
        id: 'previous_primary',
        note: 'Previous primary reading.',
        roman: r.surface?.roman ?? '',
        surface: r.surface,
        playback: r.playback,
        tokens: r.tokens,
        frame: r.llm_frame,
      };
      const otherAlts = (r.alternates ?? []).filter((_, i) => i !== index);
      STATE.translatorResult = {
        ...r,
        tokens: alt.tokens,
        surface: alt.surface,
        playback: alt.playback,
        llm_frame: alt.frame ?? r.llm_frame,
        alternates: [...otherAlts, previous],
      };
      void renderTranslatorOutput(STATE.translatorResult);
    }

    async function speakTranslatorAlternate(index) {
      const alt = STATE.translatorResult?.alternates?.[index];
      if (!alt?.tokens?.length || STATE.translatorPlaying) return;
      await speakTranslatorResult({
        ...STATE.translatorResult,
        tokens: alt.tokens,
        playback: alt.playback,
        surface: alt.surface,
      }, { alternateIndex: index });
    }

    function translatorAlternatesHtml(result) {
      if (!result?.alternates?.length) return '';
      const items = result.alternates.map((alt, i) => {
        const script = alt.playback?.script || alt.roman || '';
        const tokenList = alt.tokens?.length
          ? `<ul class="translator-token-list translator-token-list--alternate">${alt.tokens.map((t, ti) => translatorTokenHtml(t, ti)).join('')}</ul>`
          : '';
        return `<li class="translator-alternate" data-tr-alt-index="${i}">
          <div class="translator-alternate__actions">
            <button type="button" class="chip translator-alternate__use" data-tr-alt-use="${i}">Use</button>
            <button type="button" class="chip translator-alternate__hear" data-tr-alt-hear="${i}" aria-label="Listen to alternate">${playButtonMarkup('', { iconOnly: true, solo: true })}</button>
          </div>
          <div class="translator-alternate__body">
            ${script ? `<div class="translator-alternate__script fonora-script symbol-text">${escapeHtml(script)}</div>` : ''}
            <p class="translator-alternate__roman sans">${escapeHtml(alt.roman)}</p>
            <p class="translator-alternate__note sans">${escapeHtml(alt.note)}</p>
            ${tokenList}
          </div>
        </li>`;
      }).join('');
      return `<div class="translator-output__alternates">
        <p class="translator-output__alternates-label sans">Also sayable</p>
        <ul class="translator-alternates-list">${items}</ul>
      </div>`;
    }

    function translatorReverseEmptyMessage() {
      const sourceLang = readTranslatorSourceLang();
      if (sourceLang === 'fonoran-fonora') {
        return 'Type Fonoran in Fonora script on the left to see a natural-language reading.';
      }
      if (sourceLang === 'fonoran-roman') {
        return 'Type Fonoran in roman spelling on the left to see a natural-language reading.';
      }
      return 'Type any language on the left to see Fonoran script and pronunciation.';
    }

    async function renderTranslatorReverseOutput(result) {
      const out = $('tr-output');
      if (!out) return;

      await ensureRules();
      const playbackScript = result.playback?.script
        || (STATE.rules && result.surface?.roman
          ? resolveTranslatorPlayback(result).script || resolveTranslatorPlayback(result).phrase
          : '');
      const translation = String(result.translation ?? '').trim();
      const literal = String(result.literal ?? '').trim();
      const showLiteral = literal && literal !== translation;
      const roman = result.surface?.roman || '';
      const pronHtml = translatorPronHtml(result.surface?.pronunciation);

      syncTranslatorOutputHeader(result);

      out.innerHTML = `
        <div class="translator-output__surface">
          <p class="translator-output__translation">${escapeHtml(translation || '—')}</p>
          ${showLiteral ? `<p class="translator-output__literal sans"><span class="translator-output__literal-label">Literal</span> ${escapeHtml(literal)}</p>` : ''}
        </div>
        <details class="translator-output__source-details sans">
          <summary>Source Fonoran</summary>
          <div class="translator-output__source-body">
            ${playbackScript ? `<div class="translator-output__script fonora-script symbol-text">${escapeHtml(playbackScript)}</div>` : ''}
            ${roman ? `<p class="translator-output__roman">${escapeHtml(roman)}</p>` : ''}
            ${pronHtml}
          </div>
        </details>
        ${translatorLegendHtml(result)}
        <ul class="translator-token-list translator-token-list--primary">${(result.tokens ?? []).map((t, i) => translatorTokenHtml(t, i)).join('')}</ul>`;

      syncTranslatorPlaybackUi(result);
    }

    async function renderTranslatorOutput(result) {
      const out = $('tr-output');
      if (!out) return;
      if (!result || result.mode === 'empty') {
        out.innerHTML = `<p class="translator-output__empty sans">${escapeHtml(translatorReverseEmptyMessage())}</p>`;
        syncTranslatorOutputHeader(null);
        syncTranslatorPlaybackUi(null);
        return;
      }

      if (result.error) {
        out.innerHTML = `<p class="translator-output__empty sans translator-output__error">${escapeHtml(result.error)}</p>`;
        syncTranslatorOutputHeader(null);
        syncTranslatorPlaybackUi(null);
        return;
      }

      if (result.direction === 'from-fonoran' || result.mode === 'reverse') {
        await renderTranslatorReverseOutput(result);
        return;
      }

      await ensureRules();
      const playbackScript = result.playback?.script
        || (STATE.rules ? resolveTranslatorPlayback(result).phrase : '');

      const romanChunks = [];
      for (const t of result.tokens) {
        const isPunct = t.kind === 'punctuation' || t.role === 'punctuation';
        let piece;
        if (!t.resolved) {
          piece = `<span class="translator-unresolved-sample">${escapeHtml(t.english)}</span>`;
        } else if (isPunct) {
          piece = escapeHtml(t.fonoran);
        } else {
          const kindCls = translatorResolutionClass(translatorResolutionKind(t));
          const dropCls = t.droppable ? ' translator-roman--droppable' : '';
          const classes = `${kindCls || ''}${dropCls}`.trim();
          const title = t.droppable
            ? ` title="${escapeHtml(t.droppable_note || 'Can drop in casual speech')}"`
            : '';
          piece = classes
            ? `<span class="${classes}"${title}>${escapeHtml(t.fonoran)}</span>`
            : escapeHtml(t.fonoran);
        }
        if (isPunct && romanChunks.length) romanChunks[romanChunks.length - 1] += piece;
        else romanChunks.push(piece);
      }
      const romanHtml = romanChunks.join(' ');

      const pron = result.surface?.pronunciation;
      const pronHtml = translatorPronHtml(pron);

      syncTranslatorOutputHeader(result);

      out.innerHTML = `
        ${translatorSimplifiedHtml(result)}
        <div class="translator-output__surface">
          ${playbackScript ? `<div class="translator-output__script fonora-script symbol-text">${escapeHtml(playbackScript)}</div>` : ''}
          <p class="translator-output__roman">${romanHtml}</p>
          ${pronHtml}
        </div>
        ${translatorLegendHtml(result)}
        <ul class="translator-token-list translator-token-list--primary">${result.tokens.map((t, i) => translatorTokenHtml(t, i)).join('')}</ul>
        ${translatorAlternatesHtml(result)}`;

      out.querySelectorAll('[data-tr-alt-use]').forEach((btn) => {
        btn.addEventListener('click', () => swapTranslatorAlternate(Number(btn.dataset.trAltUse)));
      });
      out.querySelectorAll('[data-tr-alt-hear]').forEach((btn) => {
        btn.addEventListener('click', () => { void speakTranslatorAlternate(Number(btn.dataset.trAltHear)); });
      });

      syncTranslatorPlaybackUi(result);
    }

    function showTranslatorLoading() {
      const out = $('tr-output');
      if (!out) return;
      out.innerHTML = `<div class="translator-output__loading sans" role="status" aria-live="polite"><span class="gap-spinner" aria-hidden="true"></span>Translating…</div>`;
      syncTranslatorOutputHeader(null);
      syncTranslatorPlaybackUi(null);
    }

    async function runTranslator() {
      const input = $('tr-input');
      const text = (input?.value ?? STATE.translatorInput ?? '').trim();
      STATE.translatorInput = input?.value ?? text;
      const token = ++translatorToken;
      const sourceLang = readTranslatorSourceLang();
      const reverse = isFonoranSourceLang(sourceLang);

      if (!text) {
        STATE.translatorBusy = false;
        STATE.translatorResult = null;
        renderTranslatorOutput(null);
        return;
      }

      STATE.translatorBusy = true;
      showTranslatorLoading();
      try {
        const body = {
          text,
          sourceLang,
          simplify: reverse ? false : 'auto',
          dev_lab: isLocalDevHost(),
        };
        if (reverse) {
          body.direction = 'from-fonoran';
          body.inputMode = sourceLang === 'fonoran-fonora' ? 'fonora' : 'roman';
          body.targetLang = readTranslatorTargetLang();
        }
        const result = await api('/api/fonoran/translate', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (token !== translatorToken) return;
        if (result?.error) {
          STATE.translatorResult = { error: result.error, mode: 'error', code: result.code, hint: result.hint };
          await renderTranslatorOutput(STATE.translatorResult);
          return;
        }
        STATE.translatorResult = result;
        await renderTranslatorOutput(result);
      } catch (e) {
        if (token !== translatorToken) return;
        const out = $('tr-output');
        const msg = e.message || 'Translation failed';
        const wrongSource = /natural language, not Fonoran/i.test(msg);
        if (out) {
          out.innerHTML = wrongSource
            ? `<p class="translator-output__empty sans translator-output__error">${escapeHtml(msg)}</p>
               <p class="translator-output__empty sans"><button type="button" class="chip" data-tr-switch-source="en">Switch source to English</button></p>`
            : `<p class="translator-output__empty sans" style="color:var(--color-error)">${escapeHtml(msg)}</p>`;
          out.querySelector('[data-tr-switch-source]')?.addEventListener('click', () => {
            const sel = $('tr-source-lang');
            if (sel) {
              sel.value = 'en';
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            void runTranslator();
          });
        }
        syncTranslatorOutputHeader(null);
        syncTranslatorPlaybackUi(null);
      } finally {
        if (token === translatorToken) STATE.translatorBusy = false;
      }
    }

    function renderTranslator() {
      const devBanner = $('tr-dev-banner');
      if (devBanner) devBanner.hidden = !isLocalDevHost();
      const input = $('tr-input');
      if (input && input.value !== STATE.translatorInput) input.value = STATE.translatorInput;
      const speedEl = $('tr-speed');
      const savedSpeed = localStorage.getItem(TRANSLATOR_SPEED_KEY);
      if (speedEl && savedSpeed) speedEl.value = savedSpeed;
      const syllableEl = $('tr-syllable-by-syllable');
      const savedSyllableMode = localStorage.getItem(TRANSLATOR_SYLLABLE_MODE_KEY)
        ?? localStorage.getItem(TRANSLATOR_SYLLABLE_MODE_LEGACY_KEY);
      if (syllableEl && savedSyllableMode != null) syllableEl.checked = savedSyllableMode !== '0';
      const langEl = $('tr-source-lang');
      const savedLang = localStorage.getItem(TRANSLATOR_SOURCE_LANG_KEY);
      if (langEl && savedLang) langEl.value = savedLang;
      const targetEl = $('tr-target-lang');
      const savedTarget = localStorage.getItem(TRANSLATOR_TARGET_LANG_KEY);
      if (targetEl && savedTarget) targetEl.value = savedTarget;
      void syncTranslatorDirectionUiAsync();
      syncTranslatorSpeedLabel();
      syncTranslatorPlaybackUi(STATE.translatorResult);
      if (STATE.translatorResult) void renderTranslatorOutput(STATE.translatorResult);
      else void renderTranslatorOutput(null);
    }

    /* ---------- GRAMMAR SPEC ---------- */
    const GRAMMAR_DOC_PATH = '../docs/fonoran-grammar.md';
    let grammarLoadToken = 0;
    let grammarMarkdownCache = null;

    async function renderGrammarMermaidIn(rootEl) {
      if (!window.mermaid || !rootEl) return;
      const { getMermaidInit } = await import('../js/mermaid-theme.js');
      window.mermaid.initialize(getMermaidInit());
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await window.mermaid.run({ nodes: rootEl.querySelectorAll('.mermaid') });
      const { initMermaidPanZoomIn } = await import('../js/mermaid-pan-zoom.js');
      initMermaidPanZoomIn(rootEl, { fitMode: 'diagram' });
    }

    async function renderGrammar() {
      ensureSplitStickyObserver();
      ensurePageChromeObserver(document.getElementById('grammar-toolbar-root'));
      syncSplitStickyOffsets();
      const body = $('grammar-body');
      const toc = $('grammar-toc');
      if (!body) return;
      const token = ++grammarLoadToken;
      disconnectTocScrollSpy();
      body.innerHTML = '<p class="page-doc-loading sans">Loading specification…</p>';
      mountDocToc(toc, []);
      try {
        const res = await fetch(GRAMMAR_DOC_PATH, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Could not load grammar specification (HTTP ${res.status})`);
        const markdown = normalizeGrammarSource(await res.text());
        grammarMarkdownCache = markdown;
        if (token !== grammarLoadToken) return;
        const headings = extractMarkdownHeadings(markdown, { minLevel: 2, maxLevel: 3 });
        mountDocToc(toc, headings);
        body.innerHTML = renderMarkdown(markdown, { docPath: 'docs/fonoran-grammar.md', grammar: true });
        await renderGrammarMermaidIn(body);
        if (token !== grammarLoadToken) return;
        syncSplitStickyOffsets();
        syncPageChromeOffset(document.getElementById('grammar-toolbar-root'));
        const onGrammarAnchor = (anchorId) => {
          scrollToPageAnchor(document.getElementById(anchorId));
          history.replaceState(null, '', `${window.location.pathname}#grammar`);
        };
        setupContentAnchorHandlers(body, onGrammarAnchor);
        setupTocClickHandlers(onGrammarAnchor);
        setupTocScrollSpy(body);
      } catch (e) {
        if (token !== grammarLoadToken) return;
        body.innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`;
        mountDocToc(toc, []);
      }
    }

    function refreshGrammarTheme() {
      const body = $('grammar-body');
      if (!body || !grammarMarkdownCache || STATE.page !== 'grammar') return;
      body.innerHTML = renderMarkdown(grammarMarkdownCache, { docPath: 'docs/fonoran-grammar.md', grammar: true });
      void renderGrammarMermaidIn(body);
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
      const body = $('progress-body');
      if (!body) return;
      try {
        body.innerHTML = `
        <div class="content-page progress-page">
          <div class="page-toolbar-shell">
            <header class="page-toolbar">
              <div class="page-toolbar__text">
                <h1 class="page-toolbar__title">Lab progress</h1>
                <p class="page-toolbar__lead">Review activity, vocabulary growth, and recent changes in your lab.</p>
              </div>
            </header>
          </div>
          <section class="content-section">
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
      } catch (err) {
        console.error('[progress] render failed:', err);
        body.innerHTML = '<p class="empty">Could not load lab progress.</p>';
      }
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
    const MAIN_PAGES = new Set(['dictionary', 'translator']);
    const ALL_PAGES = new Set(['home', 'dictionary', 'grammar', 'translator', 'puzzle', 'health', 'progress']);

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
      if (isWordManagerPage(name)) {
        goWordManager();
        return;
      }
      if (name !== 'dictionary') closeSheet();
      if (name !== 'translator' && translatorKeyboardOpen) {
        void setTranslatorKeyboardOpen(false);
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
        if (name === 'dictionary' || name === 'grammar') {
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
        window.location.href = `/tools#health${window.location.search}`;
      } else if (action === 'advanced') {
        rememberMainPage();
        switchPage('advanced');
      }
    });
    $('dict-search').addEventListener('input', e => { STATE.dictQuery = e.target.value; renderDictionary(); });
    $('dict-filters')?.addEventListener('click', e => {
      const chip = e.target.closest('[data-dict-filter]');
      if (!chip) return;
      const key = chip.dataset.dictFilter;
      const filters = dictStateToFilters(STATE);
      if (!toggleFilterKey(key, filters)) return;
      STATE.dictCoreOnly = filters.showCore;
      STATE.dictShowRoots = filters.showRoots;
      STATE.dictShowWords = filters.showWords;
      STATE.dictShowParticles = filters.showParticles;
      STATE.dictShowNeedsReview = filters.showNeedsReview;
      STATE.dictShowApproved = filters.showApproved;
      STATE.dictShowRejected = filters.showRejected;
      STATE.dictShowReconsider = filters.showReconsider;
      renderDictionary();
    });
    bindModalDismiss({
      backdrop: $('sheet-backdrop'),
      panel: $('sheet'),
      close: closeSheet,
      isOpen: () => $('sheet')?.classList.contains('open'),
    });
    bindModalDismiss({
      backdrop: $('auth-sign-in-backdrop'),
      panel: $('auth-sign-in-modal'),
      close: closeAuthModal,
      isOpen: () => !$('auth-sign-in-modal')?.hasAttribute('hidden'),
    });

    $('tr-hear')?.addEventListener('click', () => {
      if (STATE.translatorResult) void speakTranslatorResult(STATE.translatorResult);
    });
    $('tr-stop')?.addEventListener('click', () => stopTranslatorSpeech());

    let translatorDebounce = null;
    $('tr-input')?.addEventListener('input', (e) => {
      STATE.translatorInput = e.target.value;
      if (isTranslatorFonoraMode()) return;
      clearTimeout(translatorDebounce);
      translatorDebounce = setTimeout(() => { void runTranslator(); }, 280);
    });
    $('tr-input')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (!isTranslatorFonoraMode()) return;
      // Physical Enter while Fonora keyboard is active is handled by the keyboard module.
      if (translatorKeyboardOpen) return;
      e.preventDefault();
      void runTranslator();
    });
    $('tr-speed')?.addEventListener('input', () => {
      syncTranslatorSpeedLabel();
      localStorage.setItem(TRANSLATOR_SPEED_KEY, String(readTranslatorSpeed()));
    });
    $('tr-syllable-by-syllable')?.addEventListener('change', (e) => {
      localStorage.setItem(TRANSLATOR_SYLLABLE_MODE_KEY, e.target.checked ? '1' : '0');
    });
    $('tr-source-lang')?.addEventListener('change', (e) => {
      localStorage.setItem(TRANSLATOR_SOURCE_LANG_KEY, e.target.value);
      void syncTranslatorDirectionUiAsync().then(() => runTranslator());
    });
    $('tr-target-lang')?.addEventListener('change', (e) => {
      localStorage.setItem(TRANSLATOR_TARGET_LANG_KEY, e.target.value);
      void runTranslator();
    });
    $('tr-keyboard-toggle')?.addEventListener('click', () => {
      void setTranslatorKeyboardOpen(!translatorKeyboardOpen);
    });
    $('tr-keyboard-close')?.addEventListener('click', () => {
      void setTranslatorKeyboardOpen(false);
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

    function toolsRedirectTab(hash) {
      if (hash === 'gaps' || hash === 'translation-test') return 'translation-test';
      if (hash === 'health') return 'health';
      if (hash === 'progress') return 'progress';
      if (hash === 'advanced') return 'advanced';
      return null;
    }

    const hashOnLoadRaw = window.location.hash.replace(/^#/, '').split('?')[0];
    if (isWordManagerPage(hashOnLoadRaw)) {
      goWordManager();
    } else {
      const toolsTab = toolsRedirectTab(hashOnLoadRaw);
      if (toolsTab) {
        window.location.replace(`/tools#${toolsTab}${window.location.search}`);
      } else {
    const hashOnLoad = hashOnLoadRaw;
    const initialPageRaw = (hashOnLoad && ALL_PAGES.has(hashOnLoad) ? hashOnLoad : null)
      || document.documentElement.getAttribute('data-fonora-page')
      || 'home';
    const initialPage = isWordManagerPage(initialPageRaw) ? 'home' : initialPageRaw;
    setNavSelectHandlers({
      onPage: (page) => switchPage(page),
      onSignOut: () => { signOut(); },
    });
    mountSiteFooter();
    initUniversalNav({ context: 'language', activeTab: initialPage });
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    // Write-protected pages are activated inside boot() after auth is verified
    if (!WRITE_PAGES.has(initialPage)) {
      $(`page-${initialPage}`)?.classList.add('active');
    }

    async function boot() {
      STATE.page = initialPage;
      await refreshAuth();
      handleAuthUrlErrors();
      updateAuthGate();
      if (STATE.page === 'advanced' && AUTH.required && !AUTH.isAdmin) {
        switchPage('dictionary');
      } else if (WRITE_PAGES.has(STATE.page)) {
        // Auth confirmed — now safe to reveal the write-protected page
        $(`page-${STATE.page}`)?.classList.add('active');
      }
      window.addEventListener('hashchange', () => {
        let hashPage = parseHashPage();
        const redirectTab = toolsRedirectTab(hashPage);
        if (redirectTab) {
          window.location.replace(`/tools#${redirectTab}${window.location.search}`);
          return;
        }
        if (isWordManagerPage(hashPage)) {
          goWordManager();
          return;
        }
        const page = hashPage && ALL_PAGES.has(hashPage) ? hashPage : 'home';
        if (page !== STATE.page) switchPage(page);
      });
      wireLander();
      window.addEventListener('resize', syncSplitStickyOffsets);
      document.addEventListener('fonora-themechange', refreshGrammarTheme);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getStoredTheme() === 'system') refreshGrammarTheme();
      });
      await load();
      syncSplitStickyOffsets();
    }

    boot();
      }
    }
