import { escapeHtml } from './utils.js';

const HOLD_MS = 2200;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {HTMLElement | null} container
 * @param {{ heading: string, items: Array<{ symbol?: string, label: string, note?: string }>, kind: 'place' | 'manner' }} options
 */
export function mountSymbolSpotlight(container, { heading, items, kind }) {
  if (!container || !items?.length) return;

  container.replaceChildren();
  container.classList.add(`symbol-spotlight--${kind}`);

  if (prefersReducedMotion()) {
    mountStaticStrip(container, { heading, items, kind });
    return;
  }

  mountCarousel(container, { heading, items, kind });
}

function kindDescription(kind) {
  return kind === 'place' ? 'place of articulation' : 'sound modifier';
}

function mountStaticStrip(container, { heading, items, kind }) {
  const headingEl = document.createElement('h3');
  headingEl.className = 'symbol-spotlight__heading home-how-subheading';
  headingEl.textContent = heading;

  const list = document.createElement('ul');
  list.className = 'symbol-spotlight__static';
  list.setAttribute('aria-label', heading);

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'symbol-spotlight__static-item';
    const glyph = item.symbol
      ? `<span class="symbol-spotlight__static-glyph symbol-text" aria-hidden="true">${escapeHtml(item.symbol)}</span>`
      : '<span class="symbol-spotlight__static-glyph symbol-spotlight__static-glyph--empty" aria-hidden="true">—</span>';
    const noteHtml = item.note
      ? `<span class="symbol-spotlight__static-note">${escapeHtml(item.note)}</span>`
      : '';
    li.innerHTML = `${glyph}<span class="symbol-spotlight__static-label">${escapeHtml(item.label)}</span>${noteHtml}`;
    list.appendChild(li);
  }

  container.append(headingEl, list);
}

function mountCarousel(container, { heading, items, kind }) {
  let activeIndex = 0;
  let paused = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  const headingEl = document.createElement('h3');
  headingEl.className = 'symbol-spotlight__heading home-how-subheading';
  headingEl.textContent = heading;

  const stage = document.createElement('div');
  stage.className = 'symbol-spotlight__stage';

  const trackWrap = document.createElement('div');
  trackWrap.className = 'symbol-spotlight__track-wrap';

  const track = document.createElement('div');
  track.className = 'symbol-spotlight__track';
  track.setAttribute('role', 'list');

  const labelEl = document.createElement('div');
  labelEl.className = 'symbol-spotlight__label';
  labelEl.setAttribute('aria-live', 'polite');

  const dots = document.createElement('div');
  dots.className = 'symbol-spotlight__dots';
  dots.setAttribute('aria-hidden', 'true');

  const kindLabel = kindDescription(kind);

  /** @type {HTMLButtonElement[]} */
  const buttons = items.map((item, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'symbol-spotlight__item';
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', `${item.label}, ${kindLabel}`);
    const glyph = item.symbol
      ? `<span class="symbol-spotlight__glyph symbol-text" aria-hidden="true">${escapeHtml(item.symbol)}</span>`
      : '<span class="symbol-spotlight__glyph symbol-spotlight__glyph--empty" aria-hidden="true">—</span>';
    btn.innerHTML = glyph;
    btn.addEventListener('click', () => goTo(index));
    track.appendChild(btn);
    return btn;
  });

  for (let i = 0; i < items.length; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'symbol-spotlight__dot';
    dots.appendChild(dot);
  }

  trackWrap.appendChild(track);
  stage.append(trackWrap, labelEl);
  container.append(headingEl, stage, dots);

  function updateLabel() {
    const item = items[activeIndex];
    const noteHtml = item.note
      ? `<span class="symbol-spotlight__note">${escapeHtml(item.note)}</span>`
      : '';
    labelEl.innerHTML = `<span class="symbol-spotlight__label-text">${escapeHtml(item.label)}</span>${noteHtml}`;
  }

  function centerActive() {
    const btn = buttons[activeIndex];
    if (!btn) return;
    const offset = trackWrap.clientWidth / 2 - (btn.offsetLeft + btn.offsetWidth / 2);
    track.style.transform = `translateX(${offset}px)`;
  }

  function setActive(index) {
    activeIndex = index;
    buttons.forEach((btn, i) => {
      if (i === index) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    dots.querySelectorAll('.symbol-spotlight__dot').forEach((dot, i) => {
      dot.classList.toggle('symbol-spotlight__dot--active', i === index);
    });
    updateLabel();
    centerActive();
  }

  function goTo(index) {
    setActive(index);
    scheduleNext();
  }

  function advance() {
    setActive((activeIndex + 1) % items.length);
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    if (paused || document.visibilityState === 'hidden') return;
    timer = setTimeout(() => {
      advance();
      scheduleNext();
    }, HOLD_MS);
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

  stage.addEventListener('mouseenter', pause);
  stage.addEventListener('mouseleave', resume);
  stage.addEventListener('focusin', pause);
  stage.addEventListener('focusout', (event) => {
    if (!stage.contains(/** @type {Node | null} */ (event.relatedTarget))) resume();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause();
    else resume();
  });

  const resizeObserver = new ResizeObserver(() => centerActive());
  resizeObserver.observe(trackWrap);

  setActive(0);
  scheduleNext();
}
