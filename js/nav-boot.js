/**
 * Synchronous boot flags (head), drives first-paint nav + panel CSS before modules load.
 */
(function () {
  const SCRIPT_TABS = new Set([
    'home',
    'translator',
    'grid',
    'alphabet',
    'samples',
    'spelling-practice',
    'quiz',
    'encoder-testing',
    'pronunciation-validation',
    'docs',
  ]);

  const learnRouting = window.FONORA_LEARN_ROUTING;
  if (!learnRouting) {
    throw new Error('learn-routing-data.js must load before nav-boot.js');
  }
  const LEARN_TABS = new Set(learnRouting.LEARN_SKILL_IDS);
  const LEGACY_LEARN_HASH = learnRouting.LEGACY_LEARN_HASH;
  const LEARN_DEFAULT_TAB = learnRouting.LEARN_DEFAULT_TAB;

  const TOOLS_TABS = new Set([
    'tools-home',
    'encoder-testing',
    'pronunciation-validation',
    'research-notes',
    'samples',
  ]);

  const FONORAN_PAGES = new Set([
    'home',
    'root-review',
    'concepts',
    'translator',
    'create',
    'review',
    'dictionary',
    'grammar',
    'health',
    'gaps',
    'progress',
    'advanced',
  ]);

  const html = document.documentElement;
  html.setAttribute('data-fonora-tools-nav', 'hidden');
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace(/^#/, '');
  const hasDocPath = new URLSearchParams(window.location.search).has('path');
  const isDocsRoute = path === '/docs' || path.startsWith('/docs/') || hasDocPath || hash === 'docs';

  if (path === '/language' || path.startsWith('/language/')) {
    const page = hash && FONORAN_PAGES.has(hash) ? hash : 'home';
    const tab = page === 'root-review' ? 'review' : page;
    html.setAttribute('data-fonora-nav', 'language');
    html.setAttribute('data-fonora-tab', tab);
    html.setAttribute('data-fonora-page', page);
    return;
  }

  if (path === '/research' || path.startsWith('/research/')) {
    let tab = 'research';
    if (path === '/research/timeline') tab = 'timeline';
    else if (hash === 'open') tab = 'open';
    html.setAttribute('data-fonora-nav', 'platform');
    html.setAttribute('data-fonora-tab', tab);
    return;
  }

  if (path === '/script' || path.startsWith('/script/')) {
    const tab = hash === 'reader' ? 'translator' : hash && SCRIPT_TABS.has(hash) ? hash : 'home';
    html.setAttribute('data-fonora-nav', 'script');
    html.setAttribute('data-fonora-tab', tab);
    return;
  }

  if (path === '/learn' || path.startsWith('/learn/')) {
    const LEARN_TO_TOOLS = learnRouting.LEARN_TO_TOOLS_REDIRECT;
    if (hash && LEARN_TO_TOOLS[hash]) {
      window.location.replace(`/tools#${LEARN_TO_TOOLS[hash]}${window.location.search}`);
      return;
    }
    let tab = LEARN_DEFAULT_TAB;
    if (hash && hash === LEARN_DEFAULT_TAB) tab = LEARN_DEFAULT_TAB;
    else if (hash && LEARN_TABS.has(hash)) tab = hash;
    else if (hash && LEGACY_LEARN_HASH[hash] && !LEARN_TO_TOOLS[hash]) tab = LEGACY_LEARN_HASH[hash];
    html.setAttribute('data-fonora-nav', 'learn');
    html.setAttribute('data-fonora-tab', tab);
    if (learnRouting.learnTrackForTab) {
      html.setAttribute('data-learn-track', learnRouting.learnTrackForTab(tab));
    }
    return;
  }

  if (path === '/tools' || path.startsWith('/tools/')) {
    if (hash && learnRouting.LEARN_REDIRECT_HASHES.includes(hash)) {
      let tab = LEARN_DEFAULT_TAB;
      if (hash === LEARN_DEFAULT_TAB) tab = LEARN_DEFAULT_TAB;
      else if (LEARN_TABS.has(hash)) tab = hash;
      else if (LEGACY_LEARN_HASH[hash]) tab = LEGACY_LEARN_HASH[hash];
      const nextHash = tab === LEARN_DEFAULT_TAB ? '' : `#${tab}`;
      window.location.replace(`/learn${nextHash}${window.location.search}`);
      return;
    }
    const tab = hash && TOOLS_TABS.has(hash) ? hash : 'tools-home';
    html.setAttribute('data-fonora-nav', 'tools');
    html.setAttribute('data-fonora-tab', tab);
    return;
  }

  if (hash === 'about') {
    html.setAttribute('data-fonora-nav', 'platform');
    html.setAttribute('data-fonora-tab', 'platform');
    return;
  }

  if (isDocsRoute) {
    html.setAttribute('data-fonora-nav', 'platform');
    html.setAttribute('data-fonora-tab', 'docs');
    return;
  }

  if (hash === 'home' || (hash && SCRIPT_TABS.has(hash))) {
    html.setAttribute('data-fonora-nav', 'script');
    html.setAttribute('data-fonora-tab', hash === 'home' ? 'home' : hash);
    return;
  }

  html.setAttribute('data-fonora-nav', 'platform');
  html.setAttribute('data-fonora-tab', 'platform');
})();
