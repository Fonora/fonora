/**
 * Shared site footer rendered into #site-footer-root on each app shell.
 */

const FOOTER_LINKS = [
  { href: '/', label: 'About' },
  { href: '/research', label: 'Research' },
  { href: '/script', label: 'Script' },
  { href: '/language', label: 'Language' },
  { href: '/learn', label: 'Learn' },
  { href: '/tools', label: 'Tools' },
  { href: '/#docs', label: 'Docs' },
  { href: 'https://github.com/Fonora/fonora', label: 'GitHub', external: true },
];

function renderFooterLinks() {
  return FOOTER_LINKS.map((link, index) => {
    const sep =
      index > 0 ? '<span class="site-footer-sep" aria-hidden="true">·</span>' : '';
    const attrs = link.external
      ? ' target="_blank" rel="noopener noreferrer"'
      : '';
    return `${sep}<a href="${link.href}"${attrs}>${link.label}</a>`;
  }).join('');
}

export function renderSiteFooterHtml() {
  return `
  <footer class="site-footer">
    <div class="site-footer-inner">
      <p class="site-footer-copy">
        © 2026 <a href="https://jamescalhoun.co" target="_blank" rel="noopener noreferrer">James Calhoun</a>.
        Released under the <a href="https://github.com/Fonora/fonora/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>.
      </p>
      <p class="site-footer-links">
        ${renderFooterLinks()}
      </p>
    </div>
  </footer>`;
}

/** Mount unified footer, replacing #site-footer-root if present. */
export function mountSiteFooter() {
  const root = document.getElementById('site-footer-root');
  if (!root) return;
  root.outerHTML = renderSiteFooterHtml();
}
