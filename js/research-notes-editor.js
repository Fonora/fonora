/**
 * Research Notes editor (Tools → /tools#research-notes).
 */

import { escapeHtml, errorMessage } from './utils.js';
import { renderMarkdown } from './markdown-render.js';
import { sanitizePreviewHtml } from './safe-html.js';
import { researchHref } from './doc-urls.js';
import { RESEARCH_PHASES } from './research-notes.js';
import {
  NOTE_STATUSES,
  deriveMetadataFromBody,
  NEW_NOTE_TEMPLATE,
  NEW_NOTE_STUB_TEMPLATE,
  RESEARCH_NOTE_SECTIONS,
  researchNoteBodyTemplate,
} from './research-note-meta.js';

const ROOT_ID = 'research-notes-editor-root';
const FONT_SIZES = ['sm', 'md', 'lg'];

/** @type {'list' | 'edit'} */
let view = 'list';
/** @type {string|null} */
let editingSlug = null;
/** @type {object|null} */
let currentRow = null;
let listFilter = 'all';
let dirty = false;

function root() {
  return document.getElementById(ROOT_ID);
}

function api(path, options = {}) {
  return fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  });
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('rn-editor-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('rn-editor-status--error', Boolean(isError));
}

function workflowBadge(workflow) {
  const cls = workflow === 'published' ? 'rn-badge--published' : 'rn-badge--draft';
  return `<span class="rn-badge ${cls}">${escapeHtml(workflow)}</span>`;
}

function formatTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function readFormMetadata() {
  const get = (id) => document.getElementById(id)?.value?.trim() ?? '';
  return {
    slug: get('rn-field-slug'),
    code: get('rn-field-code'),
    title: get('rn-field-title'),
    status: get('rn-field-status'),
    phase: get('rn-field-phase'),
    date: get('rn-field-date'),
    description: get('rn-field-description'),
    abstract: get('rn-field-abstract'),
    related: get('rn-field-related')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    docs: currentRow?.metadata?.docs || [],
    tools: currentRow?.metadata?.tools || [],
    source: currentRow?.metadata?.source || [],
    git_commit: currentRow?.metadata?.git_commit || null,
  };
}

function fillForm(row) {
  const meta = row.metadata || {};
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('rn-field-slug', meta.slug);
  set('rn-field-code', meta.code);
  set('rn-field-title', meta.title);
  set('rn-field-status', meta.status);
  set('rn-field-phase', meta.phase || meta.act);
  set('rn-field-date', meta.date);
  set('rn-field-description', meta.description);
  set('rn-field-abstract', meta.abstract);
  set('rn-field-related', (meta.related || []).join('\n'));
  const bodyEl = document.getElementById('rn-field-body');
  if (bodyEl) bodyEl.value = row.body || '';
  updatePreview();
}

function insertAtBody(prefix, suffix = prefix) {
  const ta = document.getElementById('rn-field-body');
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const selected = ta.value.slice(start, end);
  const after = ta.value.slice(end);
  ta.value = `${before}${prefix}${selected || 'text'}${suffix}${after}`;
  ta.focus();
  ta.selectionStart = start + prefix.length;
  ta.selectionEnd = start + prefix.length + (selected || 'text').length;
  dirty = true;
  updatePreview();
}

function updatePreview() {
  const body = document.getElementById('rn-field-body')?.value || '';
  const preview = document.getElementById('rn-preview');
  if (!preview) return;
  const slug = document.getElementById('rn-field-slug')?.value || 'draft';
  const html = sanitizePreviewHtml(renderMarkdown(body, { docPath: `research/${slug}`, skipTitle: false }));
  preview.replaceChildren();
  preview.append(document.createRange().createContextualFragment(html));
}

function setFontSize(size) {
  const shell = document.getElementById('rn-editor-shell');
  if (!shell) return;
  shell.dataset.rnFontSize = size;
  FONT_SIZES.forEach((s) => {
    document.getElementById(`rn-font-${s}`)?.classList.toggle('btn--primary', s === size);
  });
}

async function loadList() {
  const data = await api('/api/research/editor');
  return data.notes || [];
}

function renderListHtml(notes) {
  const filtered = notes.filter((n) => {
    if (listFilter === 'drafts') return n.workflow === 'draft';
    if (listFilter === 'published') return n.workflow === 'published';
    return true;
  });

  if (!filtered.length) {
    return '<p class="rn-empty">No notes match this filter.</p>';
  }

  const rows = filtered
    .map((n) => {
      const meta = n.metadata || {};
      return `
        <tr>
          <td><code>${escapeHtml(meta.code || '')}</code></td>
          <td>${escapeHtml(meta.title || n.slug)}</td>
          <td>${workflowBadge(n.workflow)}</td>
          <td><span class="research-badge research-badge--${escapeHtml(String(meta.status || '').toLowerCase())}">${escapeHtml(meta.status || '')}</span></td>
          <td>${escapeHtml((meta.phase || meta.act || '').replace(/^act-/, 'phase-'))}</td>
          <td>${escapeHtml(formatTs(n.updated_at))}</td>
          <td class="rn-actions">
            <button type="button" class="btn btn--sm" data-rn-edit="${escapeHtml(n.slug)}">Edit</button>
            ${n.workflow === 'published' ? `<a class="btn btn--sm" href="${escapeHtml(researchHref(n.slug))}" target="_blank" rel="noopener noreferrer">Preview</a>` : ''}
            <a class="btn btn--sm" href="/api/research/notes/${encodeURIComponent(n.slug)}.md" download>Download .md</a>
          </td>
        </tr>`;
    })
    .join('');

  return `
    <div class="rn-list-toolbar">
      <button type="button" class="btn btn--primary" id="rn-new-stub">New stub</button>
      <button type="button" class="btn" id="rn-new-note">New expanded draft</button>
      <a class="btn" href="/docs/research-notes-authoring.md" target="_blank" rel="noopener noreferrer">Authoring guide</a>
      <div class="rn-filter" role="group" aria-label="Filter notes">
        <button type="button" class="btn btn--sm${listFilter === 'all' ? ' btn--primary' : ''}" data-rn-filter="all">All</button>
        <button type="button" class="btn btn--sm${listFilter === 'drafts' ? ' btn--primary' : ''}" data-rn-filter="drafts">Drafts</button>
        <button type="button" class="btn btn--sm${listFilter === 'published' ? ' btn--primary' : ''}" data-rn-filter="published">Published</button>
      </div>
    </div>
    <div class="rn-table-wrap">
      <table class="rn-table">
        <thead>
          <tr>
            <th>Code</th><th>Title</th><th>Workflow</th><th>Status</th><th>Phase</th><th>Updated</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderEditorHtml() {
  const phaseOptions = RESEARCH_PHASES.map(
    (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`,
  ).join('');
  const statusOptions = NOTE_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('');

  return `
    <div class="rn-editor-toolbar-top">
      <button type="button" class="btn" id="rn-back-list">← Back to list</button>
      <div class="rn-editor-actions">
        <button type="button" class="btn" id="rn-refresh-meta">Refresh metadata</button>
        <button type="button" class="btn" id="rn-save">Save draft</button>
        <button type="button" class="btn btn--primary" id="rn-publish">Publish</button>
        <a class="btn" id="rn-preview-link" href="#" target="_blank" rel="noopener noreferrer" hidden>Preview</a>
        <a class="btn" id="rn-download-link" href="#">Download .md</a>
      </div>
    </div>

    <div class="rn-meta-grid">
      <label>Code <input type="text" id="rn-field-code" class="text-input" readonly></label>
      <label>Slug <input type="text" id="rn-field-slug" class="text-input"></label>
      <label>Title <input type="text" id="rn-field-title" class="text-input"></label>
      <label>Status <select id="rn-field-status" class="text-input">${statusOptions}</select></label>
      <label>Phase <select id="rn-field-phase" class="text-input">${phaseOptions}</select></label>
      <label>Date <input type="date" id="rn-field-date" class="text-input"></label>
      <label class="rn-meta-full">Description <textarea id="rn-field-description" class="text-input" rows="2"></textarea></label>
      <label class="rn-meta-full">Abstract <input type="text" id="rn-field-abstract" class="text-input"></label>
      <label class="rn-meta-full">Related slugs <textarea id="rn-field-related" class="text-input" rows="2" placeholder="one per line"></textarea></label>
    </div>

    <div class="rn-editor-shell" id="rn-editor-shell" data-rn-font-size="md">
      <div class="rn-markdown-toolbar" role="toolbar" aria-label="Markdown formatting">
        <button type="button" class="btn btn--sm" data-rn-md="h2">H2</button>
        <button type="button" class="btn btn--sm" data-rn-md="h3">H3</button>
        <button type="button" class="btn btn--sm" data-rn-md="bold"><strong>B</strong></button>
        <button type="button" class="btn btn--sm" data-rn-md="italic"><em>I</em></button>
        <button type="button" class="btn btn--sm" data-rn-md="link">Link</button>
        <button type="button" class="btn btn--sm" data-rn-md="quote">Quote</button>
        <button type="button" class="btn btn--sm" data-rn-md="list">List</button>
        <span class="rn-toolbar-sep" aria-hidden="true"></span>
        <span class="rn-toolbar-label">Size</span>
        <button type="button" class="btn btn--sm" id="rn-font-sm">S</button>
        <button type="button" class="btn btn--sm btn--primary" id="rn-font-md">M</button>
        <button type="button" class="btn btn--sm" id="rn-font-lg">L</button>
      </div>
      <div class="rn-split">
        <textarea id="rn-field-body" class="rn-textarea text-input" spellcheck="true" aria-label="Markdown source"></textarea>
        <div id="rn-preview" class="rn-preview markdown-body" aria-label="Preview"></div>
      </div>
    </div>
    <p id="rn-editor-status" class="rn-editor-status" role="status"></p>`;
}

async function showList() {
  view = 'list';
  editingSlug = null;
  currentRow = null;
  dirty = false;
  const el = root();
  if (!el) return;
  el.innerHTML = '<p class="rn-loading">Loading notes…</p>';
  try {
    const notes = await loadList();
    el.innerHTML = renderListHtml(notes);
    wireListEvents();
    setStatus('');
  } catch (err) {
    el.innerHTML = `<p class="rn-error">${escapeHtml(errorMessage(err))}</p>`;
  }
}

async function openEditor(slug) {
  view = 'edit';
  editingSlug = slug;
  dirty = false;
  const el = root();
  if (!el) return;
  el.innerHTML = '<p class="rn-loading">Loading note…</p>';
  try {
    const row = slug ? await api(`/api/research/editor/${encodeURIComponent(slug)}`) : null;
    currentRow = row;
    el.innerHTML = renderEditorHtml();
    if (row) fillForm(row);
    wireEditorEvents();
    updateEditorLinks();
    setStatus('');
  } catch (err) {
    el.innerHTML = `<p class="rn-error">${escapeHtml(errorMessage(err))}</p>`;
  }
}

async function createNewNote(bodyTemplate = NEW_NOTE_TEMPLATE) {
  view = 'edit';
  editingSlug = null;
  dirty = false;
  const el = root();
  if (!el) return;
  el.innerHTML = renderEditorHtml();
  const today = new Date().toISOString().slice(0, 10);
  currentRow = {
    slug: '',
    workflow: 'draft',
    metadata: {
      code: '',
      title: '',
      status: 'Active',
      phase: 'phase-3',
      date: today,
      description: '',
      abstract: '',
      related: [],
      docs: [],
      tools: [],
      source: [],
    },
    body: bodyTemplate,
  };
  try {
    const created = await api('/api/research/editor', {
      method: 'POST',
      body: JSON.stringify({ metadata: { phase: 'phase-3', status: 'Active', date: today }, body: bodyTemplate }),
    });
    currentRow = created;
    editingSlug = created.slug;
    fillForm(created);
  } catch {
    fillForm(currentRow);
  }
  wireEditorEvents();
  updateEditorLinks();
  setStatus(bodyTemplate === NEW_NOTE_STUB_TEMPLATE
    ? 'New stub draft — expand per docs/research-notes-authoring.md'
    : 'New expanded draft — edit and save.');
}

function updateEditorLinks() {
  const slug = document.getElementById('rn-field-slug')?.value || editingSlug;
  const preview = document.getElementById('rn-preview-link');
  const download = document.getElementById('rn-download-link');
  if (preview && slug) {
    preview.href = researchHref(slug);
    preview.hidden = currentRow?.workflow !== 'published';
  }
  if (download && slug) {
    download.href = `/api/research/notes/${encodeURIComponent(slug)}.md`;
  }
}

function refreshMetadataFromBody() {
  const body = document.getElementById('rn-field-body')?.value || '';
  const existing = readFormMetadata();
  const derived = deriveMetadataFromBody(body, existing);
  if (!existing.slug && derived.slug) {
    document.getElementById('rn-field-slug').value = derived.slug;
  }
  if (derived.title) document.getElementById('rn-field-title').value = derived.title;
  if (derived.description) document.getElementById('rn-field-description').value = derived.description;
  if (derived.abstract) document.getElementById('rn-field-abstract').value = derived.abstract;
  if (derived.related?.length) {
    document.getElementById('rn-field-related').value = derived.related.join('\n');
  }
  currentRow = {
    ...currentRow,
    metadata: {
      ...readFormMetadata(),
      ...derived,
      slug: document.getElementById('rn-field-slug')?.value || derived.slug,
      source: derived.source?.length ? derived.source : currentRow?.metadata?.source || [],
    },
  };
  setStatus('Metadata refreshed from body.');
}

async function saveCurrent() {
  const slug = document.getElementById('rn-field-slug')?.value?.trim();
  if (!slug) {
    setStatus('Slug is required.', true);
    return;
  }
  const body = document.getElementById('rn-field-body')?.value ?? '';
  const metadata = readFormMetadata();
  metadata.slug = slug;
  if (!metadata.title) {
    metadata.title = document.getElementById('rn-field-title')?.value?.trim() || slug;
  }
  const targetSlug = editingSlug || slug;
  try {
    const row = await api(`/api/research/editor/${encodeURIComponent(targetSlug)}`, {
      method: 'PUT',
      body: JSON.stringify({ metadata, body }),
    });
    currentRow = row;
    editingSlug = slug;
    dirty = false;
    fillForm(currentRow);
    updateEditorLinks();
    setStatus('Draft saved.');
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
}

async function publishCurrent() {
  await saveCurrent();
  const slug = editingSlug || document.getElementById('rn-field-slug')?.value?.trim();
  if (!slug) return;
  try {
    const row = await api(`/api/research/editor/${encodeURIComponent(slug)}/publish`, { method: 'POST' });
    currentRow = row;
    dirty = false;
    fillForm(row);
    updateEditorLinks();
    setStatus('Published to the site.');
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
}

function wireListEvents() {
  document.getElementById('rn-new-stub')?.addEventListener('click', () => createNewNote(NEW_NOTE_STUB_TEMPLATE));
  document.getElementById('rn-new-note')?.addEventListener('click', () => createNewNote(NEW_NOTE_TEMPLATE));
  root()?.querySelectorAll('[data-rn-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      listFilter = btn.getAttribute('data-rn-filter') || 'all';
      showList();
    });
  });
  root()?.querySelectorAll('[data-rn-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEditor(btn.getAttribute('data-rn-edit')));
  });
}

function wireEditorEvents() {
  document.getElementById('rn-back-list')?.addEventListener('click', () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    showList();
  });
  document.getElementById('rn-refresh-meta')?.addEventListener('click', () => refreshMetadataFromBody());
  document.getElementById('rn-save')?.addEventListener('click', () => saveCurrent());
  document.getElementById('rn-publish')?.addEventListener('click', () => publishCurrent());
  document.getElementById('rn-field-body')?.addEventListener('input', () => {
    dirty = true;
    updatePreview();
  });
  document.getElementById('rn-field-slug')?.addEventListener('input', updateEditorLinks);

  document.querySelectorAll('[data-rn-md]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-rn-md');
      if (kind === 'h2') insertAtBody('\n## ', '\n');
      else if (kind === 'h3') insertAtBody('\n### ', '\n');
      else if (kind === 'bold') insertAtBody('**', '**');
      else if (kind === 'italic') insertAtBody('*', '*');
      else if (kind === 'link') insertAtBody('[', '](url)');
      else if (kind === 'quote') insertAtBody('\n> ', '\n');
      else if (kind === 'list') insertAtBody('\n- ', '\n');
    });
  });

  document.getElementById('rn-font-sm')?.addEventListener('click', () => setFontSize('sm'));
  document.getElementById('rn-font-md')?.addEventListener('click', () => setFontSize('md'));
  document.getElementById('rn-font-lg')?.addEventListener('click', () => setFontSize('lg'));
}

let wired = false;

export function initResearchNotesEditor() {
  if (!root()) return;
  if (!wired) {
    wired = true;
  }
  showList();
}

export function onResearchNotesTabActivated() {
  initResearchNotesEditor();
}
