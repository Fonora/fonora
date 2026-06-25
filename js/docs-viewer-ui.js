import { escapeHtml } from './utils.js';
import {
  DEFAULT_DOC_PATH,
  DOC_CATALOG,
  DOC_LAYER_ORDER,
  docViewerHref,
  githubDocUrl,
  isDocsRoute,
  openDocViewer,
  parseDocFromLocation,
  splitDocRef,
} from './doc-urls.js';
import { extractMarkdownTitle, renderMarkdown } from './markdown-render.js';

let currentPath = null;

function renderSidebar(activePath) {
  const sidebar = document.getElementById('docs-viewer-sidebar');
  if (!sidebar) return;

  const sections = DOC_LAYER_ORDER.map((layer) => {
    const entries = DOC_CATALOG.filter((e) => e.layer === layer.id);
    if (!entries.length) return '';
    return `
      <section class="doc-viewer-nav-group">
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
    <h3 class="doc-viewer-sidebar-title">Docs</h3>
    <nav class="doc-viewer-nav" aria-label="Documentation">
      ${sections}
    </nav>
  `;
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
  }
  renderSidebar(path);
}

export async function loadDocViewer(repoPath) {
  const { path, anchor: refAnchor } = splitDocRef(repoPath);
  const anchor = refAnchor || '';

  const contentEl = document.getElementById('docs-viewer-content');
  if (!contentEl) return;

  currentPath = path;
  const url = docViewerHref(anchor ? `${path}#${anchor}` : path);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== url) {
    history.replaceState(null, '', url);
  }

  contentEl.innerHTML = '<p class="doc-viewer-loading">Loading…</p>';
  setViewerState({ title: 'Loading…', path });

  try {
    const res = await fetch(path.startsWith('/') ? path : `/${path}`);
    if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
    const markdown = await res.text();
    const title = extractMarkdownTitle(markdown);
    contentEl.innerHTML = renderMarkdown(markdown, { docPath: path });
    setViewerState({ title, path });
    if (anchor) {
      requestAnimationFrame(() => {
        const target = document.getElementById(anchor);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setViewerState({ title: 'Error', path, error: message });
  }
}

export function onDocsTabActivated() {
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
  loadDocViewer(path).catch(() => {});
}

export function setupDocsViewer() {
  const page = document.getElementById('tab-docs');
  if (!page) return;

  page.addEventListener('click', handleDocClick);
  window.addEventListener('popstate', () => {
    if (isDocsRoute()) {
      onDocsTabActivated();
    }
  });

  renderSidebar(null);

  if (isDocsRoute()) {
    onDocsTabActivated();
  }
}
