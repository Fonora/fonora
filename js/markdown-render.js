import { escapeHtml } from './utils.js';
import { resolveMarkdownHref, repoPathFromViewerHref } from './doc-urls.js';

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inlineFormat(text, docPath) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const resolved = resolveMarkdownHref(href, docPath);
    const docPathAttr = repoPathFromViewerHref(resolved);
    const isDoc = Boolean(docPathAttr) || (href.endsWith('.md') && !/^https?:\/\//i.test(href));
    if (isDoc && !/^https?:\/\//i.test(resolved)) {
      return `<a href="${escapeHtml(resolved)}" class="doc-internal-link" data-doc-path="${escapeHtml(docPathAttr ?? href)}">${label}</a>`;
    }
    const external = /^https?:\/\//i.test(resolved);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(resolved)}"${attrs}>${label}</a>`;
  });
  return out;
}

function isTableSeparator(line) {
  return /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(line.trim());
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

/**
 * @param {string} source
 * @param {{ docPath?: string }} [options]
 */
export function renderMarkdown(source, options = {}) {
  const docPath = options.docPath ?? 'docs/README.md';
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const fence = line.trim();
      const lang = fence.slice(3).trim();
      i += 1;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const codeClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      blocks.push(`<pre><code${codeClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = parseTableRow(line);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        bodyRows.push(parseTableRow(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${headerCells.map((c) => `<th>${inlineFormat(c, docPath)}</th>`).join('')}</tr></thead>`;
      const tbody = bodyRows.length
        ? `<tbody>${bodyRows
            .map((row) => `<tr>${row.map((c) => `<td>${inlineFormat(c, docPath)}</td>`).join('')}</tr>`)
            .join('')}</tbody>`
        : '';
      blocks.push(`<div class="table-wrap"><table class="data-table doc-table">${thead}${tbody}</table></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const plainTitle = heading[2].replace(/\*\*/g, '').replace(/`/g, '');
      const id = slugifyHeading(plainTitle);
      const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
      blocks.push(`<h${level}${idAttr}>${inlineFormat(heading[2], docPath)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(`<blockquote><p>${inlineFormat(quoteLines.join(' '), docPath)}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${inlineFormat(item, docPath)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${inlineFormat(item, docPath)}</li>`).join('')}</ol>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      if (lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${inlineFormat(paraLines.join(' '), docPath)}</p>`);
  }

  return blocks.join('\n');
}

/**
 * @param {string} markdown
 */
export function extractMarkdownTitle(markdown) {
  const match = String(markdown).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Documentation';
}
