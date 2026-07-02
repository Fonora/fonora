import { escapeHtml, errorMessage } from './utils.js';
import {
  DEFAULT_DOC_PATH,
  getDocCatalog,
  getNavigableDocCatalog,
  DOC_LAYER_ORDER,
  docViewerHref,
  githubDocUrl,
  isDocsRoute,
  openDocViewer,
  parseDocFromLocation,
  splitDocRef,
} from './doc-urls.js';
import {
  extractMarkdownHeadings,
  extractMarkdownTitle,
  normalizeGrammarSource,
  renderMarkdown,
} from './markdown-render.js';
import { renderMermaidIn } from './mermaid-render.js';

const GRAMMAR_DOC_PATHS = new Set([
  'docs/fonoran-grammar.md',
  'docs/fonoran-interpretive-translator.md',
]);

let currentPath = null;
let loadToken = 0;
let docViewerToolbarObserver = null;
/** @type {IntersectionObserver | null} */
let tocScrollObserver = null;

function isGrammarDoc(path) {
  return GRAMMAR_DOC_PATHS.has(path);
}

function prepareMarkdown(markdown, path) {
  if (path === 'docs/fonoran-grammar.md') {
    return normalizeGrammarSource(markdown);
  }
  return markdown;
}

function syncDocViewerToolbarOffset() {
  const toolbar = document.querySelector('#tab-docs .doc-viewer-toolbar');
  if (!toolbar) return;
  document.documentElement.style.setProperty('--doc-viewer-toolbar-offset', `${toolbar.offsetHeight}px`);
}

function ensureDocViewerToolbarObserver() {
  const toolbar = document.querySelector('#tab-docs .doc-viewer-toolbar');
  if (!toolbar) return;

  syncDocViewerToolbarOffset();
  if (docViewerToolbarObserver) return;

  docViewerToolbarObserver = new ResizeObserver(() => syncDocViewerToolbarOffset());
  docViewerToolbarObserver.observe(toolbar);
}

function scrollDocToTop() {
  const page = document.getElementById('tab-docs');
  if (!page) return;
  const headerOffset =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-offset')) || 112;
  const top = page.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

function scrollToDocAnchor(anchor) {
  const target = document.getElementById(anchor);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateDocAnchorInUrl(path, anchor) {
  const href = anchor ? docViewerHref(`${path}#${anchor}`) : docViewerHref(path);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== href) {
    history.replaceState(null, '', href);
  }
}

function renderSidebar(activePath) {
  const sidebar = document.getElementById('docs-viewer-sidebar');
  if (!sidebar) return;

  const sections = DOC_LAYER_ORDER.map((layer) => {
    const entries = getDocCatalog().filter((e) => e.layer === layer.id);
    if (!entries.length) return '';
    return `
      <section class="doc-viewer-nav-group${layer.id === 'archive' ? ' doc-viewer-nav-group--archive' : ''}">
        <h4 class="doc-viewer-nav-group-title">${escapeHtml(layer.label)}</h4>
        <ul class="doc-viewer-nav-list">
          ${entries
            .map(
              (entry) => `
            <li>
              <a
                href="${escapeHtml(docViewerHref(entry.path))}"
                class="doc-viewer-nav-link${entry.path === activePath ? ' doc-viewer-nav-link--active' : ''}"
                data-doc-path="${escapeHtml(entry.path)}"
              >${escapeHtml(entry.label)}</a>
            </li>`,
            )
            .join('')}
        </ul>
      </section>`;
  }).join('');

  sidebar.innerHTML = `
    <div class="doc-viewer-sidebar-panel">
      <div class="doc-viewer-sidebar-head">
        <h3 class="doc-viewer-sidebar-title">Docs</h3>
        <button type="button" class="doc-viewer-sidebar-close" id="docs-viewer-sidebar-close" aria-label="Close docs list">×</button>
      </div>
      <nav class="doc-viewer-nav" aria-label="Documentation">
        ${sections}
      </nav>
    </div>
  `;
}

/**
 * @param {Array<{ level: number, title: string, id: string }>} headings
 */
function renderDocToc(headings) {
  const toc = document.getElementById('docs-viewer-toc');
  if (!toc) return;

  if (!headings.length) {
    toc.hidden = true;
    toc.innerHTML = '';
    return;
  }

  toc.hidden = false;
  toc.innerHTML = `
    <details class="doc-viewer-toc-panel" open>
      <summary class="doc-viewer-toc-title">On this page</summary>
      <nav aria-label="On this page">
        <ul class="doc-viewer-toc-list">
          ${headings
            .map(
              (heading) => `
            <li class="doc-viewer-toc-item doc-viewer-toc-item--h${heading.level}">
              <a
                href="#${escapeHtml(heading.id)}"
                class="doc-viewer-toc-link"
                data-doc-anchor="${escapeHtml(heading.id)}"
              >${escapeHtml(heading.title)}</a>
            </li>`,
            )
            .join('')}
        </ul>
      </nav>
    </details>
  `;
}

function renderDocPager(path) {
  const pager = document.getElementById('docs-viewer-pager');
  if (!pager) return;

  const catalog = getNavigableDocCatalog();
  const index = catalog.findIndex((entry) => entry.path === path);
  if (index < 0) {
    pager.hidden = true;
    pager.innerHTML = '';
    return;
  }

  const prev = catalog[index - 1];
  const next = catalog[index + 1];
  if (!prev && !next) {
    pager.hidden = true;
    pager.innerHTML = '';
    return;
  }

  pager.hidden = false;
  pager.innerHTML = `
    <div class="doc-viewer-pager-inner">
      ${
        prev
          ? `<a href="${escapeHtml(docViewerHref(prev.path))}" class="doc-viewer-pager-link doc-viewer-pager-link--prev" data-doc-path="${escapeHtml(prev.path)}"><span class="doc-viewer-pager-label">Previous</span><span class="doc-viewer-pager-title">${escapeHtml(prev.label)}</span></a>`
          : '<span class="doc-viewer-pager-spacer" aria-hidden="true"></span>'
      }
      ${
        next
          ? `<a href="${escapeHtml(docViewerHref(next.path))}" class="doc-viewer-pager-link doc-viewer-pager-link--next" data-doc-path="${escapeHtml(next.path)}"><span class="doc-viewer-pager-label">Next</span><span class="doc-viewer-pager-title">${escapeHtml(next.label)}</span></a>`
          : '<span class="doc-viewer-pager-spacer" aria-hidden="true"></span>'
      }
    </div>
  `;
}

function disconnectTocScrollSpy() {
  if (tocScrollObserver) {
    tocScrollObserver.disconnect();
    tocScrollObserver = null;
  }
}

function setupTocScrollSpy(contentEl) {
  disconnectTocScrollSpy();

  const tocLinks = document.querySelectorAll('.doc-viewer-toc-link');
  if (!tocLinks.length) return;

  const headings = [...contentEl.querySelectorAll('h2[id], h3[id]')];
  if (!headings.length) return;

  tocScrollObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
      const activeId = visible[0]?.target.id || headings[0]?.id;
      if (!activeId) return;
      tocLinks.forEach((link) => {
        link.classList.toggle('doc-viewer-toc-link--active', link.getAttribute('data-doc-anchor') === activeId);
      });
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
  );

  headings.forEach((heading) => tocScrollObserver?.observe(heading));
}

function setupContentLinkHandlers(contentEl, path) {
  contentEl.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const anchor = link.getAttribute('href')?.slice(1);
      if (!anchor) return;
      const target = document.getElementById(anchor);
      if (!target) return;
      event.preventDefault();
      scrollToDocAnchor(anchor);
      updateDocAnchorInUrl(path, anchor);
    });
  });
}

function setupTocClickHandlers(path) {
  document.querySelectorAll('.doc-viewer-toc-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      const anchor = link.getAttribute('data-doc-anchor');
      if (!anchor) return;
      event.preventDefault();
      scrollToDocAnchor(anchor);
      updateDocAnchorInUrl(path, anchor);
      const details = link.closest('details');
      if (details && window.matchMedia('(max-width: 900px)').matches) {
        details.open = false;
      }
    });
  });
}

function setSidebarOpen(open) {
  const layout = document.querySelector('.doc-viewer-layout');
  if (!layout) return;
  layout.classList.toggle('doc-viewer-layout--sidebar-open', open);
}

function setViewerState({ title, path, error = null }) {
  const titleEl = document.getElementById('docs-viewer-title');
  const githubEl = document.getElementById('docs-viewer-github');
  const pathEl = document.getElementById('docs-viewer-path');
  const contentEl = document.getElementById('docs-viewer-content');

  if (titleEl) titleEl.textContent = title;
  if (pathEl) pathEl.textContent = path;
  if (githubEl) {
    githubEl.href = githubDocUrl(path);
    githubEl.hidden = false;
  }
  if (contentEl && error) {
    contentEl.innerHTML = `<p class="doc-viewer-error">${escapeHtml(error)}</p>`;
    renderDocToc([]);
    renderDocPager(path);
  }
  renderSidebar(path);
  syncDocViewerToolbarOffset();
}

export async function loadDocViewer(repoPath) {
  const { path, anchor: refAnchor } = splitDocRef(repoPath);
  const anchor = refAnchor || '';
  const token = ++loadToken;

  const contentEl = document.getElementById('docs-viewer-content');
  if (!contentEl) return;

  currentPath = path;
  setSidebarOpen(false);
  disconnectTocScrollSpy();

  const url = docViewerHref(anchor ? `${path}#${anchor}` : path);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== url) {
    history.replaceState(null, '', url);
  }

  contentEl.innerHTML = '<p class="doc-viewer-loading">Loading…</p>';
  renderDocToc([]);
  renderDocPager(path);
  setViewerState({ title: 'Loading…', path });

  try {
    const res = await fetch(path.startsWith('/') ? path : `/${path}`);
    if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
    const markdown = prepareMarkdown(await res.text(), path);
    if (token !== loadToken) return;

    const title = extractMarkdownTitle(markdown);
    const headings = extractMarkdownHeadings(markdown, { minLevel: 2, maxLevel: 3 });
    contentEl.innerHTML = renderMarkdown(markdown, {
      docPath: path,
      skipTitle: true,
      headingAnchors: true,
      grammar: isGrammarDoc(path),
    });
    if (token !== loadToken) return;

    await renderMermaidIn(contentEl);
    if (token !== loadToken) return;

    renderDocToc(headings);
    renderDocPager(path);
    setViewerState({ title, path });
    setupContentLinkHandlers(contentEl, path);
    setupTocClickHandlers(path);
    setupTocScrollSpy(contentEl);

    if (anchor) {
      requestAnimationFrame(() => {
        if (token !== loadToken) return;
        scrollToDocAnchor(anchor);
      });
    } else {
      scrollDocToTop();
    }
  } catch (err) {
    if (token !== loadToken) return;
    setViewerState({ title: 'Error', path, error: errorMessage(err) });
  }
}

export function onDocsTabActivated() {
  ensureDocViewerToolbarObserver();
  const parsed = parseDocFromLocation();
  if (parsed) {
    if (new URLSearchParams(window.location.search).has('path')) {
      history.replaceState(
        null,
        '',
        docViewerHref(parsed.anchor ? `${parsed.path}#${parsed.anchor}` : parsed.path),
      );
    }
    const ref = parsed.anchor ? `${parsed.path}#${parsed.anchor}` : parsed.path;
    if (ref !== `${currentPath}${parsed.anchor ? `#${parsed.anchor}` : ''}`) {
      loadDocViewer(ref).catch(() => {});
    }
    return;
  }
  if (!currentPath) {
    loadDocViewer(DEFAULT_DOC_PATH).catch(() => {});
  }
}

function handleDocClick(event) {
  const link = event.target.closest('[data-doc-path]');
  if (!link) return;
  event.preventDefault();
  const path = link.getAttribute('data-doc-path');
  if (!path) return;
  openDocViewer(path);
}

function handleSidebarToggle(event) {
  const toggle = event.target.closest('#docs-viewer-sidebar-toggle');
  const close = event.target.closest('#docs-viewer-sidebar-close');
  const sidebar = event.target.closest('#docs-viewer-sidebar');
  if (toggle) {
    event.preventDefault();
    const layout = document.querySelector('.doc-viewer-layout');
    const open = !layout?.classList.contains('doc-viewer-layout--sidebar-open');
    setSidebarOpen(open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    return;
  }
  if (close) {
    event.preventDefault();
    setSidebarOpen(false);
    document.getElementById('docs-viewer-sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    return;
  }
  if (sidebar && event.target === sidebar) {
    setSidebarOpen(false);
    document.getElementById('docs-viewer-sidebar-toggle')?.setAttribute('aria-expanded', 'false');
  }
}

export function setupDocsViewer() {
  const page = document.getElementById('tab-docs');
  if (!page) return;

  page.addEventListener('click', handleDocClick);
  page.addEventListener('click', handleSidebarToggle);
  window.addEventListener('popstate', () => {
    if (isDocsRoute()) {
      onDocsTabActivated();
    }
  });

  ensureDocViewerToolbarObserver();
  renderSidebar(null);
}
