/**
 * Learn progress: XP, streaks, daily goals (localStorage).
 */

const STORAGE_KEY = 'fonora-learn-progress-v1';

/** @typedef {'script-writing' | 'script-sounds' | 'script-words' | 'fonoran-reading' | 'fonoran-writing' | 'fonoran-hearing' | 'fonoran-grammar'} LearnSkillId */

/** @typedef {{ xp: number, sessions: number, lastPlayed: string | null }} SkillProgress */

/** @typedef {{ totalXp: number, streak: number, lastPracticeDate: string | null, dailyGoalXp: number, dailyXpEarned: number, dailyXpDate: string, skills: Record<LearnSkillId, SkillProgress> }} LearnProgress */

export const XP_MCQ = 10;
export const XP_TYPING = 15;
export const XP_SESSION_BONUS = 25;

/** @type {LearnSkillId[]} */
export const LEARN_SKILL_IDS = [
  'script-sounds',
  'script-writing',
  'script-words',
  'fonoran-reading',
  'fonoran-writing',
  'fonoran-hearing',
  'fonoran-grammar',
];

/** @type {Record<LearnSkillId, 'script' | 'language'>} */
export const SKILL_TRACK = {
  'script-writing': 'script',
  'script-sounds': 'script',
  'script-words': 'script',
  'fonoran-reading': 'language',
  'fonoran-writing': 'language',
  'fonoran-hearing': 'language',
  'fonoran-grammar': 'language',
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayLocal() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultSkill() {
  return { xp: 0, sessions: 0, lastPlayed: null };
}

/** @returns {LearnProgress} */
export function defaultProgress() {
  /** @type {Record<LearnSkillId, SkillProgress>} */
  const skills = {};
  for (const id of LEARN_SKILL_IDS) skills[id] = defaultSkill();
  return {
    totalXp: 0,
    streak: 0,
    lastPracticeDate: null,
    dailyGoalXp: 50,
    dailyXpEarned: 0,
    dailyXpDate: todayLocal(),
    skills,
  };
}

/** @param {unknown} raw */
function normalizeProgress(raw) {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  base.totalXp = typeof o.totalXp === 'number' ? o.totalXp : 0;
  base.streak = typeof o.streak === 'number' ? o.streak : 0;
  base.lastPracticeDate = typeof o.lastPracticeDate === 'string' ? o.lastPracticeDate : null;
  base.dailyGoalXp = typeof o.dailyGoalXp === 'number' ? o.dailyGoalXp : 50;
  base.dailyXpEarned = typeof o.dailyXpEarned === 'number' ? o.dailyXpEarned : 0;
  base.dailyXpDate = typeof o.dailyXpDate === 'string' ? o.dailyXpDate : todayLocal();

  const skillsRaw = o.skills;
  if (skillsRaw && typeof skillsRaw === 'object') {
    for (const id of LEARN_SKILL_IDS) {
      const s = /** @type {Record<string, unknown>} */ (skillsRaw)[id];
      if (s && typeof s === 'object') {
        base.skills[id] = {
          xp: typeof s.xp === 'number' ? s.xp : 0,
          sessions: typeof s.sessions === 'number' ? s.sessions : 0,
          lastPlayed: typeof s.lastPlayed === 'string' ? s.lastPlayed : null,
        };
      }
    }
  }
  return base;
}

/** @returns {LearnProgress} */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

/** @param {LearnProgress} state */
export function saveProgress(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

/** @param {LearnProgress} state */
function resetDailyIfNeeded(state) {
  const today = todayLocal();
  if (state.dailyXpDate !== today) {
    state.dailyXpEarned = 0;
    state.dailyXpDate = today;
  }
}

/** @param {LearnProgress} state */
function updateStreak(state) {
  const today = todayLocal();
  if (state.lastPracticeDate === today) return;

  if (state.lastPracticeDate === yesterdayLocal()) {
    state.streak += 1;
  } else if (state.lastPracticeDate !== today) {
    state.streak = 1;
  }
  state.lastPracticeDate = today;
}

/**
 * @param {LearnSkillId} skillId
 * @param {number} amount
 * @returns {number} amount actually added
 */
export function awardXp(skillId, amount) {
  if (!amount || amount <= 0) return 0;
  const state = loadProgress();
  resetDailyIfNeeded(state);
  updateStreak(state);

  state.totalXp += amount;
  state.dailyXpEarned += amount;
  if (state.skills[skillId]) {
    state.skills[skillId].xp += amount;
    state.skills[skillId].lastPlayed = todayLocal();
  }
  saveProgress(state);
  return amount;
}

/** @param {LearnSkillId} skillId */
export function recordSessionComplete(skillId) {
  const state = loadProgress();
  resetDailyIfNeeded(state);
  if (state.skills[skillId]) {
    state.skills[skillId].sessions += 1;
    state.skills[skillId].lastPlayed = todayLocal();
  }
  saveProgress(state);
  return awardXp(skillId, XP_SESSION_BONUS);
}

/** @param {number} skillXp */
export function getSkillLevel(skillXp) {
  return Math.floor(skillXp / 100) + 1;
}

/** @returns {{ earned: number, goal: number, pct: number }} */
export function getDailyGoalProgress() {
  const state = loadProgress();
  resetDailyIfNeeded(state);
  saveProgress(state);
  const pct = state.dailyGoalXp
    ? Math.min(100, Math.round((state.dailyXpEarned / state.dailyGoalXp) * 100))
    : 0;
  return { earned: state.dailyXpEarned, goal: state.dailyGoalXp, pct };
}

/** @returns {number} */
export function getTotalLevel() {
  return getSkillLevel(loadProgress().totalXp);
}

/** @param {LearnSkillId} skillId */
export function getSkillProgress(skillId) {
  return loadProgress().skills[skillId] ?? defaultSkill();
}

/** @param {LearnSkillId} skillId */
export function playedSkillToday(skillId) {
  const s = getSkillProgress(skillId);
  return s.lastPlayed === todayLocal();
}
