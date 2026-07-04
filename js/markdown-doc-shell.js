import { escapeHtml } from './utils.js';

/** @type {ResizeObserver | null} */
let pageChromeObserver = null;
/** @type {IntersectionObserver | null} */
let tocScrollObserver = null;
/** @type {(() => void) | null} */
let tocScrollListener = null;
/** @type {Map<string, boolean>} */
let headingIntersectionStates = new Map();
let scrollSpyPaused = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let scrollSpyPauseTimer = null;

/** @typedef {'gold' | 'green' | 'red' | ''} TagTone */

/**
 * @param {{
 *   tag?: string,
 *   tagTone?: TagTone,
 *   title: string,
 *   lead?: string,
 *   actionHref?: string,
 *   actionLabel?: string,
 *   actionTarget?: string,
 *   titleId?: string,
 *   actionsHtml?: string,
 * }} options
 */
export function renderPageToolbar({
  tag = '',
  tagTone = '',
  title,
  lead = '',
  actionHref = '',
  actionLabel = '',
  actionTarget = '',
  titleId = '',
  actionsHtml = '',
}) {
  const action =
    actionHref && actionLabel
      ? `<a class="btn page-toolbar__action" href="${escapeHtml(actionHref)}"${
          actionTarget ? ` target="${escapeHtml(actionTarget)}" rel="noopener noreferrer"` : ''
        }>${escapeHtml(actionLabel)}</a>`
      : '';
  const leadHtml = lead ? `<p class="page-toolbar__lead">${escapeHtml(lead)}</p>` : '';
  const titleAttr = titleId ? ` id="${escapeHtml(titleId)}"` : '';
  const actions =
    actionsHtml || action
      ? `<div class="page-toolbar__actions">${actionsHtml}${action}</div>`
      : '';
  return `
    <header class="page-toolbar">
      <div class="page-toolbar__text">
        <h1 class="page-toolbar__title"${titleAttr}>${escapeHtml(title)}</h1>
        ${leadHtml}
      </div>
      ${actions}
    </header>`;
}

/**
 * @param {string | string[]} prose
 */
export function renderHomeProse(prose) {
  const parts = (Array.isArray(prose) ? prose : [prose]).filter(Boolean);
  if (!parts.length) return '';
  return `<div class="home-prose">${parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</div>`;
}

/**
 * @param {Parameters<typeof renderPageToolbar>[0] & { shellId?: string, compact?: boolean, sticky?: boolean, prose?: string | string[] }} options
 */
export function renderPageToolbarShell({ shellId = '', compact = false, sticky = true, prose = '', ...toolbar }) {
  const idAttr = shellId ? ` id="${escapeHtml(shellId)}"` : '';
  const compactClass = compact ? ' page-toolbar-shell--compact' : '';
  const stickyClass = sticky ? '' : ' page-toolbar-shell--static';
  return `<div class="page-toolbar-shell${compactClass}${stickyClass}"${idAttr}>${renderPageToolbar(toolbar)}</div>${renderHomeProse(prose)}`;
}

/**
 * @param {HTMLElement | null | undefined} shellEl
 */
export function syncPageChromeOffset(shellEl) {
  const shell =
    shellEl ||
    document.querySelector('.page-toolbar-shell:not([hidden])') ||
    document.querySelector('.page-toolbar-shell');
  if (!shell) return;
  document.documentElement.style.setProperty('--page-chrome-offset', `${shell.offsetHeight}px`);
}

/**
 * @param {Element | null | undefined} rootEl
 */
export function ensurePageChromeObserver(rootEl) {
  const shell = rootEl?.querySelector?.('.page-toolbar-shell') || rootEl;
  if (!shell || !(shell instanceof Element)) return;

  syncPageChromeOffset(shell);
  if (pageChromeObserver) return;

  pageChromeObserver = new ResizeObserver(() => syncPageChromeOffset(shell));
  pageChromeObserver.observe(shell);
}

/**
 * @param {Array<{ level: number, title: string, id: string }>} headings
 * @param {{ linkClass?: string }} [options]
 */
export function renderDocTocHtml(headings, { linkClass = 'page-doc-toc-link' } = {}) {
  if (!headings.length) return '';
  return `
    <div class="page-doc-toc-panel">
      <h3 class="page-doc-toc-title">On this page</h3>
      <nav aria-label="On this page">
        <ul class="page-doc-toc-list">
          ${headings
            .map(
              (heading) => `
            <li class="page-doc-toc-item page-doc-toc-item--h${heading.level}">
              <a
                href="#${escapeHtml(heading.id)}"
                class="${linkClass}"
                data-doc-anchor="${escapeHtml(heading.id)}"
              >${escapeHtml(heading.title)}</a>
            </li>`,
            )
            .join('')}
        </ul>
      </nav>
    </div>`;
}

/**
 * @param {HTMLElement | null} tocEl
 * @param {Array<{ level: number, title: string, id: string }>} headings
 */
export function mountDocToc(tocEl, headings) {
  if (!tocEl) return;
  if (!headings.length) {
    tocEl.hidden = true;
    tocEl.innerHTML = '';
    return;
  }
  tocEl.hidden = false;
  tocEl.innerHTML = renderDocTocHtml(headings);
}

function getHeaderOffset() {
  return (
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-offset')) ||
    112
  );
}

function getChromeOffset() {
  return (
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-chrome-offset')) || 72
  );
}

/**
 * @param {HTMLElement[]} headings
 */
function findActiveHeadingByScroll(headings) {
  const scrollPos = window.scrollY + getHeaderOffset() + getChromeOffset() + 16;
  let active = headings[0]?.id;
  for (const heading of headings) {
    if (heading.offsetTop <= scrollPos) active = heading.id;
    else break;
  }
  return active;
}

/**
 * @param {string | undefined} activeId
 * @param {string} linkSelector
 */
function setActiveTocLink(activeId, linkSelector) {
  if (!activeId) return;
  document.querySelectorAll(linkSelector).forEach((link) => {
    link.classList.toggle('page-doc-toc-link--active', link.getAttribute('data-doc-anchor') === activeId);
  });
}

export function disconnectTocScrollSpy() {
  if (tocScrollObserver) {
    tocScrollObserver.disconnect();
    tocScrollObserver = null;
  }
  if (tocScrollListener) {
    window.removeEventListener('scroll', tocScrollListener);
    tocScrollListener = null;
  }
  headingIntersectionStates = new Map();
  scrollSpyPaused = false;
  if (scrollSpyPauseTimer) {
    clearTimeout(scrollSpyPauseTimer);
    scrollSpyPauseTimer = null;
  }
}

/** @param {number} [durationMs] */
export function pauseTocScrollSpy(durationMs = 900) {
  scrollSpyPaused = true;
  if (scrollSpyPauseTimer) clearTimeout(scrollSpyPauseTimer);
  scrollSpyPauseTimer = setTimeout(() => {
    scrollSpyPaused = false;
    scrollSpyPauseTimer = null;
  }, durationMs);
}

/**
 * @param {HTMLElement} contentEl
 * @param {{ linkSelector?: string, rootMargin?: string }} [options]
 */
export function setupTocScrollSpy(contentEl, options = {}) {
  disconnectTocScrollSpy();

  const linkSelector = options.linkSelector || '.page-doc-toc-link';
  const tocLinks = document.querySelectorAll(linkSelector);
  if (!tocLinks.length) return;

  const headings = [...contentEl.querySelectorAll('h2[id], h3[id]')];
  if (!headings.length) return;

  let scrollRaf = 0;
  const updateActive = () => {
    if (scrollSpyPaused) return;
    const visible = headings
      .filter((heading) => headingIntersectionStates.get(heading.id))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const activeId = visible[0]?.id || findActiveHeadingByScroll(headings);
    setActiveTocLink(activeId, linkSelector);
  };

  tocScrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        headingIntersectionStates.set(entry.target.id, entry.isIntersecting);
      });
      updateActive();
    },
    { rootMargin: options.rootMargin || '-10% 0px -55% 0px', threshold: 0 },
  );

  headings.forEach((heading) => tocScrollObserver?.observe(heading));

  tocScrollListener = () => {
    if (scrollSpyPaused) return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateActive();
    });
  };
  window.addEventListener('scroll', tocScrollListener, { passive: true });
  updateActive();
}

/**
 * @param {(anchor: string) => void} onNavigate
 * @param {{ linkSelector?: string, collapseMobile?: boolean }} [options]
 */
export function setupTocClickHandlers(onNavigate, options = {}) {
  const linkSelector = options.linkSelector || '.page-doc-toc-link';
  document.querySelectorAll(linkSelector).forEach((link) => {
    link.addEventListener('click', (event) => {
      const anchor = link.getAttribute('data-doc-anchor');
      if (!anchor) return;
      event.preventDefault();
      pauseTocScrollSpy();
      onNavigate(anchor);
      setActiveTocLink(anchor, linkSelector);
      if (options.collapseMobile !== false) {
        const panel = link.closest('.page-doc-toc-panel--mobile');
        if (panel && window.matchMedia('(max-width: 1099px)').matches) {
          panel.classList.remove('page-doc-toc-panel--open');
        }
      }
    });
  });
}

/**
 * @param {HTMLElement} contentEl
 * @param {(anchor: string) => void} onNavigate
 */
export function setupContentAnchorHandlers(contentEl, onNavigate) {
  contentEl.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const anchor = link.getAttribute('href')?.slice(1);
      if (!anchor) return;
      const target = document.getElementById(anchor);
      if (!target) return;
      event.preventDefault();
      pauseTocScrollSpy();
      onNavigate(anchor);
    });
  });
}

/**
 * @param {HTMLElement | null} target
 */
export function scrollToPageAnchor(target) {
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * @param {HTMLElement | null | undefined} pageEl
 */
export function scrollPageToTop(pageEl) {
  if (!pageEl) return;
  const top = pageEl.getBoundingClientRect().top + window.scrollY - getHeaderOffset() - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}
