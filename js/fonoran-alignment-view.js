/**
 * Alignment view: which Fonoran word stands for which English word.
 *
 * This is the rendering half only. It never calls the translator; it is handed a
 * response from `POST /api/fonoran/translate` with `align: true` and draws it. That
 * keeps the one-engine rule intact: the surface shows what the engine returned and
 * decides nothing about the language itself.
 *
 * Every language fact used for alignment comes from the policy module, which reads
 * the seeds. Nothing here may hardcode a particle, a spelling, or a WH mapping: the
 * page this grew out of did, and the copies rotted until "not" pointed at the root
 * for *to drink*.
 */

import {
  functionWordLabelsByForm,
  disjunction,
} from '../tools/fonoran-language-policy.js';

/**
 * One hue per content word, cycled. Deliberately not the translator's resolution
 * colours: those grade how confident a word is, and reusing them here would say
 * something about quality that this view does not mean.
 *
 * The values are theme variables rather than literals so the palette shifts with
 * light and dark mode. Ordered so neighbouring words never land on adjacent hues.
 */
const COLORS = [
  'var(--align-hue-1)', 'var(--align-hue-2)', 'var(--align-hue-3)',
  'var(--align-hue-4)', 'var(--align-hue-5)', 'var(--align-hue-6)',
];
const PARTICLE_COLOR = 'var(--align-hue-particle)';

/**
 * Slot roles come from the translator. Particles carry their own grammatical role
 * instead, and every one of those is a marker on the clause rather than a slot in
 * it, so they share a label: without one they sit in the row with a blank where
 * every neighbour has text, and read as misaligned rather than as grammar.
 */
const ROLE_LABELS = {
  subject: 'subject',
  event: 'verb',
  object: 'object',
  path: 'path',
  time: 'time',
  modifier: 'modifier',
  negation: 'negation',
  punctuation: '',
};

const PARTICLE_ROLE_LABEL = 'marker';

function roleLabel(tok) {
  const known = ROLE_LABELS[tok.role];
  if (known !== undefined) return known;
  return tok.role ? PARTICLE_ROLE_LABEL : '';
}

const DISJUNCTION_MARKER = disjunction().marker_form;
const DISJUNCTION_ENGLISH = disjunction().english;

/** Readable labels for function words whose `english` is the roman echoed back. */
const PARTICLE_LABELS = functionWordLabelsByForm();

const SENTENCE_END = /^[.!?]+$/;

// ── Small helpers ─────────────────────────────────────────────────────────────

function normWord(w) {
  return String(w).replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ea(s) { return String(s).replace(/"/g, '&quot;'); }
function r(n) { return Math.round(n * 10) / 10; }

function isGrammarOnly(tok) {
  return tok.kind === 'particle' || tok.role === 'punctuation';
}

function assignColors(tokens) {
  let ci = 0;
  return tokens.map(tok => (isGrammarOnly(tok) ? PARTICLE_COLOR : COLORS[ci++ % COLORS.length]));
}

/**
 * The meaning shown under a Fonoran word. Prefers a curated label for function
 * words, whose `english` is either the roman echoed back or a technical term.
 */
function displayGloss(tok) {
  const curated = PARTICLE_LABELS.get(tok.fonoran);
  if (curated) return curated;

  const eng = String(tok.english ?? '').trim();
  if (eng && normWord(eng) !== normWord(tok.fonoran)) return eng;

  const first = String(tok.gloss ?? '').split(/[;(]/)[0].trim();
  return first && normWord(first) !== normWord(tok.fonoran) ? first : '';
}

/** Chunks of { pre, core, post }, so punctuation renders neutrally and never anchors a line. */
function splitEnglishWords(phrase) {
  return (phrase.match(/\S+/g) ?? []).map((chunk) => {
    const m = chunk.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'’-]*)(.*)$/u);
    return m
      ? { pre: m[1] ?? '', core: m[2] ?? '', post: m[3] ?? '' }
      : { pre: '', core: chunk, post: '' };
  });
}

function buildSymbolMap(playback) {
  const map = new Map();
  if (!playback) return map;
  for (const seg of playback.segments ?? []) {
    if (seg?.wordSource?.symbols && seg.tokenIndex >= 0 && !map.has(seg.tokenIndex)) {
      map.set(seg.tokenIndex, seg.wordSource.symbols);
    }
  }
  for (const [i, ws] of (playback.wordSources ?? []).entries()) {
    if (ws?.symbols && !map.has(i)) map.set(i, ws.symbols);
  }
  return map;
}

// ── Splitting a response into one scene per sentence ──────────────────────────

/**
 * The translator returns one flat token list for the whole input, with sentence
 * ends present as punctuation tokens. Cutting on those gives a scene per sentence,
 * which is what lets a paragraph be read one sentence at a time instead of as a
 * single unreadable line.
 *
 * English is split on the same boundaries so each scene only ever tries to match
 * its own words. That also stops a word used twice in a paragraph from drawing a
 * line into the wrong sentence.
 */
export function splitScenes(phrase, data) {
  const all = Array.isArray(data.tokens) ? data.tokens : [];
  const symbolMap = buildSymbolMap(data.playback);

  const groups = [];
  let current = [];
  all.forEach((tok, sourceIdx) => {
    if (tok.role === 'punctuation' && SENTENCE_END.test(String(tok.fonoran ?? '').trim())) {
      if (current.length) groups.push(current);
      current = [];
      return;
    }
    if (tok.fonoran) current.push({ tok, sourceIdx });
  });
  if (current.length) groups.push(current);

  const sentences = String(phrase).match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) ?? [];

  return groups.map((group, i) => ({
    english: sentences[i] ?? (groups.length === 1 ? String(phrase) : ''),
    tokens: group.map(g => g.tok),
    alignKeys: group.map(g => data.alignment?.tokens?.[g.sourceIdx] ?? null),
    symbols: group.map(g => symbolMap.get(g.sourceIdx) ?? null),
  })).filter(scene => scene.tokens.length);
}

// ── Mapping English words to Fonoran tokens ───────────────────────────────────

/**
 * Two-tier lookup. `primary` holds the words a token is reported to stand for and
 * is trusted first; `secondary` is mined from gloss prose and only fills gaps,
 * because gloss text is descriptive and matches more loosely.
 *
 * Both sides are keyed on the lemma the server computed, so "children" and "child"
 * are the same key and no inflection is guessed in the browser.
 */
function buildMapping(englishPhrase, tokens, alignKeys, inputLemmas) {
  const primary = new Map();
  const secondary = new Map();
  const keyOf = word => inputLemmas[normWord(word)] ?? normWord(word);

  const add = (map, key, idx) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.includes(idx)) list.push(idx);
  };

  tokens.forEach((tok, i) => {
    const keys = alignKeys[i];
    for (const key of keys?.strong ?? []) add(primary, key, i);
    for (const key of keys?.weak ?? []) add(secondary, key, i);
  });

  // A trailing marker closing a group of alternatives is what English spells "or".
  // Guarded on the phrase actually containing it, because the same root is the
  // ordinary "one" and part of the "alone" idiom, neither of which should link.
  if (DISJUNCTION_ENGLISH.some(w => new RegExp(`\\b${w}\\b`, 'i').test(englishPhrase))) {
    const luIdx = tokens
      .map((t, i) => [t, i])
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

  const words = splitEnglishWords(englishPhrase).map((part, wi) => ({
    ...part,
    coreAnchor: `c${wi}`,
    tokenIdxs: lookupAll(part.core),
  }));

  const tokenToAnchors = new Map();
  const link = (tokenIdx, anchor) => {
    if (!tokenToAnchors.has(tokenIdx)) tokenToAnchors.set(tokenIdx, []);
    const list = tokenToAnchors.get(tokenIdx);
    if (!list.includes(anchor)) list.push(anchor);
  };

  words.forEach(({ tokenIdxs, coreAnchor }) => {
    for (const ti of tokenIdxs) link(ti, coreAnchor);
  });

  // The question marker is the one token English writes as punctuation rather than
  // a word, so the "?" is its only honest anchor. Found by the role the translator
  // assigned, never by spelling, so a respell cannot silently unlink it.
  const questionTokens = tokens
    .map((tok, i) => (tok.role === 'question' ? i : -1))
    .filter(i => i >= 0);

  if (questionTokens.length) {
    const marked = words.filter(w => w.post.includes('?')).pop();
    if (marked) {
      marked.postAnchor = `q${marked.coreAnchor.slice(1)}`;
      for (const ti of questionTokens) link(ti, marked.postAnchor);
    }
  }

  return { words, tokenToAnchors };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function sceneHtml(scene, inputLemmas) {
  const { tokens, alignKeys, symbols, english } = scene;
  const colors = assignColors(tokens);
  const { words, tokenToAnchors } = buildMapping(english, tokens, alignKeys, inputLemmas);

  const fBlocks = tokens.map((tok, i) => {
    const color = colors[i];
    const glyph = symbols[i] ?? tok.fonoran;
    const gloss = displayGloss(tok);
    const role = roleLabel(tok);
    return `
      <div class="align__fblock" data-tidx="${i}">
        <span class="align__glyph" style="color:${ea(color)}">${esc(glyph)}</span>
        <span class="align__roman" style="color:${ea(color)}">${esc(tok.fonoran)}</span>
        ${gloss ? `<span class="align__gloss">${esc(gloss)}</span>` : ''}
        ${role ? `<span class="align__role">${esc(role)}</span>` : ''}
      </div>`;
  }).join('');

  // Built without inner whitespace so punctuation stays flush against its word.
  const engWords = words.map(({ pre, core, post, tokenIdxs, coreAnchor, postAnchor }) => {
    const parts = [];
    if (pre) parts.push(`<span class="align__epunct">${esc(pre)}</span>`);
    if (core) {
      const matched = tokenIdxs.length > 0;
      const cls = matched ? 'align__ecore' : 'align__ecore align__ecore--omitted';
      // Where several Fonoran words converge on one English word, the first supplies
      // the colour and every one still gets its own line.
      const style = matched ? ` style="color:${ea(colors[tokenIdxs[0]])}"` : '';
      parts.push(`<span class="${cls}" data-anchor="${ea(coreAnchor)}"${style}>${esc(core)}</span>`);
    }
    if (post) {
      // A "?" carrying the question marker is a target like any word, so it is drawn
      // in that token's colour rather than as inert punctuation.
      const qIdx = postAnchor ? [...tokenToAnchors].find(([, a]) => a.includes(postAnchor))?.[0] : undefined;
      const style = qIdx === undefined ? '' : ` style="color:${ea(colors[qIdx])}"`;
      const cls = postAnchor ? 'align__epunct align__epunct--anchor' : 'align__epunct';
      const attr = postAnchor ? ` data-anchor="${ea(postAnchor)}"` : '';
      parts.push(`<span class="${cls}"${attr}${style}>${esc(post)}</span>`);
    }
    return `<span class="align__eword">${parts.join('')}</span>`;
  }).join('');

  return {
    html: `
      <div class="align__stage">
        <div class="align__row align__row--fonoran">${fBlocks}</div>
        <div class="align__lines"><svg class="align__svg"></svg></div>
        <div class="align__row align__row--english">${engWords}</div>
      </div>`,
    tokenToAnchors,
    colors,
  };
}

/**
 * The translator's own honest-gap list. Shown because an unresolved word is the one
 * thing this view cannot draw: it has no Fonoran token to connect to, so without
 * this it would silently vanish.
 */
function gapsHtml(unresolved) {
  const gaps = (Array.isArray(unresolved) ? unresolved : []).map(g => String(g ?? '').trim()).filter(Boolean);
  if (!gaps.length) return '';
  return `
    <div class="align__gaps">
      <span class="align__gaps-label">No Fonoran form yet for</span>
      ${gaps.map(g => `<span class="align__gap">${esc(g)}</span>`).join('')}
    </div>`;
}

// ── Line drawing and fitting ──────────────────────────────────────────────────

function drawLines(stage, tokenToAnchors, colors) {
  const fRow = stage.querySelector('.align__row--fonoran');
  const eRow = stage.querySelector('.align__row--english');
  const zone = stage.querySelector('.align__lines');
  const svg = stage.querySelector('.align__svg');
  if (!fRow || !eRow || !zone || !svg) return;

  const zoneRect = zone.getBoundingClientRect();
  const zoneH = zone.offsetHeight || 100;
  const centerX = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.left + rect.width / 2 - zoneRect.left;
  };

  const paths = [];
  for (const [tokenIdx, anchors] of tokenToAnchors) {
    const fEl = fRow.querySelector(`.align__fblock[data-tidx="${tokenIdx}"]`);
    if (!fEl) continue;
    const color = colors[tokenIdx] ?? PARTICLE_COLOR;
    const x1 = centerX(fEl);

    for (const anchor of anchors) {
      const eEl = eRow.querySelector(`[data-anchor="${anchor}"]`);
      if (!eEl) continue;
      const x2 = centerX(eEl);
      // Stroke goes through `style` because the palette is CSS variables, and a
      // presentation attribute would not resolve them.
      paths.push(
        `<path d="M ${r(x1)},0 C ${r(x1)},${r(zoneH * 0.42)} ${r(x2)},${r(zoneH * 0.58)} ${r(x2)},${r(zoneH)}"`
        + ` style="stroke:${ea(color)}" stroke-width="2.25" fill="none" stroke-linecap="round" opacity="0.78"/>`,
      );
    }
  }
  svg.innerHTML = paths.join('\n');
}

/**
 * Shrink the scene until its widest row fits the panel, so a sentence stays on one
 * line instead of wrapping or running off the side.
 *
 * The width has to be read from the viewport, not the stage: the stage is sized to
 * its own content, so measuring it would compare a number against itself and never
 * find an overflow.
 *
 * One scale on the stage keeps the two rows in proportion with each other, which
 * matters because the curves are drawn between them.
 */
function fitToWidth(viewport) {
  const stage = viewport.querySelector('.align__stage');
  if (!stage) return;

  stage.style.removeProperty('--align-scale');
  const available = viewport.clientWidth;
  if (!available) return;

  const widest = Math.max(...[...stage.querySelectorAll('.align__row')].map(row => row.scrollWidth));
  if (!widest || widest <= available) return;

  // Floor keeps a very long sentence legible; past that the viewport scrolls.
  const scale = Math.max(0.45, available / widest);
  stage.style.setProperty('--align-scale', String(r(scale)));
}

// ── Public mount ──────────────────────────────────────────────────────────────

/**
 * Render the alignment for a translate response into `host`.
 *
 * @param {HTMLElement} host
 * @param {{ phrase: string, result: object }} args
 * @returns {{ redraw: () => void, destroy: () => void }}
 */
export function mountAlignment(host, { phrase, result }) {
  const scenes = splitScenes(phrase, result ?? {});
  const inputLemmas = result?.alignment?.input ?? {};

  if (!scenes.length) {
    host.innerHTML = '<p class="align__empty sans">Nothing to align yet. Translate a phrase first.</p>';
    return { redraw() {}, destroy() {} };
  }

  let index = 0;
  let rendered = null;

  const pagerHtml = scenes.length > 1
    ? `<div class="align__pager">
         <button type="button" class="btn btn--ghost align__nav" data-align-prev aria-label="Previous sentence">‹</button>
         <span class="align__count" data-align-count></span>
         <button type="button" class="btn btn--ghost align__nav" data-align-next aria-label="Next sentence">›</button>
       </div>`
    : '';

  host.innerHTML = `
    <div class="align">
      <div class="align__viewport" data-align-viewport></div>
      ${pagerHtml}
      ${gapsHtml(result?.unresolved)}
    </div>`;

  const viewport = host.querySelector('[data-align-viewport]');
  const countEl = host.querySelector('[data-align-count]');
  const prevBtn = host.querySelector('[data-align-prev]');
  const nextBtn = host.querySelector('[data-align-next]');

  function paint() {
    const scene = scenes[index];
    const built = sceneHtml(scene, inputLemmas);
    viewport.innerHTML = built.html;
    rendered = built;

    if (countEl) countEl.textContent = `${index + 1} of ${scenes.length}`;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index === scenes.length - 1;

    // Two frames: the first lets layout settle so widths are real, the second
    // measures after the fit has been applied.
    requestAnimationFrame(() => {
      fitToWidth(viewport);
      // Second frame: the curves are measured from laid-out boxes, so they can only
      // be drawn once the fit above has actually been applied.
      requestAnimationFrame(() => {
        const stage = viewport.querySelector('.align__stage');
        if (stage) drawLines(stage, built.tokenToAnchors, built.colors);
      });
    });
  }

  function go(delta) {
    const next = Math.min(scenes.length - 1, Math.max(0, index + delta));
    if (next === index) return;
    index = next;
    paint();
  }

  prevBtn?.addEventListener('click', () => go(-1));
  nextBtn?.addEventListener('click', () => go(1));

  const onKey = (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  host.addEventListener('keydown', onKey);

  const redraw = () => {
    const stage = viewport.querySelector('.align__stage');
    if (!stage || !rendered) return;
    fitToWidth(viewport);
    drawLines(stage, rendered.tokenToAnchors, rendered.colors);
  };

  const onResize = () => redraw();
  window.addEventListener('resize', onResize);

  paint();

  return {
    redraw,
    destroy() {
      window.removeEventListener('resize', onResize);
      host.removeEventListener('keydown', onKey);
      host.innerHTML = '';
    },
  };
}
