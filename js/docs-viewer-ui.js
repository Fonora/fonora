import { escapeHtml, errorMessage } from './utils.js';
import {
  DEFAULT_DOC_PATH,
  TOOLS_DOCS_DEFAULT,
  getDocCatalog,
  getNavigableDocCatalog,
  DOC_LAYER_ORDER,
  docViewerHrefForContext,
  githubDocUrl,
  isDocsRoute,
  isToolsPath,
  openDocViewer,
  parseDocFromLocation,
  splitDocRef,
} from './doc-urls.js';
import {
  extractMarkdownLead,
  extractMarkdownTitle,
  normalizeGrammarSource,
  renderMarkdown,
  stripMarkdownLead,
} from './markdown-render.js';
import { renderMermaidIn } from './mermaid-render.js';
import {
  ensurePageChromeObserver,
  scrollPageToTop,
  syncPageChromeOffset,
  scrollToPageAnchor,
  setupContentAnchorHandlers,
} from './markdown-doc-shell.js';

const GRAMMAR_DOC_PATHS = new Set([
  'docs/fonoran-grammar.md',
  'docs/fonoran-interpretive-translator.md',
]);

let currentPath = null;
let loadToken = 0;

function isGrammarDoc(path) {
  return GRAMMAR_DOC_PATHS.has(path);
}

function prepareMarkdown(markdown, path) {
  if (path === 'docs/fonoran-grammar.md') {
    return normalizeGrammarSource(markdown);
  }
  return markdown;
}

function scrollToDocAnchor(anchor) {
  scrollToPageAnchor(document.getElementById(anchor));
}

function updateDocAnchorInUrl(path, anchor) {
  const href = anchor ? docViewerHrefForContext(`${path}#${anchor}`) : docViewerHrefForContext(path);
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
      <section class="page-doc-nav-group${layer.id === 'archive' ? ' page-doc-nav-group--archive' : ''}">
        <h4 class="page-doc-nav-group-title">${escapeHtml(layer.label)}</h4>
        <ul class="page-doc-nav-list">
          ${entries
            .map(
              (entry) => `
            <li>
              <a
                href="${escapeHtml(docViewerHrefForContext(entry.path))}"
                class="page-doc-nav-link${entry.path === activePath ? ' page-doc-nav-link--active' : ''}"
                data-doc-path="${escapeHtml(entry.path)}"
                ${entry.path === activePath ? ' aria-current="page"' : ''}
              >${escapeHtml(entry.label)}</a>
            </li>`,
            )
            .join('')}
        </ul>
      </section>`;
  }).join('');

  sidebar.innerHTML = `
    <div class="page-doc-sidebar-panel">
      <div class="page-doc-sidebar-head">
        <h3 class="page-doc-sidebar-title">Docs</h3>
        <button type="button" class="page-doc-sidebar-close" id="docs-viewer-sidebar-close" aria-label="Close docs list">×</button>
      </div>
      <nav class="page-doc-nav" aria-label="Documentation">
        ${sections}
      </nav>
    </div>
  `;
}

function setSidebarActive(activePath) {
  const sidebar = document.getElementById('docs-viewer-sidebar');
  if (!sidebar) return;
  sidebar.querySelectorAll('.page-doc-nav-link[data-doc-path]').forEach((link) => {
    const isActive = link.getAttribute('data-doc-path') === activePath;
    link.classList.toggle('page-doc-nav-link--active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
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
    <div class="page-doc-pager-inner">
      ${
        prev
          ? `<a href="${escapeHtml(docViewerHrefForContext(prev.path))}" class="page-doc-pager-link page-doc-pager-link--prev" data-doc-path="${escapeHtml(prev.path)}"><span class="page-doc-pager-label">Previous</span><span class="page-doc-pager-title">${escapeHtml(prev.label)}</span></a>`
          : '<span class="page-doc-pager-spacer" aria-hidden="true"></span>'
      }
      ${
        next
          ? `<a href="${escapeHtml(docViewerHrefForContext(next.path))}" class="page-doc-pager-link page-doc-pager-link--next" data-doc-path="${escapeHtml(next.path)}"><span class="page-doc-pager-label">Next</span><span class="page-doc-pager-title">${escapeHtml(next.label)}</span></a>`
          : '<span class="page-doc-pager-spacer" aria-hidden="true"></span>'
      }
    </div>
  `;
}

function setSidebarOpen(open) {
  const layout = document.querySelector('#tab-docs .page-doc-layout');
  if (!layout) return;
  layout.classList.toggle('page-doc-layout--sidebar-open', open);
}

function updateViewerChrome({ title, lead, path }) {
  const titleEl = document.getElementById('docs-viewer-title');
  const leadEl = document.getElementById('docs-viewer-lead');
  const proseEl = document.getElementById('docs-viewer-prose');
  const githubEl = document.getElementById('docs-viewer-github');

  if (titleEl) titleEl.textContent = title;
  if (leadEl) leadEl.textContent = lead;
  if (proseEl) proseEl.hidden = !lead;
  if (githubEl) {
    githubEl.href = githubDocUrl(path);
    githubEl.hidden = false;
  }
  syncPageChromeOffset(document.getElementById('docs-viewer-toolbar-root'));
}

function setViewerLoading(loading) {
  document.getElementById('docs-viewer-toolbar-root')?.classList.toggle('page-toolbar-shell--loading', loading);
  document.getElementById('docs-viewer-content')?.classList.toggle('page-doc-content--loading', loading);
}

function hasRenderedDocContent(contentEl) {
  return Boolean(contentEl?.querySelector('h2, h3, .mermaid, pre, table, ul, ol'));
}

function showViewerError(path, error) {
  const contentEl = document.getElementById('docs-viewer-content');
  if (contentEl) {
    contentEl.innerHTML = `<p class="page-doc-error">${escapeHtml(error)}</p>`;
    contentEl.classList.remove('page-doc-content--loading');
    contentEl.removeAttribute('aria-busy');
  }
  renderDocPager(path);
  updateViewerChrome({
    title: 'Error',
    lead: '',
    path,
  });
  setSidebarActive(path);
}

export async function loadDocViewer(repoPath) {
  const { path, anchor: refAnchor } = splitDocRef(repoPath);
  const anchor = refAnchor || '';
  const token = ++loadToken;

  const contentEl = document.getElementById('docs-viewer-content');
  if (!contentEl) return;

  const previousPath = currentPath;
  const switchingDoc = previousPath && previousPath !== path;
  currentPath = path;
  setSidebarOpen(false);
  setSidebarActive(path);

  const url = docViewerHrefForContext(anchor ? `${path}#${anchor}` : path);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== url) {
    history.replaceState(null, '', url);
  }

  if (!hasRenderedDocContent(contentEl)) {
    contentEl.innerHTML = '<p class="page-doc-loading">Loading…</p>';
  }
  contentEl.setAttribute('aria-busy', 'true');
  setViewerLoading(true);

  try {
    const res = await fetch(path.startsWith('/') ? path : `/${path}`);
    if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
    const markdown = prepareMarkdown(await res.text(), path);
    if (token !== loadToken) return;

    const title = extractMarkdownTitle(markdown);
    const lead = extractMarkdownLead(markdown);
    const bodyMarkdown = lead ? stripMarkdownLead(markdown) : markdown;
    contentEl.innerHTML = renderMarkdown(bodyMarkdown, {
      docPath: path,
      skipTitle: true,
      headingAnchors: true,
      grammar: isGrammarDoc(path),
    });
    if (token !== loadToken) return;

    await renderMermaidIn(contentEl);
    if (token !== loadToken) return;

    renderDocPager(path);
    updateViewerChrome({
      title,
      lead,
      path,
    });
    setViewerLoading(false);
    contentEl.removeAttribute('aria-busy');

    const onAnchorNavigate = (anchorId) => {
      scrollToDocAnchor(anchorId);
      updateDocAnchorInUrl(path, anchorId);
    };
    setupContentAnchorHandlers(contentEl, onAnchorNavigate);

    if (anchor) {
      requestAnimationFrame(() => {
        if (token !== loadToken) return;
        scrollToDocAnchor(anchor);
      });
    } else if (switchingDoc) {
      scrollPageToTop(document.getElementById('tab-docs'));
    }
  } catch (err) {
    if (token !== loadToken) return;
    setViewerLoading(false);
    showViewerError(path, errorMessage(err));
  }
}

export function onDocsTabActivated() {
  ensurePageChromeObserver(document.getElementById('docs-viewer-toolbar-root'));
  const parsed = parseDocFromLocation();
  if (parsed) {
    if (new URLSearchParams(window.location.search).has('path')) {
      history.replaceState(
        null,
        '',
        docViewerHrefForContext(parsed.anchor ? `${parsed.path}#${parsed.anchor}` : parsed.path),
      );
    }
    const ref = parsed.anchor ? `${parsed.path}#${parsed.anchor}` : parsed.path;
    if (ref !== `${currentPath}${parsed.anchor ? `#${parsed.anchor}` : ''}`) {
      loadDocViewer(ref).catch(() => {});
    }
    return;
  }
  if (!currentPath) {
    loadDocViewer(isToolsPath() ? TOOLS_DOCS_DEFAULT : DEFAULT_DOC_PATH).catch(() => {});
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
    const layout = document.querySelector('#tab-docs .page-doc-layout');
    const open = !layout?.classList.contains('page-doc-layout--sidebar-open');
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

  ensurePageChromeObserver(document.getElementById('docs-viewer-toolbar-root'));
  renderSidebar(null);
}
