/**
 * Unified two-row navigation shell for Fonora Script and Fonoran.
 * Mount into #app-header-root.
 */

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
  { id: 'create', label: 'Compound Creator' },
  { id: 'review', label: 'Review' },
  { id: 'dictionary', label: 'Dictionary' },
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
  create: 'Compound Creator',
  review: 'Review',
  dictionary: 'Dictionary',
  health: 'Health',
  advanced: 'Advanced',
};

const MORE_TAB_IDS = new Set(MORE_MENU.filter((i) => i.id).map((i) => i.id));

let state = {
  context: 'script',
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

function scriptBase(context) {
  return context === 'fonoran' ? '..' : '.';
}

function docHref(context, path) {
  return `${scriptBase(context)}/?path=${encodeURIComponent(path)}#docs`;
}

function renderFonoranAuthTools() {
  if (!fonoranAuthState?.required || !fonoranAuthState.authenticated) return '';
  const email = escapeAttr(fonoranAuthState.email ?? 'Signed in');
  return `
        <span class="fonoran-auth-user" title="${email}">${escapeHtml(fonoranAuthState.email ?? 'Signed in')}</span>
        <button type="button" class="app-header__global-link app-header__global-link--button" id="fonoran-sign-out">Sign out</button>`;
}

function renderRow1(context) {
  const base = scriptBase(context);
  const scriptActive = context === 'script';
  const fonoranActive = context === 'fonoran';

  return `
    <div class="app-header__row app-header__row--platform">
      <div class="app-header__start">
        <a href="${escapeAttr(base)}/#home" class="app-header__brand">Fonora</a>
        <div class="context-pills" role="group" aria-label="Application context">
          ${
            scriptActive
              ? `<span class="context-pill context-pill--active context-pill--script">Fonora Script</span>`
              : `<a href="${escapeAttr(base)}/#home" class="context-pill context-pill--script">Fonora Script</a>`
          }
          ${
            fonoranActive
              ? `<a href="${escapeAttr(base)}/fonoran/" class="context-pill context-pill--active context-pill--fonoran">Fonoran</a>`
              : `<a href="${escapeAttr(base)}/fonoran/" class="context-pill context-pill--fonoran">Fonoran</a>`
          }
        </div>
      </div>
      <nav class="app-header__global" aria-label="Platform links">
        <a href="${escapeAttr(base)}/#open-problems" class="app-header__global-link" data-script-tab="open-problems">Research</a>
        <a href="${docHref(context, 'docs/platform-overview.md')}" class="app-header__global-link" data-script-tab="docs">Docs</a>
        ${context === 'fonoran' ? renderFonoranAuthTools() : ''}
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
    return `<button type="button" class="tab-btn nav-dropdown-item" data-tab="${item.id}" role="menuitem"${
      active ? ' aria-current="page"' : ''
    }>${item.label}</button>`;
  }).join('');

  const moreActive = MORE_TAB_IDS.has(activeTab);

  return `
    <div class="app-header__row app-header__row--tools">
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
      <button type="button" class="fonoran-tab-btn${t.id === activeTab ? ' active' : ''}" data-fonoran-page="${t.id}"${
        t.id === activeTab ? ' aria-current="page"' : ''
      }>${t.label}</button>`,
  ).join('');

  return `
    <div class="app-header__row app-header__row--tools app-header__row--fonoran">
      <nav class="fonoran-tabs" aria-label="Fonoran tools">${tabs}</nav>
      <div class="app-header__tools">
        <button type="button" class="icon-btn" id="health-btn" data-fonoran-action="health">Health</button>
        <button type="button" class="icon-btn" id="advanced-btn" data-fonoran-action="advanced">⚙ Advanced</button>
      </div>
    </div>`;
}

function updateDocumentTitle() {
  if (state.context === 'script') {
    const label = SCRIPT_TITLES[state.activeTab] ?? 'Fonora';
    document.title = state.activeTab === 'home' ? 'Fonora | Universal Phonetic Script' : `Fonora — ${label}`;
  } else {
    const label = FONORAN_TITLES[state.activeTab] ?? 'Fonoran';
    document.title = state.activeTab === 'home' ? 'Fonoran: Experimental Language' : `Fonoran: ${label}`;
  }
}

function render() {
  const root = document.getElementById(state.mountId);
  if (!root) return;

  const contextClass = state.context === 'fonoran' ? 'app-header--fonoran' : 'app-header--script';
  const row2 =
    state.context === 'fonoran'
      ? renderFonoranRow2(state.activeTab)
      : renderScriptRow2(state.activeTab);

  root.className = `app-header ${contextClass}`;
  root.innerHTML = `${renderRow1(state.context)}${row2}`;
  updateDocumentTitle();
}

function closeNavDropdown() {
  const dropdown = document.getElementById('nav-more');
  const menu = document.getElementById('nav-more-menu');
  const trigger = document.getElementById('nav-more-trigger');
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.remove('nav-dropdown--open');
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function openNavDropdown() {
  const dropdown = document.getElementById('nav-more');
  const menu = document.getElementById('nav-more-menu');
  const trigger = document.getElementById('nav-more-trigger');
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.add('nav-dropdown--open');
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

function setupScriptHeaderListeners() {
  const root = document.getElementById(state.mountId);
  if (!root) return;

  root.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      const tab = el.dataset.tab;
      if (!tab) return;
      root.dispatchEvent(new CustomEvent('universal-nav:tab', { detail: { tab }, bubbles: true }));
    });
  });

  root.querySelectorAll('[data-script-tab]').forEach((el) => {
    el.addEventListener('click', (event) => {
      if (state.context !== 'script') return;
      const tab = el.dataset.scriptTab;
      if (!tab) return;
      event.preventDefault();
      root.dispatchEvent(new CustomEvent('universal-nav:tab', { detail: { tab }, bubbles: true }));
    });
  });

  const trigger = document.getElementById('nav-more-trigger');
  const dropdown = document.getElementById('nav-more');
  if (trigger && dropdown) {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (dropdown.classList.contains('nav-dropdown--open')) closeNavDropdown();
      else openNavDropdown();
    });
  }
}

function setupFonoranHeaderListeners() {
  const root = document.getElementById(state.mountId);
  if (!root) return;

  root.querySelectorAll('[data-fonoran-page]').forEach((el) => {
    el.addEventListener('click', () => {
      const page = el.dataset.fonoranPage;
      if (page) {
        root.dispatchEvent(new CustomEvent('universal-nav:page', { detail: { page }, bubbles: true }));
      }
    });
  });

  root.querySelectorAll('[data-fonoran-action]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.fonoranAction;
      if (action) {
        root.dispatchEvent(new CustomEvent('universal-nav:action', { detail: { action }, bubbles: true }));
      }
    });
  });

  const signOut = document.getElementById('fonoran-sign-out');
  if (signOut) {
    signOut.addEventListener('click', () => {
      root.dispatchEvent(new CustomEvent('universal-nav:sign-out', { bubbles: true }));
    });
  }
}

function bindListeners() {
  if (state.context === 'script') {
    setupScriptHeaderListeners();
  } else {
    setupFonoranHeaderListeners();
  }
}

let listenersBound = false;

function bindGlobalDismiss() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('nav-more');
    if (dropdown && !dropdown.contains(event.target)) closeNavDropdown();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNavDropdown();
  });
}

/**
 * @param {{ context?: 'script' | 'fonoran', activeTab?: string, mountId?: string }} [options]
 */
export function initUniversalNav(options = {}) {
  state.context =
    options.context ?? (window.location.pathname.includes('/fonoran') ? 'fonoran' : 'script');
  state.activeTab = options.activeTab ?? 'home';
  state.mountId = options.mountId ?? 'app-header-root';

  render();
  bindListeners();
  bindGlobalDismiss();
}

/**
 * @param {string} tabOrPage
 */
export function setActiveTab(tabOrPage) {
  if (state.activeTab === tabOrPage) {
    updateDocumentTitle();
    return;
  }
  state.activeTab = tabOrPage;
  render();
  bindListeners();
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
  if (state.context === 'fonoran') {
    render();
    bindListeners();
  }
}

export { closeNavDropdown, MORE_TAB_IDS };
