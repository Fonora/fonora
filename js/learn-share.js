/**
 * Learn progress share — message builder and platform intent URLs (no SDKs).
 */
import { SITE_ORIGIN } from './fonora-config.js';
import { getTotalLevel, loadProgress } from './learn-gamification.js';
import { getAuthState } from './auth-session.js';

/**
 * @param {string | null | undefined} userId
 */
export function getLearnShareUrl(userId) {
  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const origin = isLocal ? window.location.origin : SITE_ORIGIN;
  const base = `${origin}/learn`;
  if (userId && /^usr-/.test(userId)) {
    return `${base}?ref=${encodeURIComponent(userId)}`;
  }
  return base;
}

/** @returns {{ title: string, hook: string, text: string, url: string, statsLine: string }} */
export function buildLearnShareMessage() {
  const progress = loadProgress();
  const level = getTotalLevel();
  const auth = getAuthState();
  const url = getLearnShareUrl(auth.userId);
  const statsLine = `🔥 ${progress.streak}-day streak · Lv ${level} · ${progress.totalXp} XP`;
  const hook = "Hey, check out this new language I'm learning. You should learn it too!";
  const text = `${hook}\n\n${statsLine}\n\n${url}`;
  return {
    title: hook,
    hook,
    text,
    url,
    statsLine,
  };
}

/** @param {ReturnType<typeof buildLearnShareMessage>} message */
export function getShareTargets(message) {
  return {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message.text)}`,
    reddit: `https://www.reddit.com/submit?title=${encodeURIComponent(message.title)}&url=${encodeURIComponent(message.url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(message.url)}`,
    fullText: message.text,
    url: message.url,
  };
}

/** @returns {boolean} True when the Web Share API is available (macOS, iOS, Android, etc.). */
export function canUseNativeShare() {
  return typeof navigator.share === 'function';
}

/** @returns {Promise<'native' | 'menu' | 'cancelled'>} */
export async function shareLearnProgress() {
  const message = buildLearnShareMessage();
  if (canUseNativeShare()) {
    try {
      // iMessage (and some other targets) ignore `text` when `url` is set separately —
      // send one combined body so the hook, stats, and link all appear.
      await navigator.share({ text: message.text });
      return 'native';
    } catch (err) {
      if (/** @type {Error} */ (err).name === 'AbortError') return 'cancelled';
    }
  }
  return 'menu';
}

/** @returns {Promise<boolean>} */
export async function copyLearnShareMessage() {
  const message = buildLearnShareMessage();
  try {
    await navigator.clipboard.writeText(message.text);
    return true;
  } catch {
    return false;
  }
}
