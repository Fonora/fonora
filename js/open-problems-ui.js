import { escapeHtml } from './utils.js';
import { docViewerHref, githubDocUrl } from './doc-urls.js';
import {
  CONTRIBUTION_TYPES,
  GITHUB_ISSUES_URL,
  GITHUB_NEW_ISSUE_URL,
  HOW_TO_HELP,
  LANGUAGE_FOCUS,
  PROBLEM_CATEGORIES,
  STATUS_LABELS,
} from './open-problems-data.js';

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="op-status op-status--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function renderDocLinkPair(label, path) {
  return `<span class="op-doc-link-wrap">
    <a class="op-doc-link op-doc-link--view" href="${escapeHtml(docViewerHref(path))}">${escapeHtml(label)}</a>
    <a class="op-doc-link op-doc-link--gh" href="${escapeHtml(githubDocUrl(path))}" target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View ${escapeHtml(label)} on GitHub">↗</a>
  </span>`;
}

function renderDocLinks(docs) {
  if (!docs?.length) return '';
  const items = docs.map((doc) => renderDocLinkPair(doc.label, doc.href)).join('');
  return `<div class="op-card-docs"><span class="op-card-docs-label">Docs:</span><span class="op-card-docs-links">${items}</span></div>`;
}

function renderTagList(items, className) {
  if (!items?.length) return '';
  return `<ul class="op-tag-list ${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderProblemCard(problem) {
  return `
    <article class="op-card" id="op-${escapeHtml(problem.id)}">
      <header class="op-card-header">
        <h3 class="op-card-title">${escapeHtml(problem.title)}</h3>
        ${statusBadge(problem.status)}
      </header>
      <p class="op-card-why">${escapeHtml(problem.why)}</p>
      <div class="op-card-meta">
        <div class="op-card-meta-block">
          <h4 class="op-card-meta-label">Languages affected</h4>
          ${renderTagList(problem.languages, 'op-tag-list--langs')}
        </div>
        <div class="op-card-meta-block">
          <h4 class="op-card-meta-label">Helpful skills</h4>
          ${renderTagList(problem.skills, 'op-tag-list--skills')}
        </div>
        <div class="op-card-meta-block">
          <h4 class="op-card-meta-label">Suggested contributions</h4>
          ${renderTagList(problem.contributions, 'op-tag-list--contrib')}
        </div>
      </div>
      ${renderDocLinks(problem.docs)}
    </article>
  `;
}

function renderLanguageCard(lang) {
  return `
    <article class="op-lang-card" id="op-lang-${escapeHtml(lang.id)}">
      <header class="op-lang-card-header">
        <h3 class="op-lang-card-title">${escapeHtml(lang.name)}</h3>
        ${statusBadge(lang.status)}
      </header>
      <ul class="op-lang-topics">
        ${lang.topics.map((topic) => `<li>${escapeHtml(topic)}</li>`).join('')}
      </ul>
      <p class="op-lang-contrib-label">Ways to help</p>
      ${renderTagList(lang.contributions, 'op-tag-list--contrib')}
      ${renderDocLinks(lang.docs)}
    </article>
  `;
}

function renderHowToHelp() {
  return HOW_TO_HELP.map((item) => {
    if (item.tab) {
      return `
      <a class="op-cta-card" href="#${escapeHtml(item.tab)}" data-tab="${escapeHtml(item.tab)}">
        <h3 class="op-cta-card-title">${escapeHtml(item.title)}</h3>
        <p class="op-cta-card-desc">${escapeHtml(item.description)}</p>
      </a>
    `;
    }
    if (item.href?.endsWith('.md') || item.href?.includes('.md#')) {
      return `
      <a class="op-cta-card" href="${escapeHtml(docViewerHref(item.href))}">
        <h3 class="op-cta-card-title">${escapeHtml(item.title)}</h3>
        <p class="op-cta-card-desc">${escapeHtml(item.description)}</p>
      </a>
    `;
    }
    const external = item.external || /^https?:\/\//i.test(item.href);
    const attrs = external ? 'target="_blank" rel="noopener noreferrer"' : '';
    return `
      <a class="op-cta-card" href="${escapeHtml(item.href)}" ${attrs}>
        <h3 class="op-cta-card-title">${escapeHtml(item.title)}</h3>
        <p class="op-cta-card-desc">${escapeHtml(item.description)}</p>
      </a>
    `;
  }).join('');
}

export function renderOpenProblemsPage() {
  const root = document.getElementById('open-problems-root');
  if (!root) return;

  root.innerHTML = `
    <header class="op-header">
      <h2 id="open-problems-title">Open Problems</h2>
      <p class="op-subtitle">Help solve the hard parts of building a compact phonetic writing system.</p>
    </header>

    <section class="op-intro" aria-labelledby="op-intro-heading">
      <h3 id="op-intro-heading" class="visually-hidden">Introduction</h3>
      <p>
        Fonora is an <strong>experimental</strong>, open-source research project, a compact phonetic writing system
        built from nine core symbols. Limitations are expected; we document them openly so contributors can help close gaps.
      </p>
      <p>
        Fonora offers <strong>broad phonetic approximation</strong> through an eSpeak-driven IPA pipeline, not a finished
        universal script. <strong>Human readability still needs testing.</strong>
      </p>
      <p>
        We invite linguists, language speakers, typographers, engineers, educators, and curious users to propose mappings,
        submit test sets, and improve the system on the merits.
      </p>
      <p class="op-intro-links">
        <a href="${escapeHtml(GITHUB_NEW_ISSUE_URL)}" target="_blank" rel="noopener noreferrer">Open an issue</a>
        <span aria-hidden="true">·</span>
        <a href="${escapeHtml(GITHUB_ISSUES_URL)}" target="_blank" rel="noopener noreferrer">Browse issues</a>
        <span aria-hidden="true">·</span>
        <a href="${escapeHtml(docViewerHref('CONTRIBUTING.md'))}">Contributing guide</a>
      </p>
    </section>

    <section class="op-section" aria-labelledby="op-categories-heading">
      <h3 id="op-categories-heading" class="op-section-title">Problem categories</h3>
      <p class="op-section-desc">
        Known limitations grouped by research area. Status reflects current code and docs, not a promise of future scope.
      </p>
      <div class="op-card-grid">
        ${PROBLEM_CATEGORIES.map(renderProblemCard).join('')}
      </div>
    </section>

    <section class="op-section" aria-labelledby="op-languages-heading">
      <h3 id="op-languages-heading" class="op-section-title">By language</h3>
      <p class="op-section-desc">
        Language-specific gaps drawn from multilingual docs, supplemental IPA maps, and UI language support.
      </p>
      <div class="op-lang-grid">
        ${LANGUAGE_FOCUS.map(renderLanguageCard).join('')}
      </div>
    </section>

    <section class="op-section op-section--cta" aria-labelledby="op-help-heading">
      <h3 id="op-help-heading" class="op-section-title">How to Help</h3>
      <p class="op-section-desc">
        Pick a contribution that matches your skills. Issue templates are available for common report types.
      </p>
      <div class="op-cta-grid">
        ${renderHowToHelp()}
      </div>
      <p class="op-contrib-types">
        <span class="op-contrib-types-label">Contribution types we track:</span>
        ${CONTRIBUTION_TYPES.map((type) => `<span class="op-contrib-pill">${escapeHtml(type)}</span>`).join('')}
      </p>
    </section>
  `;

  root.querySelectorAll('.op-cta-card[data-tab]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const tab = link.dataset.tab;
      if (tab && typeof window.showTab === 'function') {
        window.showTab(tab);
      }
    });
  });
}

export function setupOpenProblems() {
  renderOpenProblemsPage();
}
