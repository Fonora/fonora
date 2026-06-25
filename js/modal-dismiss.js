/** Shared backdrop click + Escape dismiss for overlay modals. */

/**
 * @param {HTMLElement | null | undefined} backdrop
 * @param {boolean} open
 */
export function setModalBackdropOpen(backdrop, open) {
  if (!backdrop) return;
  backdrop.classList.toggle('modal-backdrop--open', open);
  backdrop.hidden = !open;
  backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.documentElement.classList.toggle('modal-open', open);
}

/**
 * @param {{
 *   backdrop?: HTMLElement | null,
 *   panel: HTMLElement | null,
 *   close: () => void,
 *   isOpen: () => boolean,
 * }} config
 */
export function bindModalDismiss({ backdrop, panel, close, isOpen }) {
  if (!panel) return;

  backdrop?.addEventListener('click', close);

  panel.querySelectorAll('[data-modal-close], .close').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      close();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    close();
  });
}
