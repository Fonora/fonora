import { escapeHtml } from './utils.js';

const PHASES = [
  { id: 'script-symbols', layer: 'Script', caption: 'Symbols mark where and how speech is made', hold: 2000 },
  { id: 'script-syllable', layer: 'Script', caption: 'Sounds become written roots', hold: 2000 },
  { id: 'language-split', layer: 'Language', caption: 'Speakers combine roots to express ideas', hold: 1100 },
  { id: 'language-merge', layer: 'Language', caption: 'Speakers combine roots to express ideas', hold: 520 },
  { id: 'language-reveal', layer: 'Language', caption: 'Meaning emerges', hold: 2400 },
];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {object} rules
 * @param {(parts: string[]) => string} toScript
 */
export function buildPlatformPipelineData(rules, toScript) {
  // Live lexicon: water (ye) + path (nan) → river (yenan).
  // Script intro still shows place + vowel as the writing-system idea;
  // the language beat uses the real approved roots.
  const lips = rules?.places?.find((place) => place.id === 'lips');
  const palate = rules?.places?.find((place) => place.id === 'palate' || place.id === 'blade' || place.id === 'ridge');
  const vowel = rules?.modifiers?.find((modifier) => modifier.id === 'vowel');
  const place = palate ?? lips;
  const roots = [
    { spelling: 'ye', meaning: 'water' },
    { spelling: 'nan', meaning: 'path' },
  ];

  return {
    symbols: [
      { symbol: place?.symbol ?? lips?.symbol ?? '∋', label: place?.label ?? lips?.label ?? 'Lips' },
      { symbol: vowel?.symbol ?? '⚬', label: vowel?.label ?? 'Vowel' },
    ],
    syllable: {
      roman: 'ye',
      script: toScript(['ye']),
    },
    roots,
    compound: {
      spelling: 'yenan',
      meaning: 'river',
      script: toScript(roots.map((root) => root.spelling)),
    },
  };
}

/**
 * @param {HTMLElement | null} container
 * @param {{ data: ReturnType<typeof buildPlatformPipelineData> }} options
 */
export function mountPlatformShowcase(container, { data }) {
  if (!container || !data) return () => {};

  container.replaceChildren();
  container.classList.add('platform-showcase');

  if (prefersReducedMotion()) {
    mountStaticPipeline(container, data);
    return () => {};
  }

  return mountAnimatedPipeline(container, data);
}

function mountStaticPipeline(container, data) {
  const scriptGlyphs = [data.syllable.script, data.compound.script].filter(Boolean).join(' → ');
  container.innerHTML = `
    <p class="platform-showcase__tag">From speech to shared meaning</p>
    <div class="platform-showcase__static">
      <div class="platform-showcase__static-step">
        <p class="platform-showcase__static-label">Script</p>
        <div class="platform-showcase__symbol-row">
          ${data.symbols.map((item) => `
            <span class="platform-showcase__symbol-card">
              <span class="platform-showcase__symbol-glyph symbol-text">${escapeHtml(item.symbol)}</span>
              <span class="platform-showcase__symbol-name">${escapeHtml(item.label)}</span>
            </span>`).join('<span class="platform-showcase__op" aria-hidden="true">+</span>')}
        </div>
        <p class="platform-showcase__static-arrow" aria-hidden="true">↓</p>
        <p class="platform-showcase__static-roman mono">${escapeHtml(data.syllable.roman)}</p>
        ${data.syllable.script ? `<p class="platform-showcase__static-script symbol-text">${escapeHtml(data.syllable.script)}</p>` : ''}
      </div>
      <div class="platform-showcase__static-step">
        <p class="platform-showcase__static-label">Language</p>
        <p class="platform-showcase__static-roman mono">${data.roots.map((r) => escapeHtml(r.spelling)).join(' + ')}</p>
        <p class="platform-showcase__static-arrow" aria-hidden="true">↓</p>
        <p class="platform-showcase__static-roman mono">${escapeHtml(data.compound.spelling)}</p>
        ${data.compound.script ? `<p class="platform-showcase__static-script symbol-text">${escapeHtml(data.compound.script)}</p>` : ''}
        <p class="platform-showcase__static-meaning">${escapeHtml(data.compound.meaning)}</p>
      </div>
    </div>
  `;
}

function mountAnimatedPipeline(container, data) {
  let phaseIndex = 0;
  let paused = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  const symbolCards = data.symbols.map((item) => `
    <span class="platform-showcase__symbol-card">
      <span class="platform-showcase__symbol-glyph symbol-text">${escapeHtml(item.symbol)}</span>
      <span class="platform-showcase__symbol-name">${escapeHtml(item.label)}</span>
    </span>`).join('<span class="platform-showcase__op" aria-hidden="true">+</span>');

  const rootCards = data.roots.map((root, index) => {
    const side = index === 0 ? 'left' : 'right';
    return `${index > 0 ? '<span class="platform-showcase__op" aria-hidden="true">+</span>' : ''}
      <span class="platform-showcase__root platform-showcase__root--${side}">
        <span class="platform-showcase__root-spelling mono">${escapeHtml(root.spelling)}</span>
        <span class="platform-showcase__root-meaning">${escapeHtml(root.meaning)}</span>
      </span>`;
  }).join('');

  container.innerHTML = `
    <p class="platform-showcase__tag">From speech to shared meaning</p>
    <p class="platform-showcase__layer" data-platform-layer>Script</p>
    <p class="platform-showcase__caption" data-platform-caption aria-live="polite"></p>
    <div class="platform-showcase__stage" data-platform-stage>
      <div class="platform-showcase__layer-panel platform-showcase__layer-panel--script-symbols">
        <div class="platform-showcase__symbol-row">${symbolCards}</div>
      </div>
      <div class="platform-showcase__layer-panel platform-showcase__layer-panel--script-syllable">
        <span class="platform-showcase__roman mono">${escapeHtml(data.syllable.roman)}</span>
        ${data.syllable.script ? `<span class="platform-showcase__script symbol-text">${escapeHtml(data.syllable.script)}</span>` : ''}
      </div>
      <div class="platform-showcase__layer-panel platform-showcase__layer-panel--language-roots">
        <div class="platform-showcase__roots">${rootCards}</div>
      </div>
      <div class="platform-showcase__layer-panel platform-showcase__layer-panel--language-result" aria-live="polite">
        <span class="platform-showcase__compound mono">${escapeHtml(data.compound.spelling)}</span>
        ${data.compound.script ? `<span class="platform-showcase__script symbol-text">${escapeHtml(data.compound.script)}</span>` : ''}
        <span class="platform-showcase__meaning">${escapeHtml(data.compound.meaning)}</span>
      </div>
    </div>
    <div class="platform-showcase__dots" data-platform-dots aria-hidden="true"></div>
  `;

  const stage = container.querySelector('[data-platform-stage]');
  const layerEl = container.querySelector('[data-platform-layer]');
  const captionEl = container.querySelector('[data-platform-caption]');
  const dotsEl = container.querySelector('[data-platform-dots]');
  const rootsPanel = container.querySelector('.platform-showcase__layer-panel--language-roots');

  if (!stage || !layerEl || !captionEl || !dotsEl || !rootsPanel) {
    return () => {};
  }

  for (let i = 0; i < PHASES.length; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'platform-showcase__dot';
    dotsEl.appendChild(dot);
  }

  function applyPhase(index) {
    const phase = PHASES[index];
    container.className = 'platform-showcase platform-showcase-host platform-showcase--phase-' + phase.id;
    layerEl.textContent = phase.layer;
    captionEl.textContent = phase.caption;
    rootsPanel.classList.remove('is-split', 'is-merge');
    if (phase.id === 'language-split') rootsPanel.classList.add('is-split');
    if (phase.id === 'language-merge') rootsPanel.classList.add('is-merge');
    dotsEl.querySelectorAll('.platform-showcase__dot').forEach((dot, i) => {
      dot.classList.toggle('platform-showcase__dot--active', i === index);
    });
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    if (paused || document.visibilityState === 'hidden') return;
    timer = setTimeout(() => {
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      applyPhase(phaseIndex);
      scheduleNext();
    }, PHASES[phaseIndex].hold);
  }

  function pause() {
    paused = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function resume() {
    if (!paused) return;
    paused = false;
    scheduleNext();
  }

  container.addEventListener('mouseenter', pause);
  container.addEventListener('mouseleave', resume);
  container.addEventListener('focusin', pause);
  container.addEventListener('focusout', (event) => {
    if (!container.contains(/** @type {Node | null} */ (event.relatedTarget))) resume();
  });

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pause();
    else resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  applyPhase(0);
  scheduleNext();

  return () => {
    pause();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
