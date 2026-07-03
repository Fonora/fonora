/**
 * Hydrate Learn home — streak, daily goal, level, and per-skill progress.
 */
import {
  getDailyGoalProgress,
  getSkillLevel,
  getSkillProgress,
  getTotalLevel,
  loadProgress,
} from './learn-gamification.js';
import { icon } from './learn-icons.js';

const XP_PER_LEVEL = 100;

export function refreshLearnHomeProgress() {
  const root = document.getElementById('learn-home-progress');
  if (root) {
    const progress = loadProgress();
    const daily = getDailyGoalProgress();
    const level = getTotalLevel();

    root.innerHTML = `
      <div class="learn-stat">
        <span class="learn-stat__icon learn-stat__icon--streak">${icon('flame')}</span>
        <span class="learn-stat__value">${progress.streak}</span>
        <span class="learn-stat__label">Day streak</span>
      </div>
      <div class="learn-stat learn-stat--goal">
        <div class="learn-stat__ring" style="--goal-pct: ${daily.pct}">
          <span class="learn-stat__ring-icon">${icon('target')}</span>
        </div>
        <span class="learn-stat__value">${daily.earned} / ${daily.goal}</span>
        <span class="learn-stat__label">Daily goal (XP)</span>
      </div>
      <div class="learn-stat">
        <span class="learn-stat__icon learn-stat__icon--level">${icon('award')}</span>
        <span class="learn-stat__value">Level ${level}</span>
        <span class="learn-stat__label">${progress.totalXp} XP total</span>
      </div>`;
  }

  document.querySelectorAll('.learn-skill-card[data-skill]').forEach((card) => {
    const skillId = card.getAttribute('data-skill');
    if (!skillId) return;

    const skill = getSkillProgress(/** @type {import('./learn-gamification.js').LearnSkillId} */ (skillId));
    const lvl = getSkillLevel(skill.xp);
    const withinLevel = skill.xp % XP_PER_LEVEL;
    const pct = Math.round((withinLevel / XP_PER_LEVEL) * 100);

    const levelEl = card.querySelector('.learn-skill-card__level');
    if (levelEl) levelEl.textContent = `Level ${lvl} · ${withinLevel}/${XP_PER_LEVEL} XP`;

    const bar = card.querySelector('.learn-skill-card__progress');
    const fill = card.querySelector('.learn-skill-card__progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    if (bar) bar.setAttribute('aria-valuenow', String(pct));

    const label = card.querySelector('.learn-skill-card__cta-label');
    if (label) label.textContent = skill.xp > 0 ? 'Continue' : 'Start';

    card.classList.toggle('learn-skill-card--started', skill.xp > 0);
  });
}
