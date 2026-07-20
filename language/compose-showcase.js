import { escapeHtml } from '../js/utils.js';

const SCENE_HOLD_MS = 2400;
const MERGE_MS = 520;
const SPLIT_MS = 1100;

const PRIORITY_CONCEPTS = ['river', 'beach', 'family', 'cloud', 'friend', 'home'];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {object} lab
 * @returns {Array<{ spelling: string, meaning: string, roots: Array<{ spelling: string, meaning: string }> }>}
 */
export function buildComposeScenesFromLab(lab) {
  const compounds = lab?.compounds ?? [];
  const scenes = [];
  const used = new Set();

  function resolveScene(compound) {
    const parts = compound.part_details
      ?? compound.derivation?.direct
      ?? [];
    if (parts.length !== 2) return null;
    const roots = parts.map((part) => ({
      spelling: part.spelling,
      meaning: part.meaning,
    }));
    if (!roots.every((root) => root.spelling && root.meaning)) return null;

    return {
      spelling: compound.spelling,
      meaning: compound.meaning,
      roots,
    };
  }

  for (const conceptId of PRIORITY_CONCEPTS) {
    const compound = compounds.find((item) => {
      if (item.state === 'rejected') return false;
      return item.concept_id === conceptId || (item.meaning ?? '').toLowerCase() === conceptId;
    });
    if (!compound || used.has(compound.id)) continue;
    const scene = resolveScene(compound);
    if (!scene) continue;
    used.add(compound.id);
    scenes.push(scene);
  }

  if (scenes.length >= 3) return scenes.slice(0, 4);

  for (const compound of compounds) {
    if (scenes.length >= 4) break;
    if (compound.state === 'rejected' || used.has(compound.id)) continue;
    const scene = resolveScene(compound);
    if (!scene) continue;
    used.add(compound.id);
    scenes.push(scene);
  }

  return scenes.slice(0, 4);
}

/**
 * @param {HTMLElement | null} container
 * @param {{ scenes: ReturnType<typeof buildComposeScenesFromLab>, toScript?: (spelling: string) => string }} options
 */
export function mountComposeShowcase(container, { scenes, toScript = (s) => s }) {
  if (!container || !scenes?.length) return () => {};

  container.replaceChildren();
  container.classList.add('compose-showcase');

  if (prefersReducedMotion()) {
    mountStaticShowcase(container, scenes, toScript);
    return () => {};
  }

  return mountAnimatedShowcase(container, scenes, toScript);
}

function mountStaticShowcase(container, scenes, toScript) {
  const scene = scenes[0];
  container.innerHTML = buildStaticHtml(scene, toScript);
  if (scenes.length <= 1) return;

  const list = document.createElement('div');
  list.className = 'compose-showcase__static-more';
  list.setAttribute('aria-label', 'More composed words');
  for (const extra of scenes.slice(1, 3)) {
    const item = document.createElement('div');
    item.className = 'compose-showcase__static-item';
    item.innerHTML = buildStaticHtml(extra, toScript, { compact: true });
    list.appendChild(item);
  }
  container.appendChild(list);
}

function buildStaticHtml(scene, toScript, { compact = false } = {}) {
  const script = toScript(scene.spelling);
  const rootsHtml = scene.roots.map((root, index) => {
    const op = index > 0 ? '<span class="compose-showcase__op" aria-hidden="true">+</span>' : '';
    return `${op}<span class="compose-showcase__root compose-showcase__root--static">
      <span class="compose-showcase__root-spelling mono">${escapeHtml(root.spelling)}</span>
      <span class="compose-showcase__root-meaning">${escapeHtml(root.meaning)}</span>
    </span>`;
  }).join('');

  const tag = compact
    ? ''
    : '<p class="compose-showcase__tag">Two roots combine. Meaning emerges.</p>';

  return `${tag}
    <div class="compose-showcase__static-scene${compact ? ' compose-showcase__static-scene--compact' : ''}">
      <div class="compose-showcase__roots compose-showcase__roots--static" aria-hidden="true">${rootsHtml}</div>
      <div class="compose-showcase__result compose-showcase__result--static" aria-live="polite">
        <span class="compose-showcase__compound mono">${escapeHtml(scene.spelling)}</span>
        ${script ? `<span class="compose-showcase__script symbol-text">${escapeHtml(script)}</span>` : ''}
        <span class="compose-showcase__meaning">${escapeHtml(scene.meaning)}</span>
      </div>
    </div>`;
}

function mountAnimatedShowcase(container, scenes, toScript) {
  let sceneIndex = 0;
  let phase = 'split';
  let paused = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  container.innerHTML = `
    <p class="compose-showcase__tag">Two roots combine. Meaning emerges.</p>
    <div class="compose-showcase__stage is-split" data-compose-stage>
      <div class="compose-showcase__roots" aria-hidden="true">
        <div class="compose-showcase__root compose-showcase__root--left">
          <span class="compose-showcase__root-spelling mono" data-root-left-spelling></span>
          <span class="compose-showcase__root-meaning" data-root-left-meaning></span>
        </div>
        <span class="compose-showcase__op" aria-hidden="true">+</span>
        <div class="compose-showcase__root compose-showcase__root--right">
          <span class="compose-showcase__root-spelling mono" data-root-right-spelling></span>
          <span class="compose-showcase__root-meaning" data-root-right-meaning></span>
        </div>
      </div>
      <div class="compose-showcase__result" aria-live="polite">
        <span class="compose-showcase__compound mono" data-compose-compound></span>
        <span class="compose-showcase__script symbol-text" data-compose-script></span>
        <span class="compose-showcase__meaning" data-compose-meaning></span>
      </div>
    </div>
    <div class="compose-showcase__dots" data-compose-dots aria-hidden="true"></div>
  `;

  const stage = container.querySelector('[data-compose-stage]');
  const leftSpelling = container.querySelector('[data-root-left-spelling]');
  const leftMeaning = container.querySelector('[data-root-left-meaning]');
  const rightSpelling = container.querySelector('[data-root-right-spelling]');
  const rightMeaning = container.querySelector('[data-root-right-meaning]');
  const compoundEl = container.querySelector('[data-compose-compound]');
  const scriptEl = container.querySelector('[data-compose-script]');
  const meaningEl = container.querySelector('[data-compose-meaning]');
  const dotsEl = container.querySelector('[data-compose-dots]');

  if (!stage || !leftSpelling || !leftMeaning || !rightSpelling || !rightMeaning
    || !compoundEl || !scriptEl || !meaningEl || !dotsEl) {
    return () => {};
  }

  for (let i = 0; i < scenes.length; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'compose-showcase__dot';
    dotsEl.appendChild(dot);
  }

  function renderScene(index) {
    const scene = scenes[index];
    leftSpelling.textContent = scene.roots[0].spelling;
    leftMeaning.textContent = scene.roots[0].meaning;
    rightSpelling.textContent = scene.roots[1].spelling;
    rightMeaning.textContent = scene.roots[1].meaning;
    compoundEl.textContent = scene.spelling;
    const script = toScript(scene.spelling);
    scriptEl.textContent = script;
    scriptEl.hidden = !script;
    meaningEl.textContent = scene.meaning;

    dotsEl.querySelectorAll('.compose-showcase__dot').forEach((dot, i) => {
      dot.classList.toggle('compose-showcase__dot--active', i === index);
    });
  }

  function setPhase(nextPhase) {
    phase = nextPhase;
    stage.classList.remove('is-split', 'is-merge', 'is-reveal');
    stage.classList.add(`is-${nextPhase}`);
  }

  function schedule(delay, fn) {
    if (timer) clearTimeout(timer);
    if (paused || document.visibilityState === 'hidden') return;
    timer = setTimeout(fn, delay);
  }

  function runSplit() {
    renderScene(sceneIndex);
    setPhase('split');
    schedule(SPLIT_MS, runMerge);
  }

  function runMerge() {
    setPhase('merge');
    schedule(MERGE_MS, runReveal);
  }

  function runReveal() {
    setPhase('reveal');
    schedule(SCENE_HOLD_MS, runNext);
  }

  function runNext() {
    sceneIndex = (sceneIndex + 1) % scenes.length;
    runSplit();
  }

  function pause() {
    paused = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (phase === 'split') schedule(SPLIT_MS, runMerge);
    else if (phase === 'merge') schedule(MERGE_MS, runReveal);
    else schedule(SCENE_HOLD_MS, runNext);
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

  runSplit();

  return () => {
    pause();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
