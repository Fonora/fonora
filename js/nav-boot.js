/**
 * Synchronous boot flags (head), drives first-paint nav + panel CSS before modules load.
 */
(function () {
  const SCRIPT_TABS = new Set([
    'home',
    'translator',
    'grid',
    'alphabet',
    'breakdown',
    'samples',
    'keyboard',
    'spelling-practice',
    'reverse',
    'quiz',
    'encoder-testing',
    'pronunciation-validation',
    'symbols',
    'open-problems',
    'docs',
  ]);

  const FONORAN_PAGES = new Set([
    'home',
    'root-review',
    'concepts',
    'translator',
    'roots',
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

  if (path === '/script' || path.startsWith('/script/')) {
    const tab = hash === 'reader' ? 'translator' : hash && SCRIPT_TABS.has(hash) ? hash : 'home';
    html.setAttribute('data-fonora-nav', 'script');
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

  if (hash === 'open-problems') {
    html.setAttribute('data-fonora-nav', 'platform');
    html.setAttribute('data-fonora-tab', 'open-problems');
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
