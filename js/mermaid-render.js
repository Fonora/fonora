import { escapeHtml } from './utils.js';
import { initMermaidPanZoomIn } from './mermaid-pan-zoom.js';
import { MERMAID_INIT } from './mermaid-theme.js';

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

/** @type {Promise<void> | null} */
let mermaidLoadPromise = null;

/** Load mermaid.min.js on demand (research note pages only). */
export function ensureMermaidLoaded() {
  if (typeof window !== 'undefined' && window.mermaid) return Promise.resolve();
  if (mermaidLoadPromise) return mermaidLoadPromise;
  mermaidLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MERMAID_CDN;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mermaidLoadPromise = null;
      reject(new Error('Failed to load Mermaid'));
    };
    document.head.appendChild(script);
  });
  return mermaidLoadPromise;
}

/**
 * @param {string} mermaidSource
 */
export function buildStaticMermaidHtml(mermaidSource) {
  if (!mermaidSource) return '';
  return `<div class="mermaid-static"><div class="mermaid">${escapeHtml(mermaidSource)}</div></div>`;
}

async function runMermaidIn(rootEl, { interactive = true, panZoomOptions = {}, mermaidInit = MERMAID_INIT } = {}) {
  if (!rootEl) return;
  const nodes = rootEl.querySelectorAll('.mermaid');
  if (!nodes.length) return;

  await ensureMermaidLoaded();
  if (!window.mermaid) return;

  window.mermaid.initialize(mermaidInit);

  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    await window.mermaid.run({ nodes });
    if (interactive) {
      initMermaidPanZoomIn(rootEl, { fitMode: 'diagram', ...panZoomOptions });
    }
  } catch (err) {
    console.error('Mermaid render failed:', err);
  }
}

/**
 * Initialize and render Mermaid diagrams inside a container element.
 * @param {ParentNode | null | undefined} rootEl
 * @param {{ fitMode?: 'diagram' | 'all' | 'height' | 'timeline', fitPadding?: number, maxInitialScale?: number, initialZoomSteps?: number, zoomStep?: number, anchor?: 'start' | 'center', anchorX?: 'start' | 'center', anchorY?: 'start' | 'center', edgePadding?: number }} [panZoomOptions]
 * @param {object} [mermaidInit]
 */
export async function renderMermaidIn(rootEl, panZoomOptions = {}, mermaidInit = MERMAID_INIT) {
  await runMermaidIn(rootEl, { interactive: true, panZoomOptions, mermaidInit });
}

/**
 * Render Mermaid diagrams without pan/zoom chrome (static inline SVG).
 * @param {ParentNode | null | undefined} rootEl
 */
export async function renderMermaidStaticIn(rootEl) {
  await runMermaidIn(rootEl, { interactive: false });
}
