/**
 * Learn progress: XP, streaks, daily goals (localStorage).
 */

const STORAGE_KEY = 'fonora-learn-progress-v2';
const LEGACY_STORAGE_KEY = 'fonora-learn-progress-v1';

/** @typedef {'script-writing' | 'script-sounds' | 'script-words' | 'fonoran-reading' | 'fonoran-writing' | 'fonoran-hearing' | 'fonoran-grammar' | 'fonoran-speaking'} LearnSkillId */

/** @typedef {{ seen: number, correct: number }} ItemStats */

/** @typedef {{ total: number, totalLessons: number, ring: string }} CurriculumMeta */

/** @typedef {{ xp: number, sessions: number, lastPlayed: string | null, lessonIndex: number, mastery: Record<string, ItemStats>, curriculum: CurriculumMeta }} SkillProgress */

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
  'fonoran-speaking',
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
  'fonoran-speaking': 'language',
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

function defaultCurriculumMeta() {
  return { total: 0, totalLessons: 0, ring: '' };
}

function defaultSkill() {
  return { xp: 0, sessions: 0, lastPlayed: null, lessonIndex: 0, mastery: {}, curriculum: defaultCurriculumMeta() };
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
          lessonIndex: typeof s.lessonIndex === 'number' && s.lessonIndex >= 0 ? Math.floor(s.lessonIndex) : 0,
          mastery: normalizeMastery(s.mastery),
          curriculum: normalizeCurriculumMeta(s.curriculum),
        };
      }
    }
  }
  return base;
}

/** @param {unknown} raw */
function normalizeMastery(raw) {
  /** @type {Record<string, ItemStats>} */
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (!value || typeof value !== 'object') continue;
    const v = /** @type {Record<string, unknown>} */ (value);
    out[key] = {
      seen: typeof v.seen === 'number' ? v.seen : 0,
      correct: typeof v.correct === 'number' ? v.correct : 0,
    };
  }
  return out;
}

/** @param {unknown} raw */
function normalizeCurriculumMeta(raw) {
  const base = defaultCurriculumMeta();
  if (!raw || typeof raw !== 'object') return base;
  const v = /** @type {Record<string, unknown>} */ (raw);
  base.total = typeof v.total === 'number' ? v.total : 0;
  base.totalLessons = typeof v.totalLessons === 'number' ? v.totalLessons : 0;
  base.ring = typeof v.ring === 'string' ? v.ring : '';
  return base;
}

/** @returns {LearnProgress} */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeProgress(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = normalizeProgress(JSON.parse(legacy));
      saveProgress(migrated);
      return migrated;
    }
    return defaultProgress();
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
  void pushProgressToServer(state);
}

let pushTimer = null;

async function pushProgressToServer(state) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const res = await fetch('/auth/session', { credentials: 'include' });
      const auth = await res.json();
      if (!auth.authenticated || !auth.userId) return;
      await fetch('/api/fonoran/me/progress', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: state }),
      });
    } catch {
      /* offline or auth off */
    }
  }, 800);
}

/** Merge server progress after sign-in (max-xp strategy). */
export async function mergeLearnProgressOnLogin() {
  try {
    const res = await fetch('/api/fonoran/me/progress', { credentials: 'include' });
    if (!res.ok) return loadProgress();
    const data = await res.json();
    const local = loadProgress();
    if (!data.progress) {
      await fetch('/api/fonoran/me/progress', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: local }),
      });
      return local;
    }
    const merged = mergeProgressLocal(local, data.progress);
    saveProgress(merged);
    return merged;
  } catch {
    return loadProgress();
  }
}

/** @param {LearnProgress} local @param {LearnProgress} remote */
function mergeProgressLocal(local, remote) {
  const out = { ...remote };
  if ((local.totalXp ?? 0) > (out.totalXp ?? 0)) out.totalXp = local.totalXp;
  if ((local.streak ?? 0) > (out.streak ?? 0)) out.streak = local.streak;
  out.skills = out.skills && typeof out.skills === 'object' ? { ...out.skills } : {};
  for (const id of LEARN_SKILL_IDS) {
    const ls = local.skills?.[id];
    const rs = out.skills[id] ?? defaultSkill();
    if (!ls) {
      out.skills[id] = rs;
      continue;
    }
    const merged = { ...rs };
    merged.xp = Math.max(ls.xp ?? 0, rs.xp ?? 0);
    merged.sessions = Math.max(ls.sessions ?? 0, rs.sessions ?? 0);
    merged.lessonIndex = Math.max(ls.lessonIndex ?? 0, rs.lessonIndex ?? 0);
    merged.mastery = { ...(rs.mastery ?? {}) };
    for (const [key, ms] of Object.entries(ls.mastery ?? {})) {
      const rm = merged.mastery[key] ?? { seen: 0, correct: 0 };
      merged.mastery[key] = {
        seen: Math.max(ms.seen ?? 0, rm.seen ?? 0),
        correct: Math.max(ms.correct ?? 0, rm.correct ?? 0),
      };
    }
    out.skills[id] = merged;
  }
  return normalizeProgress(out);
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

/**
 * Current lesson index (0-based) for a curriculum-driven skill.
 * @param {LearnSkillId} skillId
 */
export function getSkillLesson(skillId) {
  return getSkillProgress(skillId).lessonIndex ?? 0;
}

/**
 * Advance to the next lesson and return the new index.
 * @param {LearnSkillId} skillId
 */
export function advanceSkillLesson(skillId) {
  const state = loadProgress();
  const skill = state.skills[skillId];
  if (!skill) return 0;
  skill.lessonIndex = (skill.lessonIndex ?? 0) + 1;
  saveProgress(state);
  return skill.lessonIndex;
}

/**
 * Record that a curriculum item was practiced (seen, and whether answered correctly).
 * @param {LearnSkillId} skillId
 * @param {string} key stable item key (spelling or exercise id)
 * @param {boolean} correct
 */
export function recordItemResult(skillId, key, correct) {
  if (!key) return;
  const state = loadProgress();
  const skill = state.skills[skillId];
  if (!skill) return;
  const stats = skill.mastery[key] ?? { seen: 0, correct: 0 };
  stats.seen += 1;
  if (correct) stats.correct += 1;
  skill.mastery[key] = stats;
  saveProgress(state);
}

/**
 * @param {LearnSkillId} skillId
 * @returns {{ seen: number, mastered: number }}
 */
export function getMasteryStats(skillId) {
  const mastery = getSkillProgress(skillId).mastery ?? {};
  let seen = 0;
  let mastered = 0;
  for (const stats of Object.values(mastery)) {
    seen += 1;
    if (stats.correct > 0) mastered += 1;
  }
  return { seen, mastered };
}

/**
 * Persist the shape of a skill's curriculum so the Learn home can show progress
 * without re-loading the lab dictionary.
 * @param {LearnSkillId} skillId
 * @param {Partial<CurriculumMeta>} meta
 */
export function setSkillCurriculumMeta(skillId, meta) {
  const state = loadProgress();
  const skill = state.skills[skillId];
  if (!skill) return;
  skill.curriculum = { ...skill.curriculum, ...meta };
  saveProgress(state);
}

/** @param {LearnSkillId} skillId */
export function getSkillCurriculumMeta(skillId) {
  return getSkillProgress(skillId).curriculum ?? defaultCurriculumMeta();
}

/** Fonoran language skills that share the domain phrase curriculum. */
export const FONORAN_LANGUAGE_SKILL_IDS = [
  'fonoran-reading',
  'fonoran-writing',
  'fonoran-hearing',
  'fonoran-grammar',
  'fonoran-speaking',
];

/** localStorage flag set after migrating to domain-based phrase courses. */
export const COURSE_CURRICULUM_MIGRATION_KEY = 'fonoran-course-curriculum-v1';

/** Reset progress for all Fonoran language skills (phrase course migration). */
export function resetFonoranLanguageSkills() {
  const state = loadProgress();
  for (const id of FONORAN_LANGUAGE_SKILL_IDS) {
    state.skills[id] = defaultSkill();
  }
  saveProgress(state);
}

/**
 * True when the learner has ring-vocabulary progress but has not acknowledged
 * the switch to domain phrase courses.
 * @param {LearnProgress} [progress]
 */
export function needsCourseCurriculumMigration(progress = loadProgress()) {
  if (localStorage.getItem(COURSE_CURRICULUM_MIGRATION_KEY)) return false;
  return FONORAN_LANGUAGE_SKILL_IDS.some((id) => {
    const skill = progress.skills[id];
    if (!skill) return false;
    const hasLesson = (skill.lessonIndex ?? 0) > 0;
    const hasXp = (skill.xp ?? 0) > 0;
    const masteryKeys = Object.keys(skill.mastery ?? {});
    const ringBasedKeys = masteryKeys.some((k) => !/^[a-z]{2,4}-\d{3}$/i.test(k));
    return (hasLesson || hasXp) && ringBasedKeys;
  });
}

/** Mark domain phrase curriculum as acknowledged (banner dismissed or reset). */
export function markCourseCurriculumMigrated() {
  try {
    localStorage.setItem(COURSE_CURRICULUM_MIGRATION_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}
