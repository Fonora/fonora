import { escapeHtml } from './utils.js';
import { resolveMarkdownHref, repoPathFromViewerHref } from './doc-urls.js';
import { buildMermaidPanZoomHtml } from './mermaid-pan-zoom.js';

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inlineFormat(text, docPath, options = {}) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
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
  if (options.grammar) {
    out = out.replace(/\[([^\]/\[]+)\](?!\()/g, '<span class="grammar-missing">$1</span>');
  }
  return out;
}

function renderGrammarTokenLine(line) {
  return line
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const missing = token.match(/^\[([^\]]+)\]$/);
      if (missing) return `<span class="grammar-missing">${escapeHtml(missing[1])}</span>`;
      return `<span class="grammar-token">${escapeHtml(token)}</span>`;
    })
    .join(' ');
}

function renderGrammarExampleBlock(source) {
  const parts = String(source).trim().split(/\n\s*↓\s*\n/);
  if (parts.length < 2) {
    return `<pre class="grammar-example grammar-example--raw">${escapeHtml(source)}</pre>`;
  }
  const english = parts[1].trim();
  const beforeParts = parts[0].trim().split(/\n\n+/);
  const fonoranLines = (beforeParts[0] || '').trim().split('\n').filter(Boolean);
  const glossBlock = (beforeParts[1] || '').trim();
  const glossLines = glossBlock ? glossBlock.split('\n').filter(Boolean) : [];
  const fonoranHtml = fonoranLines
    .map((line) => `<div class="grammar-example__row"><span class="grammar-example__fonoran">${renderGrammarTokenLine(line)}</span></div>`)
    .join('');
  const glossHtml = glossLines.length
    ? `<div class="grammar-example__gloss">${glossLines.map((line) => `<div class="grammar-example__gloss-line">${escapeHtml(line)}</div>`).join('')}</div>`
    : '';
  return `<div class="grammar-example">
    <div class="grammar-example__stack">${fonoranHtml}${glossHtml}</div>
    <div class="grammar-example__arrow" aria-hidden="true">↓</div>
    <div class="grammar-example__english">${escapeHtml(english)}</div>
  </div>`;
}

function renderGrammarPipelineBlock(source) {
  /** @type {Record<string, string[]>} */
  const sections = {};
  let current = null;
  for (const line of String(source).split('\n')) {
    const label = line.match(/^([A-Za-z]+):\s*$/);
    if (label) {
      current = label[1].toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current && line.trim()) sections[current].push(line.trim());
  }
  const stages = [];
  if (sections.english?.length) {
    stages.push(`<div class="grammar-pipeline__stage"><h4 class="grammar-pipeline__label">English</h4><p class="grammar-pipeline__english">${escapeHtml(sections.english.join(' '))}</p></div>`);
  }
  if (sections.semantic?.length) {
    stages.push(`<div class="grammar-pipeline__stage"><h4 class="grammar-pipeline__label">Semantic interpretation</h4><div class="grammar-pipeline__tokens">${sections.semantic.map((token) => `<span class="grammar-pipeline__token">${escapeHtml(token)}</span>`).join('')}</div></div>`);
  }
  if (sections.fonoran?.length) {
    const tokens = sections.fonoran
      .map((token) => {
        const missing = token.match(/^\[([^\]]+)\]$/);
        if (missing) return `<span class="grammar-missing">${escapeHtml(missing[1])}</span>`;
        return `<span class="grammar-token">${escapeHtml(token)}</span>`;
      })
      .join('');
    stages.push(`<div class="grammar-pipeline__stage"><h4 class="grammar-pipeline__label">Fonoran</h4><div class="grammar-pipeline__tokens grammar-pipeline__tokens--fonoran">${tokens}</div></div>`);
  }
  return `<div class="grammar-pipeline">${stages.join('')}</div>`;
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
 * @param {{ docPath?: string, skipTitle?: boolean }} [options]
 */
export function renderMarkdown(source, options = {}) {
  const docPath = options.docPath ?? 'docs/README.md';
  const formatInline = (text) => inlineFormat(text, docPath, options);
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let skippedTitle = false;

  while (i < lines.length) {
    const line = lines[i];

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push('<hr class="doc-hr">');
      i += 1;
      continue;
    }

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
      if (lang === 'mermaid') {
        blocks.push(buildMermaidPanZoomHtml(codeLines.join('\n'), { variant: 'diagram' }));
      } else if (options.grammar && lang === 'example') {
        blocks.push(renderGrammarExampleBlock(codeLines.join('\n')));
      } else if (options.grammar && lang === 'pipeline') {
        blocks.push(renderGrammarPipelineBlock(codeLines.join('\n')));
      } else {
        const codeClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        blocks.push(`<pre><code${codeClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      }
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
      const thead = `<thead><tr>${headerCells.map((c) => `<th>${formatInline(c)}</th>`).join('')}</tr></thead>`;
      const tbody = bodyRows.length
        ? `<tbody>${bodyRows
            .map((row) => `<tr>${row.map((c) => `<td>${formatInline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody>`
        : '';
      blocks.push(`<div class="table-wrap"><table class="data-table doc-table">${thead}${tbody}</table></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (options.skipTitle && level === 1 && !skippedTitle) {
        skippedTitle = true;
        i += 1;
        continue;
      }
      const plainTitle = heading[2].replace(/\*\*/g, '').replace(/`/g, '');
      const id = slugifyHeading(plainTitle);
      const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
      const anchor =
        options.headingAnchors && id
          ? `<a class="doc-heading__anchor" href="#${escapeHtml(id)}" aria-label="Link to this section">#</a>`
          : '';
      blocks.push(
        `<h${level}${idAttr} class="doc-heading doc-heading--h${level}">${anchor}${formatInline(heading[2])}</h${level}>`,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      /** @type {string[]} */
      const paragraphs = [];
      let current = [];
      for (const quoteLine of quoteLines) {
        if (!quoteLine.trim()) {
          if (current.length) paragraphs.push(current.join(' '));
          current = [];
          continue;
        }
        current.push(quoteLine);
      }
      if (current.length) paragraphs.push(current.join(' '));
      const inner = (paragraphs.length ? paragraphs : ['']).map((p) => `<p>${formatInline(p)}</p>`).join('');
      blocks.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ol>`);
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
    blocks.push(`<p>${formatInline(paraLines.join(' '))}</p>`);
  }

  return blocks.join('\n');
}

export function normalizeGrammarSource(source) {
  return String(source)
    .replace(/\r\n/g, '\n')
    .replace(/^(#{1,6}\s+Rule \d+)\s*(?:\u2014|\u2013|-)\s*/gm, '$1: ')
    .replace(/\*\*([^*\n]+?)\*\*\s*(?:\u2014|\u2013)\s*/g, '**$1**: ')
    .replace(/\*\*([^*\n:]+):\*\*/g, '**$1**:')
    .replace(/\s\u2014\s/g, ': ')
    .replace(/\s\u2013\s/g, ': ');
}

/**
 * @param {string} markdown
 */
export function extractMarkdownTitle(markdown) {
  const match = String(markdown).match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Documentation';
}

/**
 * @param {string} markdown
 * @param {{ minLevel?: number, maxLevel?: number }} [options]
 * @returns {Array<{ level: number, title: string, id: string }>}
 */
export function extractMarkdownHeadings(markdown, options = {}) {
  const minLevel = options.minLevel ?? 2;
  const maxLevel = options.maxLevel ?? 3;
  const headings = [];
  for (const line of String(markdown).split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    if (level < minLevel || level > maxLevel) continue;
    const plainTitle = match[2].replace(/\*\*/g, '').replace(/`/g, '');
    const id = slugifyHeading(plainTitle);
    if (!id) continue;
    headings.push({ level, title: plainTitle, id });
  }
  return headings;
}
