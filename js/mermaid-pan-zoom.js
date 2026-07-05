import { escapeHtml } from './utils.js';

export const MERMAID_PAN_ZOOM_HINT = 'Drag to pan · Ctrl or ⌘ scroll to zoom';

/**
 * @param {string} mermaidSource
 * @param {{ wheelZoom?: boolean, variant?: 'diagram' | 'default', toolbar?: boolean, hint?: string }} [options]
 */
export function buildMermaidPanZoomHtml(mermaidSource, {
  wheelZoom = true,
  variant = 'default',
  toolbar = false,
  hint = MERMAID_PAN_ZOOM_HINT,
} = {}) {
  if (!mermaidSource) return '';
  const wheelAttr = wheelZoom ? '' : ' data-wheel-zoom="false"';
  const variantClass = variant === 'diagram' ? ' mermaid-pan-zoom--diagram' : '';
  const toolbarHtml = toolbar
    ? `<div class="mermaid-pan-zoom__toolbar" aria-label="Graph zoom controls">
        <button type="button" class="mermaid-pan-zoom__btn" data-mermaid-zoom-out aria-label="Zoom out">−</button>
        <button type="button" class="mermaid-pan-zoom__btn" data-mermaid-zoom-reset aria-label="Reset view">Fit</button>
        <button type="button" class="mermaid-pan-zoom__btn" data-mermaid-zoom-in aria-label="Zoom in">+</button>
      </div>`
    : '';
  return `<div class="mermaid-pan-zoom${variantClass}"${wheelAttr}>
    <div class="mermaid-pan-zoom__chrome">
      <p class="mermaid-pan-zoom__hint">${hint}</p>
      ${toolbarHtml}
    </div>
    <div class="mermaid-pan-zoom__viewport is-loading">
      <div class="mermaid-pan-zoom__stage">
        <div class="mermaid-wrap"><div class="mermaid">${escapeHtml(mermaidSource)}</div></div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {Element} panZoomEl
 * @param {{ fitMode?: 'diagram' | 'all' | 'height' | 'timeline', fitPadding?: number, maxInitialScale?: number, initialZoomSteps?: number, zoomStep?: number, anchor?: 'start' | 'center', anchorX?: 'start' | 'center', anchorY?: 'start' | 'center', edgePadding?: number }} [options]
 */
export function initMermaidPanZoom(panZoomEl, options = {}) {
  if (!panZoomEl || panZoomEl.dataset.panZoomReady === '1') return;

  const viewport = panZoomEl.querySelector('.mermaid-pan-zoom__viewport');
  const stage = panZoomEl.querySelector('.mermaid-pan-zoom__stage');
  const svg = panZoomEl.querySelector('svg');
  if (!viewport || !stage || !svg) return;

  const fitMode = options.fitMode
    ?? (panZoomEl.classList.contains('mermaid-pan-zoom--diagram') ? 'diagram' : 'all');

  svg.style.maxWidth = 'none';
  svg.style.display = 'block';

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let fitAttempts = 0;
  const minScale = 0.25;
  const maxScale = 5;
  const maxFitScale = fitMode === 'height' || fitMode === 'diagram' ? 4 : 2;
  const fitPadding = options.fitPadding ?? (fitMode === 'diagram' ? 1.04 : 1.14);
  const heightFitPadding = 0.92;
  const maxInitialScale = options.maxInitialScale ?? 1;
  const zoomStep = options.zoomStep ?? 1.2;
  const edgePadding = options.edgePadding ?? 28;

  const apply = () => {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };

  const boxSize = (box) => box && box.width > 0 && box.height > 0;

  const contentBox = () => {
    const vb = svg.viewBox?.baseVal;
    if (vb?.width > 0 && vb?.height > 0) {
      return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    }
    return svg.getBBox();
  };

  const normalizeSvgSize = () => {
    const box = contentBox();
    if (!boxSize(box)) return false;
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = `${box.width}px`;
    svg.style.height = `${box.height}px`;
    svg.style.maxWidth = 'none';
    return true;
  };

  const centerOn = (box, s = scale) => {
    const vp = viewport.getBoundingClientRect();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    panX = vp.width / 2 - cx * s;
    panY = vp.height / 2 - cy * s;
  };

  const reveal = () => {
    panZoomEl.dataset.panZoomReady = '1';
    viewport.classList.remove('is-loading');
    panZoomEl.classList.remove('is-loading');
    panZoomEl.classList.add('is-ready');
  };

  const fitAll = () => {
    const vp = viewport.getBoundingClientRect();
    if (!vp.width || !vp.height || !normalizeSvgSize()) return;
    const box = contentBox();
    if (!boxSize(box)) return;
    if (fitMode === 'height') {
      scale = Math.min(vp.height / (box.height * heightFitPadding), maxFitScale);
      scale = Math.max(scale, minScale);
      panX = 20 - box.x * scale;
      panY = (vp.height - box.height * scale) / 2 - box.y * scale;
    } else if (fitMode === 'timeline') {
      const widthScale = vp.width / (box.width * fitPadding);
      const heightScale = vp.height / (box.height * fitPadding);
      let baseScale = Math.min(widthScale, heightScale, maxInitialScale);
      baseScale = Math.max(baseScale, minScale);
      const zoomSteps = options.initialZoomSteps ?? 0;
      scale = Math.min(maxScale, baseScale * zoomStep ** zoomSteps);
      const anchorX = options.anchorX ?? (options.anchor === 'start' ? 'start' : 'center');
      const anchorY = options.anchorY ?? 'center';
      panX = anchorX === 'start'
        ? edgePadding - box.x * scale
        : (vp.width - box.width * scale) / 2 - box.x * scale;
      panY = anchorY === 'start'
        ? edgePadding - box.y * scale
        : (vp.height - box.height * scale) / 2 - box.y * scale;
    } else {
      scale = Math.min(
        vp.width / (box.width * fitPadding),
        vp.height / (box.height * fitPadding),
        maxFitScale,
      );
      scale = Math.max(scale, minScale);
      centerOn(box, scale);
    }
    apply();
  };

  const scheduleFit = () => {
    fitAttempts = 0;
    panZoomEl.classList.remove('is-ready');
    viewport.classList.add('is-loading');
    panZoomEl.classList.add('is-loading');

    const tryFit = () => {
      const vp = viewport.getBoundingClientRect();
      if (!vp.width || !vp.height || !normalizeSvgSize()) {
        if (fitAttempts++ < 40) requestAnimationFrame(tryFit);
        else { scale = 1; panX = 16; panY = 16; apply(); reveal(); }
        return;
      }
      const box = contentBox();
      if (!boxSize(box)) {
        if (fitAttempts++ < 40) requestAnimationFrame(tryFit);
        else { scale = 1; panX = 16; panY = 16; apply(); reveal(); }
        return;
      }
      fitAttempts = 0;
      fitAll();
      reveal();
    };

    requestAnimationFrame(() => requestAnimationFrame(tryFit));
  };

  const zoomBy = (factor, clientX, clientY) => {
    const rect = viewport.getBoundingClientRect();
    const mx = clientX != null ? clientX - rect.left : rect.width / 2;
    const my = clientY != null ? clientY - rect.top : rect.height / 2;
    const next = Math.min(maxScale, Math.max(minScale, scale * factor));
    panX = mx - (mx - panX) * (next / scale);
    panY = my - (my - panY) * (next / scale);
    scale = next;
    apply();
  };

  panZoomEl.querySelector('[data-mermaid-zoom-in]')?.addEventListener('click', (e) => {
    e.preventDefault();
    zoomBy(1.2);
  });
  panZoomEl.querySelector('[data-mermaid-zoom-out]')?.addEventListener('click', (e) => {
    e.preventDefault();
    zoomBy(1 / 1.2);
  });
  panZoomEl.querySelector('[data-mermaid-zoom-reset]')?.addEventListener('click', (e) => {
    e.preventDefault();
    fitAll();
  });

  if (panZoomEl.dataset.wheelZoom !== 'false') {
    viewport.addEventListener(
      'wheel',
      (e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        e.stopPropagation();
        zoomBy(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
      },
      { passive: false, capture: true },
    );
  }

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragPanX = 0;
  let dragPanY = 0;
  let pointerId = null;

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('.mermaid-pan-zoom__btn')) return;
    dragging = true;
    pointerId = e.pointerId;
    viewport.setPointerCapture(pointerId);
    viewport.classList.add('is-dragging');
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanX = panX;
    dragPanY = panY;
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    panX = dragPanX + (e.clientX - dragStartX);
    panY = dragPanY + (e.clientY - dragStartY);
    apply();
    e.preventDefault();
  };
  const endDrag = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    viewport.classList.remove('is-dragging');
    viewport.releasePointerCapture(e.pointerId);
  };
  viewport.addEventListener('pointerdown', onPointerDown, { capture: true });
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  scheduleFit();
}

/**
 * @param {ParentNode | null | undefined} rootEl
 * @param {{ fitMode?: 'diagram' | 'all' | 'height' | 'timeline', fitPadding?: number, maxInitialScale?: number, initialZoomSteps?: number, zoomStep?: number, anchor?: 'start' | 'center', anchorX?: 'start' | 'center', anchorY?: 'start' | 'center', edgePadding?: number }} [options]
 */
export function initMermaidPanZoomIn(rootEl, options = {}) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.mermaid-pan-zoom').forEach((el) => initMermaidPanZoom(el, options));
}
