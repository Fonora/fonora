/** iOS Safari scroll lock — prevents background scroll when overlays are open. */

let lockCount = 0;
let lockedY = 0;

export function lockPageScroll() {
  if (lockCount === 0) {
    lockedY = window.scrollY;
    document.body.classList.add('scroll-locked');
    document.body.style.top = `-${lockedY}px`;
  }
  lockCount += 1;
}

export function unlockPageScroll() {
  if (lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  document.body.classList.remove('scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, lockedY);
}
