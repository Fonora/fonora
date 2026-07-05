/**
 * Hydrate Learn home — streak, daily goal, level, per-skill progress, and domain cards.
 */
import {
  getDailyGoalProgress,
  getMasteryStats,
  getSkillCurriculumMeta,
  getSkillLesson,
  getSkillLevel,
  getSkillProgress,
  getTotalLevel,
  LEARN_SKILL_IDS,
  loadProgress,
  markCourseCurriculumMigrated,
  needsCourseCurriculumMigration,
  resetFonoranLanguageSkills,
  SKILL_TRACK,
} from './learn-gamification.js';
import { renderModulePath } from './learn-module-path.js';
import { icon } from './learn-icons.js';
import { getAuthState } from './auth-session.js';
import {
  buildLearnShareMessage,
  copyLearnShareMessage,
  canUseNativeShare,
  getShareTargets,
  shareLearnProgress,
} from './learn-share.js';

const XP_PER_LEVEL = 100;

/** @type {(() => void) | null} */
let sharePopoverDismiss = null;

function closeSharePopover() {
  sharePopoverDismiss?.();
  sharePopoverDismiss = null;
}

function wireShareStatCard(root) {
  const card = root.querySelector('.learn-stat--share');
  if (!card) return;

  /** @type {HTMLElement | null} */
  let popover = null;

  const dismiss = () => {
    if (!popover) return;
    popover.hidden = true;
    card.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeydown);
    sharePopoverDismiss = null;
  };
  sharePopoverDismiss = dismiss;

  /** @param {MouseEvent} event */
  function onDocClick(event) {
    if (!card.contains(/** @type {Node} */ (event.target))) dismiss();
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key === 'Escape') dismiss();
  }

  const ensurePopover = () => {
    if (popover) return popover;
    const shareTargets = getShareTargets(buildLearnShareMessage());
    popover = document.createElement('div');
    popover.className = 'learn-share-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'menu');
    popover.setAttribute('aria-label', 'Share options');
    popover.innerHTML = `
      <a class="learn-share-popover__btn" href="${shareTargets.x}" target="_blank" rel="noopener noreferrer" role="menuitem">X</a>
      <a class="learn-share-popover__btn" href="${shareTargets.reddit}" target="_blank" rel="noopener noreferrer" role="menuitem">Reddit</a>
      <a class="learn-share-popover__btn" href="${shareTargets.facebook}" target="_blank" rel="noopener noreferrer" role="menuitem">Facebook</a>
      <button type="button" class="learn-share-popover__btn" data-share-copy role="menuitem">Copy text</button>`;
    card.appendChild(popover);
    popover.querySelector('[data-share-copy]')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      const btn = /** @type {HTMLButtonElement} */ (event.currentTarget);
      const copied = await copyLearnShareMessage();
      const prev = btn.textContent;
      btn.textContent = copied ? 'Copied!' : 'Copy failed';
      window.setTimeout(() => {
        btn.textContent = prev;
      }, 1600);
    });
    return popover;
  };

  const openPopover = () => {
    const menu = ensurePopover();
    menu.hidden = false;
    card.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKeydown);
    });
  };

  const handleShare = async () => {
    const result = await shareLearnProgress();
    if (result === 'menu') openPopover();
  };

  card.addEventListener('click', (event) => {
    if (event.target.closest('.learn-share-popover')) return;
    event.preventDefault();
    void handleShare();
  });

  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void handleShare();
  });
}

/** @type {Partial<Record<import('./learn-gamification.js').LearnSkillId, string>>} */
const CURRICULUM_UNITS = {
  'script-sounds': 'sounds',
};

function hasAnyLearnProgress(progress) {
  if (progress.totalXp > 0 || progress.streak > 0) return true;
  return LEARN_SKILL_IDS.some((id) => (progress.skills[id]?.xp ?? 0) > 0);
}

/** @param {ReturnType<typeof loadProgress>} progress */
function compactLessonLabel(progress) {
  const lessonIndex = getSkillLesson('fonoran-reading');
  const meta = getSkillCurriculumMeta('fonoran-reading');
  const totalLessons = meta.totalLessons || 1;
  const lessonNumber = Math.min(lessonIndex + 1, totalLessons);
  if (!hasAnyLearnProgress(progress) && lessonIndex === 0) {
    return 'Beginner · Lesson 1';
  }
  return `Lesson ${lessonNumber}`;
}

function refreshCompactProgress() {
  const root = document.getElementById('learn-home-progress');
  if (!root) return;

  const progress = loadProgress();
  root.innerHTML = `
    <span class="learn-stats-compact__item learn-stats-compact__item--beginner" title="Current lesson">
      <span class="learn-stats-compact__icon">${icon('award')}</span>
      <span class="learn-stats-compact__value">${compactLessonLabel(progress)}</span>
    </span>`;
}

function refreshFullProgress() {
  const root = document.getElementById('learn-progress-stats');
  if (!root) return;

  closeSharePopover();

  const progress = loadProgress();
  const daily = getDailyGoalProgress();
  const level = getTotalLevel();
  const auth = getAuthState();
  const referralCount = auth.authenticated ? auth.referralCount : 0;
  const hasNativeShare = canUseNativeShare();

  root.innerHTML = `
    <article class="learn-stat">
      <span class="learn-stat__icon learn-stat__icon--streak">${icon('flame')}</span>
      <span class="learn-stat__value">${progress.streak}</span>
      <span class="learn-stat__label">Day streak</span>
    </article>
    <article class="learn-stat">
      <span class="learn-stat__ring" style="--goal-pct: ${daily.pct}">
        <span class="learn-stat__ring-icon">${icon('target')}</span>
      </span>
      <span class="learn-stat__value">${daily.earned}/${daily.goal}</span>
      <span class="learn-stat__label">Daily goal</span>
    </article>
    <article class="learn-stat">
      <span class="learn-stat__icon learn-stat__icon--level">${icon('award')}</span>
      <span class="learn-stat__value">Lv ${level}</span>
      <span class="learn-stat__label">${progress.totalXp} XP total</span>
    </article>
    <article
      class="learn-stat learn-stat--share"
      tabindex="0"
      role="button"
      aria-label="Share your progress and recruit friends"
      ${hasNativeShare ? '' : 'aria-haspopup="true"'}
      aria-expanded="false"
    >
      <span class="learn-stat__icon learn-stat__icon--share">${icon('share')}</span>
      <span class="learn-stat__value">${referralCount}</span>
      <span class="learn-stat__label">Friends recruited</span>
      <span class="learn-stat__cta">Click to Recruit!</span>
      ${auth.authenticated ? '' : '<span class="learn-stat__hint">Sign in to track friends you recruit</span>'}
    </article>`;

  wireShareStatCard(root);
}

export function refreshLearnHomeProgress(rules = null) {
  refreshCompactProgress();
  refreshFullProgress();

  document.querySelectorAll('.learn-skill-card[data-skill]').forEach((card) => {
    const skillId = card.getAttribute('data-skill');
    if (!skillId) return;

    const typedSkillId = /** @type {import('./learn-gamification.js').LearnSkillId} */ (skillId);
    const skill = getSkillProgress(typedSkillId);
    const meta = getSkillCurriculumMeta(typedSkillId);
    const isCurriculum = (SKILL_TRACK[typedSkillId] === 'language' || SKILL_TRACK[typedSkillId] === 'script') && meta.total > 0;

    let pct;
    let levelText;
    if (isCurriculum) {
      const { mastered } = getMasteryStats(typedSkillId);
      const lessonIndex = getSkillLesson(typedSkillId);
      const lessonNumber = Math.min(lessonIndex + 1, meta.totalLessons);
      pct = meta.total ? Math.round((mastered / meta.total) * 100) : 0;
      const unit = CURRICULUM_UNITS[typedSkillId] ?? 'words';
      const ring = meta.ring ? `${meta.ring} · ` : '';
      levelText = lessonIndex >= meta.totalLessons
        ? `Review · ${mastered}/${meta.total} ${unit}`
        : `${ring}Lesson ${lessonNumber}/${meta.totalLessons}`;
    } else {
      const lvl = getSkillLevel(skill.xp);
      const withinLevel = skill.xp % XP_PER_LEVEL;
      pct = Math.round((withinLevel / XP_PER_LEVEL) * 100);
      levelText = `Level ${lvl} · ${withinLevel}/${XP_PER_LEVEL} XP`;
    }

    const levelEl = card.querySelector('.learn-skill-card__level');
    if (levelEl) levelEl.textContent = levelText;

    const bar = card.querySelector('.learn-skill-card__progress');
    const fill = card.querySelector('.learn-skill-card__progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    if (bar) bar.setAttribute('aria-valuenow', String(pct));

    const label = card.querySelector('.learn-skill-card__cta-label');
    if (label) label.textContent = skill.xp > 0 ? 'Continue' : 'Start';

    card.classList.toggle('learn-skill-card--started', skill.xp > 0);
  });

  void renderModulePath(rules);
  maybeShowCourseMigrationBanner();
}

function maybeShowCourseMigrationBanner() {
  const banner = document.getElementById('learn-course-migration-banner');
  if (!banner) return;
  if (!needsCourseCurriculumMigration()) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.querySelector('[data-course-migration-reset]')?.addEventListener('click', () => {
    resetFonoranLanguageSkills();
    markCourseCurriculumMigrated();
    banner.hidden = true;
    refreshLearnHomeProgress();
  }, { once: true });
  banner.querySelector('[data-course-migration-keep]')?.addEventListener('click', () => {
    markCourseCurriculumMigrated();
    banner.hidden = true;
  }, { once: true });
}
