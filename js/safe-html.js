const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'meta',
  'link',
  'base',
  'style',
]);

function isSafeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return true;
  if (url.startsWith('#')) return true;
  if (url.startsWith('/')) return !url.startsWith('//');
  return /^https?:\/\//i.test(url);
}

function sanitizeElement(el) {
  const tag = el.tagName.toLowerCase();
  if (FORBIDDEN_TAGS.has(tag)) {
    el.remove();
    return;
  }

  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) {
      el.removeAttribute(attr.name);
      continue;
    }
    if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
      el.removeAttribute(attr.name);
    }
  }

  for (const child of [...el.children]) {
    sanitizeElement(child);
  }
}

/**
 * Strip dangerous tags/attributes from rendered markdown HTML before DOM insertion.
 * @param {string} html
 */
export function sanitizePreviewHtml(html) {
  if (typeof document === 'undefined') return String(html || '');
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  for (const child of [...template.content.children]) {
    sanitizeElement(child);
  }
  return template.innerHTML;
}
