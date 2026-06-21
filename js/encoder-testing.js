import { escapeHtml } from './utils.js';
import { runIpaPipeline } from './ipa-pipeline.js';
import { encodeSounds } from './encode.js';
import { decodeSymbols } from './decode.js';
import { pickCuratedWords, TEST_CATEGORIES, getMultilingualTestEntries } from './encoder-test-sets.js';
import { getDefinedSounds } from './rules.js';
import { addGlossaryEntry } from './glossary.js';

const REVIEWS_KEY = 'fonora-pronunciation-reviews-v1';

export const ISSUE_TAGS = [
  'vowel wrong',
  'consonant wrong',
  'double-letter issue',
  'silent-letter issue',
  'digraph issue',
  'th/dh issue',
  'sh/ch/j issue',
  'ng issue',
  'dictionary override issue',
  'fallback/unknown sound',
  'output unreadable',
  'should become glossary exception',
  'other',
];

let rulesRef = null;
let sessionCards = [];
const sessionReviews = new Map();
const sessionResults = new Map();
let renderGeneration = 0;

export function loadReviews() {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAllReviews(reviews) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
}

export function saveReview(record) {
  const reviews = loadReviews();
  const idx = reviews.findIndex((r) => r.id === record.id);
  if (idx >= 0) reviews[idx] = record;
  else reviews.push(record);
  saveAllReviews(reviews);
  sessionReviews.set(record.cardId, record);
}

function cardReview(cardId) {
  if (sessionReviews.has(cardId)) return sessionReviews.get(cardId);
  const saved = loadReviews().filter((r) => r.cardId === cardId);
  if (saved.length) {
    const latest = saved.sort((a, b) => b.timestamp - a.timestamp)[0];
    sessionReviews.set(cardId, latest);
    return latest;
  }
  return null;
}

function pipelineToReview(card, result, reviewData) {
  return {
    id: reviewData?.id || `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cardId: card.id,
    english: card.input,
    ipa: result.ipa || '',
    lang: result.lang || card.lang || 'en',
    normalizedPhonemes: result.normalizedPhonemes || result.normalizedSpelling || '',
    normalizedSpelling: result.normalizedSpelling || result.phonemeString || result.sounds || '',
    phoneticParse: result.phoneticParse || result.normalizedPhonemes || '',
    fonoraOutput: result.symbols,
    breakdown: result.breakdown,
    encoderSource: result.source,
    primarySource: result.primarySource,
    hasFallback: result.hasFallback,
    testSet: card.testSet,
    testMode: card.testMode,
    result: reviewData?.result ?? null,
    issueTags: reviewData?.issueTags ?? [],
    notes: reviewData?.notes ?? '',
    timestamp: reviewData?.timestamp ?? Date.now(),
    rerunOf: card.rerunOf || null,
  };
}

export function getDashboardStats() {
  const reviews = loadReviews().filter((r) => r.result);
  const total = reviews.length;
  const correct = reviews.filter((r) => r.result === 'correct').length;
  const wrong = reviews.filter((r) => r.result === 'wrong').length;
  const unsure = reviews.filter((r) => r.result === 'unsure').length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const tagCounts = {};
  for (const r of reviews) {
    for (const tag of r.issueTags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topIssueTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  const byCategory = {};
  for (const r of reviews) {
    const cat = r.testSet || '(uncategorized)';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, failed: 0 };
    byCategory[cat].total++;
    if (r.result === 'wrong' || r.result === 'unsure') byCategory[cat].failed++;
  }
  let worstCategory = '—';
  let worstRate = -1;
  for (const [cat, stats] of Object.entries(byCategory)) {
    if (stats.total < 3) continue;
    const rate = stats.failed / stats.total;
    if (rate > worstRate) {
      worstRate = rate;
      worstCategory = `${cat} (${Math.round(rate * 100)}% failed)`;
    }
  }

  const dictionaryCount = reviews.filter(
    (r) => r.encoderSource === 'dictionary' || r.primarySource === 'dictionary',
  ).length;
  const fallbackCount = reviews.filter(
    (r) => r.encoderSource === 'fallback' || r.hasFallback,
  ).length;

  return {
    total,
    correct,
    wrong,
    unsure,
    accuracy,
    topIssueTags,
    worstCategory,
    dictionaryCount,
    fallbackCount,
  };
}

export function getFailedWordsForRerun() {
  const reviews = loadReviews();
  const failed = reviews.filter((r) => r.result === 'wrong' || r.result === 'unsure');
  const seen = new Map();
  for (const r of failed.sort((a, b) => b.timestamp - a.timestamp)) {
    const key = r.english.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { word: r.english, testSet: r.testSet, testMode: r.testMode, reviewId: r.id });
    }
  }
  return [...seen.values()];
}

export function exportReviewsJson() {
  return JSON.stringify(loadReviews(), null, 2);
}

export function exportReviewsCsv() {
  const reviews = loadReviews();
  const headers = [
    'id', 'cardId', 'english', 'ipa', 'lang', 'normalizedPhonemes', 'normalizedSpelling',
    'phoneticParse', 'fonoraOutput', 'encoderSource', 'testSet', 'testMode',
    'result', 'issueTags', 'notes', 'timestamp', 'rerunOf',
  ];
  const rows = reviews.map((r) =>
    headers.map((h) => {
      const val = h === 'issueTags' ? (r.issueTags || []).join('; ') : r[h] ?? '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

function isVowelSound(sound) {
  return /^[aeiouāēīōū]$/.test(sound);
}

function isConsonantSound(sound, definedSounds) {
  return definedSounds.includes(sound) && !isVowelSound(sound);
}

export function generateRandomSoundStrings(rules, count = 30) {
  const defined = getDefinedSounds(rules);
  const vowels = defined.filter(isVowelSound);
  const consonants = defined.filter((s) => isConsonantSound(s, defined));
  const results = [];

  for (let n = 0; n < count; n++) {
    const syllableCount = 1 + Math.floor(Math.random() * 3);
    let str = '';
    let expectConsonant = Math.random() > 0.3;

    for (let s = 0; s < syllableCount; s++) {
      if (expectConsonant && consonants.length) {
        str += consonants[Math.floor(Math.random() * consonants.length)];
        expectConsonant = false;
      }
      if (vowels.length) {
        str += vowels[Math.floor(Math.random() * vowels.length)];
        expectConsonant = true;
      }
    }
    if (expectConsonant && consonants.length && Math.random() > 0.5) {
      str += consonants[Math.floor(Math.random() * consonants.length)];
    }
    if (str) results.push(str);
  }

  return results;
}

function sourceBadge(result) {
  if (result.source === 'dictionary') {
    return '<span class="translate-badge translate-badge--dict">Dictionary</span>';
  }
  if (result.source === 'fallback') {
    return '<span class="translate-badge translate-badge--miss">Fallback</span>';
  }
  return '<span class="translate-badge translate-badge--encoded">IPA Pipeline</span>';
}

function renderBreakdown(breakdown) {
  if (!breakdown?.length) return '<em>—</em>';
  return breakdown
    .map(
      (g) =>
        `<div class="encoder-breakdown-row"><span class="symbol-text">${escapeHtml(g.symbols)}</span> = ${escapeHtml(g.sound)}</div>`,
    )
    .join('');
}

function passesFilter(card, result, review, filters) {
  if (filters.status) {
    if (filters.status === 'unreviewed' && review?.result) return false;
    if (filters.status !== 'unreviewed' && review?.result !== filters.status) return false;
  }
  if (filters.issueTag && !(review?.issueTags || []).includes(filters.issueTag)) return false;
  if (filters.category && card.testSet !== filters.category) return false;
  if (filters.source) {
    if (filters.source === 'dictionary' && result.source !== 'dictionary') return false;
    if (filters.source === 'ipa' && result.primarySource !== 'ipa' && result.source !== 'ipa') return false;
    if (filters.source === 'fallback' && result.source !== 'fallback' && !result.hasFallback) return false;
  }
  return true;
}

function getFilters() {
  return {
    status: document.getElementById('encoder-filter-status')?.value || '',
    issueTag: document.getElementById('encoder-filter-tag')?.value || '',
    category: document.getElementById('encoder-filter-category')?.value || '',
    source: document.getElementById('encoder-filter-source')?.value || '',
  };
}

async function ensureCardResult(card) {
  if (sessionResults.has(card.id) && !sessionResults.get(card.id).loading) {
    return sessionResults.get(card.id);
  }

  const entry = { loading: true, result: null, error: null };
  sessionResults.set(card.id, entry);

  try {
    entry.result = await runIpaForCard(card);
    entry.loading = false;
  } catch (err) {
    entry.loading = false;
    entry.error = err.message || String(err);
  }

  sessionResults.set(card.id, entry);
  return entry;
}

async function runIpaForCard(card) {
  if (card.testMode === 'random') {
    const encoded = encodeSounds(card.input, rulesRef);
    const decoded = decodeSymbols(encoded.symbols, rulesRef);
    const hasFallback = encoded.symbols.includes('?') || encoded.warnings.length > 0;
    return {
      id: card.id,
      input: card.input,
      testSet: card.testSet,
      testMode: card.testMode,
      rerunOf: card.rerunOf,
      original: card.input,
      lang: card.lang || 'en',
      ipa: '—',
      normalizedPhonemes: card.input.split('').join(' '),
      phonemeString: card.input,
      sounds: card.input,
      phoneticParse: card.input.split('').join(' + '),
      symbols: encoded.symbols,
      decoded: decoded.pronunciation,
      breakdown: encoded.groups,
      warnings: [...encoded.warnings, ...decoded.warnings],
      unmapped: [],
      source: hasFallback ? 'fallback' : 'sound',
      primarySource: 'sound',
      hasFallback,
    };
  }

  return runIpaPipeline(card.input, rulesRef, {
    lang: card.lang || 'en',
    testSet: card.testSet,
    testMode: card.testMode,
    id: card.id,
    rerunOf: card.rerunOf,
  });
}

function renderPipelineRow(result) {
  if (!result) return '';
  return `
    <dl class="encoder-pipeline encoder-pipeline--compact">
      <div><dt>Word</dt><dd><code>${escapeHtml(result.original)}</code></dd></div>
      <div><dt>IPA</dt><dd><code>${escapeHtml(result.ipa || '—')}</code></dd></div>
      <div><dt>Normalized Phonemes</dt><dd><code>${escapeHtml(result.normalizedPhonemes || result.phoneticParse || result.sounds || '—')}</code></dd></div>
      <div><dt>Fonora</dt><dd><span class="symbol-text">${escapeHtml(result.symbols)}</span></dd></div>
      <div><dt>Decoded</dt><dd><code>${escapeHtml(result.decoded)}</code></dd></div>
    </dl>`;
}

function renderDashboard() {
  const stats = getDashboardStats();
  const el = document.getElementById('encoder-dashboard');
  if (!el) return;

  const tagHtml = stats.topIssueTags.length
    ? stats.topIssueTags.map((t) => `${escapeHtml(t.tag)} (${t.count})`).join(', ')
    : '—';

  el.innerHTML = `
    <div class="encoder-stat"><span class="encoder-stat-label">Total tested</span><span class="encoder-stat-value">${stats.total}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Correct</span><span class="encoder-stat-value encoder-stat-value--ok">${stats.correct}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Wrong</span><span class="encoder-stat-value encoder-stat-value--bad">${stats.wrong}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Unsure</span><span class="encoder-stat-value encoder-stat-value--warn">${stats.unsure}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Accuracy</span><span class="encoder-stat-value">${stats.accuracy}%</span></div>
    <div class="encoder-stat encoder-stat--wide"><span class="encoder-stat-label">Top issues</span><span class="encoder-stat-value">${tagHtml}</span></div>
    <div class="encoder-stat encoder-stat--wide"><span class="encoder-stat-label">Worst category</span><span class="encoder-stat-value">${escapeHtml(stats.worstCategory)}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Dictionary overrides</span><span class="encoder-stat-value">${stats.dictionaryCount}</span></div>
    <div class="encoder-stat"><span class="encoder-stat-label">Fallback/unknown</span><span class="encoder-stat-value">${stats.fallbackCount}</span></div>
  `;
}

async function renderCards() {
  const list = document.getElementById('encoder-card-list');
  if (!list || !rulesRef) return;

  const generation = ++renderGeneration;
  const filters = getFilters();
  list.innerHTML = '<p class="encoder-empty">Loading pronunciation results…</p>';

  const html = [];

  for (const card of sessionCards) {
    const cached = await ensureCardResult(card);
    if (generation !== renderGeneration) return;

    const result = cached.result;
    if (!result && !cached.error) continue;

    const review = cardReview(card.id);
    if (result && !passesFilter(card, result, review, filters)) continue;

    const dictClass = result?.source === 'dictionary' ? ' encoder-card--dict' : '';
    const reviewResult = review?.result || '';

    if (cached.loading) {
      html.push(`<article class="encoder-card"><p>Loading ${escapeHtml(card.input)}…</p></article>`);
      continue;
    }

    if (cached.error && !result) {
      html.push(`
        <article class="encoder-card">
          <header class="encoder-card-header"><strong>${escapeHtml(card.input)}</strong></header>
          <div class="warning-item">${escapeHtml(cached.error)}</div>
        </article>`);
      continue;
    }

    const pipelineHtml = renderPipelineRow(result);

    html.push(`
      <article class="encoder-card${dictClass}" data-card-id="${escapeHtml(card.id)}">
        <header class="encoder-card-header">
          <strong class="encoder-card-word">${escapeHtml(card.input)}</strong>
          ${card.lang ? `<span class="encoder-card-lang">${escapeHtml(card.lang)}</span>` : ''}
          ${card.testSet ? `<span class="encoder-card-set">${escapeHtml(card.testSet)}</span>` : ''}
          ${result ? sourceBadge(result) : ''}
        </header>

        ${pipelineHtml}

        ${result?.warnings?.length ? `<div class="encoder-warnings">${result.warnings.map((w) => `<div class="warning-item">${escapeHtml(w)}</div>`).join('')}</div>` : ''}

        <div class="encoder-breakdown">
          <strong>Breakdown</strong>
          ${renderBreakdown(result?.breakdown)}
        </div>

        <div class="encoder-review">
          <div class="encoder-review-buttons">
            <button type="button" class="btn btn--sm encoder-review-btn${reviewResult === 'correct' ? ' encoder-review-btn--active encoder-review-btn--correct' : ''}" data-result="correct">Correct</button>
            <button type="button" class="btn btn--sm encoder-review-btn${reviewResult === 'wrong' ? ' encoder-review-btn--active encoder-review-btn--wrong' : ''}" data-result="wrong">Wrong</button>
            <button type="button" class="btn btn--sm encoder-review-btn${reviewResult === 'unsure' ? ' encoder-review-btn--active encoder-review-btn--unsure' : ''}" data-result="unsure">Unsure</button>
          </div>

          <div class="encoder-issue-tags${reviewResult === 'wrong' || reviewResult === 'unsure' ? '' : ' encoder-issue-tags--hidden'}">
            ${ISSUE_TAGS.map((tag) => {
              const checked = (review?.issueTags || []).includes(tag) ? ' checked' : '';
              return `<label class="encoder-issue-tag"><input type="checkbox" data-tag="${escapeHtml(tag)}"${checked}> ${escapeHtml(tag)}</label>`;
            }).join('')}
          </div>

          <label class="encoder-notes-label">Notes
            <textarea class="encoder-notes text-input" rows="2" placeholder="Optional notes">${escapeHtml(review?.notes || '')}</textarea>
          </label>

          ${reviewResult === 'wrong' ? `
            <details class="encoder-glossary-promote">
              <summary>Add as Glossary Exception</summary>
              <form class="encoder-glossary-form">
                <label>English<input type="text" class="text-input encoder-glossary-english" value="${escapeHtml(card.input)}"></label>
                <label>Fonora spelling<input type="text" class="text-input symbol-text encoder-glossary-spelling" placeholder="Symbols"></label>
                <label>Pronunciation<input type="text" class="text-input encoder-glossary-pronunciation" placeholder="Sound units" value="${escapeHtml(result?.sounds || result?.phonemeString || '')}"></label>
                <label>Notes<textarea class="text-input encoder-glossary-notes" rows="2" placeholder="Optional"></textarea></label>
                <button type="submit" class="btn btn--primary btn--sm">Save to dictionary</button>
              </form>
            </details>
          ` : ''}
        </div>
      </article>
    `);
  }

  list.innerHTML = html.length
    ? html.join('')
    : '<p class="encoder-empty">No test cards match the current filters. Generate tests or adjust filters.</p>';

  bindCardEvents();
}

function bindCardEvents() {
  document.querySelectorAll('.encoder-card').forEach((cardEl) => {
    const cardId = cardEl.dataset.cardId;
    const card = sessionCards.find((c) => c.id === cardId);
    if (!card) return;

    cardEl.querySelectorAll('.encoder-review-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cached = await ensureCardResult(card);
        const result = cached.result;
        if (!result) return;
        const existing = cardReview(cardId);
        const issueTags = [...cardEl.querySelectorAll('.encoder-issue-tag input:checked')].map((cb) => cb.dataset.tag);
        const notes = cardEl.querySelector('.encoder-notes')?.value || '';
        const record = pipelineToReview(card, result, {
          ...existing,
          result: btn.dataset.result,
          issueTags,
          notes,
          timestamp: Date.now(),
        });
        saveReview(record);
        renderDashboard();
        renderCards();
      });
    });

    cardEl.querySelectorAll('.encoder-issue-tag input').forEach((cb) => {
      cb.addEventListener('change', () => {
        const review = cardReview(cardId);
        if (!review?.result || (review.result !== 'wrong' && review.result !== 'unsure')) return;
        review.issueTags = [...cardEl.querySelectorAll('.encoder-issue-tag input:checked')].map((i) => i.dataset.tag);
        review.timestamp = Date.now();
        saveReview(review);
        renderDashboard();
      });
    });

    const notesEl = cardEl.querySelector('.encoder-notes');
    notesEl?.addEventListener('blur', () => {
      const review = cardReview(cardId);
      if (!review?.result) return;
      review.notes = notesEl.value;
      review.timestamp = Date.now();
      saveReview(review);
    });

    const glossaryForm = cardEl.querySelector('.encoder-glossary-form');
    glossaryForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const english = glossaryForm.querySelector('.encoder-glossary-english').value.trim();
      const languageSpelling = glossaryForm.querySelector('.encoder-glossary-spelling').value.trim();
      const pronunciation = glossaryForm.querySelector('.encoder-glossary-pronunciation').value.trim();
      const notesVal = glossaryForm.querySelector('.encoder-glossary-notes').value.trim();
      const date = new Date().toLocaleDateString();
      const fullNotes = notesVal
        ? `${notesVal}\nPromoted from encoder testing on ${date}`
        : `Promoted from encoder testing on ${date}`;
      if (addGlossaryEntry({ english, languageSpelling, pronunciation, notes: fullNotes })) {
        glossaryForm.innerHTML = '<p class="encoder-glossary-saved">Saved to dictionary.</p>';
        renderCards();
      }
    });
  });
}

function generateCuratedCards() {
  const selected = [...document.querySelectorAll('.encoder-category-cb:checked')].map((cb) => cb.value);
  if (!selected.length) {
    alert('Select at least one test category.');
    return;
  }
  const count = Math.min(50, Math.max(20, parseInt(document.getElementById('encoder-curated-count').value, 10) || 30));
  const picks = pickCuratedWords(selected, count);
  sessionCards = picks.map(({ word, testSet }) => ({
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input: word,
    testSet,
    testMode: 'curated',
    lang: 'en',
    rerunOf: null,
  }));
  sessionResults.clear();
  sessionReviews.clear();
  renderCards();
  populateCategoryFilter();
}

function generateRandomCards() {
  const count = Math.min(50, Math.max(20, parseInt(document.getElementById('encoder-random-count').value, 10) || 30));
  const strings = generateRandomSoundStrings(rulesRef, count);
  sessionCards = strings.map((str) => ({
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input: str,
    testSet: 'Random generated',
    testMode: 'random',
    lang: 'en',
    rerunOf: null,
  }));
  sessionResults.clear();
  sessionReviews.clear();
  renderCards();
}

function generateManualCards() {
  const text = document.getElementById('encoder-manual-input').value.trim();
  if (!text) return;
  const words = [...new Set(text.split(/\n+/).map((w) => w.trim()).filter(Boolean))];
  sessionCards = words.map((word) => ({
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input: word,
    testSet: 'Manual batch',
    testMode: 'manual',
    lang: 'en',
    rerunOf: null,
  }));
  sessionResults.clear();
  sessionReviews.clear();
  renderCards();
  populateCategoryFilter();
}

function generateMultilingualCards() {
  const entries = getMultilingualTestEntries();
  sessionCards = entries.map(({ word, lang, testSet }) => ({
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input: word,
    lang,
    testSet,
    testMode: 'multilingual',
    rerunOf: null,
  }));
  sessionResults.clear();
  sessionReviews.clear();
  renderCards();
  populateCategoryFilter();
}

function rerunFailedCards() {
  const failed = getFailedWordsForRerun();
  if (!failed.length) {
    alert('No wrong or unsure reviews to rerun.');
    return;
  }
  sessionCards = failed.map(({ word, testSet, testMode, reviewId }) => ({
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input: word,
    testSet: testSet || 'Rerun',
    testMode: testMode === 'random' ? 'random' : 'manual',
    lang: 'en',
    rerunOf: reviewId,
  }));
  sessionResults.clear();
  sessionReviews.clear();
  renderCards();
}

function populateCategoryFilter() {
  const sel = document.getElementById('encoder-filter-category');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All categories</option>';
  const cats = new Set(sessionCards.map((c) => c.testSet).filter(Boolean));
  for (const cat of [...cats].sort()) {
    sel.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  }
  sel.value = current;
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setupSubTabs() {
  document.querySelectorAll('.encoder-sub-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.encoderSubTab;
      document.querySelectorAll('.encoder-sub-tab-btn').forEach((b) =>
        b.classList.toggle('encoder-sub-tab-btn--active', b.dataset.encoderSubTab === id),
      );
      document.querySelectorAll('.encoder-sub-tab-panel').forEach((p) => {
        p.hidden = p.dataset.encoderSubTabPanel !== id;
        p.classList.toggle('encoder-sub-tab-panel--active', p.dataset.encoderSubTabPanel === id);
      });
    });
  });
}

function renderCategoryCheckboxes() {
  const container = document.getElementById('encoder-category-grid');
  if (!container) return;
  container.innerHTML = TEST_CATEGORIES.map(
    (cat) =>
      `<label class="encoder-category-label"><input type="checkbox" class="encoder-category-cb" value="${escapeHtml(cat.id)}"> ${escapeHtml(cat.label)}</label>`,
  ).join('');
}

export function setupEncoderTesting(rules) {
  rulesRef = rules;

  renderCategoryCheckboxes();
  setupSubTabs();
  renderDashboard();

  document.getElementById('encoder-generate-curated')?.addEventListener('click', () => {
    generateCuratedCards();
    populateCategoryFilter();
  });
  document.getElementById('encoder-generate-random')?.addEventListener('click', generateRandomCards);
  document.getElementById('encoder-generate-manual')?.addEventListener('click', generateManualCards);
  document.getElementById('encoder-generate-multilingual')?.addEventListener('click', () => {
    generateMultilingualCards();
    populateCategoryFilter();
  });
  document.getElementById('encoder-rerun-failed')?.addEventListener('click', rerunFailedCards);
  document.getElementById('encoder-clear-session')?.addEventListener('click', () => {
    sessionCards = [];
    sessionReviews.clear();
    sessionResults.clear();
    renderCards();
  });

  document.getElementById('encoder-export-json')?.addEventListener('click', () => {
    downloadFile(exportReviewsJson(), `fonora-encoder-reviews-${Date.now()}.json`, 'application/json');
  });
  document.getElementById('encoder-export-csv')?.addEventListener('click', () => {
    downloadFile(exportReviewsCsv(), `fonora-encoder-reviews-${Date.now()}.csv`, 'text/csv');
  });

  ['encoder-filter-status', 'encoder-filter-tag', 'encoder-filter-category', 'encoder-filter-source'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      sessionResults.clear();
      renderCards();
    });
  });
}
