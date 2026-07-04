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
import { countDomainMastered, loadDomainStats } from './fonoran-course-phrases.js';
import { icon } from './learn-icons.js';

const XP_PER_LEVEL = 100;

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

export function refreshLearnHomeProgress() {
  refreshCompactProgress();
  refreshFullProgress();

  document.querySelectorAll('.learn-skill-card[data-skill]').forEach((card) => {
    const skillId = card.getAttribute('data-skill');
    if (!skillId) return;

    const typedSkillId = /** @type {import('./learn-gamification.js').LearnSkillId} */ (skillId);
    const skill = getSkillProgress(typedSkillId);
    const meta = getSkillCurriculumMeta(typedSkillId);
    const isCurriculum = SKILL_TRACK[typedSkillId] === 'language' && meta.total > 0;

    let pct;
    let levelText;
    if (isCurriculum) {
      const { mastered } = getMasteryStats(typedSkillId);
      const lessonIndex = getSkillLesson(typedSkillId);
      const lessonNumber = Math.min(lessonIndex + 1, meta.totalLessons);
      pct = meta.total ? Math.round((mastered / meta.total) * 100) : 0;
      const ring = meta.ring ? `${meta.ring} · ` : '';
      levelText = lessonIndex >= meta.totalLessons
        ? `${ring}Review · ${mastered}/${meta.total} words`
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

  void refreshDomainProgress();
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

/**
 * Render 20 domain progress cards in #learn-domain-progress (if present).
 * The current domain (first incomplete) is highlighted; locked domains are dimmed.
 * This is a best-effort async update — absent or empty data silently no-ops.
 */
async function refreshDomainProgress() {
  const container = document.getElementById('learn-domain-progress');
  if (!container) return;

  let stats;
  try {
    stats = await loadDomainStats();
  } catch {
    return;
  }
  if (!stats.length) {
    container.hidden = true;
    return;
  }

  // Determine which domain is currently active from the reading skill lesson index.
  const LESSONS_PER_DOMAIN = 5;
  const currentLesson = getSkillLesson('fonoran-reading');
  const currentDomainIndex = Math.floor(currentLesson / LESSONS_PER_DOMAIN);

  container.hidden = false;
  const readingMastery = getSkillProgress('fonoran-reading').mastery ?? {};
  container.innerHTML = stats
    .map((domain, idx) => {
      const isUnlocked = idx <= currentDomainIndex;
      const isCurrent = idx === currentDomainIndex;
      const domainMastered = countDomainMastered(readingMastery, domain.phraseIds ?? []);
      const masteredPct = isUnlocked && domain.translated
        ? Math.round((domainMastered / domain.translated) * 100)
        : 0;

      const gapNote = domain.translated < domain.total
        ? `<span class="learn-domain-card__gap">${domain.total - domain.translated} awaiting translation</span>`
        : '';

      return `<article class="learn-domain-card${isCurrent ? ' learn-domain-card--current' : ''}${!isUnlocked ? ' learn-domain-card--locked' : ''}" aria-label="${domain.label}">
        <div class="learn-domain-card__level">Module ${domain.level}</div>
        <div class="learn-domain-card__label">${domain.label}</div>
        <div class="learn-domain-card__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${masteredPct}">
          <span class="learn-domain-card__progress-fill" style="width:${isUnlocked ? masteredPct : 0}%"></span>
        </div>
        <div class="learn-domain-card__meta">
          ${isUnlocked ? `${domainMastered}/${domain.translated} mastered` : icon('lock')}
          ${gapNote}
        </div>
      </article>`;
    })
    .join('');
}
