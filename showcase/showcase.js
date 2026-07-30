/**
 * Phrase Aligner — showcase/showcase.js
 *
 * Calls POST /api/fonoran/translate, renders a color-coded alignment poster,
 * then draws SVG bezier curves connecting each Fonoran token block to the
 * English word(s) it represents.
 *
 * Every language fact used for alignment comes from the policy module, which reads
 * the seeds. Nothing here may hardcode a particle, a spelling, or a WH mapping: this
 * file previously did, and the copies rotted until "not" pointed at the root for
 * *to drink*.
 */

import {
  functionWordLabelsByForm,
  whDimensionEnglish,
  whQuantityDimensionConcepts,
  unknownProbeConcept,
  disjunction,
} from '../tools/fonoran-language-policy.js';

// ── Color palette ─────────────────────────────────────────────────────────────

const COLORS = ['#00b4d8', '#e09b20', '#9b5de5', '#e63946', '#2ab87a', '#f4845f'];
const PARTICLE_COLOR = '#aaa';

const ROLE_LABELS = {
  subject:   'subject',
  event:     'verb',
  object:    'object',
  path:      'path',
  time:      'time',
  modifier:  'modifier',
  negation:  'negation',
  particle:  '',
  punctuation: '',
};

/**
 * Fonoran has no interrogative words. It asks by naming an unknown value and
 * the dimension being probed, so `nohu X` is what English spells as a single
 * WH-word: nohu ba "unknown person" = who, nohu che "unknown place" = where.
 * Keyed on meaning rather than roman so a lexicon respell cannot break it.
 */
const WH_PROBE_GLOSS = unknownProbeConcept();

/** Roman form of the quantity root that closes a disjunctive group. */
const DISJUNCTION_MARKER = disjunction().marker_form;

/** English connectives the marker stands in for. */
const DISJUNCTION_ENGLISH = disjunction().english;

const WH_ALL = ['how', 'what', 'who', 'whom', 'which', 'where', 'when', 'why'];

/** Dimension concept → the single English WH-word the `nohu X` pair collapses into. */
const WH_DIMENSION = whDimensionEnglish();

/**
 * Quantity probes stay two-to-two rather than collapsing: English also spells
 * this with two words, so nohu aligns to "how" and the dimension to "many".
 */
const WH_QUANTITY_DIMENSIONS = whQuantityDimensionConcepts();

/**
 * Friendly labels for function words whose `english` field is either the roman
 * itself ("mi" glossed as "mi") or a technical term ("addressee"), neither of
 * which tells a newcomer anything on a poster.
 */
const PARTICLE_LABELS = functionWordLabelsByForm();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const inputEl = document.getElementById('phrase-input');
const btn     = document.getElementById('translate-btn');
const saveBtn = document.getElementById('save-btn');
const saveRow = document.getElementById('save-actions');
const poster  = document.getElementById('poster');

// ── Events ────────────────────────────────────────────────────────────────────

btn.addEventListener('click', () => run());
inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
saveBtn.addEventListener('click', () => window.print());

window.addEventListener('resize', () => {
  if (document.getElementById('lines-zone')) redrawLines();
});

// ── Translation ───────────────────────────────────────────────────────────────

async function run() {
  const text = inputEl.value.trim();
  if (!text) return;

  btn.disabled = true;
  saveRow.style.display = 'none';
  showLoading();

  try {
    const res = await fetch('/api/fonoran/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLang: 'en', align: true }),
    });

    if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`);

    renderPoster(text, await res.json());
    saveRow.style.display = 'flex';
  } catch (err) {
    showError(String(err));
  } finally {
    btn.disabled = false;
  }
}

// ── Color assignment ──────────────────────────────────────────────────────────

function assignColors(tokens) {
  let ci = 0;
  return tokens.map((tok) => (isGrammarOnly(tok) ? PARTICLE_COLOR : COLORS[ci++ % COLORS.length]));
}

function isGrammarOnly(tok) {
  return tok.kind === 'particle' || tok.role === 'punctuation';
}

// ── Symbol map ────────────────────────────────────────────────────────────────

function buildSymbolMap(playback) {
  const map = new Map();
  if (!playback) return map;
  for (const seg of (playback.segments ?? [])) {
    if (seg?.wordSource?.symbols && seg.tokenIndex >= 0 && !map.has(seg.tokenIndex))
      map.set(seg.tokenIndex, seg.wordSource.symbols);
  }
  for (const [i, ws] of (playback.wordSources ?? []).entries()) {
    if (ws?.symbols && !map.has(i)) map.set(i, ws.symbols);
  }
  return map;
}

// ── Word normalization and inflection ─────────────────────────────────────────

function normWord(w) {
  return String(w).replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();
}

/**
 * The meaning shown under a Fonoran word. Prefers a curated label for function
 * words, since their `english` is either the roman echoed back or a technical
 * term. Falls back to `english`, then to the longer `gloss`.
 */
function displayGloss(tok) {
  const curated = PARTICLE_LABELS.get(tok.fonoran);
  if (curated) return curated;

  const eng = String(tok.english ?? '').trim();
  if (eng && normWord(eng) !== normWord(tok.fonoran)) return eng;

  // `english` echoed the roman, so try the gloss's first clause instead.
  const first = String(tok.gloss ?? '').split(/[;(]/)[0].trim();
  return first && normWord(first) !== normWord(tok.fonoran) ? first : '';
}

/**
 * Split the phrase into chunks of { pre, core, post } so surrounding
 * punctuation can be rendered neutrally and excluded from line anchoring.
 */
function splitEnglishWords(phrase) {
  return (phrase.match(/\S+/g) ?? []).map((chunk) => {
    const m = chunk.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'’-]*)(.*)$/u);
    return m
      ? { pre: m[1] ?? '', core: m[2] ?? '', post: m[3] ?? '' }
      : { pre: '', core: chunk, post: '' };
  });
}

// ── Mapping English words to Fonoran tokens ───────────────────────────────────

/**
 * Two-tier lookup. `primary` holds the words a token is reported to stand for
 * and is trusted first; `secondary` is mined from gloss prose and only fills
 * gaps, because gloss text is descriptive and matches more loosely.
 *
 * Both sides are keyed on the lemma the server computed, so "children" and
 * "child" are the same key and no inflection has to be guessed here.
 */
function buildMapping(englishPhrase, tokens, alignment) {
  const primary = new Map();
  const secondary = new Map();
  const keyOf = (word) => alignment.input[normWord(word)] ?? normWord(word);

  const add = (map, key, idx) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.includes(idx)) list.push(idx);
  };

  tokens.forEach((tok, i) => {
    const keys = alignment.keys[i];
    for (const key of keys?.strong ?? []) add(primary, key, i);
    for (const key of keys?.weak ?? []) add(secondary, key, i);
  });

  // Interrogatives: register the unknown-probe and its dimension against the
  // English WH-word, so both halves of `nohu X` link to the one word English
  // uses. Runs after the base pass so it can inspect neighbours.
  tokens.forEach((tok, i) => {
    if (normWord(tok.english) !== WH_PROBE_GLOSS) return;

    const dimension = tokens[i + 1] ? normWord(tokens[i + 1].english) : '';

    if (WH_QUANTITY_DIMENSIONS.has(dimension)) {
      // "how many": probe takes "how", dimension already matches "many" itself.
      add(primary, keyOf('how'), i);
      return;
    }

    const whWord = WH_DIMENSION[dimension];
    if (whWord) {
      add(primary, keyOf(whWord), i);
      add(primary, keyOf(whWord), i + 1);
      return;
    }

    // Unpaired probe: let it claim whichever WH-word the sentence actually uses.
    for (const w of WH_ALL) add(primary, keyOf(w), i);
  });

  // Disjunction: a trailing `lu` closing a group of alternatives is what English
  // spells `or`, so point the connective at it. Guarded on the phrase actually
  // containing `or`, because `lu` is also the ordinary `one` and the `lu de`
  // ("alone") idiom, neither of which should steal the link.
  if (DISJUNCTION_ENGLISH.some(w => new RegExp(`\\b${w}\\b`, 'i').test(englishPhrase))) {
    const luIdx = tokens.map((t, i) => [t, i])
      .filter(([t]) => normWord(t.fonoran) === DISJUNCTION_MARKER)
      .map(([, i]) => i)
      .pop();
    if (luIdx !== undefined) for (const w of DISJUNCTION_ENGLISH) add(primary, keyOf(w), luIdx);
  }

  const lookupAll = (core) => {
    const key = keyOf(core);
    if (!key) return [];
    const strong = primary.get(key);
    if (strong?.length) return [...strong];
    const weak = secondary.get(key);
    return weak?.length ? [weak[0]] : [];
  };

  const words = splitEnglishWords(englishPhrase)
    .map((part) => ({ ...part, tokenIdxs: lookupAll(part.core) }));

  const tokenToEngIdxs = new Map();
  words.forEach(({ tokenIdxs }, wi) => {
    for (const ti of tokenIdxs) {
      if (!tokenToEngIdxs.has(ti)) tokenToEngIdxs.set(ti, []);
      tokenToEngIdxs.get(ti).push(wi);
    }
  });

  return { words, tokenToEngIdxs };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function showLoading() {
  poster.innerHTML = `
    <div class="poster__placeholder">
      <div class="spinner"></div>
      <div>Translating…</div>
    </div>`;
}

function showError(msg) {
  poster.innerHTML = `<div class="poster__error">Translation failed: ${esc(msg)}</div>`;
}

function renderPoster(englishPhrase, data) {
  const allTokens = Array.isArray(data.tokens) ? data.tokens : [];
  // The server's alignment is indexed against the unfiltered token list, so the
  // original position travels with each token that survives the filter.
  const kept = allTokens
    .map((tok, sourceIdx) => ({ tok, sourceIdx }))
    .filter(({ tok }) => tok.role !== 'punctuation' && tok.fonoran);
  const tokens = kept.map(({ tok }) => tok);
  const alignKeys = kept.map(({ sourceIdx }) => data.alignment?.tokens?.[sourceIdx] ?? null);
  const colors = assignColors(tokens);
  const symbolMap = buildSymbolMap(data.playback);
  const { words, tokenToEngIdxs } = buildMapping(englishPhrase, tokens, {
    keys: alignKeys,
    input: data.alignment?.input ?? {},
  });

  const headerHtml = `
    <div class="poster__header">
      <span class="poster__brand">Fonoran</span>
      <span class="poster__url">fonora.org</span>
    </div>`;

  const fBlocksHtml = tokens.map((tok, i) => {
    const color = colors[i];
    const glyph = symbolMap.get(i) ?? tok.fonoran;
    const gloss = displayGloss(tok);
    const role  = ROLE_LABELS[tok.role] ?? '';
    return `
      <div class="poster__fblock" data-tidx="${i}">
        <span class="poster__fblock-glyph" style="color:${ea(color)}">${esc(glyph)}</span>
        <span class="poster__fblock-roman" style="color:${ea(color)}">${esc(tok.fonoran)}</span>
        ${gloss ? `<span class="poster__fblock-gloss">${esc(gloss)}</span>` : ''}
        ${role ? `<span class="poster__fblock-role">${esc(role)}</span>` : ''}
      </div>`;
  }).join('');

  // Built without inner whitespace so punctuation stays flush against its word.
  const engHtml = words.map(({ pre, core, post, tokenIdxs }, wi) => {
    const parts = [];
    if (pre) parts.push(`<span class="poster__eword-punct">${esc(pre)}</span>`);
    if (core) {
      const matched = tokenIdxs.length > 0;
      const cls = matched ? 'poster__eword-core' : 'poster__eword-core poster__eword-core--omitted';
      // Where several Fonoran words converge on one English word, the first
      // one supplies the color and every one still gets its own line.
      const style = matched ? ` style="color:${ea(colors[tokenIdxs[0]])}"` : '';
      parts.push(`<span class="${cls}" data-core="${wi}"${style}>${esc(core)}</span>`);
    }
    if (post) parts.push(`<span class="poster__eword-punct">${esc(post)}</span>`);
    return `<span class="poster__eword">${parts.join('')}</span>`;
  }).join('');

  poster.innerHTML = headerHtml + `
    <div class="poster__aligner" id="poster-aligner">
      <div class="poster__fonoran-row" id="poster-fonoran-row">${fBlocksHtml}</div>
      <div class="poster__lines-zone" id="lines-zone">
        <svg class="poster__lines-svg" id="lines-svg"></svg>
      </div>
      <div class="poster__english-row" id="poster-english-row">${engHtml}</div>
    </div>` + gapsHtml(data.unresolved);

  poster._tokenToEngIdxs = tokenToEngIdxs;
  poster._colors = colors;

  requestAnimationFrame(() => requestAnimationFrame(redrawLines));
}

/**
 * The translator's own honest-gap list. Shown because an unresolved word is the
 * one thing the aligner cannot draw: it has no Fonoran token to connect to, so
 * without this it silently vanishes from the poster.
 */
function gapsHtml(unresolved) {
  const gaps = (Array.isArray(unresolved) ? unresolved : [])
    .map((g) => String(g ?? '').trim())
    .filter(Boolean);
  if (!gaps.length) return '';
  const items = gaps.map((g) => `<span class="poster__gap">${esc(g)}</span>`).join('');
  return `
    <div class="poster__gaps">
      <span class="poster__gaps-label">No Fonoran form yet for</span>
      ${items}
    </div>`;
}

// ── SVG line drawing ──────────────────────────────────────────────────────────

function redrawLines() {
  const fRow = document.getElementById('poster-fonoran-row');
  const eRow = document.getElementById('poster-english-row');
  const zone = document.getElementById('lines-zone');
  const svg  = document.getElementById('lines-svg');
  if (!fRow || !eRow || !zone || !svg) return;

  const tokenToEngIdxs = poster._tokenToEngIdxs;
  const colors = poster._colors;
  if (!tokenToEngIdxs || !colors) return;

  const zoneRect = zone.getBoundingClientRect();
  const zoneH = zone.offsetHeight || 100;
  const centerX = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2 - zoneRect.left;
  };

  const paths = [];
  for (const [tokenIdx, engIdxs] of tokenToEngIdxs) {
    const fEl = fRow.querySelector(`.poster__fblock[data-tidx="${tokenIdx}"]`);
    if (!fEl) continue;
    const color = colors[tokenIdx] ?? PARTICLE_COLOR;
    const x1 = centerX(fEl);

    for (const wi of engIdxs) {
      const eEl = eRow.querySelector(`.poster__eword-core[data-core="${wi}"]`);
      if (!eEl) continue;
      const x2 = centerX(eEl);

      paths.push(
        `<path d="M ${r(x1)},0 C ${r(x1)},${r(zoneH * 0.42)} ${r(x2)},${r(zoneH * 0.58)} ${r(x2)},${r(zoneH)}"` +
        ` stroke="${ea(color)}" stroke-width="2.25" fill="none" stroke-linecap="round" opacity="0.72"/>`
      );
    }
  }

  svg.innerHTML = paths.join('\n');
}

// ── Utility ───────────────────────────────────────────────────────────────────

function r(n) { return Math.round(n * 10) / 10; }

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ea(s) { return String(s).replace(/"/g, '&quot;'); }
