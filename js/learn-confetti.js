/**
 * Lightweight canvas confetti burst for module-completion celebrations.
 * No external dependencies. Fades out after ~3 s and removes itself.
 */

const COLORS = ['#c4a574', '#9a7544', '#2d6a4f', '#40916c', '#1b4332', '#dcc9a8', '#95d5b2'];
const PARTICLE_COUNT = 130;
const DURATION_MS = 3200;
const FADE_START = 0.65; // fraction of DURATION_MS when fade begins

/**
 * Fire a confetti burst. Safe to call when motion is reduced (returns immediately).
 * @returns {() => void}  cleanup function (also fires automatically after animation)
 */
export function fireConfetti() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9000';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return () => {}; }

  /** @type {Array<{ x:number, y:number, vx:number, vy:number, color:string, w:number, h:number, r:number, dr:number, shape:'rect'|'circle' }>} */
  const particles = Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = (Math.random() * 60 - 30) * (Math.PI / 180); // spray upward
    const speed = Math.random() * 8 + 4;
    return {
      x: canvas.width * (0.3 + Math.random() * 0.4),
      y: canvas.height * 0.55,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: Math.random() * 10 + 6,
      h: Math.random() * 6 + 3,
      r: Math.random() * Math.PI * 2,
      dr: (Math.random() - 0.5) * 0.25,
      shape: Math.random() < 0.4 ? 'circle' : 'rect',
    };
  });

  let animId = 0;
  let elapsed = 0;
  let last = performance.now();
  let dead = false;

  function cleanup() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(animId);
    canvas.remove();
  }

  function frame(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    elapsed += dt;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fadeProgress = elapsed / DURATION_MS;
    const alpha = fadeProgress > FADE_START
      ? Math.max(0, 1 - (fadeProgress - FADE_START) / (1 - FADE_START))
      : 1;

    for (const p of particles) {
      p.vy += 0.22;   // gravity
      p.vx *= 0.99;   // air resistance
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.dr;

      if (p.y > canvas.height + 20) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (elapsed < DURATION_MS) {
      animId = requestAnimationFrame(frame);
    } else {
      cleanup();
    }
  }

  animId = requestAnimationFrame(frame);
  return cleanup;
}
