/**
 * Unified two-row navigation shell for Fonora platform, Script, and Language.
 * Mount into #app-header-root.
 */

import { docViewerHref, isDocsRoute } from './doc-urls.js';
import { learnTrackForTab } from './learn-routing.js';
import { pageTitle, PLATFORM_HOME_TITLE, PLATFORM_PAGE_TITLE, SITE_NAME } from './site-copy.js';
import { cycleTheme, getStoredTheme } from './theme.js';

const SCRIPT_TABS = [
  { id: 'home', label: 'About', primary: true },
  { id: 'translator', label: 'Transliterate', primary: true },
  { id: 'alphabet', label: 'Alphabet', primary: true },
  { id: 'grid', label: 'Sound Grid', primary: true },
];

// "Builder" = the /language vocabulary-building lab for Fonoran.
const BUILDER_TABS = [
  { id: 'home', label: 'About' },
  { id: 'translator', label: 'Translator' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'puzzle', label: 'Puzzle' },
];

const LEARN_TITLES = {
  'learn-home': 'Learn',
  'script-writing': 'Script · Writing',
  'script-sounds': 'Script · Symbol Sounds',
  'script-words': 'Script · Read Words',
  'fonoran-reading': 'Fonoran · Reading',
  'fonoran-writing': 'Fonoran · Writing',
  'fonoran-hearing': 'Fonoran · Hearing',
  'fonoran-grammar': 'Fonoran · Grammar',
  'fonoran-speaking': 'Fonoran · Speaking',
};

const SCRIPT_TITLES = {
  home: 'About',
  translator: 'Transliterate',
  grid: 'Sound Grid',
  alphabet: 'Alphabet',
  docs: 'Documentation',
};

const BUILDER_TITLES = {
  home: 'About',
  translator: 'Translator',
  puzzle: 'Puzzle Conversation',
  dictionary: 'Dictionary',
  grammar: 'Grammar',
  health: 'Health',
  gaps: 'Translation Test',
  progress: 'Lab progress',
  advanced: 'Advanced',
};

const TOOLS_TITLES = {
  'tools-home': 'Tools',
  'word-manager': 'Words',
  'gap-workshop': 'Review',
  'translation-test': 'Translation Test',
  advanced: 'Advanced',
  docs: 'Docs',
  samples: 'Samples',
  'encoder-testing': 'Pronunciation Testing',
  'pronunciation-validation': 'Pronunciation Validation',
};

const TOOLS_ROW_TABS = [
  { id: 'tools-home', label: 'Home' },
  { id: 'word-manager', label: 'Words', adminOnly: true },
  { id: 'gap-workshop', label: 'Review', adminOnly: true },
  { id: 'translation-test', label: 'Translation Test', adminOnly: true },
  { id: 'advanced', label: 'Advanced', adminOnly: true },
  { id: 'docs', label: 'Docs' },
];

const PLATFORM_TABS = [
  { id: 'platform', label: 'About' },
  { id: 'research', label: 'Research', href: '/research' },
  { id: 'timeline', label: 'Timeline', href: '/research/timeline' },
  { id: 'open', label: 'Open Questions', href: '/research#open' },
  { id: 'docs', label: 'Docs' },
];

const PLATFORM_TITLES = {
  platform: PLATFORM_PAGE_TITLE,
  research: 'Research Notebook',
  timeline: 'Research Timeline',
  open: 'Open Questions',
  note: 'Research Note',
  docs: 'Docs',
};

/** @typedef {'platform' | 'script' | 'language' | 'learn' | 'tools'} NavContext */

let state = {
  context: /** @type {NavContext} */ ('script'),
  activeTab: 'home',
  mountId: 'app-header-root',
};

/** @type {{ required: boolean, configured: boolean, toolsGated: boolean, authenticated: boolean, isAdmin: boolean, email: string | null, loginUrl: string } | null} */
let fonoranAuthState = null;

function shouldHideToolsPlatformTab() {
  // Hide Tools tab for everyone except admins when auth is enabled.
  if (!fonoranAuthState) return true;
  if (!fonoranAuthState.toolsGated) return false;
  return !fonoranAuthState.isAdmin;
}

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

function platformTabHref(_context, tabId) {
  if (tabId === 'platform') return '/';
  if (tabId === 'script') return '/script';
  if (tabId === 'learn') return '/learn';
  if (tabId === 'tools') return '/tools';
  return '/language';
}

function renderThemeToggle() {
  const theme = getStoredTheme();
  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto';
  const icons = {
    light:
      '<svg class="app-header__theme-icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="3.25"/><path stroke-linecap="round" d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M4.4 15.6l1.4-1.4M14.2 5.8l1.4-1.4"/></svg>',
    dark: '<svg class="app-header__theme-icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14.5 12.5a5.5 5.5 0 11-3.4-9.8 6.5 6.5 0 003.4 9.8z"/></svg>',
    system:
      '<svg class="app-header__theme-icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="14" height="9" rx="1.5"/><path stroke-linecap="round" d="M8 16h4"/></svg>',
  };
  const icon = icons[theme === 'system' ? 'system' : theme];
  return `<button type="button" class="app-header__theme-btn" id="fonora-theme-toggle" aria-label="Theme: ${label}" title="Theme (${label})">${icon}</button>`;
}

function renderGlobalAuthTools() {
  const themeBtn = renderThemeToggle();
  if (!fonoranAuthState?.configured) {
    return `<div class="app-header__account">${themeBtn}</div>`;
  }
  if (fonoranAuthState.authenticated) {
    const email = escapeAttr(fonoranAuthState.email ?? 'Signed in');
    return `<div class="app-header__account">
        ${themeBtn}
        <span class="fonoran-auth-user" title="${email}">${escapeHtml(fonoranAuthState.email ?? 'Signed in')}</span>
        <button type="button" class="app-header__global-link app-header__global-link--button" id="fonoran-sign-out">Sign out</button>
      </div>`;
  }
  const loginUrl = escapeAttr(fonoranAuthState.loginUrl);
  return `<div class="app-header__account">${themeBtn}<a href="${loginUrl}" class="app-header__global-link">Sign in</a></div>`;
}

function renderPlatformTabs(context) {
  const tabs = [
    { id: 'platform', label: 'Fonora' },
    { id: 'script', label: 'Script' },
    { id: 'language', label: 'Language' },
    { id: 'learn', label: 'Learn' },
    { id: 'tools', label: 'Tools' },
  ];

  return tabs
    .filter((tab) => tab.id !== 'tools' || !shouldHideToolsPlatformTab())
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
    const cls = `tab-btn${active ? ' tab-btn--active' : ''}`;
    const activeAttr = active ? ' aria-current="page"' : '';
    if (t.href) {
      return `<a href="${escapeAttr(t.href)}" class="${cls}" data-platform-tab="${t.id}"${activeAttr}>${t.label}</a>`;
    }
    return `<button type="button" class="${cls}" data-platform-tab="${t.id}"${activeAttr}>${t.label}</button>`;
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

  return `
    <div class="app-header__row app-header__row--tools" data-nav-row="script-tools">
      <nav class="main-nav" aria-label="Script tools">
        <div class="main-nav-primary">${primary}</div>
      </nav>
    </div>`;
}

function renderBuilderRow2(activeTab) {
  const tabs = BUILDER_TABS.map(
    (t) => `
      <button type="button" class="tab-btn${t.id === activeTab ? ' tab-btn--active' : ''}" data-fonoran-page="${t.id}"${
        t.id === activeTab ? ' aria-current="page"' : ''
      }>${t.label}</button>`,
  ).join('');

  return `
    <div class="app-header__row app-header__row--tools" data-nav-row="language-tools">
      <nav class="main-nav" aria-label="Language">
        <div class="main-nav-primary">${tabs}</div>
      </nav>
    </div>`;
}

function renderLearnRow2() {
  // The Learn platform tab is its own section (the skill hub); no sub-nav row is
  // rendered. In-lesson navigation is handled by the sticky session bar.
  return '';
}

function shouldShowToolsTab(tab) {
  if (!tab.adminOnly) return true;
  if (!fonoranAuthState?.configured || !fonoranAuthState?.toolsGated) return true;
  return Boolean(fonoranAuthState?.isAdmin);
}

function renderToolsRow2(activeTab) {
  const tabs = TOOLS_ROW_TABS.filter(shouldShowToolsTab)
    .map((t) => {
      if (t.href) {
        return `<a href="${escapeAttr(t.href)}" class="tab-btn">${t.label}</a>`;
      }
      const active = t.id === activeTab;
      return `
      <button type="button" class="tab-btn${active ? ' tab-btn--active' : ''}" data-tab="${t.id}"${
        active ? ' aria-current="page"' : ''
      }>${t.label}</button>`;
    })
    .join('');

  return `
    <div class="app-header__row app-header__row--tools" data-nav-row="tools-tools">
      <nav class="main-nav" aria-label="Tools">
        <div class="main-nav-primary">${tabs}</div>
      </nav>
    </div>`;
}

function updateDocumentTitle() {
  if (state.context === 'platform') {
    if (state.activeTab === 'docs') {
      document.title = pageTitle('Docs');
    } else if (state.activeTab === 'platform') {
      document.title = PLATFORM_HOME_TITLE;
    } else {
      const label = PLATFORM_TITLES[state.activeTab] ?? SITE_NAME;
      document.title = pageTitle(label);
    }
  } else if (state.context === 'script') {
    const label = SCRIPT_TITLES[state.activeTab] ?? 'Script';
    document.title = pageTitle(state.activeTab === 'home' ? 'Fonora Script' : `Fonora Script · ${label}`);
  } else if (state.context === 'learn') {
    const label = LEARN_TITLES[state.activeTab] ?? 'Learn';
    document.title = pageTitle(`Learn · ${label}`);
  } else if (state.context === 'tools') {
    const label = TOOLS_TITLES[state.activeTab] ?? 'Tools';
    document.title = pageTitle(state.activeTab === 'tools-home' ? 'Tools' : `Tools · ${label}`);
  } else {
    const label = BUILDER_TITLES[state.activeTab] ?? 'Fonoran';
    document.title = pageTitle(state.activeTab === 'home' ? 'Fonoran' : `Fonoran · ${label}`);
  }
}

function syncBootAttributes() {
  const html = document.documentElement;
  html.setAttribute('data-fonora-nav', state.context);
  html.setAttribute('data-fonora-tools-nav', shouldHideToolsPlatformTab() ? 'hidden' : 'visible');
  if (state.context === 'language') {
    html.setAttribute('data-fonora-tab', state.activeTab);
    html.setAttribute('data-fonora-page', state.activeTab);
    html.removeAttribute('data-learn-track');
    return;
  }
  html.setAttribute('data-fonora-tab', state.activeTab);
  html.removeAttribute('data-fonora-page');
  if (state.context === 'learn') {
    html.setAttribute('data-learn-track', learnTrackForTab(state.activeTab));
  } else {
    html.removeAttribute('data-learn-track');
  }
}

function wireThemeToggle(authSlot) {
  authSlot.querySelector('#fonora-theme-toggle')?.addEventListener('click', () => {
    cycleTheme();
    authSlot.innerHTML = renderGlobalAuthTools();
    wireThemeToggle(authSlot);
  });
}

function patchAuthSlot(root) {
  const authSlot = root.querySelector('[data-nav-auth]');
  if (!authSlot) return;
  authSlot.innerHTML = renderGlobalAuthTools();
  wireThemeToggle(authSlot);
}

function patchStaticNav(root) {
  root.className = `app-header app-header--${state.context}`;

  root.querySelectorAll('[data-nav-tab]').forEach((el) => {
    const hideTools = el.dataset.navTab === 'tools' && shouldHideToolsPlatformTab();
    if (hideTools) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.classList.remove('platform-tab--active');
      el.removeAttribute('aria-current');
      return;
    }
    if (el.dataset.navTab === 'tools') {
      el.hidden = false;
      el.removeAttribute('aria-hidden');
    }
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

  root.querySelectorAll('[data-learn-tab].tab-btn').forEach((el) => {
    const active = el.dataset.learnTab === state.activeTab;
    el.classList.toggle('tab-btn--active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  patchAuthSlot(root);
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
        ? renderBuilderRow2(state.activeTab)
        : state.context === 'script'
          ? renderScriptRow2(state.activeTab)
          : state.context === 'learn'
            ? renderLearnRow2(state.activeTab)
            : state.context === 'tools'
              ? renderToolsRow2(state.activeTab)
              : state.context === 'platform'
                ? renderPlatformRow2(state.activeTab)
                : '';

    root.className = `app-header ${contextClass}`;
    root.innerHTML = `${renderRow1(state.context)}${row2}`;
    patchAuthSlot(root);
  }

  updateDocumentTitle();
  syncBootAttributes();
  bindNavListeners();
}

const ALL_DROPDOWN_IDS = [];

function closeNavDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const menu = document.getElementById(`${dropdownId}-menu`);
  const trigger = document.getElementById(`${dropdownId}-trigger`);
  if (!dropdown || !menu || !trigger) return;
  dropdown.classList.remove('nav-dropdown--open');
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function closeAllNavDropdowns() {
  ALL_DROPDOWN_IDS.forEach((id) => closeNavDropdown(id));
}

function openNavDropdown(dropdownId) {
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

/** @type {{ onTab?: (tab: string) => void, onPlatformTab?: (tab: string) => void, onPage?: (page: string) => void, onSignOut?: () => void }} */
let navSelectHandlers = {};

/**
 * Register platform/script tab handlers before initUniversalNav().
 * @param {{ onTab?: (tab: string) => void, onPlatformTab?: (tab: string) => void, onPage?: (page: string) => void, onSignOut?: () => void }} handlers
 */
export function setNavSelectHandlers(handlers = {}) {
  navSelectHandlers = { ...navSelectHandlers, ...handlers };
}

function dispatchNavEvent(root, type, detail) {
  root.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
}

function handleScriptTab(root, tab) {
  closeAllNavDropdowns();
  if (navSelectHandlers.onTab) {
    navSelectHandlers.onTab(tab);
    return;
  }
  if (typeof window.showTab === 'function') {
    if (tab === 'docs' && typeof window.openDocViewer === 'function') {
      window.openDocViewer('docs/platform-overview.md');
    } else {
      window.showTab(tab);
    }
    return;
  }
  dispatchNavEvent(root, 'universal-nav:tab', { tab });
}

function handlePlatformTab(root, tab) {
  if (navSelectHandlers.onPlatformTab) {
    navSelectHandlers.onPlatformTab(tab);
    return;
  }
  if (typeof window.showTab === 'function') {
    if (tab === 'docs' && typeof window.openDocViewer === 'function') {
      window.openDocViewer('docs/platform-overview.md');
    } else {
      window.showTab(tab);
    }
    return;
  }
  dispatchNavEvent(root, 'universal-nav:platform-tab', { tab });
}

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
        handleScriptTab(root, tab);
      },
      { signal },
    );
  });

  root.querySelectorAll('[data-platform-tab]').forEach((el) => {
    if (el.tagName === 'A') return;
    el.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        const tab = el.dataset.platformTab;
        if (!tab) return;
        handlePlatformTab(root, tab);
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
        closeAllNavDropdowns();
        if (navSelectHandlers.onPage) {
          navSelectHandlers.onPage(page);
          return;
        }
        dispatchNavEvent(root, 'universal-nav:page', { page });
      },
      { signal },
    );
  });

  root.querySelectorAll('[data-learn-tab]').forEach((el) => {
    el.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        const tab = el.dataset.learnTab;
        if (!tab) return;
        handleScriptTab(root, tab);
      },
      { signal },
    );
  });

  const signOut = document.getElementById('fonoran-sign-out');
  signOut?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      if (navSelectHandlers.onSignOut) {
        navSelectHandlers.onSignOut();
        return;
      }
      dispatchNavEvent(root, 'universal-nav:sign-out', {});
    },
    { signal },
  );

  ALL_DROPDOWN_IDS.forEach((dropdownId) => {
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
    ALL_DROPDOWN_IDS.forEach((id) => {
      const dropdown = document.getElementById(id);
      if (dropdown && !dropdown.contains(el)) closeNavDropdown(id);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllNavDropdowns();
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
  const normalizedPath = window.location.pathname.replace(/\/$/, '');
  state.context =
    options.context ??
    (window.location.pathname.includes('/language')
      ? 'language'
      : normalizedPath === '/learn'
        ? 'learn'
        : normalizedPath === '/tools'
          ? 'tools'
          : normalizedPath === '/research' || normalizedPath.startsWith('/research/')
            ? 'platform'
            : normalizedPath === '/script'
              ? 'script'
              : !window.location.hash && !isDocsRoute()
                ? 'platform'
                : 'script');
  state.activeTab =
    options.activeTab ??
    (state.context === 'platform'
      ? 'platform'
      : state.context === 'learn'
        ? 'writing'
        : state.context === 'tools'
          ? 'tools-home'
          : 'home');
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
 * @param {{ required?: boolean, configured?: boolean, toolsGated?: boolean, learnToolsGated?: boolean, authenticated: boolean, isAdmin?: boolean, email?: string | null, loginUrl?: string }} auth
 */
export function setFonoranAuth(auth) {
  fonoranAuthState = {
    required: Boolean(auth.required),
    configured: Boolean(auth.configured),
    toolsGated: Boolean(auth.toolsGated ?? auth.learnToolsGated),
    authenticated: Boolean(auth.authenticated),
    isAdmin: Boolean(auth.isAdmin),
    email: auth.email ?? null,
    loginUrl: auth.loginUrl ?? '/auth/google?returnTo=/language',
  };
  const root = document.getElementById(state.mountId);
  if (root?.dataset.navShell === 'static') {
    patchStaticNav(root);
    bindNavListeners();
  } else {
    render();
  }
}

export { closeNavDropdown, closeAllNavDropdowns };
