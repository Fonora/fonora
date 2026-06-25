/**
 * Unified two-row navigation shell for Fonora platform, Script, and Language.
 * Mount into #app-header-root.
 */

import { docViewerHref, isDocsRoute } from './doc-urls.js';

const SCRIPT_TABS = [
  { id: 'home', label: 'Home', primary: true },
  { id: 'translator', label: 'Translator', primary: true },
  { id: 'reader', label: 'Reader', primary: true },
  { id: 'grid', label: 'Sound Grid', primary: true },
  { id: 'alphabet', label: 'Alphabet', primary: true },
];

const MORE_MENU = [
  { type: 'label', text: 'Transliteration' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'samples', label: 'Samples' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'reverse', label: 'Reverse Lookup' },
  { type: 'label', text: 'Script QA' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'encoder-testing', label: 'Pronunciation Testing' },
  { id: 'pronunciation-validation', label: 'Pronunciation Validation' },
  { type: 'label', text: 'Platform' },
  { id: 'open-problems', label: 'Open Problems' },
  { id: 'docs', label: 'Docs' },
];

const FONORAN_TABS = [
  { id: 'home', label: 'Home' },
  { id: 'roots', label: 'Root Creator' },
  { id: 'create', label: 'Word Creator' },
  { id: 'matcher', label: 'Word Matcher' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'review', label: 'Review' },
];

const SCRIPT_TITLES = {
  home: 'Home',
  translator: 'Translator',
  reader: 'Reader',
  grid: 'Sound Grid',
  alphabet: 'Alphabet',
  breakdown: 'Breakdown',
  samples: 'Samples',
  keyboard: 'Keyboard',
  reverse: 'Reverse Lookup',
  quiz: 'Quiz',
  'encoder-testing': 'Pronunciation Testing',
  'pronunciation-validation': 'Pronunciation Validation',
  'open-problems': 'Open Problems',
  docs: 'Documentation',
};

const FONORAN_TITLES = {
  home: 'About Fonoran',
  roots: 'Root Creator',
  create: 'Word Creator',
  matcher: 'Word Matcher',
  review: 'Review',
  dictionary: 'Dictionary',
  health: 'Health',
  advanced: 'Advanced',
};

const MORE_TAB_IDS = new Set(MORE_MENU.filter((i) => i.id).map((i) => i.id));
const FONORAN_MORE_IDS = new Set(['health', 'advanced']);

const PLATFORM_TABS = [
  { id: 'platform', label: 'About' },
  { id: 'open-problems', label: 'Research' },
  { id: 'docs', label: 'Docs' },
];

/** @typedef {'platform' | 'script' | 'language'} NavContext */

let state = {
  context: /** @type {NavContext} */ ('script'),
  activeTab: 'home',
  mountId: 'app-header-root',
};

/** @type {{ required: boolean, authenticated: boolean, email: string | null, loginUrl: string } | null} */
let fonoranAuthState = null;

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rootPath(context) {
  return context === 'language' ? '..' : '.';
}

function docHref(context, path) {
  const prefix = context === 'language' ? '..' : '';
  return `${prefix}${docViewerHref(path)}`;
}

function platformTabHref(context, tabId) {
  const root = rootPath(context);
  if (tabId === 'platform') return `${root}/#about`;
  if (tabId === 'script') return `${root}/#home`;
  return context === 'language' ? './' : 'fonoran/';
}

function renderGlobalAuthTools() {
  if (!fonoranAuthState?.required) return '';
  if (fonoranAuthState.authenticated) {
    const email = escapeAttr(fonoranAuthState.email ?? 'Signed in');
    return `
        <span class="fonoran-auth-user" title="${email}">${escapeHtml(fonoranAuthState.email ?? 'Signed in')}</span>
        <button type="button" class="app-header__sign-out-btn" id="fonoran-sign-out">Sign out</button>`;
  }
  const loginUrl = escapeAttr(fonoranAuthState.loginUrl);
  return `<a href="${loginUrl}" class="app-header__global-link">Sign in</a>`;
}

function renderPlatformTabs(context) {
  const tabs = [
    { id: 'platform', label: 'Fonora' },
    { id: 'script', label: 'Script' },
    { id: 'language', label: 'Language' },
  ];

  return tabs
    .map((tab) => {
      const active = context === tab.id;
      const href = escapeAttr(platformTabHref(context, tab.id));
      if (active) {
        return `<span class="platform-tab platform-tab--active" aria-current="page">${tab.label}</span>`;
      }
      return `<a href="${href}" class="platform-tab">${tab.label}</a>`;
    })
    .join('');
}

function renderRow1(context) {
  return `
    <div class="app-header__tabstrip">
      <div class="app-header__row app-header__row--platform">
        <div class="app-header__start">
          <nav class="platform-tabs" role="tablist" aria-label="Fonora sections">${renderPlatformTabs(context)}</nav>
        </div>
        <nav class="app-header__global" aria-label="Account" data-nav-auth>${renderGlobalAuthTools()}</nav>
      </div>
    </div>`;
}

function renderPlatformRow2(activeTab) {
  const tabs = PLATFORM_TABS.map((t) => {
    const active = t.id === activeTab;
    return `<button type="button" class="tab-btn${active ? ' tab-btn--active' : ''}" data-platform-tab="${t.id}"${
      active ? ' aria-current="page"' : ''
    }>${t.label}</button>`;
  }).join('');

  return `
    <div class="app-header__row app-header__row--tools" data-nav-row="platform-tools">
      <nav class="main-nav" aria-label="Fonora">
        <div class="main-nav-primary">${tabs}</div>
      </nav>
    </div>`;
}

function renderScriptRow2(activeTab) {
  const primary = SCRIPT_TABS.map(
    (t) => `
      <button type="button" class="tab-btn${t.id === activeTab ? ' tab-btn--active' : ''}" data-tab="${t.id}"${
        t.id === activeTab ? ' aria-current="page"' : ''
      }>${t.label}</button>`,
  ).join('');

  const moreItems = MORE_MENU.map((item) => {
    if (item.type === 'label') {
      return `<p class="nav-dropdown-label" role="presentation">${item.text}</p>`;
    }
    const active = item.id === activeTab;
    return `<button type="button" class="tab-btn nav-dropdown-item${active ? ' tab-btn--active' : ''}" data-tab="${item.id}" role="menuitem"${
      active ? ' aria-current="page"' : ''
    }>${item.label}</button>`;
  }).join('');

  const moreActive = MORE_TAB_IDS.has(activeTab);

  return `
    <div class="app-header__row app-header__row--tools" data-nav-row="script-tools">
      <nav class="main-nav" aria-label="Script tools">
        <div class="main-nav-primary">${primary}</div>
        <div class="nav-dropdown${moreActive ? ' nav-dropdown--child-active' : ''}" id="nav-more">
          <button
            type="button"
            class="nav-dropdown-trigger tab-btn"
            id="nav-more-trigger"
            aria-expanded="false"
            aria-haspopup="true"
            aria-controls="nav-more-menu"
          >
            More
            <span class="nav-dropdown-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="nav-dropdown-menu" id="nav-more-menu" role="menu" hidden>${moreItems}</div>
        </div>
      </nav>
    </div>`;
}

function renderFonoranRow2(activeTab) {
  const tabs = FONORAN_TABS.map(
    (t) => `
      <button type="button" class="tab-btn${t.id === activeTab ? ' tab-btn--active' : ''}" data-fonoran-page="${t.id}"${
        t.id === activeTab ? ' aria-current="page"' : ''
      }>${t.label}</button>`,
  ).join('');

  const moreActive = FONORAN_MORE_IDS.has(activeTab);
  const moreItems = ['health', 'advanced']
    .map((id) => {
      const active = id === activeTab;
      const label = id === 'health' ? 'Health' : 'Advanced';
      return `<button type="button" class="tab-btn nav-dropdown-item${active ? ' tab-btn--active' : ''}" data-fonoran-page="${id}" role="menuitem"${
        active ? ' aria-current="page"' : ''
      }>${label}</button>`;
    })
    .join('');

  return `
    <div class="app-header__row app-header__row--tools" data-nav-row="language-tools">
      <nav class="main-nav" aria-label="Fonoran tools">
        <div class="main-nav-primary">${tabs}</div>
        <div class="nav-dropdown${moreActive ? ' nav-dropdown--child-active' : ''}" id="fonoran-nav-more">
          <button
            type="button"
            class="nav-dropdown-trigger tab-btn"
            id="fonoran-nav-more-trigger"
            aria-expanded="false"
            aria-haspopup="true"
            aria-controls="fonoran-nav-more-menu"
          >
            More
            <span class="nav-dropdown-chevron" aria-hidden="true">▾</span>
          </button>
          <div class="nav-dropdown-menu" id="fonoran-nav-more-menu" role="menu" hidden>${moreItems}</div>
        </div>
      </nav>
    </div>`;
}

function updateDocumentTitle() {
  if (state.context === 'platform') {
    if (state.activeTab === 'open-problems') {
      document.title = 'Fonora | Research';
    } else if (state.activeTab === 'docs') {
      document.title = 'Fonora | Docs';
    } else {
      document.title = 'Fonora | Phonetic Writing Platform';
    }
  } else if (state.context === 'script') {
    const label = SCRIPT_TITLES[state.activeTab] ?? 'Fonora';
    document.title = state.activeTab === 'home' ? 'Fonora Script | Universal Phonetic Writing' : `Fonora Script | ${label}`;
  } else {
    const label = FONORAN_TITLES[state.activeTab] ?? 'Fonoran';
    document.title = state.activeTab === 'home' ? 'Fonoran | Experimental Language' : `Fonoran | ${label}`;
  }
}

function syncBootAttributes() {
  const html = document.documentElement;
  html.setAttribute('data-fonora-nav', state.context);
  if (state.context === 'language') {
    html.setAttribute('data-fonora-tab', state.activeTab);
    html.setAttribute('data-fonora-page', state.activeTab);
    return;
  }
  html.setAttribute('data-fonora-tab', state.activeTab);
  html.removeAttribute('data-fonora-page');
}

function patchStaticNav(root) {
  root.className = `app-header app-header--${state.context}`;

  root.querySelectorAll('[data-nav-tab]').forEach((el) => {
    el.classList.toggle('platform-tab--active', el.dataset.navTab === state.context);
  });

  root.querySelectorAll('[data-tab].tab-btn').forEach((el) => {
    const active = el.dataset.tab === state.activeTab;
    el.classList.toggle('tab-btn--active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  root.querySelectorAll('[data-platform-tab].tab-btn').forEach((el) => {
    const active = el.dataset.platformTab === state.activeTab;
    el.classList.toggle('tab-btn--active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  root.querySelectorAll('[data-fonoran-page].tab-btn').forEach((el) => {
    const active = el.dataset.fonoranPage === state.activeTab;
    el.classList.toggle('tab-btn--active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  const moreDropdown = root.querySelector('#nav-more');
  if (moreDropdown) {
    moreDropdown.classList.toggle('nav-dropdown--child-active', MORE_TAB_IDS.has(state.activeTab));
  }

  const fonoranMore = root.querySelector('#fonoran-nav-more');
  if (fonoranMore) {
    fonoranMore.classList.toggle('nav-dropdown--child-active', FONORAN_MORE_IDS.has(state.activeTab));
  }

  const authSlot = root.querySelector('[data-nav-auth]');
  if (authSlot) {
    authSlot.innerHTML = renderGlobalAuthTools();
  }

  syncBootAttributes();
}

function render() {
  const root = document.getElementById(state.mountId);
  if (!root) return;

  if (root.dataset.navShell === 'static') {
    patchStaticNav(root);
  } else {
    const contextClass = `app-header--${state.context}`;
    const row2 =
      state.context === 'language'
        ? renderFonoranRow2(state.activeTab)
        : state.context === 'script'
          ? renderScriptRow2(state.activeTab)
          : state.context === 'platform'
            ? renderPlatformRow2(state.activeTab)
            : '';

    root.className = `app-header ${contextClass}`;
    root.innerHTML = `${renderRow1(state.context)}${row2}`;
  }

  updateDocumentTitle();
  syncBootAttributes();
  bindNavListeners();
}

function closeNavDropdown(dropdownId = 'nav-more') {
  const dropdown = document.getElementById(dropdownId);
  const menu = document.getElementById(`${dropdownId}-menu`);
  const trigger = document.getElementById(`${dropdownId}-trigger`);
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.remove('nav-dropdown--open');
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function openNavDropdown(dropdownId = 'nav-more') {
  const dropdown = document.getElementById(dropdownId);
  const menu = document.getElementById(`${dropdownId}-menu`);
  const trigger = document.getElementById(`${dropdownId}-trigger`);
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.add('nav-dropdown--open');
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

/** @type {AbortController | null} */
let navListenersAbort = null;

function bindNavListeners() {
  navListenersAbort?.abort();
  navListenersAbort = new AbortController();
  const { signal } = navListenersAbort;

  const root = document.getElementById(state.mountId);
  if (!root) return;

  root.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        const tab = el.dataset.tab;
        if (!tab) return;
        closeNavDropdown('nav-more');
        root.dispatchEvent(new CustomEvent('universal-nav:tab', { detail: { tab }, bubbles: true }));
      },
      { signal },
    );
  });

  root.querySelectorAll('[data-platform-tab]').forEach((el) => {
    el.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        const tab = el.dataset.platformTab;
        if (!tab) return;
        root.dispatchEvent(new CustomEvent('universal-nav:platform-tab', { detail: { tab }, bubbles: true }));
      },
      { signal },
    );
  });

  root.querySelectorAll('[data-fonoran-page]').forEach((el) => {
    el.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        const page = el.dataset.fonoranPage;
        if (!page) return;
        closeNavDropdown('fonoran-nav-more');
        root.dispatchEvent(new CustomEvent('universal-nav:page', { detail: { page }, bubbles: true }));
      },
      { signal },
    );
  });

  const signOut = document.getElementById('fonoran-sign-out');
  signOut?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      root.dispatchEvent(new CustomEvent('universal-nav:sign-out', { bubbles: true }));
    },
    { signal },
  );

  ['nav-more', 'fonoran-nav-more'].forEach((dropdownId) => {
    const trigger = document.getElementById(`${dropdownId}-trigger`);
    const dropdown = document.getElementById(dropdownId);
    if (!trigger || !dropdown) return;
    trigger.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (dropdown.classList.contains('nav-dropdown--open')) closeNavDropdown(dropdownId);
        else openNavDropdown(dropdownId);
      },
      { signal },
    );
  });
}

let listenersBound = false;

function bindGlobalDismiss() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!el) return;
    ['nav-more', 'fonoran-nav-more'].forEach((id) => {
      const dropdown = document.getElementById(id);
      if (dropdown && !dropdown.contains(el)) closeNavDropdown(id);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNavDropdown('nav-more');
      closeNavDropdown('fonoran-nav-more');
    }
  });
}

export function wireUniversalNav() {
  bindGlobalDismiss();
}

/**
 * @param {{ context?: NavContext, activeTab?: string, mountId?: string }} [options]
 */
export function initUniversalNav(options = {}) {
  state.context =
    options.context ??
    (window.location.pathname.includes('/fonoran')
      ? 'language'
      : !window.location.hash && !isDocsRoute()
        ? 'platform'
        : 'script');
  state.activeTab =
    options.activeTab ??
    (state.context === 'platform' ? 'platform' : 'home');
  state.mountId = options.mountId ?? 'app-header-root';

  render();
  wireUniversalNav();
}

/**
 * @param {NavContext} context
 */
export function setNavContext(context) {
  if (state.context === context) return;
  state.context = context;
  render();
}

/**
 * @param {string} tabOrPage
 */
export function setActiveTab(tabOrPage) {
  if (state.activeTab === tabOrPage) {
    updateDocumentTitle();
    syncBootAttributes();
    return;
  }
  state.activeTab = tabOrPage;
  render();
}

/** @param {boolean} disabled */
export function setFonoranUndoDisabled(disabled) {
  const btn = document.getElementById('undo-btn');
  if (btn) btn.disabled = disabled;
}

/**
 * @param {{ required: boolean, authenticated: boolean, email?: string | null, loginUrl?: string }} auth
 */
export function setFonoranAuth(auth) {
  fonoranAuthState = {
    required: Boolean(auth.required),
    authenticated: Boolean(auth.authenticated),
    email: auth.email ?? null,
    loginUrl: auth.loginUrl ?? '/auth/google?returnTo=/fonoran/',
  };
  const root = document.getElementById(state.mountId);
  if (root?.dataset.navShell === 'static') {
    patchStaticNav(root);
    bindNavListeners();
  } else {
    render();
  }
}

export { closeNavDropdown, MORE_TAB_IDS };
