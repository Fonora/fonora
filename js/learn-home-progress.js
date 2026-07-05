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

const XP_PER_LEVEL = 100;

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

  const progress = loadProgress();
  const daily = getDailyGoalProgress();
  const level = getTotalLevel();

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
    </article>`;
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
